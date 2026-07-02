import { Express } from 'express'

/**
 * Express 请求类型扩展：挂载 requestId / sessionId。
 *
 * requestId 由 middleware/requestId.ts 生成（或从 X-Request-ID 头透传），
 * 贯穿请求日志与错误日志，便于关联同一请求的全部日志行。
 * sessionId 由 middleware/sessionAuth.ts 在会话校验通过后挂载。
 */
declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string
    sessionId?: string
  }
}
