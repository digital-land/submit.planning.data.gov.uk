import { Router } from 'express'
import wizard from 'hmpo-form-wizard'
import steps from './steps.js'
import fields from './fields.js'

const app = Router()

app.use(wizard(steps, fields, { name: 'my-wizard', csrf: false }))

export default app