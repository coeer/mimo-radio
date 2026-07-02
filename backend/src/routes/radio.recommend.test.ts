import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import radioRoutes from './radio'
import { initDb } from '../db'

// Ensure session secret is set for token signing
process.env.SESSION_SECRET = 'test-secret-32-chars-long!!!!!!'

// Mock AI：让它返回带推荐标签的回复
vi.mock('../services/aiFactory', () => ({
  getAIService: () => ({
    model: 'mock-model',
    chat: vi.fn().mockResolvedValue('明白了，我给你找了五首开头就定情绪的，先放给你听：[推荐:爵士]'),
    generateIntro: vi.fn().mockResolvedValue('欢迎收听！'),
    generateDJTransition: vi.fn().mockResolvedValue({ text: '接下来...' }),
    generateRecommendationStrategy: vi.fn().mockResolvedValue({
      mood: '测试', genres: [], energy: 'medium', reason: '测试'
    }),
    analyzePersonality: vi.fn().mockResolvedValue({ type: '测试型', description: '测试描述' }),
    chatWithImage: vi.fn().mockResolvedValue(''),
  }),
  listAvailableModels: () => [{ id: 'mock', name: 'Mock', supportsImage: false }],
}))

// Mock QQ音乐（保留 import 兼容）
vi.mock('../services/qqmusic', () => ({
  qqMusicService: {
    search: vi.fn().mockResolvedValue([]),
  },
}))

// Mock 网易云：searchPlayable 返回 5 首真实可播结果（含完整 Song 字段）
vi.mock('../services/netease', () => {
  const songs = () => [
    { id: 'ne_1', title: 'If', artist: 'Bread', playUrl: 'http://x/1.mp3', neteaseId: 'n1', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_2', title: 'Fade Into You', artist: 'Mazzy Star', playUrl: 'http://x/2.mp3', neteaseId: 'n2', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_3', title: 'Wicked Game', artist: 'Chris Isaak', playUrl: 'http://x/3.mp3', neteaseId: 'n3', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_4', title: 'The Night We Met', artist: 'Lord Huron', playUrl: 'http://x/4.mp3', neteaseId: 'n4', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_5', title: 'Nude', artist: 'Radiohead', playUrl: 'http://x/5.mp3', neteaseId: 'n5', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
  ]
  return {
    neteaseService: {
      search: vi.fn().mockResolvedValue(songs()),
      searchPlayable: vi.fn().mockResolvedValue(songs()),
      getOuterPlayUrl: vi.fn((id: string) => `http://x/outer/${id}.mp3`),
    },
  }
})

// mock 统一音源层（chat 走 getMusicSource().searchPlayable）
vi.mock('../services/musicSource', () => {
  const songs = [
    { id: 'ne_1', title: 'If', artist: 'Bread', playUrl: 'http://x/1.mp3', neteaseId: 'n1', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_2', title: 'Fade Into You', artist: 'Mazzy Star', playUrl: 'http://x/2.mp3', neteaseId: 'n2', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_3', title: 'Wicked Game', artist: 'Chris Isaak', playUrl: 'http://x/3.mp3', neteaseId: 'n3', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_4', title: 'The Night We Met', artist: 'Lord Huron', playUrl: 'http://x/4.mp3', neteaseId: 'n4', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
    { id: 'ne_5', title: 'Nude', artist: 'Radiohead', playUrl: 'http://x/5.mp3', neteaseId: 'n5', playable: true, fee: 8, emotionTags: [], sceneTags: [], platform: 'netease' },
  ]
  return {
    getMusicSource: () => ({ searchPlayable: vi.fn().mockResolvedValue(songs), getPlayUrl: vi.fn().mockResolvedValue('http://x/1.mp3') }),
    getCurrentSourceId: () => 'netease',
    setCurrentSourceId: () => true,
    listMusicSources: () => [],
  }
})

const app = express()
app.use(express.json())
app.use('/api/radio', radioRoutes)
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ success: false, error: { message: err.message || 'Unknown error' } })
})

describe('POST /api/radio/:id/chat —— 推荐扩展', () => {
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

  it('推荐请求应返回结构化 recommendations 数组', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '推荐点爵士' })

    expect(res.status).toBe(200)
    expect(res.body.recommendations).toBeDefined()
    expect(res.body.recommendations).toBeInstanceOf(Array)
    expect(res.body.recommendations.length).toBeLessThanOrEqual(5)
  })

  it('推荐数组每项应含 title 和 artist', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '再推荐点' })

    const recs = res.body.recommendations
    expect(recs.length).toBeGreaterThan(0)
    for (const r of recs) {
      expect(r.title).toBeDefined()
      expect(r.artist).toBeDefined()
    }
  })

  it('推荐数组首项应 selected=true', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '继续推荐' })

    expect(res.body.recommendations[0].selected).toBe(true)
  })

  it('推荐应携带 neteaseId 便于前端点播', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '推荐' })

    expect(res.body.recommendations[0].neteaseId).toBeDefined()
  })

  it('显示文本应去掉 [推荐:] 标签', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '推荐' })

    expect(res.body.reply).not.toContain('[推荐:')
    expect(res.body.reply).not.toContain('[QQ音乐:')
  })

  it('action 字段应标记为 recommend', async () => {
    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: '推荐' })

    expect(res.body.action).toBe('recommend')
  })
})
