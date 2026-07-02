import { Router } from 'express'
import { z } from 'zod'
import { qqMusicService } from '../services/qqmusic'
import { neteaseService } from '../services/netease'
import { validateParams } from '../middleware/validate'
import { logger } from '../utils/logger'

const router = Router()

/**
 * 歌词获取参数：platform + 歌曲在该平台的 id
 * - qq：songMid（QQ 的歌曲标识）
 * - netease：neteaseId（网易云数字 id）
 */
const lyricParamsSchema = z.object({
  platform: z.enum(['qq', 'netease']),
  id: z.string().min(1),
})

/**
 * GET /api/v1/lyric/:platform/:id
 * 返回歌曲 LRC 歌词（原文 + 可选翻译）。
 * QQ 走 qqMusicService.getLyric(mid)，网易云走 neteaseService.getLyric(id)。
 * 失败返回空歌词（前端据此降级到 DJ 解说高亮）。
 */
router.get('/:platform/:id', validateParams(lyricParamsSchema), async (req, res, next) => {
  try {
    const { platform, id } = req.params as z.infer<typeof lyricParamsSchema>

    if (platform === 'qq') {
      const result = await qqMusicService.getLyric(id)
      if (!result) {
        res.json({ success: true, data: { lyric: '', transLyric: undefined, hasLyric: false } })
        return
      }
      res.json({
        success: true,
        data: {
          lyric: result.lyric,
          transLyric: result.transLyric,
          hasLyric: !!result.lyric,
        },
      })
      return
    }

    // netease
    const result = await neteaseService.getLyric(id)
    if (!result) {
      res.json({ success: true, data: { lyric: '', tlyric: undefined, hasLyric: false } })
      return
    }
    res.json({
      success: true,
      data: {
        lyric: result.lyric,
        tlyric: result.tlyric,
        hasLyric: !!result.lyric,
      },
    })
  } catch (err) {
    logger.error('lyric route failed', { error: err instanceof Error ? err.message : String(err) })
    next(err)
  }
})

export default router
