import { Song, RadioSession, SessionContext } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { MOCK_SONGS } from '../mockData/songs'
import { getAllMusicSources } from './musicSource'
import { logger, toErrorMeta } from '../utils/logger'
import { getLikedArtists } from '../db'
import {
  QUEUE_LENGTH,
  TOP_K_CANDIDATES,
  DIVERSITY_PENALTY_SAME_ARTIST,
  WEIGHT_SAME_ARTIST,
  WEIGHT_EMOTION_OVERLAP,
  WEIGHT_SCENE_OVERLAP,
  WEIGHT_MOOD_PROXIMITY_MAX,
  MOOD_SCORE_FACTOR,
  TAG_FILTER_KEYWORDS,
} from '../constants'
export { MOCK_SONGS }

// Song pool
let songPool: Song[] = []

const LOCAL_TRACKS = [
  `${config.apiBaseUrl}/static/audio/track1.mp3`,
  `${config.apiBaseUrl}/static/audio/track3.mp3`,
]

export function loadMockSongs() {
  // Deep clone to avoid mutating the original MOCK_SONGS
  songPool = MOCK_SONGS.map((s, i) => ({
    ...s,
    playUrl: LOCAL_TRACKS[i % LOCAL_TRACKS.length],
    platform: 'mock' as const,
  }))
}

export function getSongPool(): Song[] {
  return songPool
}

export function loadSongs(songs: Song[]) {
  songPool = songs
}

/**
 * 基于当前音源真实搜索构建曲库 —— 替代 MOCK。
 * 支持网易云/QQ 双音源切换（getMusicSource 自动路由）。
 *
 * 搜索失败时的兜底策略（分层保障总有歌可放）：
 *   1. 首选音源（如 QQ）搜索失败/返回空
 *   2. 自动尝试所有备用音源（如网易云）
 *   3. 全部失败才回落 MOCK_SONGS
 */
export async function loadNeteaseSongs(keywords: string[]): Promise<{ songs: Song[]; source: string }> {
  const all: Song[] = []
  const seenIds = new Set<string>()
  const sources = getAllMusicSources() // 首选排第一，其余备用
  let usedSourceId = ''

  // B2：把用户收藏过的歌手加入搜索关键词（品味加权）
  // 偏好歌手追加在用户输入关键词之后——用户意图优先，偏好作为补充丰富曲库
  const likedArtists = getLikedArtists(3)
  const likedKeywords = likedArtists.map(a => a.artist)
  const allKeywords = [...keywords, ...likedKeywords]

  for (const kw of allKeywords) {
    let foundThisKw = false
    for (const source of sources) {
      if (foundThisKw) break
      try {
        const found = await source.searchPlayable(kw, 8)
        if (found.length === 0) continue // 该音源没搜到，试下一个
        foundThisKw = true
        usedSourceId = source.id
        for (const s of found) {
          // QQ 音源 searchPlayable 不返回 playUrl（延迟获取），用 playable 标记
          const usable = s.playUrl || s.playable
          if (usable !== false && !seenIds.has(s.id)) {
            seenIds.add(s.id)
            all.push(s)
          }
        }
        logger.debug('曲库加载', { source: source.id, keyword: kw, got: found.length })
      } catch (err) {
        logger.error('曲库加载失败', { source: source.id, keyword: kw, ...toErrorMeta(err) })
        // 继续尝试下一个备用音源
      }
    }
  }

  if (all.length === 0) {
    // 所有音源都失败 → 兜底回落 mock
    logger.warn('所有音源均无结果，回落 MOCK_SONGS', { sources: sources.map((s) => s.id), keywords })
    loadMockSongs()
    return { songs: songPool, source: 'mock-fallback' }
  }

  songPool = all
  logger.info('曲库加载完成', { source: usedSourceId, count: all.length, keywords })
  return { songs: all, source: usedSourceId }
}

