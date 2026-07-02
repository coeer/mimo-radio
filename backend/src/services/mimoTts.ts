import { config } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { logger } from '../utils/logger'
import { loadPersona } from './djPersona'
import * as fs from 'fs'
import * as path from 'path'
import type { TtsEngine } from '../types'

/**
 * MiMo TTS 引擎实现 —— OpenAI 兼容的 /chat/completions 接口。
 *
 * 复用 config.mimoApiKey / config.mimoBaseUrl，无需新增 env key。
 * 三个子类分别对应三个 MiMo TTS 模型：
 *   - MimoPresetTtsEngine  → mimo-v2.5-tts（预置音色）
 *   - MimoDesignTtsEngine  → mimo-v2.5-tts-voicedesign（文本描述生成音色）
 *   - MimoCloneTtsEngine   → mimo-v2.5-tts-voiceclone（音频样本复刻）
 *
 * 三个模型的请求体结构差异（经官方文档 + 实测确认）：
 *
 * 1. 预置音色 mimo-v2.5-tts：
 *    audio.voice = 音色名（苏打/冰糖/...）
 *    待合成文本放 messages[0].role='assistant'.content
 *
 * 2. 音色设计 mimo-v2.5-tts-voicedesign：
 *    ⚠️ 音色描述必须放 messages[0].role='user'.content（不能为空！）
 *    待合成文本放 messages[1].role='assistant'.content
 *
 * 3. 音色复刻 mimo-v2.5-tts-voiceclone：
 *    audio.voice = 参考音频的 base64 data URL（复用 voice 字段！）
 *    待合成文本放 messages[0].role='assistant'.content
 *
 * 返回的音频在 choices[0].message.audio.data 中，是 base64 编码。
 */

const TTS_TIMEOUT = 30000
const VOICE_SAMPLE_FILE = path.join(__dirname, '../../data/voice-sample.json')

/** 抽象基类：封装 HTTP 调用 + base64 解码 + 耗时埋点 */
abstract class MimoTtsBase implements TtsEngine {
  abstract readonly id: string
  abstract readonly label: string
  abstract readonly kind: 'preset' | 'design' | 'clone'
  protected abstract readonly model: string

  /**
   * 子类构建完整的请求 body（messages + audio 参数）。
   * 不同模型的 messages 结构差异较大，所以整个 body 都交给子类。
   * options.voice：预置引擎可覆盖默认音色（运行时切换）。
   */
  protected abstract buildRequestBody(text: string, options?: { voice?: string }): Record<string, unknown>

  /** 默认就绪判断：有 API key 即就绪。子类可覆盖 */
  async isReady(): Promise<boolean> {
    return Boolean(config.mimoApiKey)
  }

  async synthesize(text: string, options?: { voice?: string }): Promise<Buffer> {
    if (!config.mimoApiKey) {
      throw new Error('MIMO_API_KEY not configured')
    }

    const body = this.buildRequestBody(text, options)

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
      TTS_TIMEOUT
    )

    const duration = Date.now() - startTime

    if (!res.ok) {
      const err = await res.text()
      logger.error('MiMo TTS API error', {
        engine: this.id,
        model: this.model,
        status: res.status,
        duration: `${duration}ms`,
        error: err.slice(0, 300),
      })
      throw new Error(`MiMo TTS error (${this.id}): ${err.slice(0, 200)}`)
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { audio?: { data?: string } } }>
    }

    const audioData = json.choices?.[0]?.message?.audio?.data
    if (!audioData) {
      logger.error('MiMo TTS 返回无音频数据', {
        engine: this.id,
        duration: `${duration}ms`,
        raw: JSON.stringify(json).slice(0, 300),
      })
      throw new Error(`MiMo TTS (${this.id}) 返回无音频数据`)
    }

    logger.info('MiMo TTS 合成完成', {
      engine: this.id,
      model: this.model,
      textLen: text.length,
      duration: `${duration}ms`,
      audioBytes: Math.round((audioData.length * 3) / 4),
    })

    return Buffer.from(audioData, 'base64')
  }
}

