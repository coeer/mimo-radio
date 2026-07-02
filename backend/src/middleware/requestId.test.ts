import { describe, it, expect, vi } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { requestId } from './requestId'

function createMockReqRes(headerId?: string) {
  const req = {
    headers: headerId ? { 'x-request-id': headerId } : {},
  } as unknown as Request

  const res = {
    setHeader: vi.fn(),
  } as unknown as Response

  const next = vi.fn() as NextFunction

  return { req, res, next }
}

describe('requestId middleware', () => {
  it('should generate a UUID when no X-Request-ID header is provided', () => {
    const { req, res, next } = createMockReqRes()

    requestId(req, res, next)

    expect((res as any).setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String))
    const generatedId = (res as any).setHeader.mock.calls[0][1]
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(generatedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect((req as any).requestId).toBe(generatedId)
    expect(next).toHaveBeenCalledOnce()
  })

  it('should use the provided X-Request-ID header', () => {
    const customId = 'custom-request-id-abc-123'
    const { req, res, next } = createMockReqRes(customId)

    requestId(req, res, next)

    expect((res as any).setHeader).toHaveBeenCalledWith('X-Request-ID', customId)
    expect((req as any).requestId).toBe(customId)
    expect(next).toHaveBeenCalledOnce()
  })

  it('should attach requestId to the request object', () => {
    const { req, res, next } = createMockReqRes()

    requestId(req, res, next)

    expect((req as any).requestId).toBeDefined()
    expect(typeof (req as any).requestId).toBe('string')
  })
})
