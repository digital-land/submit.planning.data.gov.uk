import datasette from './datasette.js'
import logger from '../utils/logger.js'
import JSON5 from 'json5' // need to use this as spec is written with single quotes. need to pass this onto data designers team to fix

async function getColumnSummary (dataset, lpa) {
  const sql = `select * from column_field_summary
    where resource != ''
    and pipeline = '${dataset}'
    AND organisation = '${lpa}'
    limit 1000`

  const { formattedData } = await datasette.runQuery(sql, 'performance')

  return formattedData
}

export async function getFieldStats (lpa, dataset) {
  const columnSummary = await getColumnSummary(dataset, lpa)
  const specifications = await getSpecifications()
  const datasetSpecification = specifications[dataset]

  const matchingFields = columnSummary[0].matching_field.split(',')
  const nonMatchingFields = columnSummary[0].non_matching_field.split(',')
  const allFields = [...matchingFields, ...nonMatchingFields]

  const numberOfFieldsSupplied = datasetSpecification.fields.map(field => field.field).reduce((acc, current) => {
    return allFields.includes(current) ? acc + 1 : acc
  }, 0)

  const numberOfFieldsMatched = datasetSpecification.fields.map(field => field.field).reduce((acc, current) => {
    return matchingFields.includes(current) ? acc + 1 : acc
  }, 0)

  const NumberOfExpectedFields = datasetSpecification.fields.length

  return {
    numberOfFieldsSupplied,
    numberOfFieldsMatched,
    NumberOfExpectedFields
  }
}

export async function getSpecifications () {
  try {
    const sql = 'select * from specification order by specification'
    const result = await datasette.runQuery(sql)

    const resultWithParsedJson = result.formattedData.filter(dataset => dataset.datasets !== '').map((dataset) => {
      const { json, ...rest } = dataset
      const formattedJson = JSON5.parse(json)
      return {
        ...rest,
        json: formattedJson
      }
    })

    const specifications = resultWithParsedJson.reduce((accumulator, current) => {
      const datasets = current.datasets.split(';')
      datasets.forEach((dataset, index) => {
        accumulator[dataset] = current.json[index]
      })
      return accumulator
    }, {})

    return specifications
  } catch (error) {
    // ToDo: handle this error
    logger.error(error) // ToDo: make this error appropriate
  }
}

export async function getSources (lpa, dataset) {
  const sql = `
    select endpoint, endpoint_url, status, exception, resource, latest_log_entry_date, endpoint_entry_date, endpoint_end_date, resource_start_date, resource_end_date
    from reporting_historic_endpoints 
    where REPLACE(organisation, '-eng', '') = '${lpa}' and pipeline = '${dataset}'
    AND (resource_end_date >= current_timestamp OR resource_end_date is null)
  `

  const { formattedData } = await datasette.runQuery(sql, 'performance')

  return formattedData
}
