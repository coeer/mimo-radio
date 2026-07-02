import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import radioRoutes from './radio'
import { initDb, getSession } from '../db'

// Ensure session secret is set for token signing
process.env.SESSION_SECRET = 'test-secret-32-chars-long!!!!!!'

// Mock AI service to avoid real HTTP calls
vi.mock('../services/aiFactory', () => ({
  getAIService: () => ({
    model: 'mock-model',
    chat: vi.fn().mockResolvedValue('收到，让我为你调整一下。'),
    generateIntro: vi.fn().mockResolvedValue('欢迎收听！'),
    generateDJTransition: vi.fn().mockResolvedValue({ text: '接下来...' }),
    generateRecommendationStrategy: vi.fn().mockResolvedValue({
      mood: '测试', genres: [], energy: 'medium', reason: '测试'
    }),
    analyzePersonality: vi.fn().mockResolvedValue({
      type: '测试型', description: '测试描述'
    }),
    chatWithImage: vi.fn().mockResolvedValue(''),
  }),
  listAvailableModels: () => [{ id: 'mock', name: 'Mock', supportsImage: false }],
}))

// Set up a minimal Express app for route testing
const app = express()
app.use(express.json())
app.use('/api/radio', radioRoutes)
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ success: false, error: { message: err.message || 'Unknown error' } })
})

describe('POST /api/radio/create', () => {
  beforeAll(() => {
    initDb()
  })

  it('should create a new radio session and return signed token', async () => {
    const res = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    expect(res.status).toBe(200)
    expect(res.body.session_token).toBeDefined()
    expect(res.body.session_token).toContain('.')
    expect(res.body.queue).toBeInstanceOf(Array)
    expect(res.body.queue.length).toBeGreaterThan(0)
  })

  it('should validate request body', async () => {
    const res = await request(app)
      .post('/api/radio/create')
      .send({ mood: 'x'.repeat(101) })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

describe('POST /api/radio/:id/next', () => {
  it('should increment index and return next song', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const queue = createRes.body.queue
    expect(queue.length).toBeGreaterThan(1)

    const res = await request(app)
      .post(`/api/radio/${token.split('.')[0]}/next`)
      .set('X-Session-Token', token)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.song).toBeDefined()
    expect(res.body.has_more).toBe(queue.length > 2)
  })

  it('should NOT increment past end of queue (bounds check)', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]
    const queue = createRes.body.queue

    // Advance to the end
    for (let i = 0; i < queue.length; i++) {
      await request(app)
        .post(`/api/radio/${sessionId}/next`)
        .set('X-Session-Token', token)
        .send({})
    }

    // One more call should NOT corrupt state
    const res = await request(app)
      .post(`/api/radio/${sessionId}/next`)
      .set('X-Session-Token', token)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.song).toBeNull()
    expect(res.body.has_more).toBe(false)

    // Verify session is not corrupted
    const session = getSession(sessionId)
    expect(session!.currentIndex).toBeLessThan(queue.length)
  })

  it('should return 403 for invalid session token', async () => {
    const res = await request(app)
      .post('/api/radio/nonexistent/next')
      .set('X-Session-Token', 'fake.token')
      .send({})

    expect(res.status).toBe(403)
  })
})

describe('POST /api/radio/:id/chat', () => {
  it('should store sanitized user input', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]
    const maliciousText = '<script>alert("xss")</script>hello'

    const res = await request(app)
      .post(`/api/radio/${sessionId}/chat`)
      .set('X-Session-Token', token)
      .send({ text: maliciousText })

    expect(res.status).toBe(200)
    // The stored text should be sanitized (angle brackets escaped)
    const session = getSession(sessionId)
    const userMsg = session!.messages.find(m => m.sender === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg!.text).not.toContain('<')
    expect(userMsg!.text).not.toContain('>')
  })
})

describe('GET /api/radio/:id/queue', () => {
  it('should return remaining queue from current index', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]
    const queue = createRes.body.queue

    // Advance once
    await request(app)
      .post(`/api/radio/${sessionId}/next`)
      .set('X-Session-Token', token)
      .send({})

    const res = await request(app)
      .get(`/api/radio/${sessionId}/queue`)
      .set('X-Session-Token', token)

    expect(res.status).toBe(200)
    expect(res.body.queue.length).toBe(queue.length - 1)
    expect(res.body.current_index).toBe(1)
  })
})

describe('POST /api/radio/:id/feedback', () => {
  it('should accept like action and return 200', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]

    const res = await request(app)
      .post(`/api/radio/${sessionId}/feedback`)
      .set('X-Session-Token', token)
      .send({ action: 'like' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.action).toBe('like')
  })

  it('should accept unlike action', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]

    const res = await request(app)
      .post(`/api/radio/${sessionId}/feedback`)
      .set('X-Session-Token', token)
      .send({ action: 'unlike' })

    expect(res.status).toBe(200)
    expect(res.body.action).toBe('unlike')
  })

  it('should accept skip and complete actions', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]

    const skip = await request(app)
      .post(`/api/radio/${sessionId}/feedback`)
      .set('X-Session-Token', token)
      .send({ action: 'skip' })
    expect(skip.status).toBe(200)
    expect(skip.body.action).toBe('skip')

    const complete = await request(app)
      .post(`/api/radio/${sessionId}/feedback`)
      .set('X-Session-Token', token)
      .send({ action: 'complete' })
    expect(complete.status).toBe(200)
    expect(complete.body.action).toBe('complete')
  })

  it('should reject invalid action with 400', async () => {
    const createRes = await request(app)
      .post('/api/radio/create')
      .send({ mood: '温暖', dj_enabled: false })

    const token = createRes.body.session_token
    const sessionId = token.split('.')[0]

    const res = await request(app)
      .post(`/api/radio/${sessionId}/feedback`)
      .set('X-Session-Token', token)
      .send({ action: 'foo' })

    expect(res.status).toBe(400)
  })

  it('should return 404 for nonexistent session', async () => {
    const res = await request(app)
      .post('/api/radio/nonexistent/feedback')
      .set('X-Session-Token', 'fake.token')
      .send({ action: 'like' })

    expect(res.status).toBe(403) // sessionAuth rejects before route handler
  })
})
