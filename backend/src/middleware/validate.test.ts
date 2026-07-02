import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { z } from 'zod'
import { validateBody, validateParams, validateQuery } from './validate'

const app = express()
app.use(express.json())

// Test routes
app.post('/body', validateBody(z.object({ name: z.string().min(1) })), (req, res) => {
  res.json({ ok: true, body: req.body })
})

app.get('/params/:id', validateParams(z.object({ id: z.string().uuid() })), (req, res) => {
  res.json({ ok: true, params: req.params })
})

app.get('/query', validateQuery(z.object({ search: z.string().min(1) })), (req, res) => {
  res.json({ ok: true, query: req.query })
})

describe('validateBody', () => {
  it('should pass valid body', async () => {
    const res = await request(app).post('/body').send({ name: 'Kimi' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.body).toEqual({ name: 'Kimi' })
  })

  it('should reject invalid body with 400', async () => {
    const res = await request(app).post('/body').send({ name: '' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.issues).toBeDefined()
  })

  it('should reject missing fields', async () => {
    const res = await request(app).post('/body').send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('validateParams', () => {
  it('should pass valid UUID param', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const res = await request(app).get(`/params/${uuid}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.params.id).toBe(uuid)
  })

  it('should reject invalid UUID param', async () => {
    const res = await request(app).get('/params/not-a-uuid')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('validateQuery', () => {
  it('should pass valid query', async () => {
    const res = await request(app).get('/query?search=kimi')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.query.search).toBe('kimi')
  })

  it('should reject missing query param', async () => {
    const res = await request(app).get('/query')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('should reject empty query param', async () => {
    const res = await request(app).get('/query?search=')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})
