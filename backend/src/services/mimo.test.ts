import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('../config', () => ({
  config: {
    mimoApiKey: 'test-key-123',
    mimoBaseUrl: 'https://api.test.com/v1',
    mimoDefaultModel: 'mimo-v2.5',
  },
}))

import { MimoService } from './mimo'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
const mockFetch = vi.mocked(fetchWithTimeout)

function mockJsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response
}

describe('MimoService', () => {
  let service: MimoService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new MimoService()
  })

  describe('chat', () => {
    it('should send messages and return response content', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: '你好！我是MiMo DJ。' } }],
        })
      )

      const result = await service.chat([{ role: 'user', content: '你好' }])
      expect(result).toBe('你好！我是MiMo DJ。')
      // fetchWithTimeout 现在是 (url, options, timeoutMs) 三参数，用 .calls 验证前两个
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      expect(lastCall[0]).toBe('https://api.test.com/v1/chat/completions')
      expect(lastCall[1]).toEqual(expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key-123',
        }),
      }))
    })

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'rate limited' }, false, 429)
      )

      await expect(
        service.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Mimo API error')
    })

    it('should return empty string when choices is empty', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ choices: [] })
      )

      const result = await service.chat([{ role: 'user', content: 'test' }])
      expect(result).toBe('')
    })
  })

  describe('chatWithImage', () => {
    it('should send multimodal request with image', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: '图片描述' } }],
        })
      )

      const result = await service.chatWithImage('描述这张图', 'base64data123')
      expect(result).toBe('图片描述')

      const callBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
      expect(callBody.messages[0].content).toBeInstanceOf(Array)
      expect(callBody.messages[0].content[1].type).toBe('image_url')
      expect(callBody.messages[0].content[1].image_url.url).toContain('base64')
    })
  })

  describe('generateRecommendationStrategy', () => {
    it('should parse valid JSON response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                mood: '慵懒',
                genres: ['爵士', '民谣'],
                energy: 'low',
                reason: '雨天下午适合放松',
              }),
            },
          }],
        })
      )

      const result = await service.generateRecommendationStrategy(
        '想听安静的',
        { time: '14:00' },
        []
      )
      expect(result.mood).toBe('慵懒')
      expect(result.genres).toEqual(['爵士', '民谣'])
      expect(result.energy).toBe('low')
    })

    it('should handle JSON wrapped in markdown code blocks', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{
            message: {
              content: '```json\n{"mood":"开心","genres":["流行"],"energy":"high","reason":"阳光明媚"}\n```',
            },
          }],
        })
      )

      const result = await service.generateRecommendationStrategy('开心', { time: '10:00' }, [])
      expect(result.mood).toBe('开心')
      expect(result.energy).toBe('high')
    })

    it('should fallback on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: '这不是JSON' } }],
        })
      )

      const result = await service.generateRecommendationStrategy('测试', { time: '10:00' }, [])
      expect(result.mood).toBe('测试')
      expect(result.energy).toBe('medium')
    })

    it('should validate energy values', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({ mood: 'test', genres: [], energy: 'invalid', reason: 'test' }),
            },
          }],
        })
      )

      const result = await service.generateRecommendationStrategy('test', { time: '10:00' }, [])
      expect(result.energy).toBe('medium') // fallback
    })
  })

  describe('generateDJTransition', () => {
    it('should generate transition text', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: '接下来是一首温暖的歌。' } }],
        })
      )

      const prevSong = { id: '1', title: 'Yesterday', artist: 'Beatles', emotionTags: [], sceneTags: [] }
      const nextSong = { id: '2', title: 'Let It Be', artist: 'Beatles', emotionTags: ['温暖'], sceneTags: [] }

      const result = await service.generateDJTransition(prevSong, nextSong, { time: '20:00' })
      expect(result.text).toBe('接下来是一首温暖的歌。')
    })

    it('should handle null prevSong (opening)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: '欢迎收听！' } }],
        })
      )

      const nextSong = { id: '1', title: 'Hello', artist: 'Adele', emotionTags: [], sceneTags: [] }
      const result = await service.generateDJTransition(null, nextSong, { time: '09:00' })
      expect(result.text).toBe('欢迎收听！')
    })
  })

  describe('generateIntro', () => {
    it('should generate intro text', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: '晚上好，让我们一起放松。' } }],
        })
      )

      const result = await service.generateIntro('放松', { time: '21:00' })
      expect(result).toBe('晚上好，让我们一起放松。')
    })
  })

  describe('analyzePersonality', () => {
    it('should parse personality JSON', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({ type: '深夜怀旧型', description: '喜欢在深夜听经典老歌' }),
            },
          }],
        })
      )

      const songs = [
        { id: '1', title: 'Test', artist: 'A', emotionTags: ['怀旧'], sceneTags: ['深夜'] },
      ]
      const result = await service.analyzePersonality(songs)
      expect(result.type).toBe('深夜怀旧型')
      expect(result.description).toContain('深夜')
    })

    it('should fallback on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          choices: [{ message: { content: 'not json' } }],
        })
      )

      const result = await service.analyzePersonality([])
      expect(result.type).toBe('音乐探索者')
    })
  })
})
