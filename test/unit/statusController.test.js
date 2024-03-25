import StatusController from '../../src/controllers/statusController.js'
import { describe, it, vi, expect, beforeEach } from 'vitest'

describe('StatusController', () => {
  vi.mock('@/utils/publishRequestAPI.js')

  let publishRequestApi
  let statusController

  beforeEach(async () => {
    publishRequestApi = await import('@/utils/publishRequestAPI')

    statusController = new StatusController({
      route: '/status'
    })
  })

  describe('configure', () => {
    it('configure should make a request and attach the result of that request to the req.form.options object', async () => {
      const req = {
        params: { id: 'test_id' },
        form: {
          options: {

          }
        }
      }
      const res = { render: vi.fn(), redirect: vi.fn() }
      const next = vi.fn()

      const mockResult = { response: { test: 'test' }, hasErrors: () => false }
      publishRequestApi.getRequestData = vi.fn().mockResolvedValue(mockResult)

      await statusController.configure(req, res, next)

      expect(publishRequestApi.getRequestData).toHaveBeenCalledWith(req.params.id)
    })
  })

  describe('locals', () => {
    it('should attach the result of the request to the req.form.options.data object', async () => {
      const req = {
        form: {
          options: {}
        }
      }
      const res = {}
      const next = vi.fn()

      const mockResult = { response: { test: 'test' }, hasErrors: () => false }
      statusController.result = mockResult

      statusController.locals(req, res, next)

      expect(req.form.options.data).toBe(mockResult)
    })
  })
})
