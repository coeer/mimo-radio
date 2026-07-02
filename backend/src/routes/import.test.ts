import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// mock neteaseService：parsePlaylist 解析文本、search 返回固定结果、getOuterPlayUrl 纯拼接
vi.mock('../services/netease', () => ({
  neteaseService: {
    parsePlaylist: vi.fn((text: string) => {
      // 复刻真实行为：文本格式 "id - title - artist"
      const songs: Array<Record<string, unknown>> = []
      const regex = /(\d+)\s*-\s*(.+?)\s*-\s*(.+?)(?:\n|$)/g
      let m
      while ((m = regex.exec(text)) !== null) {
        songs.push({ id: m[1], title: m[2].trim(), artist: m[3].trim(), neteaseId: m[1] })
      }
      return songs
    }),
    search: vi.fn().mockResolvedValue([{ id: 'ne_1', title: '搜索结果', artist: 'A' }]),
    getOuterPlayUrl: vi.fn((id: string) => `http://music.163.com/outer?id=${id}.mp3`),
  },
}))

// mock engine：getSongPool 返回可控池，loadSongs 记录调用
const mockPool: Array<{ id: string; title: string; artist: string }> = []
vi.mock('../services/engine', () => ({
  getSongPool: vi.fn(() => mockPool),
  loadSongs: vi.fn((songs: unknown) => {
    mockPool.length = 0
    mockPool.push(...(songs as Array<{ id: string; title: string; artist: string }>))
  }),
}))

import importRoutes from './import'
import { loadSongs } from '../services/engine'

const app = express()
app.use(express.json())
app.use('/api/import', importRoutes)
app.use((err: { message: string }, _req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ success: false, error: { message: err.message } })
})

describe('POST /api/import/playlist', () => {
  beforeEach(() => {
    mockPool.length = 0
    vi.clearAllMocks()
  })

  it('接受 JSON 歌曲数组并合并到歌池', async () => {
    const res = await request(app)
      .post('/api/import/playlist')
      .send({ songs: [{ id: 'a1', title: '晴天', artist: '周杰伦' }] })

    expect(res.status).toBe(200)
    expect(res.body.imported).toBe(1)
    expect(res.body.total).toBe(1)
    expect(loadSongs).toHaveBeenCalledOnce()
  })

  it('去重：已存在的 id 不重复加入', async () => {
    // 先导入一首
    await request(app).post('/api/import/playlist').send({ songs: [{ id: 'a1', title: '晴天', artist: '周杰伦' }] })
    // 再次导入相同 id + 新 id
    const res = await request(app).post('/api/import/playlist').send({
      songs: [
        { id: 'a1', title: '晴天', artist: '周杰伦' },
        { id: 'a2', title: '稻香', artist: '周杰伦' },
      ],
    })

    expect(res.body.imported).toBe(2) // 请求里的数量
    expect(res.body.total).toBe(2) // 池里只有 2 首（去重后）
  })

  it('接受纯文本歌单字符串（走 parsePlaylist）', async () => {
    const res = await request(app)
      .post('/api/import/playlist')
      .send({ songs: '100 - 晴天 - 周杰伦\n200 - 稻香 - 周杰伦' })

    expect(res.status).toBe(200)
    expect(res.body.imported).toBe(2)
  })

  it('neteaseId 存在时生成 outer playUrl', async () => {
    const res = await request(app)
      .post('/api/import/playlist')
      .send({ songs: [{ id: 'n9', title: '夜曲', artist: '周杰伦', neteaseId: '999' }] })

    expect(res.status).toBe(200)
    // loadSongs 被调用，传入的歌曲应含 playUrl（由 neteaseService.getOuterPlayUrl 生成）
    const loaded = (loadSongs as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Array<{ playUrl?: string }>
    expect(loaded[0].playUrl).toContain('id=999')
  })

  it('缺 songs 字段时校验失败返回 400', async () => {
    const res = await request(app).post('/api/import/playlist').send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/import/netease/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('返回搜索结果', async () => {
    const res = await request(app)
      .post('/api/import/netease/search')
      .send({ keyword: '周杰伦', limit: 5 })

    expect(res.status).toBe(200)
    expect(res.body.songs).toHaveLength(1)
    expect(res.body.songs[0].title).toBe('搜索结果')
  })

  it('空 keyword 校验失败', async () => {
    const res = await request(app).post('/api/import/netease/search').send({ keyword: '' })
    expect(res.status).toBe(400)
  })
})
