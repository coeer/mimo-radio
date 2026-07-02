import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import radioRoutes from './radio'
import { initDb } from '../db'

process.env.SESSION_SECRET = 'test-secret-32-chars-long!!!!!!'

// Mock AI：返回带 [QQ音乐:] 标签
vi.mock('../services/aiFactory', () => ({
  getAIService: () => ({
    model: 'mock-model',
    chat: vi.fn().mockResolvedValue('好的，给你放周杰伦的晴天[QQ音乐:周杰伦 晴天]'),
    generateIntro: vi.fn().mockResolvedValue('欢迎收听！'),
    generateDJTransition: vi.fn().mockResolvedValue({ text: '接下来...' }),
    generateRecommendationStrategy: vi.fn().mockResolvedValue({
      mood: '测试', genres: [], energy: 'medium', reason: '测试'
    }),
    analyzePersonality: vi.fn().mockResolvedValue({ type: '测试', description: 't' }),
    chatWithImage: vi.fn().mockResolvedValue(''),
  }),
  listAvailableModels: () => [{ id: 'mock', name: 'Mock', supportsImage: false }],
}))

// Mock QQ音乐：第 1 首可播
vi.mock('../services/qqmusic', () => ({
  qqMusicService: {
    search: vi.fn().mockResolvedValue([]),
  },
}))

// 点歌 [QQ音乐:] 现在走 netease.searchPlayable（含完整 Song 字段）
vi.mock('../services/netease', () => ({
  neteaseService: {
    search: vi.fn().mockResolvedValue([
      { id: 'ne_1', title: '晴天', artist: '周杰伦', playUrl: 'http://x/q.mp3', neteaseId: 'n1', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
      { id: 'ne_2', title: '稻香', artist: '周杰伦', playUrl: null, neteaseId: 'n2', playable: false, fee: 1, emotionTags: [], sceneTags: [], platform: 'netease' },
    ]),
    searchPlayable: vi.fn().mockResolvedValue([
      { id: 'ne_1', title: '晴天', artist: '周杰伦', playUrl: 'http://x/q.mp3', neteaseId: 'n1', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    ]),
    getOuterPlayUrl: vi.fn((id) => `http://x/outer/${id}.mp3`),
  },
}))

// mock 统一音源层
vi.mock('../services/musicSource', () => {
  const songs = [
    { id: 'ne_1', title: '晴天', artist: '周杰伦', playUrl: 'http://x/q.mp3', neteaseId: 'n1', qqMusicMid: undefined, playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
  ]
  return {
    getMusicSource: () => ({ searchPlayable: vi.fn().mockResolvedValue(songs), getPlayUrl: vi.fn().mockResolvedValue('http://x/q.mp3') }),
    getCurrentSourceId: () => 'netease',
    setCurrentSourceId: () => true,
    listMusicSources: () => [],
  }
})

const app = express()
app.use(express.json())
app.use('/api/radio', radioRoutes)
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ success: false, error: { message: err.message } })
})

describe('POST /api/radio/:id/chat —— [QQ音乐:] 点歌同时返回推荐卡片', () => {
  let token: string
  let sessionId: string

  beforeAll(async () => {
    initDb()
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })
    token = createRes.body.session_token
    sessionId = token.split('.')[0]
  })

  it('点歌应返回可播放的 new_song', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '放周杰伦晴天' })

    expect(res.status).toBe(200)
    expect(res.body.new_song).toBeDefined()
    expect(res.body.new_song.title).toBe('晴天')
    expect(res.body.new_song.playUrl).toBeTruthy()
  })

  it('点歌应同时返回 recommendations 卡片', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '再来一首' })

    expect(res.body.recommendations).toBeDefined()
    expect(res.body.recommendations.length).toBeGreaterThan(0)
  })

  it('点歌 action 应为 play_qqmusic', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '放歌' })

    expect(res.body.action).toBe('play_qqmusic')
  })
})
