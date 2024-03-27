import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('StatusPage', () => {
  let statusPage
  let mockHeading
  let mockButton

  beforeEach(async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn()
    mockHeading = { textContent: 'Checking File' }
    mockButton = { style: { display: 'none' } }
    global.window = {
      addEventListener: vi.fn()
    }
    global.document = {
      querySelector: vi.fn().mockImplementation((selector) => {
        switch (selector) {
          case '.js-async-processing-heading':
            return mockHeading
          case '.js-async-continue-button':
            return mockButton
          default:
            return null
        }
      })
    }
    const StatusPage = await import('@/assets/js/statusPage.js')
    statusPage = new StatusPage.default() // eslint-disable-line new-cap
  })

  it('should initialize correctly', () => {
    expect(statusPage.heading).toBe(mockHeading)
    expect(statusPage.continueButton).toBe(mockButton)
  })

  it('should begin polling and update page when status is COMPLETE', async () => {
    const mockResponse = { status: 'COMPLETE' }
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse)
    })
    statusPage.beginPolling('http://test.com', '123')
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve() // wait for promises to resolve
    expect(statusPage.heading.textContent).toBe(statusPage.headingTexts.fileChecked)
    expect(statusPage.continueButton.style.display).toBe('block')
  })

  it('should begin polling and update the page when the status is FAILED', async () => {
    const mockResponse = { status: 'FAILED' }
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse)
    })
    statusPage.beginPolling('http://test.com', '123')
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve() // wait for promises to resolve
    expect(statusPage.heading.textContent).toBe(statusPage.headingTexts.fileChecked)
    expect(statusPage.continueButton.style.display).toBe('block')
  })

  it('should continue polling if status is not COMPLETE or FAILED, then finally update the page once the status is COMPLETE', async () => {
    const mockResponse = { status: 'PROCESSING' }
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve(mockResponse)
    })
    statusPage.beginPolling('http://test.com', '123')
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve() // wait for promises to resolve
    expect(statusPage.heading.textContent).toBe(statusPage.headingTexts.checkingFile)
    expect(statusPage.continueButton.style.display).toBe('none')
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    expect(statusPage.heading.textContent).toBe(statusPage.headingTexts.checkingFile)
    expect(statusPage.continueButton.style.display).toBe('none')
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 'COMPLETE' })
    })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    expect(statusPage.heading.textContent).toBe(statusPage.headingTexts.fileChecked)
    expect(statusPage.continueButton.style.display).toBe('block')
  })
})
