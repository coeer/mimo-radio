import { Router } from 'express'
import { z } from 'zod'
import { getAIService } from '../services/aiFactory'
import { getSongPool } from '../services/engine'
import { getProfile, setProfile } from '../db'
import { validateQuery } from '../middleware/validate'
import { ESTIMATED_AVG_SONG_DURATION_SEC, TOP_ARTISTS_COUNT } from '../constants'
import type { Song } from '../types'

const router = Router()

const personalityQuerySchema = z.object({
  model: z.string().max(50).optional(),
})

function computeDistributions(songs: Song[]) {
  const emotionDistribution: Record<string, number> = {}
  const sceneDistribution: Record<string, number> = {}
  const artistCount: Record<string, number> = {}

  songs.forEach(s => {
    s.emotionTags.forEach(t => { emotionDistribution[t] = (emotionDistribution[t] || 0) + 1 })
    s.sceneTags.forEach(t => { sceneDistribution[t] = (sceneDistribution[t] || 0) + 1 })
    artistCount[s.artist] = (artistCount[s.artist] || 0) + 1
  })

  return {
    emotionDistribution,
    sceneDistribution,
    favoriteArtists: Object.entries(artistCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_ARTISTS_COUNT)
      .map(([name]) => name),
  }
}

// GET /api/profile/personality
router.get('/personality', validateQuery(personalityQuerySchema), async (req, res, next) => {
  try {
    const model = req.query.model as string | undefined
    const ai = getAIService(model)

    const songs = getSongPool()
    let result = { type: '音乐探索者', description: '你的音乐品味独特而多元' }
    try {
      result = await ai.analyzePersonality(songs)
    } catch {
      // fallback
    }

    const { emotionDistribution, sceneDistribution, favoriteArtists } = computeDistributions(songs)

    const profile = {
      personalityType: result.type,
      personalityDesc: result.description,
      emotionDistribution,
      sceneDistribution,
      favoriteArtists,
      totalSongs: songs.length,
      totalListenTime: songs.length * ESTIMATED_AVG_SONG_DURATION_SEC,
    }

    setProfile(profile)
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

// GET /api/profile/stats
router.get('/stats', (_req, res) => {
  const profile = getProfile()
  if (profile) {
    res.json(profile)
  } else {
    const songs = getSongPool()
    const { emotionDistribution, sceneDistribution } = computeDistributions(songs)
    res.json({
      personalityType: '音乐探索者',
      personalityDesc: '你的音乐品味独特而多元',
      emotionDistribution,
      sceneDistribution,
      favoriteArtists: [],
      totalSongs: songs.length,
      totalListenTime: songs.length * ESTIMATED_AVG_SONG_DURATION_SEC,
    })
  }
})

export default router
