import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { validateBody } from '../middleware/validate'
import { logger } from '../utils/logger'

const router = Router()

/**
 * 前端日志上报端点。
 *
 * 前端 lib/logger.ts 在生产环境把 warn/error 通过此端点转发到后端，
 * 写入同一份日志文件（app-YYYY-MM-DD.log），实现前后端日志统一排查。
 *
 * - 不计入 AI 限流（这是日志通道，不是业务接口）
 * - 单独限流：单 IP 每分钟 30 条，防滥用
 * - 用 apiKeyAuth 保护（在 index.ts 的 /api 下统一挂载）
 */

// 防滥用：单 IP 每分钟 30 条上报
const logLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Log report rate limit exceeded', code: 'RATE_LIMITED' } },
})

const logSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  msg: z.string().max(2000),
  ctx: z.record(z.unknown()).optional(),
})

// POST /api/v1/log
router.post('/', logLimiter, validateBody(logSchema), (req: Request, res: Response) => {
  const { level, msg, ctx } = req.body as z.infer<typeof logSchema>

  // 统一加 [frontend] 前缀，附加来源信息
  const meta = {
    source: 'frontend',
    ip: req.ip,
    ua: req.headers['user-agent'],
    url: (ctx as any)?.url,
    ...ctx,
  }

  // 映射到后端日志级别；debug/info 在 prod 会被 logger 自动过滤
  if (level === 'error') {
    logger.error(`[frontend] ${msg}`, meta)
  } else if (level === 'warn') {
    logger.warn(`[frontend] ${msg}`, meta)
  } else if (level === 'info') {
    logger.info(`[frontend] ${msg}`, meta)
  } else {
    logger.debug(`[frontend] ${msg}`, meta)
  }

  res.status(204).end()
})

export default router
