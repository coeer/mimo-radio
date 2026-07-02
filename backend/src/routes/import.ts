import { Router } from 'express'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { neteaseService } from '../services/netease'
import { loadSongs, getSongPool } from '../services/engine'
import { validateBody } from '../middleware/validate'

const router = Router()

const songItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  name: z.string().optional(),
  artist: z.string().min(1),
  album: z.string().optional(),
  neteaseId: z.string().optional(),
  playUrl: z.string().optional(),
  emotionTags: z.array(z.string()).default([]),
  sceneTags: z.array(z.string()).default([]),
})

const playlistSchema = z.object({
  songs: z.union([z.array(songItemSchema), z.string().max(5_000_000)]),
})

const neteaseSearchSchema = z.object({
  keyword: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(50).optional(),
})

// POST /api/import/playlist
router.post('/playlist', validateBody(playlistSchema), (req, res, next) => {
  try {
    // For now, accept JSON or simple text list
    const { songs } = req.body
    const imported: Array<{ id?: string; title?: string; name?: string; artist?: string; album?: string; neteaseId?: string; playUrl?: string; emotionTags?: string[]; sceneTags?: string[] }> = []

    if (Array.isArray(songs)) {
      imported.push(...songs)
    } else if (typeof songs === 'string') {
      const parsed = neteaseService.parsePlaylist(songs)
      imported.push(...parsed)
    }

    // Merge with existing pool
    const existing = getSongPool()
    const merged = [...existing]
    imported.forEach((s) => {
      if (!existing.find(e => e.id === s.id)) {
        merged.push({
          id: s.id || randomUUID(),
          title: s.title || s.name || 'Unknown',
          artist: s.artist || 'Unknown',
          album: s.album,
          neteaseId: s.neteaseId || s.id,
          playUrl: s.neteaseId ? neteaseService.getOuterPlayUrl(s.neteaseId) : undefined,
          emotionTags: s.emotionTags || [],
          sceneTags: s.sceneTags || [],
        })
      }
    })

    loadSongs(merged)

    res.json({
      imported: imported.length,
      total: merged.length,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/import/netease/search
router.post('/netease/search', validateBody(neteaseSearchSchema), async (req, res, next) => {
  try {
    const { keyword, limit } = req.body
    const songs = await neteaseService.search(keyword, limit || 10)
    res.json({ songs })
  } catch (err) {
    next(err)
  }
})

export default router
