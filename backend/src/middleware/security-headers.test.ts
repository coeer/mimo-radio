import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import helmet from 'helmet'

/**
 * 后端 helmet 配置快照测试。
 *
 * 目的：保证 backend/src/index.ts 中的 helmet() 调用所产出的安全头组合符合规格。
 * 这里复刻 index.ts 里的 helmet 配置（snapshot），避免在测试里 import index.ts
 * 导致数据库初始化、端口监听等副作用。
 *
 * 如未来修改了 index.ts 的 helmet 配置，请同步更新本测试的 cspMatch。
 */

const cspMatch = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  upgradeInsecureRequests: [],
}

function buildConfiguredApp() {
  const app = express()
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspMatch,
      },
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe('backend helmet security headers', () => {
  it('应下发 Content-Security-Policy header', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(typeof res.headers['content-security-policy']).toBe('string')
  })

  it('CSP 应包含 default-src \'self\'', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toMatch(/default-src 'self'/)
  })

  it('CSP 应包含 script-src \'self\'（禁 inline 脚本）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toMatch(/script-src 'self'/)
  })

  it('CSP 应允许 img data: base64（封面图场景）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toMatch(/img-src[^;]*'self'/)
    expect(csp).toMatch(/img-src[^;]*data:/)
  })

  it('CSP 应禁止 frame 嵌入（frame-ancestors/frame-src 均为 \'none\'）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toMatch(/frame-src 'none'/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
  })

  it('CSP 应禁止 object/插件加载', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toMatch(/object-src 'none'/)
  })

  it('CSP 应包含 upgrade-insecure-requests（自动升级 https）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toMatch(/upgrade-insecure-requests/)
  })

  it('应保留 helmet 其它默认安全头（X-Content-Type-Options）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('应保留 helmet 其它默认安全头（X-Frame-Options）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    // helmet 默认 X-Frame-Options 是 SAMEORIGIN；CSP frame-ancestors 'none' 是更严的可选补充
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
  })

  it('应保留 helmet 其它默认安全头（Referrer-Policy）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    expect(res.headers['referrer-policy']).toBeDefined()
  })

  it('应保留 helmet 其它默认安全头（Cross-Origin-Resource-Policy）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin')
  })

  it('应隐藏 X-Powered-By 头（helmet 默认）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('不应设置 Cross-Origin-Embedder-Policy（COEP=false 防 PWA 兼容）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined()
  })

  it('CSP 完整字符串快照——如修改 index.ts helmet 配置请同步本测试', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    // 校验关键字都出现（顺序由 helmet 内部固定）：每条 directive 各匹配一次
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data:")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
  })
})