export function filterByMood(songs: Song[], mood?: string): Song[] {
  if (!mood) return [...songs]
  const lowerMood = mood.toLowerCase()
  const filtered = songs.filter(s =>
    s.emotionTags.some(t => t.toLowerCase().includes(lowerMood)) ||
    s.sceneTags.some(t => t.toLowerCase().includes(lowerMood)) ||
    s.title.toLowerCase().includes(lowerMood) ||
    s.artist.toLowerCase().includes(lowerMood) ||
    (s.album && s.album.toLowerCase().includes(lowerMood))
  )
  return filtered.length > 0 ? filtered : [...songs]
}

function filterByTags(songs: Song[], tags: string[]): Song[] {
  if (!tags.length) return [...songs]
  const lowerTags = tags.map(t => t.toLowerCase())
  const filtered = songs.filter(s =>
    lowerTags.some(tag =>
      s.emotionTags.some(t => t.toLowerCase().includes(tag)) ||
      s.sceneTags.some(t => t.toLowerCase().includes(tag))
    )
  )
  return filtered.length > 0 ? filtered : [...songs]
}

export function calculateSimilarity(a: Song, b: Song): number {
  let score = 0
  // Same artist
  if (a.artist === b.artist) score += WEIGHT_SAME_ARTIST
  // Emotion overlap
  const emotionOverlap = a.emotionTags.filter(t => b.emotionTags.includes(t)).length
  score += emotionOverlap * WEIGHT_EMOTION_OVERLAP
  // Scene overlap
  const sceneOverlap = a.sceneTags.filter(t => b.sceneTags.includes(t)).length
  score += sceneOverlap * WEIGHT_SCENE_OVERLAP
  // Mood score proximity
  if (a.moodScore != null && b.moodScore != null) {
    score += Math.max(0, WEIGHT_MOOD_PROXIMITY_MAX - Math.abs(a.moodScore - b.moodScore) * MOOD_SCORE_FACTOR)
  }
  return score
}

function pickNextSong(candidates: Song[], lastSong: Song | null, usedIds: Set<string>): Song | null {
  const available = candidates.filter(s => !usedIds.has(s.id))
  if (available.length === 0) return null
  if (!lastSong) return available[Math.floor(Math.random() * available.length)]

  const scored = available.map(song => {
    let score = calculateSimilarity(lastSong, song)
    // Diversity: penalize same artist
    if (song.artist === lastSong.artist) score -= DIVERSITY_PENALTY_SAME_ARTIST
    return { song, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const topK = scored.slice(0, Math.min(TOP_K_CANDIDATES, scored.length))
  return topK[Math.floor(Math.random() * topK.length)].song
}

export function generateQueue(
  candidates: Song[],
  seedSongId?: string,
  length: number = QUEUE_LENGTH
): Song[] {
  const queue: Song[] = []
  const usedIds = new Set<string>()

  // Seed song first
  if (seedSongId) {
    const seed = candidates.find(s => s.id === seedSongId)
    if (seed) {
      queue.push(seed)
      usedIds.add(seed.id)
    }
  }

  while (queue.length < length && usedIds.size < candidates.length) {
    const next = pickNextSong(candidates, queue[queue.length - 1] || null, usedIds)
    if (!next) break
    queue.push(next)
    usedIds.add(next.id)
  }

  return queue
}

export function createSession(
  mood?: string,
  djEnabled: boolean = true,
  seedSongId?: string,
  context?: SessionContext
): RadioSession {
  // If mood is a specific tag, try tag filtering first
  let candidates: Song[]
  if (context?.mood && TAG_FILTER_KEYWORDS.some(t => context.mood?.includes(t))) {
    candidates = filterByTags(songPool, [context.mood])
  } else {
    candidates = filterByMood(songPool, mood)
  }

  // If too few results, expand
  if (candidates.length < 5) {
    candidates = [...songPool]
  }

  const queue = generateQueue(candidates, seedSongId, 20)

  return {
    id: uuidv4(),
    queue,
    currentIndex: 0,
    djEnabled,
    context: context || { time: new Date().toISOString() },
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
