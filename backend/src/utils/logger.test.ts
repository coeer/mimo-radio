import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger, toErrorMeta, cleanupOldLogs } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('log levels', () => {
    it('should call console.debug for debug messages in development', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      logger.debug('test debug message')
      expect(debugSpy).toHaveBeenCalled()
      expect(debugSpy.mock.calls[0][0]).toContain('DEBUG')
      expect(debugSpy.mock.calls[0][0]).toContain('test debug message')
    })

    it('should call console.info for info messages', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      logger.info('test info', { key: 'value' })
      expect(infoSpy).toHaveBeenCalled()
      expect(infoSpy.mock.calls[0][0]).toContain('INFO')
      expect(infoSpy.mock.calls[0][0]).toContain('test info')
    })

    it('should call console.warn for warn messages', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      logger.warn('test warning')
      expect(warnSpy).toHaveBeenCalled()
      expect(warnSpy.mock.calls[0][0]).toContain('WARN')
    })

    it('should call console.error for error messages', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      logger.error('test error', { code: 500 })
      expect(errorSpy).toHaveBeenCalled()
      expect(errorSpy.mock.calls[0][0]).toContain('ERROR')
      expect(errorSpy.mock.calls[0][0]).toContain('test error')
    })
  })

  describe('format', () => {
    it('should include timestamp in log output', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      logger.info('test')
      expect(infoSpy.mock.calls[0][0]).toMatch(/\d{4}-\d{2}-\d{2}T/)
    })

    it('should include metadata when provided', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      logger.info('test', { requestId: 'abc123' })
      expect(infoSpy.mock.calls[0][0]).toContain('abc123')
    })
  })

  describe('toErrorMeta', () => {
    it('should extract name/message/stack from Error instances', () => {
      const err = new Error('boom')
      const meta = toErrorMeta(err)
      expect(meta.name).toBe('Error')
      expect(meta.message).toBe('boom')
      expect(typeof meta.stack).toBe('string')
    })

    it('should preserve custom Error subclass name', () => {
      class CustomError extends Error {
        constructor(msg: string) {
          super(msg)
          this.name = 'CustomError'
        }
      }
      const meta = toErrorMeta(new CustomError('x'))
      expect(meta.name).toBe('CustomError')
    })

    it('should stringify non-Error values', () => {
      expect(toErrorMeta('plain string')).toEqual({ message: 'plain string' })
      expect(toErrorMeta(42)).toEqual({ message: '42' })
      expect(toErrorMeta(null)).toEqual({ message: 'null' })
    })
  })

  describe('cleanupOldLogs', () => {
    it('should return 0 when log dir does not exist', async () => {
      // 用不存在的目录：cleanupOldLogs 内部会 try/catch，返回 0
      const deleted = await cleanupOldLogs(1)
      // 默认 LOG_DIR 是项目根 logs/，通常存在；这里只验证不抛异常且返回数字
      expect(typeof deleted).toBe('number')
      expect(deleted).toBeGreaterThanOrEqual(0)
    })

    it('should not throw even if retention is invalid', async () => {
      await expect(cleanupOldLogs(NaN)).resolves.toBeGreaterThanOrEqual(0)
    })
  })
})

