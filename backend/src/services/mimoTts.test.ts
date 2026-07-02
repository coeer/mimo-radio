import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config 和 fetchWithTimeout（在 import 服务前 mock）
vi.mock('../config', () => ({
  config: {
    mimoApiKey: 'test-key',
    mimoBaseUrl: 'https://test.xiaomimimo.com/v1',
    mimoTtsVoice: '苏打',
    mimoTtsModel: 'mimo-v2.5-tts',
    mimoTtsDesignModel: 'mimo-v2.5-tts-voicedesign',
    mimoTtsCloneModel: 'mimo-v2.5-tts-voiceclone',
  },
}))

const mockFetch = vi.fn()
vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}))

// Mock djPersona（voicedesign 会读 persona）
vi.mock('./djPersona', () => ({
  loadPersona: () => ({
    name: 'KIMI',
    voiceTone: '温暖、克制、深夜电台老朋友',
  }),
}))

import { mimoPresetTts, mimoDesignTts } from './mimoTts'

const FAKE_BASE64 = 'SGVsbG8=' // "Hello"
const FAKE_AUDIO_RESPONSE = {
  choices: [{ message: { audio: { data: FAKE_BASE64 } } }],
}

describe('MiMo TTS 引擎', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('MimoPresetTtsEngine（预置音色）', () => {
    it('id/label/kind 正确', () => {
      expect(mimoPresetTts.id).toBe('mimo-tts')
      expect(mimoPresetTts.label).toBe('MiMo 苏打')
      expect(mimoPresetTts.kind).toBe('preset')
    })

    it('isReady：有 key 即就绪', async () => {
      expect(await mimoPresetTts.isReady()).toBe(true)
    })

    it('synthesize：请求体含正确的 voice，文本在 assistant 消息', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => FAKE_AUDIO_RESPONSE,
      })

      const buffer = await mimoPresetTts.synthesize('你好世界')

      // 验证返回 Buffer
      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.toString()).toBe('Hello')

      // 验证请求 URL 和 body
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://test.xiaomimimo.com/v1/chat/completions')
      const body = JSON.parse(opts.body)
      expect(body.model).toBe('mimo-v2.5-tts')
      expect(body.modalities).toEqual(['audio'])
      expect(body.audio.voice).toBe('苏打')
      expect(body.audio.format).toBe('mp3')
      // 预置音色：文本在 assistant 消息
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].role).toBe('assistant')
      expect(body.messages[0].content).toBe('你好世界')
    })

    it('合成失败时抛错', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })
      await expect(mimoPresetTts.synthesize('test')).rejects.toThrow(/MiMo TTS error/)
    })
  })

  describe('MimoDesignTtsEngine（音色设计）', () => {
    it('id/label/kind 正确', () => {
      expect(mimoDesignTts.id).toBe('mimo-design')
      expect(mimoDesignTts.kind).toBe('design')
    })

    it('synthesize：音色描述在 user 消息，文本在 assistant 消息', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => FAKE_AUDIO_RESPONSE,
      })

      await mimoDesignTts.synthesize('深夜问候')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('mimo-v2.5-tts-voicedesign')
      // design 模式：audio 只有 format，没有 voice
      expect(body.audio.voice).toBeUndefined()
      expect(body.audio.format).toBe('mp3')
      // 关键：必须有两条消息，第一条是 user（描述），第二条是 assistant（文本）
      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toBeTruthy()
      expect(body.messages[1].role).toBe('assistant')
      expect(body.messages[1].content).toBe('深夜问候')
    })

    it('description 从 DJ 人设的 voiceTone 动态生成', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => FAKE_AUDIO_RESPONSE,
      })
      await mimoDesignTts.synthesize('test')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // 人设的 voiceTone="温暖、克制、深夜电台老朋友" 应被注入到 user 消息
      expect(body.messages[0].content).toContain('温暖')
      expect(body.messages[0].content).toContain('深夜电台老朋友')
    })
  })
})
