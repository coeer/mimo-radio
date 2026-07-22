import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lookup } from 'dns/promises'
import { isSafeUrl, SSRF_ALLOW_HOSTS } from './ssrfGuard'

// dns/promises.lookup 必须 mock——真实调用依赖网络，CI 环境不可控
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}))

const mockLookup = vi.mocked(lookup)

beforeEach(() => {
  // 默认：公网域名解析为公网 IP（避免所有域名测试都被 rebinding 拦截）
  mockLookup.mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ] as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('isSafeUrl', () => {
  describe('valid public URLs', () => {
    it('should allow https URLs with public domains', async () => {
      const result = await isSafeUrl('https://example.com')
      expect(result).toEqual({ safe: true })
    })

    it('should allow http URLs with public domains', async () => {
      const result = await isSafeUrl('http://example.com')
      expect(result).toEqual({ safe: true })
    })

    it('should allow URLs with paths and query strings', async () => {
      const result = await isSafeUrl('https://api.example.com/v1/data?key=abc')
      expect(result).toEqual({ safe: true })
    })

    it('should allow URLs with ports', async () => {
      const result = await isSafeUrl('https://example.com:8080/api')
      expect(result).toEqual({ safe: true })
    })

    it('should allow IP literal of public address', async () => {
      const result = await isSafeUrl('http://8.8.8.8')
      expect(result).toEqual({ safe: true })
    })

    it('should allow IP literal 1.1.1.1', async () => {
      const result = await isSafeUrl('http://1.1.1.1')
      expect(result).toEqual({ safe: true })
    })
  })

  describe('protocol validation', () => {
    it('should reject ftp protocol', async () => {
      const result = await isSafeUrl('ftp://example.com/file')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('protocol')
    })

    it('should reject file protocol', async () => {
      const result = await isSafeUrl('file:///etc/passwd')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('protocol')
    })

    it('should reject javascript protocol', async () => {
      const result = await isSafeUrl('javascript:alert(1)')
      expect(result.safe).toBe(false)
    })

    it('should reject data protocol', async () => {
      const result = await isSafeUrl('data:text/html,<h1>test</h1>')
      expect(result.safe).toBe(false)
    })
  })

  describe('localhost blocking', () => {
    it('should block localhost', async () => {
      const result = await isSafeUrl('http://localhost:3000')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('localhost')
    })

    it('should block 127.0.0.1', async () => {
      const result = await isSafeUrl('http://127.0.0.1:8080')
      expect(result.safe).toBe(false)
    })

    it('should block subdomain.localhost', async () => {
      const result = await isSafeUrl('http://api.localhost:3000')
      expect(result.safe).toBe(false)
    })
  })

  describe('private IP blocking (IPv4)', () => {
    it('should block 10.x.x.x', async () => {
      const result = await isSafeUrl('http://10.0.0.1')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('private')
    })

    it('should block 172.16.x.x', async () => {
      const result = await isSafeUrl('http://172.16.0.1')
      expect(result.safe).toBe(false)
    })

    it('should block 172.31.x.x', async () => {
      const result = await isSafeUrl('http://172.31.255.255')
      expect(result.safe).toBe(false)
    })

    it('should block 192.168.x.x', async () => {
      const result = await isSafeUrl('http://192.168.1.1')
      expect(result.safe).toBe(false)
    })

    it('should block 0.x.x.x', async () => {
      const result = await isSafeUrl('http://0.0.0.0')
      expect(result.safe).toBe(false)
    })

    it('should block 169.254.x.x (link-local)', async () => {
      const result = await isSafeUrl('http://169.254.169.254/metadata')
      expect(result.safe).toBe(false)
    })
  })

  // P0-2 修复（B1-1）：IPv6 字面量 Node URL 返回带方括号 [::1]，
  // 原正则 /^::1$/ 永不匹配；现先剥方括号再匹配。
  describe('IPv6 literal blocking (B1-1)', () => {
    it('should block [::1] loopback', async () => {
      const result = await isSafeUrl('http://[::1]:8080/')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('private')
    })

    it('should block [fc00::1] (unique local)', async () => {
      const result = await isSafeUrl('http://[fc00::1]/')
      expect(result.safe).toBe(false)
    })

    it('should block [fd12:3456:789a::1] (unique local, 大小写)', async () => {
      const result = await isSafeUrl('http://[FD12:3456:789A::1]/')
      expect(result.safe).toBe(false)
    })

    it('should block [fe80::1] (link-local)', async () => {
      const result = await isSafeUrl('http://[fe80::1]/')
      expect(result.safe).toBe(false)
    })

    it('should block [::ffff:127.0.0.1] (IPv4-mapped IPv6)', async () => {
      const result = await isSafeUrl('http://[::ffff:127.0.0.1]/')
      expect(result.safe).toBe(false)
    })

    it('should block [::ffff:10.0.0.1] (IPv4-mapped IPv6 private)', async () => {
      const result = await isSafeUrl('http://[::ffff:10.0.0.1]/')
      expect(result.safe).toBe(false)
    })

    it('should block [2002::1] (6to4)', async () => {
      const result = await isSafeUrl('http://[2002::1]/')
      expect(result.safe).toBe(false)
    })

    it('should not block [2606:4700:4700::1111] (public IPv6, Cloudflare DNS)', async () => {
      const result = await isSafeUrl('http://[2606:4700:4700::1111]/')
      expect(result.safe).toBe(true)
    })
  })

  // P0-2 修复（B1-2）：DNS rebinding 防护 + IPv4-mapped IPv6 解析结果拦截。
  // 公网域名解析到私网 IP → 拒绝；解析失败 → fail-closed。
  describe('DNS rebinding protection (B1-2)', () => {
    it('should reject when DNS resolves to private IP (127.0.0.1)', async () => {
      mockLookup.mockResolvedValueOnce([
        { address: '127.0.0.1', family: 4 },
      ] as never)
      const result = await isSafeUrl('http://evil.example.com')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toMatch(/resolves to private IP/)
    })

    it('should reject when DNS resolves to private IPv6 (::1)', async () => {
      mockLookup.mockResolvedValueOnce([
        { address: '::1', family: 6 },
      ] as never)
      const result = await isSafeUrl('http://evil.example.com')
      expect(result.safe).toBe(false)
    })

    it('should reject when one of multiple DNS records is private (fail-closed)', async () => {
      // 公网域名返回多条记录，其中一条是私网 → 必须拒绝
      mockLookup.mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ] as never)
      const result = await isSafeUrl('http://multi-record.example.com')
      expect(result.safe).toBe(false)
    })

    it('should fail-closed when DNS resolution throws', async () => {
      mockLookup.mockRejectedValueOnce(new Error('ENOTFOUND'))
      const result = await isSafeUrl('http://nonexistent.example.com')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('DNS resolution failed')
    })

    it('should NOT call dns.lookup for IP literals (already covered by pattern)', async () => {
      await isSafeUrl('http://8.8.8.8')
      expect(mockLookup).not.toHaveBeenCalled()
    })

    it('should NOT call dns.lookup for blocked private IP literals', async () => {
      await isSafeUrl('http://10.0.0.1')
      expect(mockLookup).not.toHaveBeenCalled()
    })

    it('should call dns.lookup for domain-form hostnames', async () => {
      await isSafeUrl('http://example.com')
      expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true })
    })
  })

  describe('edge cases', () => {
    it('should reject invalid URL format', async () => {
      const result = await isSafeUrl('not-a-url')
      expect(result.safe).toBe(false)
      if (!result.safe) expect(result.reason).toContain('invalid')
    })

    it('should reject empty string', async () => {
      const result = await isSafeUrl('')
      expect(result.safe).toBe(false)
    })
  })

  // 白名单查询在 fetchWithTimeout，不在本函数——验证白名单集合的导出与成员
  describe('whitelist exports', () => {
    it('should export SSRF_ALLOW_HOSTS with expected trusted domains', () => {
      expect(SSRF_ALLOW_HOSTS.has('y.qq.com')).toBe(true)
      expect(SSRF_ALLOW_HOSTS.has('music.163.com')).toBe(true)
      expect(SSRF_ALLOW_HOSTS.has('token-plan-cn.xiaomimimo.com')).toBe(true)
      expect(SSRF_ALLOW_HOSTS.has('api.openweathermap.org')).toBe(true)
    })
  })
})
