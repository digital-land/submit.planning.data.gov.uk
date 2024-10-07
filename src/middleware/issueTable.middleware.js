import performanceDbApi from '../services/performanceDbApi.js'
import { pagination } from '../utils/pagination.js'
import { fetchDatasetInfo, fetchEntityCount, fetchIssueEntitiesCount, fetchLatestResource, fetchOrgInfo, fetchSpecification, isResourceIdInParams, logPageError, pullOutDatasetSpecification, takeResourceIdFromParams, validateQueryParams } from './common.middleware.js'
import { fetchIf, fetchMany, FetchOptions, parallel, renderTemplate } from './middleware.builders.js'
import * as v from 'valibot'

const paginationPageLength = 50

export const IssueTableQueryParams = v.object({
  lpa: v.string(),
  dataset: v.string(),
  issue_type: v.string(),
  issue_field: v.string(),
  pageNumber: v.optional(v.string()),
  resourceId: v.optional(v.string())
})

const validateIssueTableQueryParams = validateQueryParams.bind({
  schema: IssueTableQueryParams
})

const setDefaultQueryParams = (req, res, next) => {
  if (!req.params.pageNumber) {
    req.params.pageNumber = 1
  }
  next()
}

const fetchEntitiesWithIssues = fetchMany({
  query: ({ req, params }) => {
    const pagination = {
      limit: paginationPageLength,
      offset: paginationPageLength * (params.pageNumber - 1)
    }
    return performanceDbApi.entitiesAndIssuesQuery({
      resource: req.resource.resource,
      issueType: req.params.issue_type,
      issueField: req.params.issue_field,
      pagination
    })
  },
  result: 'entitiesWithIssues',
  dataset: FetchOptions.fromParams
})

const prepareIssueTableTemplateParams = (req, res, next) => {
  const { issue_type: issueType, issue_field: issueField, lpa, dataset: datasetId } = req.params
  const { entitiesWithIssues, specification, entityCount: entityCountRow, issueEntitiesCount, pagination } = req
  const { entity_count: entityCount } = entityCountRow ?? { entity_count: 0 }

  const tableParams = {
    columns: specification.fields.map(field => field.field),
    fields: specification.fields.map(field => field.field),
    rows: entitiesWithIssues.map((entity, index) => {
      const columns = {}

      specification.fields.forEach(fieldObject => {
        const { field } = fieldObject
        if (field === 'reference') {
          const entityLink = `/organisations/${lpa}/${datasetId}/${issueType}/${issueField}/entry/${entity.entry_number}`
          columns[field] = { html: `<a href="${entityLink}">${entity[field]}</a>` }
        } else if (entity[field]) {
          columns[field] = { value: entity[field] }
        } else {
          columns[field] = { value: '' }
        }
      })

      let issues
      try {
        issues = JSON.parse(entity.issues)
      } catch (e) {
        console.log(e)
      }

      Object.entries(issues).forEach(([field, issueType]) => {
        if (columns[field]) {
          columns[field].error = { message: issueType }
        } else {
          columns[field] = { value: '', error: { message: issueType } }
        }
      })

      return {
        columns
      }
    })
  }

  const errorHeading = performanceDbApi.getTaskMessage({ issue_type: issueType, num_issues: issueEntitiesCount, entityCount, field: issueField }, true)

  req.templateParams = {
    organisation: req.orgInfo,
    dataset: req.dataset,
    errorHeading,
    issueItems: [],
    issueType,
    tableParams,
    pagination
  }
  next()
}

const createPaginationTemplatePrams = (req, res, next) => {
  const { issueEntitiesCount } = req
  const { pageNumber, lpa, dataset: datasetId, issue_type: issueType, issue_field: issueField } = req.params

  const totalPages = Math.ceil(issueEntitiesCount / paginationPageLength)

  const BaseSubpath = `/organisations/${lpa}/${datasetId}/${issueType}/${issueField}/`

  const paginationObj = {}
  if (pageNumber > 1) {
    paginationObj.previous = {
      href: `${BaseSubpath}${pageNumber - 1}`
    }
  }

  if (pageNumber < totalPages) {
    paginationObj.next = {
      href: `${BaseSubpath}${pageNumber + 1}`
    }
  }

  paginationObj.items = pagination(totalPages, pageNumber).map(item => {
    if (item === '...') {
      return {
        type: 'ellipsis',
        ellipsis: true,
        href: '#'
      }
    } else {
      return {
        type: 'number',
        number: item,
        href: `${BaseSubpath}${item}`,
        current: pageNumber === parseInt(item)
      }
    }
  })

  req.pagination = paginationObj

  next()
}

const getIssueTable = renderTemplate({
  templateParams: (req) => req.templateParams,
  template: 'organisations/issueTable.html',
  handlerName: 'getIssueTable'
})

export default [
  validateIssueTableQueryParams,
  setDefaultQueryParams,
  parallel([
    fetchOrgInfo,
    fetchDatasetInfo
  ]),
  fetchIf(isResourceIdInParams, fetchLatestResource, takeResourceIdFromParams),
  fetchEntitiesWithIssues,
  fetchIssueEntitiesCount,
  fetchSpecification,
  pullOutDatasetSpecification,
  fetchEntityCount,
  createPaginationTemplatePrams,
  prepareIssueTableTemplateParams,
  getIssueTable,
  logPageError
]
