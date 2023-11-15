'use strict'

const MyController = require('./MyController')

class ErrorsController extends MyController {
  get (req, res, next) {
    const json = req.sessionModel.get('validationResult')

    const aggregatedIssues = {}
    const issueCounts = {}

    json['issue-log'].forEach(issue => {
      const entryNumber = issue['entry-number']

      const rowColumns = json['converted-csv'][issue['line-number'] - 2]
      if (!(entryNumber in aggregatedIssues)) {
        aggregatedIssues[entryNumber] = Object.keys(rowColumns).reduce((acc, originalColumnName) => {
          const mappedColumnName = this.lookupMappedColumnName(originalColumnName, json['column-field-log'])
          acc[mappedColumnName] = {
            error: false,
            value: rowColumns[originalColumnName]
          }
          return acc
        }, {})
      }

      if (entryNumber in aggregatedIssues) {
        aggregatedIssues[entryNumber][issue.field] = {
          error: this.lookupIssueType(issue['issue-type']),
          value: rowColumns[issue.field]
        }
        issueCounts[issue.field] = issueCounts[issue.field] ? issueCounts[issue.field] + 1 : 1
      }
    })

    const rows = Object.keys(aggregatedIssues).map(entryNumber => {
      return {
        entryNumber,
        columns: aggregatedIssues[entryNumber]
      }
    })

    req.form.options.rows = rows
    req.form.options.issueCounts = issueCounts
    req.form.options.columnNames = Object.keys(json['converted-csv'][0])
    req.form.options.dataset = req.sessionModel.get('dataset')
    req.form.options.dataSubject = req.sessionModel.get('data-subject')

    super.get(req, res, next)
  }

  lookupIssueType (issueType) {
    // this needs to be implemented once we know what the issue types are
    return issueType
  }

  lookupMappedColumnName (originalColumnName, columnFieldLogs) {
    const columnFieldLog = columnFieldLogs.find(columnField => columnField.column === originalColumnName)
    let mappedColumnName = originalColumnName
    if (columnFieldLog) {
      mappedColumnName = columnFieldLog.field
    }
    return mappedColumnName
  }
}

module.exports = ErrorsController
