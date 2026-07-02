import { Router } from 'express'
import { loadPersona, generatePersona, personaPromptBlock } from '../services/djPersona'
import { getAIService } from '../services/aiFactory'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'

const router = Router()

const TASTE_FILE = path.join(__dirname, '../../data/netease-taste.json')

/** 读取当前 DJ 人设 */
router.get('/', (req, res) => {
  const persona = loadPersona()
  res.json({ persona })
})

/** 读取人设的 prompt 文本块（调试用） */
router.get('/prompt-block', (req, res) => {
  res.json({ block: personaPromptBlock() })
})

/**
 * 基于 netease-taste.json 生成 DJ 人设。
 * 首次配置 / 想刷新人设时调用。
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { model } = req.body as { model?: string }
    const ai = getAIService(model)

    // 读取已抓取的用户听歌数据
    let userTaste: any = undefined
    if (fs.existsSync(TASTE_FILE)) {
      const raw = fs.readFileSync(TASTE_FILE, 'utf-8')
      const data = JSON.parse(raw)
      // 从 favorite_tracks_sample + yoasobi + instrumental 提炼画像输入
      const samples = [
        ...(data.favorite_tracks_sample || []),
        ...(data.instrumental_playlist_sample || []),
      ].slice(0, 15).map((s: any) => ({ name: s.name, artist: s.artist }))

      userTaste = {
        tasteType: '多元跨界（J-Pop/华语伤感/纯音乐/欧美电子）',
        genres: ['J-Pop', '华语流行', '纯音乐', 'New Age', '电子', 'ACG'],
        signatureArtists: ['YOASOBI', 'Aimer', '久石譲', '坂本龍一', '司南', '程响', 'DJ Okawari', 'Bôa'],
        sceneTags: ['深夜', '专注', 'ACG', '游戏'],
        sampleSongs: samples,
      }
      logger.info('使用网易云听歌数据生成人设', { samples: samples.length })
    } else {
      logger.warn('未找到 netease-taste.json，生成通用 DJ 人设')
    }

    const persona = await generatePersona(
      (messages) => ai.chat(messages),
      userTaste
    )
    res.json({ persona, source: userTaste ? 'netease-taste' : 'default' })
  } catch (err) {
    next(err)
  }
})

export default router
