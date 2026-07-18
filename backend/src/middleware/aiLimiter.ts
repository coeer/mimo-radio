import rateLimit from 'express-rate-limit'

/**
 * AI / 昂贵端点限流（P0a-4 / B1：抽共享模块，单一实例）。
 *
 * 原实现挂在 radio/dj 整 router 上（index.ts），GET /models /songs /queue 也消耗
 * 10 次/分钟配额，且 feedback 的 30/min limiter 永远到不了（先被 aiLimiter 429）。
 * 现改为只挂在具体 POST 路由（create/next/chat + dj 的 tts/intro/asr/analyze-image/transition），
 * 两个路由文件 import 同一个实例——别各自 new（限流配额会翻倍）。
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI generation rate limit exceeded. Please slow down.' },
  // 测试环境放行：路由测试 1 分钟内会多次调 /create 等端点，必命中 10/min 阈值。
  // 原实现挂在 index.ts（测试不 import index.ts，天然豁免）；移入路由后需显式豁免。
  skip: () => process.env.NODE_ENV === 'test',
})
