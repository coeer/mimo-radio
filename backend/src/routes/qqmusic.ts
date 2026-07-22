import { Router } from 'express'
import { z } from 'zod'
import { qqMusicService } from '../services/qqmusic'
import { validateParams, validateQuery } from '../middleware/validate'

const router = Router()

const searchQuerySchema = z.object({
  keyword: z.string().min(1).max(200),
  limit: z.coerce.number().min(1).max(50).default(20),
})

const midParamSchema = z.object({
  mid: z.string().min(1).max(64),
})

/**
 * GET /api/qqmusic/search
 * Query: ?keyword=周杰伦&limit=10
 */
router.get('/search', validateQuery(searchQuerySchema), async (req, res, next) => {
  try {
    const { keyword, limit } = req.query as unknown as z.infer<typeof searchQuerySchema>
    const songs = await qqMusicService.search(keyword, limit)
    res.json({
      success: true,
      platform: 'qq',
      keyword,
      count: songs.length,
      songs,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/qqmusic/url/:mid
 * Returns playable URL for a song mid
 */
router.get('/url/:mid', validateParams(midParamSchema), async (req, res, next) => {
  try {
    const { mid } = req.params
    const url = await qqMusicService.getPlayUrl(mid)
    if (!url) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No playable URL found (may be VIP-only or unavailable)',
          code: 'PLAYBACK_UNAVAILABLE',
        },
        mid,
      })
    }
    res.json({ success: true, mid, url })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/qqmusic/lyric/:mid
 */
router.get('/lyric/:mid', validateParams(midParamSchema), async (req, res, next) => {
  try {
    const { mid } = req.params
    const lyric = await qqMusicService.getLyric(mid)
    if (!lyric) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lyric not found', code: 'NOT_FOUND' },
        mid,
      })
    }
    res.json({ success: true, mid, ...lyric })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/qqmusic/detail/:mid
 */
router.get('/detail/:mid', validateParams(midParamSchema), async (req, res, next) => {
  try {
    const { mid } = req.params
    const detail = await qqMusicService.getSongDetail(mid)
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: { message: 'Song not found', code: 'NOT_FOUND' },
        mid,
      })
    }
    res.json({ success: true, mid, detail })
  } catch (err) {
    next(err)
  }
})

export default router
