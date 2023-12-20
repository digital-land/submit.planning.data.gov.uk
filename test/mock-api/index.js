'use strict'
// this script runs a mock server that mimics the pipeline runner api
// it doesn't perform any validations but instead looks at the filename to determine if it should return errors or not

import express from 'express'

import config from '../../config/index.js'

import multer from 'multer'

import { readFileSync } from 'fs'
const upload = multer({ dest: 'uploads/' })

const APIResponse = JSON.parse(readFileSync('./test/testData/API_RUN_PIPELINE_RESPONSE.json'))

const app = express()

app.use(config.api.validationEndpoint, upload.single('upload_file'))

app.post(config.api.validationEndpoint, (req, res) => {
  const filename = req.file.originalname

  const _toSend = { ...APIResponse }

  if (filename !== 'conservation-area-errors.csv') {
    _toSend['issue-log'] = []
    _toSend['missing-columns'] = []
  }
  res.json(_toSend)
})

app.listen(config.api.port, () => {
  console.log('listening on port ' + config.api.port)
})
