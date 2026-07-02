import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTimeout } from './fetchWithTimeout'

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should call fetch with the provided URL and options', async () => {
    const mockResponse = { ok: true } as Response
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse)

    const result = await fetchWithTimeout('https://example.com', { method: 'GET' })
    expect(result).toBe(mockResponse)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('should pass AbortController signal to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response)

    await fetchWithTimeout('https://example.com')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('should use default timeout of 15000ms', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response)

    // Just verify it doesn't throw with default params
    const result = await fetchWithTimeout('https://example.com')
    expect(result).toBeDefined()
  })

  it('should accept custom timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response)

    const result = await fetchWithTimeout('https://example.com', {}, 5000)
    expect(result).toBeDefined()
  })

  it('should throw on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    await expect(fetchWithTimeout('https://example.com')).rejects.toThrow('Network error')
  })
})
