import { describe, it, expect } from 'vitest'
import { signSession, verifySessionToken } from './sessionToken'

describe('sessionToken', () => {
  describe('signSession', () => {
    it('should return a string in sessionId.signature format', () => {
      const token = signSession('test-session-123')
      expect(token).toContain('.')
      const parts = token.split('.')
      expect(parts.length).toBe(2)
      expect(parts[0]).toBe('test-session-123')
      expect(parts[1].length).toBe(64) // SHA256 hex length
    })

    it('should produce different signatures for different session IDs', () => {
      const token1 = signSession('session-a')
      const token2 = signSession('session-b')
      expect(token1).not.toBe(token2)
    })

    it('should produce deterministic signatures for the same input', () => {
      const token1 = signSession('same-session')
      const token2 = signSession('same-session')
      expect(token1).toBe(token2)
    })
  })

  describe('verifySessionToken', () => {
    it('should verify a valid token', () => {
      const sessionId = 'valid-session-id'
      const token = signSession(sessionId)
      const result = verifySessionToken(token)
      expect(result.valid).toBe(true)
      if (result.valid) expect(result.sessionId).toBe(sessionId)
    })

    it('should reject a token with invalid signature', () => {
      const result = verifySessionToken('fake-session.abcdef1234567890')
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.reason).toContain('invalid signature')
    })

    it('should reject a token with no dot separator', () => {
      const result = verifySessionToken('no-dot-separator')
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.reason).toContain('invalid token format')
    })

    it('should reject an empty token', () => {
      const result = verifySessionToken('')
      expect(result.valid).toBe(false)
    })

    it('should reject a token with empty session ID', () => {
      const result = verifySessionToken('.abcdef')
      expect(result.valid).toBe(false)
    })

    it('should reject a token with empty signature', () => {
      const result = verifySessionToken('session-id.')
      expect(result.valid).toBe(false)
    })

    it('should reject tampered tokens', () => {
      const token = signSession('original-session')
      const [sessionId] = token.split('.')
      const tampered = `${sessionId}.0000000000000000000000000000000000000000000000000000000000000000`
      const result = verifySessionToken(tampered)
      expect(result.valid).toBe(false)
    })

    it('should handle tokens with multiple dots gracefully', () => {
      const result = verifySessionToken('a.b.c')
      // 'a.b' will be treated as sessionId='a', signature='b', then 'c' is extra
      // Actually split('.') gives ['a','b','c'] which has length 3, rejected
      expect(result.valid).toBe(false)
    })
  })

  describe('round-trip', () => {
    it('should sign and verify multiple session IDs', () => {
      const ids = [
        'uuid-style-550e8400-e29b-41d4',
        'simple-id',
        'a'.repeat(128),
        'unicode-中文-session',
      ]
      for (const id of ids) {
        const token = signSession(id)
        const result = verifySessionToken(token)
        expect(result.valid).toBe(true)
        if (result.valid) expect(result.sessionId).toBe(id)
      }
    })
  })
})
