/**
 * Performance DB API service
 */
import datasette from './datasette.js'

// ===========================================

// for now we are using a csv for these messages but we will probably end up moving to a table, so for now this can sit in the fake performance db api

import csv from 'csv-parser' // ToDo: remember to remove this from package.json when we move away from csv
import fs from 'fs'

const messages = {}

fs.createReadStream('src/content/fieldIssueMessages.csv')
  .pipe(csv())
  .on('data', (row) => {
    messages[row.issue_type] = {
      singular: row.singular_message,
      plural: row.plural_message.replace('{num_issues}', '{}')
    }
  })
  .on('end', () => {
    // Messages object is now populated
  })

fs.createReadStream('src/content/entityIssueMessages.csv')
  .pipe(csv())
  .on('data', (row) => {
    messages[row.issue_type] = {
      ...messages[row.issue_type],
      entities_singular: row.singular_message.replace('{num_entries}', '{}'),
      entities_plural: row.plural_message.replace('{num_entries}', '{}')
    }
  })
  .on('end', () => {
    // Messages object is now populated
  })

// ===========================================

/**
 * @typedef {object} Dataset
 * @property {string} endpoint
 * @property {?string} error
 * @property {?string} issue
 */

/**
 * @typedef {object} LpaOverview
 * @property {string} name
 * @property {{ [dataset: string]: Dataset }} datasets
 */

/**
 * Performance DB API service
 * @export
 * @default
 */
export default {
  /**
   * Get LPA overview
   * @param {string} lpa - LPA ID
   * @returns {Promise<LpaOverview>} LPA overview
   */
  getLpaOverview: async (lpa, params = {}) => {
    let datasetClause = ''
    if (params.datasetsFilter) {
      const datasetString = params.datasetsFilter.map(dataset => `'${dataset}'`).join(',')
      datasetClause = `AND rle.pipeline in (${datasetString})`
    }

    const query = `
    SELECT
    p.organisation,
    o.name,
    p.dataset,
    rle.pipeline,
    rle.endpoint,
    rle.resource,
    rle.exception,
    rle.status as http_status,
    case 
           when (rle.status != '200') then 'Error'
           when (it.severity = 'error') then 'Issue'
           else 'No issues'
           end as status,
    case
            when (it.severity = 'info') then ''
            else i.issue_type
        end as issue_type,
        case
            when (it.severity = 'info') then ''
            else it.severity
        end as severity,
        it.responsibility,
        COUNT(
            case
            when it.severity != 'info' then 1
            else null
            end
        ) as issue_count
FROM
    provision p
LEFT JOIN
    organisation o ON o.organisation = p.organisation
LEFT JOIN
    reporting_latest_endpoints rle
    ON REPLACE(rle.organisation, '-eng', '') = p.organisation
    AND rle.pipeline = p.dataset
LEFT JOIN
    issue i ON rle.resource = i.resource AND rle.pipeline = i.dataset
LEFT JOIN
    issue_type it ON i.issue_type = it.issue_type AND it.severity != 'info'
WHERE
    p.organisation = '${lpa}'
    ${datasetClause}
GROUP BY
    p.organisation,
    p.dataset,
    o.name,
    rle.pipeline,
    rle.endpoint
ORDER BY
    p.organisation,
    o.name;
`

    const result = await datasette.runQuery(query)

    const datasets = result.formattedData.reduce((accumulator, row) => {
      let error
      if (row.http_status !== '200' || row.exception) {
        error = row.exception ? row.exception : `endpoint returned with a status of ${row.http_status}`
      }

      let issue
      if (row.issue_count > 0) {
        issue = `There are ${row.issue_count} issues in this dataset`
      }

      accumulator[row.dataset] = {
        endpoint: row.endpoint,
        error,
        issue
      }
      return accumulator
    }, {})

    return {
      datasets
    }
  },

  getResourceStatus: async (lpa, datasetId) => {
    const sql = `
      select endpoint_url, status, latest_log_entry_date, days_since_200 from reporting_latest_endpoints
      WHERE REPLACE(organisation, '-eng', '') = '${lpa}'
      AND pipeline = '${datasetId}'`

    const result = await datasette.runQuery(sql)

    return result.formattedData[0]
  },

  getLpaDatasetIssues: async (lpa, datasetId) => {
    const sql = `
      SELECT
        rle.endpoint,
        rle.resource,
        rle.exception,

        i.field,
        i.issue_type,
        i.line_number,
        i.value,
        i.message,

        CASE
          WHEN COUNT(
            CASE
              WHEN it.severity == 'error' THEN 1
              ELSE null
            END
          ) > 0 THEN 'Needs fixing'
          ELSE 'Live'
        END AS status,
        COUNT(i.issue_type) as num_issues
      FROM
          provision p
      LEFT JOIN
          reporting_latest_endpoints rle
          ON REPLACE(rle.organisation, '-eng', '') = p.organisation
          AND rle.pipeline = p.dataset
      LEFT JOIN
          issue i ON rle.resource = i.resource AND rle.pipeline = i.dataset
      LEFT JOIN
          issue_type it ON i.issue_type = it.issue_type
      WHERE
          p.organisation = '${lpa}' AND p.dataset = '${datasetId}'
          AND it.severity == 'error'
      GROUP BY i.issue_type
      ORDER BY it.severity`

    const result = await datasette.runQuery(sql)
    return result.formattedData.map((row) => {
      return {
        num_issues: row.num_issues,
        issue_type: row.issue_type,
        resource: row.resource,
        status: row.status
      }
    })
  },

  getTaskMessage (issueType, issueCount, entityLevel = false) {
    if (!messages[issueType]) {
      throw new Error(`Unknown issue type: ${issueType}`)
    }

    let message
    if (entityLevel) {
      message = issueCount === 1 ? messages[issueType].entities_singular : messages[issueType].entities_plural
    } else {
      message = issueCount === 1 ? messages[issueType].singular : messages[issueType].plural
    }
    return message.replace('{}', issueCount)
  },

  async getLatestResource (lpa, dataset) {
    const sql = `
      SELECT rle.resource, rle.status, rle.endpoint, rle.endpoint_url, rle.status, rle.days_since_200, rle.exception
      FROM reporting_latest_endpoints rle
      LEFT JOIN resource_organisation ro ON rle.resource = ro.resource
      LEFT JOIN organisation o ON REPLACE(ro.organisation, '-eng', '') = o.organisation
      WHERE REPLACE(ro.organisation, '-eng', '') = '${lpa}'
      AND rle.pipeline = '${dataset}'`

    const result = await datasette.runQuery(sql)

    return result.formattedData[0]
  },

  async getIssues (resource, issueType, database = 'digital-land') {
    const sql = `
      SELECT i.field, i.line_number, entry_number, message, issue_type, value
      FROM issue i
      WHERE i.resource = '${resource}'
      AND issue_type = '${issueType}'
    `

    const result = await datasette.runQuery(sql, database)

    return result.formattedData
  },

  async getEntry (resourceId, entryNumber, dataset) {
    const sql = `
      select
        fr.rowid,
        fr.end_date,
        fr.fact,
        fr.entry_date,
        fr.entry_number,
        fr.resource,
        fr.start_date,
        ft.entity,
        ft.field,
        ft.entry_date,
        ft.start_date,
        ft.value
      from
        fact_resource fr
        left join fact ft on fr.fact = ft.fact
      where
        fr.resource = '${resourceId}'
        and fr.entry_number = ${entryNumber}
      order by
        fr.rowid`

    const result = await datasette.runQuery(sql, dataset)

    return result.formattedData
  }
}
