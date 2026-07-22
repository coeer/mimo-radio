import { Router } from 'express'
import { z } from 'zod'
import {
  listMusicSources,
  getCurrentSourceId,
  setCurrentSourceId,
  getMusicSource,
} from '../services/musicSource'
import { validateBody } from '../middleware/validate'

const router = Router()

/** 列出所有音源 + 当前选中 */
router.get('/', (req, res) => {
  res.json({
    current: getCurrentSourceId(),
    sources: listMusicSources(),
  })
})

/** 检查某音源是否就绪（QQ 依赖 webbridge+登录态） */
router.get('/:id/ready', async (req, res, next) => {
  try {
    const source = getMusicSource()
    const ready = await source.isReady()
    res.json({ id: source.id, ready })
  } catch (err) {
    next(err)
  }
})

const switchSchema = z.object({
  id: z.enum(['netease', 'qq']),
})

const playUrlSchema = z.object({
  songId: z.string().min(1).max(100),
})

/** 获取单曲播放 URL（QQ 延迟获取场景：前端点播时调） */
router.post('/play-url', validateBody(playUrlSchema), async (req, res, next) => {
  try {
    const { songId } = req.body
    const source = getMusicSource()
    const url = await source.getPlayUrl(songId)
    if (url) {
      res.json({ url })
    } else {
      res.status(404).json({
        success: false,
        error: {
          message: '无法获取播放URL（请确保浏览器已登录QQ音乐并打开播放器页）',
          code: 'PLAYBACK_UNAVAILABLE',
        },
      })
    }
  } catch (err) {
    next(err)
  }
})

/** 切换音源 */
router.post('/switch', validateBody(switchSchema), async (req, res, next) => {
  try {
    const { id } = req.body
    // QQ 切换前先检查是否就绪
    if (id === 'qq') {
      // 临时检查 qq（先切过去才能查）—— 实际：直接试切，再验就绪
      const ok = setCurrentSourceId(id)
      if (!ok) {
        res.status(400).json({
          success: false,
          error: { message: '未知音源', code: 'UNKNOWN_SOURCE' },
        })
        return
      }
      const newSource = getMusicSource()
      const ready = await newSource.isReady()
      if (!ready) {
        // 不就绪，回退到网易云并提示
        setCurrentSourceId('netease')
        res.status(400).json({
          success: false,
          error: {
            message: 'QQ 音源未就绪：请确保浏览器已登录 y.qq.com 并打开播放器页，webbridge 在运行',
            code: 'SOURCE_NOT_READY',
          },
          switchedTo: 'netease',
        })
        return
      }
      res.json({ switched: id, ready: true })
    } else {
      const ok = setCurrentSourceId(id)
      if (!ok) {
        res.status(400).json({
          success: false,
          error: { message: '未知音源', code: 'UNKNOWN_SOURCE' },
        })
        return
      }
      res.json({ switched: id })
    }
  } catch (err) {
    next(err)
  }
})

export default router
