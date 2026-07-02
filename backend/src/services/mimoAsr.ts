import { config } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { logger } from '../utils/logger'

/**
 * MiMo ASR（语音识别）服务 —— mimo-v2.5-asr。
 *
 * 语音 → 文字，OpenAI 兼容的 /chat/completions 接口。
 * 音频以 base64 data URL 形式放在 user 消息的 input_audio 中。
 *
 * 用途：为未来"语音点歌"功能预留（用户对麦克风说"来首夜曲" → 识别 → 选歌）。
 * 目前未接入前端，仅提供后端能力 + /dj/asr 路由。
 */
class MimoAsrService {
  private model: string

  constructor(model?: string) {
    this.model = model || config.mimoAsrModel
  }

  async isReady(): Promise<boolean> {
    return Boolean(config.mimoApiKey)
  }

  /**
   * 语音转文字。
   *
   * @param audioBuffer 音频二进制（wav 或 mp3）
   * @param format 音频格式，默认 wav
   * @param language 语言提示，默认 'auto'（自动检测中英+方言）
   * @returns 识别出的文字
   */
  async transcribe(
    audioBuffer: Buffer,
    format: 'wav' | 'mp3' | 'webm' | 'ogg' | 'm4a' | 'mp4' = 'wav',
    language: 'auto' | 'zh' | 'en' = 'auto'
  ): Promise<string> {
    if (!config.mimoApiKey) {
      throw new Error('MIMO_API_KEY not configured')
    }

    const base64 = audioBuffer.toString('base64')
    const dataUrl = `data:audio/${format};base64,${base64}`

    const body = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: dataUrl },
            },
          ],
        },
      ],
      asr_options: { language },
    }

    const startTime = Date.now()
    const res = await fetchWithTimeout(
      `${config.mimoBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.mimoApiKey}`,
        },
        body: JSON.stringify(body),
      },
      60000 // ASR 可能较慢，给 60s
    )

    const duration = Date.now() - startTime

    if (!res.ok) {
      const err = await res.text()
      logger.error('MiMo ASR API error', {
        status: res.status,
        duration: `${duration}ms`,
        error: err.slice(0, 300),
      })
      throw new Error(`MiMo ASR error: ${err.slice(0, 200)}`)
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) {
      logger.error('MiMo ASR 返回空文本', {
        duration: `${duration}ms`,
        raw: JSON.stringify(json).slice(0, 300),
      })
      throw new Error('MiMo ASR 返回空文本')
    }

    logger.info('MiMo ASR 识别完成', {
      audioBytes: audioBuffer.length,
      textLen: text.length,
      duration: `${duration}ms`,
    })

    return text
  }
}

export const mimoAsrService = new MimoAsrService()
