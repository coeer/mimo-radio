import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

// Mock sessionToken module
vi.mock('../utils/sessionToken', () => ({
  verifySessionToken: vi.fn(),
}))

import { sessionAuth } from './sessionAuth'
import { verifySessionToken } from '../utils/sessionToken'

const mockVerify = vi.mocked(verifySessionToken)

function createMockReqRes(overrides: Record<string, any> = {}) {
  const req = {
    headers: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response

  const next = vi.fn() as NextFunction

  return { req, res, next }
}

describe('sessionAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should extract and verify token from X-Session-Token header', () => {
    mockVerify.mockReturnValue({ valid: true, sessionId: 'session-123' })

    const { req, res, next } = createMockReqRes({
      headers: { 'x-session-token': 'session-123.signature' },
    })

    sessionAuth(req, res, next)

    expect(mockVerify).toHaveBeenCalledWith('session-123.signature')
    expect(next).toHaveBeenCalledOnce()
    expect((req as any).sessionId).toBe('session-123')
  })

  it('should extract token from body session_token field', () => {
    mockVerify.mockReturnValue({ valid: true, sessionId: 'session-456' })

    const { req, res, next } = createMockReqRes({
      body: { session_token: 'session-456.signature' },
    })

    sessionAuth(req, res, next)

    expect(mockVerify).toHaveBeenCalledWith('session-456.signature')
    expect(next).toHaveBeenCalledOnce()
  })

  it('should reject token from query session_token param (URL leak prevention)', () => {
    // B2-1 (2026-07-18)：query 传 token 被移除——token 走 URL 会进 access log/browser
    // history/Referer/proxy log 被动泄漏。前端零引用 query 传参。
    mockVerify.mockReturnValue({ valid: true, sessionId: 'session-789' })

    const { req, res, next } = createMockReqRes({
      query: { session_token: 'session-789.signature' },
    })

    sessionAuth(req, res, next)

    expect(mockVerify).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    expect((res as any).status).toHaveBeenCalledWith(401)
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'SESSION_REQUIRED' }),
      })
    )
  })

  it('should return 401 when no token is provided', () => {
    const { req, res, next } = createMockReqRes()

    sessionAuth(req, res, next)

    expect((res as any).status).toHaveBeenCalledWith(401)
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'SESSION_REQUIRED' }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 403 when token is invalid', () => {
    mockVerify.mockReturnValue({ valid: false, reason: 'invalid signature' })

    const { req, res, next } = createMockReqRes({
      headers: { 'x-session-token': 'bad-token' },
    })

    sessionAuth(req, res, next)

    expect((res as any).status).toHaveBeenCalledWith(403)
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'SESSION_INVALID' }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should prioritize header token over body and query', () => {
    mockVerify.mockReturnValue({ valid: true, sessionId: 'from-header' })

    const { req, res, next } = createMockReqRes({
      headers: { 'x-session-token': 'header-token.sig' },
      body: { session_token: 'body-token.sig' },
      query: { session_token: 'query-token.sig' },
    })

    sessionAuth(req, res, next)

    expect(mockVerify).toHaveBeenCalledWith('header-token.sig')
    expect((req as any).sessionId).toBe('from-header')
  })
})
