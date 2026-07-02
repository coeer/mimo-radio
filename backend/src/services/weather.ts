import { config } from '../config'
import { WeatherInfo } from '../types'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { logger, toErrorMeta } from '../utils/logger'

interface OpenWeatherResponse {
  name?: string
  main?: {
    temp?: number
    humidity?: number
  }
  weather?: Array<{
    main?: string
    description?: string
  }>
}

class WeatherService {
  private apiKey: string
  private cache: { data: WeatherInfo; expiry: number } | null = null
  private cacheTtlMs = 5 * 60 * 1000 // 5 minutes

  constructor() {
    this.apiKey = config.openWeatherApiKey
  }

  async getCurrent(): Promise<WeatherInfo> {
    // Return cached data if valid
    if (this.cache && Date.now() < this.cache.expiry) {
      return this.cache.data
    }

    if (!this.apiKey) {
      return {
        city: config.openWeatherCity,
        temp: 22,
        condition: 'Clear',
        description: '晴天',
      }
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${config.openWeatherLat}&lon=${config.openWeatherLon}&appid=${this.apiKey}&units=metric&lang=zh_cn`
      const res = await fetchWithTimeout(url, {}, 10000)

      if (!res.ok) {
        logger.warn('Weather API error', { statusCode: String(res.status) })
        return this.getFallback()
      }

      const data = (await res.json()) as OpenWeatherResponse

      const result: WeatherInfo = {
        city: data.name || config.openWeatherCity,
        temp: Math.round(data.main?.temp || 22),
        condition: data.weather?.[0]?.main || 'Clear',
        description: data.weather?.[0]?.description || '晴天',
        humidity: data.main?.humidity,
      }

      this.cache = { data: result, expiry: Date.now() + this.cacheTtlMs }
      return result
    } catch (err) {
      logger.warn('Weather fetch failed', { ...toErrorMeta(err) })
      return this.getFallback()
    }
  }

  private getFallback(): WeatherInfo {
    return {
      city: config.openWeatherCity,
      temp: 22,
      condition: 'Clear',
      description: '晴天',
    }
  }
}

export const weatherService = new WeatherService()
