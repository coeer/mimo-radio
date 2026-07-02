import { describe, it, expect, vi, afterEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

// Mock config before importing auth
vi.mock('../config', () => ({
  config: {
    apiKey: 'test-api-key-12345',
    nodeEnv: 'development',
  },
}))

import { apiKeyAuth } from './auth'

function createMockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    ...overrides,
  } as unknown as Request

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response

  const next = vi.fn() as NextFunction

  return { req, res, next }
}

describe('apiKeyAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call next() when valid API key is provided', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'test-api-key-12345' },
    } as any)

    apiKeyAuth(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect((res as any).status).not.toHaveBeenCalled()
  })

  it('should return 401 when API key is missing', () => {
    const { req, res, next } = createMockReqRes()

    apiKeyAuth(req, res, next)

    expect((res as any).status).toHaveBeenCalledWith(401)
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 when API key is incorrect', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': 'wrong-key' },
    } as any)

    apiKeyAuth(req, res, next)

    expect((res as any).status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for non-string API key values', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-api-key': ['array-key'] },
    } as any)

    apiKeyAuth(req, res, next)

    expect((res as any).status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 500 in production when no API_KEY is configured', async () => {
    // Re-mock config for production
    const configModule = await import('../config')
    const originalEnv = configModule.config.nodeEnv
    const originalKey = configModule.config.apiKey

    configModule.config.nodeEnv = 'production'
    configModule.config.apiKey = ''

    const { req, res, next } = createMockReqRes()

    // Re-import to get the updated mock
    const { apiKeyAuth: freshAuth } = await import('./auth')
    freshAuth(req, res, next)

    expect((res as any).status).toHaveBeenCalledWith(500)
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'SERVER_MISCONFIG' }),
      })
    )

    // Restore
    configModule.config.nodeEnv = originalEnv
    configModule.config.apiKey = originalKey
  })
})