// ── 1. 预置音色引擎 ──
// audio.voice = 音色名，文本放 assistant 消息
export class MimoPresetTtsEngine extends MimoTtsBase {
  readonly id = 'mimo-tts'
  readonly label = `MiMo ${config.mimoTtsVoice}`
  readonly kind = 'preset' as const
  protected model = config.mimoTtsModel

  protected buildRequestBody(text: string, options?: { voice?: string }): Record<string, unknown> {
    // 运行时传入的 voice 优先于 config 默认值（支持设置页切音色）
    const voice = options?.voice || config.mimoTtsVoice
    return {
      model: this.model,
      modalities: ['audio'],
      audio: {
        voice,
        format: 'mp3',
      },
      messages: [{ role: 'assistant', content: text }],
    }
  }
}

// ── 2. 音色设计引擎（文本描述生成）──
// ⚠️ 音色描述必须放 user 消息（官方强制要求 user message 非空）
export class MimoDesignTtsEngine extends MimoTtsBase {
  readonly id = 'mimo-design'
  readonly label = 'MiMo 音色设计'
  readonly kind = 'design' as const
  protected model = config.mimoTtsDesignModel

  /**
   * 从 DJ 人设的 voiceTone 字段动态生成音色描述。
   * 例如 voiceTone="温暖、克制、深夜电台老朋友"
   *      → "温暖磁性的成熟男声，深夜电台风格，语速稍慢，亲切陪伴感"
   */
  private getDescription(): string {
    try {
      const persona = loadPersona()
      const tone = persona.voiceTone || '温暖、亲切的电台 DJ'
      return `${tone}。声音质感：磁性沉稳的成熟男声，语速稍慢，带深夜电台的亲切陪伴感`
    } catch {
      return '温暖磁性的成熟男声，深夜电台风格，语速稍慢'
    }
  }

  protected buildRequestBody(text: string, _options?: { voice?: string }): Record<string, unknown> {
    return {
      model: this.model,
      modalities: ['audio'],
      audio: { format: 'mp3' },
      // 关键：音色描述放 user 消息，待合成文本放 assistant 消息
      messages: [
        { role: 'user', content: this.getDescription() },
        { role: 'assistant', content: text },
      ],
    }
  }
}

// ── 3. 音色复刻引擎（音频样本）──
// 参考音频放 audio.voice（base64 data URL），文本放 assistant 消息
export class MimoCloneTtsEngine extends MimoTtsBase {
  readonly id = 'mimo-clone'
  readonly label = 'MiMo 音色复刻'
  readonly kind = 'clone' as const
  protected model = config.mimoTtsCloneModel

  /** 读取本地存储的参考音频（base64 data URL） */
  private loadReferenceAudio(): string | null {
    try {
      if (!fs.existsSync(VOICE_SAMPLE_FILE)) return null
      const raw = fs.readFileSync(VOICE_SAMPLE_FILE, 'utf-8')
      const data = JSON.parse(raw) as { base64?: string; format?: string }
      if (!data.base64) return null
      const fmt = data.format || 'wav'
      return data.base64.startsWith('data:')
        ? data.base64
        : `data:audio/${fmt};base64,${data.base64}`
    } catch {
      return null
    }
  }

  protected buildRequestBody(text: string, _options?: { voice?: string }): Record<string, unknown> {
    const ref = this.loadReferenceAudio()
    if (!ref) {
      throw new Error('音色复刻未就绪：请先上传参考音频（见 data/voice-sample.json）')
    }
    return {
      model: this.model,
      modalities: ['audio'],
      // 关键：参考音频放 audio.voice（base64 data URL）
      audio: { voice: ref, format: 'mp3' },
      messages: [{ role: 'assistant', content: text }],
    }
  }

  async isReady(): Promise<boolean> {
    if (!config.mimoApiKey) return false
    return this.loadReferenceAudio() !== null
  }
}

// ── 单例导出 ──
export const mimoPresetTts = new MimoPresetTtsEngine()
export const mimoDesignTts = new MimoDesignTtsEngine()
export const mimoCloneTts = new MimoCloneTtsEngine()
