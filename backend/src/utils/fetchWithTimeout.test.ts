import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lookup } from 'dns/promises'
import { fetchWithTimeout, readBodySafely } from './fetchWithTimeout'

// dns/promises.lookup mock：测试用的 *.example 假域名需要解析为公网 IP，
// 否则 isSafeUrl 的 DNS 解析校验（fail-closed）会拦下所有请求。
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}))

const mockLookup = vi.mocked(lookup)

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 默认：所有域名解析为公网 IP（93.184.216.34 = example.com 真实 IP）
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
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

  // P1-1（B2）：5xx 计入熔断 / 4xx 不计 / body 读取超时
  describe('P1-1 熔断与 body 超时', () => {
    it('上游持续 500 → 达到阈值后熔断 OPEN', async () => {
      // 用独立 host 避免与其他用例的熔断计数互相污染
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout('https://upstream-5xx.example')
      }
      await expect(fetchWithTimeout('https://upstream-5xx.example')).rejects.toThrow(/Circuit breaker OPEN/)
    })

    it('4xx 不计入熔断（客户端错误不算上游故障）', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response)
      for (let i = 0; i < 6; i++) {
        await fetchWithTimeout('https://client-4xx.example')
      }
      // 超过阈值也不 OPEN——第 7 次仍正常发出并返回
      await expect(fetchWithTimeout('https://client-4xx.example')).resolves.toMatchObject({ status: 404 })
    })

    it('2xx 重置熔断计数', async () => {
      const spy = vi.spyOn(globalThis, 'fetch')
      spy.mockResolvedValue({ ok: false, status: 500 } as Response)
      for (let i = 0; i < 4; i++) await fetchWithTimeout('https://reset-2xx.example')
      spy.mockResolvedValue({ ok: true, status: 200 } as Response)
      await fetchWithTimeout('https://reset-2xx.example') // 重置
      spy.mockResolvedValue({ ok: false, status: 500 } as Response)
      for (let i = 0; i < 4; i++) await fetchWithTimeout('https://reset-2xx.example') // 重新计 4 次，未到阈值
      // 第 5 次（若未重置应是第 9 次，早已 OPEN）仍放行
      await expect(fetchWithTimeout('https://reset-2xx.example')).resolves.toBeDefined()
    })

    it('readBodySafely：慢 body 读取超时抛错并取消流', async () => {
      const cancel = vi.fn().mockResolvedValue(undefined)
      const res = { body: { cancel } } as unknown as Response
      const neverResolves = () => new Promise<never>(() => { /* 挂起模拟慢流 */ })

      const assertion = expect(readBodySafely(res, 1000, neverResolves)).rejects.toThrow(/Body read timeout/)
      await vi.advanceTimersByTimeAsync(1000)
      await assertion
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('readBodySafely：正常读取返回值（默认 json reader）', async () => {
      const res = { json: () => Promise.resolve({ audio: 'data' }) } as unknown as Response
      const value = await readBodySafely(res, 1000)
      expect(value).toEqual({ audio: 'data' })
    })
  })
})
