import { Router } from 'express'
import { z } from 'zod'
import { getAIService } from '../services/aiFactory'
import { getTtsEngine, setCurrentTtsEngine } from '../services/ttsEngine'
import { mimoAsrService } from '../services/mimoAsr'
import { writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { validateBody } from '../middleware/validate'
import { aiLimiter } from '../middleware/aiLimiter'
import { cleanupAudioFiles } from '../utils/fileCleanup'
import type { Song, SessionContext } from '../types'

const router = Router()

const AUDIO_DIR = join(__dirname, '../../static/audio')
const CLEANUP_OPTIONS = { maxFiles: 50, maxAgeMs: 24 * 60 * 60 * 1000, maxTotalSizeMb: 200 }

const transitionSchema = z.object({
  prev_song: z.custom<Song | null>((val) => val === null || typeof val === 'object'),
  next_song: z.custom<Song>((val) => typeof val === 'object' && val !== null),
  context: z.custom<SessionContext>((val) => typeof val === 'object' && val !== null),
  model: z.string().max(50).optional(),
})

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  engine: z.string().max(50).optional(), // 可选：覆盖当前 TTS 引擎（如 'mimo-design'）
  voice: z.string().max(50).optional(), // 可选：覆盖预置引擎的默认音色（如 '冰糖'）
})

/** MiMo 预置音色全集（与官方文档对齐） */
const PRESET_VOICES = [
  { id: '苏打', name: '苏打', gender: '男', style: '电台', lang: 'zh', desc: '沉稳磁性，深夜电台老朋友' },
  { id: '冰糖', name: '冰糖', gender: '女', style: '清甜', lang: 'zh', desc: '清甜自然，邻家少女感' },
  { id: '茉莉', name: '茉莉', gender: '女', style: '知性', lang: 'zh', desc: '知性温柔，娓娓道来' },
  { id: '白桦', name: '白桦', gender: '男', style: '大气', lang: 'zh', desc: '大气浑厚，沉稳可靠' },
  { id: 'Mia', name: 'Mia', gender: '女', style: '英文', lang: 'en', desc: 'Female English voice' },
  { id: 'Chloe', name: 'Chloe', gender: '女', style: '英文', lang: 'en', desc: 'Female English voice' },
  { id: 'Milo', name: 'Milo', gender: '男', style: '英文', lang: 'en', desc: 'Male English voice' },
  { id: 'Dean', name: 'Dean', gender: '男', style: '英文', lang: 'en', desc: 'Male English voice' },
]

const introSchema = z.object({
  mood: z.string().max(100).optional(),
  context: z.custom<SessionContext>((val) => typeof val === 'object' && val !== null).optional(),
  model: z.string().max(50).optional(),
})

const analyzeImageSchema = z.object({
  text: z.string().max(1000).optional(),
  image: z.string().min(1).max(10_000_000), // ~7.5MB base64
  model: z.string().max(50).optional(),
})

const asrSchema = z.object({
  audio: z.string().min(1).max(20_000_000), // base64 音频（≤~15MB）
  format: z.enum(['wav', 'mp3', 'webm', 'ogg', 'm4a', 'mp4']).optional(),
  language: z.enum(['auto', 'zh', 'en']).optional(),
})

// POST /api/dj/transition
router.post('/transition', aiLimiter, validateBody(transitionSchema), async (req, res, next) => {
  try {
    const { prev_song, next_song, context, model } = req.body
    const ai = getAIService(model)
    const transition = await ai.generateDJTransition(prev_song, next_song, context)
    res.json(transition)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/tts-voices —— 预置音色列表（供设置页音色选择）
router.get('/tts-voices', (_req, res) => {
  res.json({ voices: PRESET_VOICES })
})

// POST /api/v1/dj/tts
router.post('/tts', aiLimiter, validateBody(ttsSchema), async (req, res, next) => {
  try {
    const { text, engine, voice } = req.body
    if (!text) {
      return res.status(400).json({
        success: false,
        error: { message: 'text is required', code: 'VALIDATION_ERROR' },
      })
    }

    // 若请求指定了 engine，切换到该引擎（与音源 switch 一致：切换即生效）
    let usedEngineId = ''
    if (engine) {
      const switched = setCurrentTtsEngine(engine)
      if (!switched) {
        return res.status(400).json({
          success: false,
          error: { message: `unknown tts engine: ${engine}`, code: 'INVALID_ENGINE' },
        })
      }
      usedEngineId = engine
    }

    const ttsEngine = getTtsEngine()
    usedEngineId = usedEngineId || ttsEngine.id

    // voice 透传给引擎（仅预置引擎生效，设计/复刻引擎忽略）
    const audio = await ttsEngine.synthesize(text, voice ? { voice } : undefined)
    const filename = `${randomUUID()}.mp3`
    const filepath = join(AUDIO_DIR, filename)
    const dir = dirname(filepath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(filepath, audio)

    // Clean up old audio files asynchronously (non-blocking)
    cleanupAudioFiles(AUDIO_DIR, CLEANUP_OPTIONS).catch(() => {})

    res.json({
      audio_url: `/static/audio/${filename}`,
      text,
      engine: usedEngineId,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/dj/intro
router.post('/intro', aiLimiter, validateBody(introSchema), async (req, res, next) => {
  try {
    const { mood, context, model } = req.body
    const ai = getAIService(model)
    const intro = await ai.generateIntro(mood || '随机', context || { time: new Date().toISOString() })
    res.json({ text: intro })
  } catch (err) {
    next(err)
  }
})

// POST /api/dj/analyze-image
router.post('/analyze-image', aiLimiter, validateBody(analyzeImageSchema), async (req, res, next) => {
  try {
    const { text, image, model } = req.body
    if (!image) {
      return res.status(400).json({
        success: false,
        error: { message: 'image is required', code: 'VALIDATION_ERROR' },
      })
    }

    // Validate base64 format
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/
    const cleaned = image.replace(/^data:image\/\w+;base64,/, '')
    if (!base64Pattern.test(cleaned)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid base64 image data', code: 'INVALID_IMAGE' },
      })
    }

    const ai = getAIService(model)
    const prompt = text || '描述这张图片的氛围和情感，并推荐适合的音乐心情。'
    const result = await ai.chatWithImage(prompt, cleaned)

    // Extract mood from the analysis
    const moodMatch = result.match(/心情[：:]\s*([^\n。]+)/)
    const mood = moodMatch ? moodMatch[1].trim() : undefined

    res.json({ result, mood })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/dj/asr —— 语音识别（语音 → 文字）
// 为未来"语音点歌"功能预留。body: { audio: base64, format?: 'wav'|'mp3', language?: 'auto'|'zh'|'en' }
router.post('/asr', aiLimiter, validateBody(asrSchema), async (req, res, next) => {
  try {
    const { audio, format, language } = req.body
    // 去掉可能的 data URL 前缀
    const cleaned = audio.replace(/^data:audio\/\w+;base64,/, '')
    const audioBuffer = Buffer.from(cleaned, 'base64')

    const text = await mimoAsrService.transcribe(
      audioBuffer,
      format || 'wav',
      language || 'auto'
    )

    res.json({ text, format: format || 'wav' })
  } catch (err) {
    next(err)
  }
})

export default router
