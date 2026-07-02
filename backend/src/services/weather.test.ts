import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('../config', () => ({
  config: {
    openWeatherApiKey: 'test-weather-key',
    openWeatherCity: 'Beijing',
    openWeatherLat: 39.9042,
    openWeatherLon: 116.4074,
  },
}))

import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { weatherService } from './weather'

const mockFetch = vi.mocked(fetchWithTimeout)

function mockJsonResponse(data: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(data), text: () => Promise.resolve('') } as Response
}

describe('weatherService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear internal cache by accessing private property
    ;(weatherService as any).cache = null
  })

  describe('getCurrent', () => {
    it('should return weather data from API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          name: 'Beijing',
          main: { temp: 25, humidity: 60 },
          weather: [{ main: 'Clear', description: '晴天' }],
        })
      )

      const result = await weatherService.getCurrent()
      expect(result.city).toBe('Beijing')
      expect(result.temp).toBe(25)
      expect(result.condition).toBe('Clear')
      expect(result.description).toBe('晴天')
      expect(result.humidity).toBe(60)
    })

    it('should use cache on second call within TTL', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          name: 'Beijing',
          main: { temp: 25 },
          weather: [{ main: 'Clear', description: '晴天' }],
        })
      )

      const result1 = await weatherService.getCurrent()
      const result2 = await weatherService.getCurrent()

      expect(result1).toEqual(result2)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should return fallback on API error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'invalid key' }, false)
      )

      const result = await weatherService.getCurrent()
      expect(result.city).toBe('Beijing')
      expect(result.temp).toBe(22)
      expect(result.condition).toBe('Clear')
    })

    it('should return fallback on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await weatherService.getCurrent()
      expect(result.city).toBe('Beijing')
      expect(result.temp).toBe(22)
    })

    it('should handle missing fields in API response', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}))

      const result = await weatherService.getCurrent()
      expect(result.city).toBe('Beijing')
      expect(result.temp).toBe(22)
      expect(result.condition).toBe('Clear')
    })
  })
})
