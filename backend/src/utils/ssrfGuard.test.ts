import { describe, it, expect } from 'vitest'
import { isSafeUrl } from './ssrfGuard'

describe('isSafeUrl', () => {
  describe('valid public URLs', () => {
    it('should allow https URLs with public domains', () => {
      expect(isSafeUrl('https://example.com')).toEqual({ safe: true })
    })

    it('should allow http URLs with public domains', () => {
      expect(isSafeUrl('http://example.com')).toEqual({ safe: true })
    })

    it('should allow URLs with paths and query strings', () => {
      expect(isSafeUrl('https://api.example.com/v1/data?key=abc')).toEqual({ safe: true })
    })

    it('should allow URLs with ports', () => {
      expect(isSafeUrl('https://example.com:8080/api')).toEqual({ safe: true })
    })
  })

  describe('protocol validation', () => {
    it('should reject ftp protocol', () => {
      const result = isSafeUrl('ftp://example.com/file')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('protocol')
    })

    it('should reject file protocol', () => {
      const result = isSafeUrl('file:///etc/passwd')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('protocol')
    })

    it('should reject javascript protocol', () => {
      const result = isSafeUrl('javascript:alert(1)')
      expect(result.safe).toBe(false)
    })

    it('should reject data protocol', () => {
      const result = isSafeUrl('data:text/html,<h1>test</h1>')
      expect(result.safe).toBe(false)
    })
  })

  describe('localhost blocking', () => {
    it('should block localhost', () => {
      const result = isSafeUrl('http://localhost:3000')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('localhost')
    })

    it('should block 127.0.0.1', () => {
      const result = isSafeUrl('http://127.0.0.1:8080')
      expect(result.safe).toBe(false)
    })

    it('should block subdomain.localhost', () => {
      const result = isSafeUrl('http://api.localhost:3000')
      expect(result.safe).toBe(false)
    })
  })

  describe('private IP blocking', () => {
    it('should block 10.x.x.x', () => {
      const result = isSafeUrl('http://10.0.0.1')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('private')
    })

    it('should block 172.16.x.x', () => {
      const result = isSafeUrl('http://172.16.0.1')
      expect(result.safe).toBe(false)
    })

    it('should block 172.31.x.x', () => {
      const result = isSafeUrl('http://172.31.255.255')
      expect(result.safe).toBe(false)
    })

    it('should block 192.168.x.x', () => {
      const result = isSafeUrl('http://192.168.1.1')
      expect(result.safe).toBe(false)
    })

    it('should block 0.x.x.x', () => {
      const result = isSafeUrl('http://0.0.0.0')
      expect(result.safe).toBe(false)
    })

    it('should block 169.254.x.x (link-local)', () => {
      const result = isSafeUrl('http://169.254.169.254/metadata')
      expect(result.safe).toBe(false)
    })

    it('should not block public IPs', () => {
      expect(isSafeUrl('http://8.8.8.8')).toEqual({ safe: true })
      expect(isSafeUrl('http://1.1.1.1')).toEqual({ safe: true })
    })
  })

  describe('edge cases', () => {
    it('should reject invalid URL format', () => {
      const result = isSafeUrl('not-a-url')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('invalid')
    })

    it('should reject empty string', () => {
      const result = isSafeUrl('')
      expect(result.safe).toBe(false)
    })
  })
})
