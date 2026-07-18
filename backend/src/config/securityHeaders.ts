import type { HelmetOptions } from 'helmet'

/**
 * helmet/CSP 配置单一来源（P0a-1 / B5 根治）。
 *
 * index.ts 和 security-headers.test.ts 都引用本模块——杜绝"测试测自己的副本，
 * 真实配置改坏了测试照绿"的快照漂移（B5 教训：2026-07-13 收紧 styleSrc 时漏同步测试）。
 *
 * CSP 设计：
 * - useDefaults: false —— 不与 helmet 默认合并，从零显式声明，避免历史默认值未来变动引入回归
 * - 后端默认仅响应 JSON，CSP 作为兜底防护（防未来端点返回 HTML 时的 XSS）
 * - crossOriginEmbedderPolicy: false —— PWA/前端资源加载兼容；COEP=require-corp 会破坏跨域资源（如网易云封面）
 * - styleSrc 仅 'self'：纯 JSON 后端，无 CSS 资源（2026-07-13 从 'unsafe-inline' 收紧）
 */
export const HELMET_OPTIONS: HelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // 后端纯 JSON，禁 inline 即可
      styleSrc: ["'self'"], // 纯 JSON 后端，无 CSS 资源
      imgSrc: ["'self'", 'data:'], // 允许 data: base64（封面图等）
      connectSrc: ["'self'"], // fetch/XHR 限制同源
      frameSrc: ["'none'"], // 不允许嵌入
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // 防 PWA 兼容性问题（见上头注释）
}
