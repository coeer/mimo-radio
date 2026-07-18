import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import helmet from 'helmet'
import { HELMET_OPTIONS } from '../config/securityHeaders'

/**
 * 后端 helmet 安全头测试（P0a-1 / B5 根治版）。
 *
 * 直接引用 config/securityHeaders.ts 的 HELMET_OPTIONS——index.ts 用的也是同一份，
 * 测试测的就是真实配置，不再是自我复制的快照。
 * （B5 教训：2026-07-13 styleSrc 收紧为 'self'，旧测试副本仍断言 'unsafe-inline'，
 *  配置与测试漂移却双双全绿。）
 */

function buildConfiguredApp() {
  const app = express()
  app.use(helmet(HELMET_OPTIONS))
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

  it('CSP 完整字符串快照——directives 与 HELMET_OPTIONS 同源，改配置只改 securityHeaders.ts', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    // 校验关键字都出现（顺序由 helmet 内部固定）：每条 directive 各匹配一次
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("img-src 'self' data:")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('style-src 不允许 unsafe-inline（B5 回归：2026-07-13 收紧后的真实配置）', async () => {
    const res = await request(buildConfiguredApp()).get('/health')
    const csp = res.headers['content-security-policy'] as string
    // style-src 段落必须恰好是 'self'，不得回退到 'unsafe-inline'
    expect(csp).toMatch(/style-src 'self'(;|$)/)
    expect(csp).not.toContain('unsafe-inline')
  })
})
