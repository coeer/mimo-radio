import { describe, it, expect } from 'vitest'
import { AppError } from './apiResponse'

describe('apiResponse', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const err = new AppError('test error')
      expect(err.message).toBe('test error')
      expect(err.statusCode).toBe(500)
      expect(err.code).toBe('INTERNAL_ERROR')
      expect(err).toBeInstanceOf(Error)
    })

    it('should create error with custom status and code', () => {
      const err = new AppError('not found', 404, 'NOT_FOUND')
      expect(err.message).toBe('not found')
      expect(err.statusCode).toBe(404)
      expect(err.code).toBe('NOT_FOUND')
    })

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new AppError('test', 400, 'BAD_REQUEST')
      }).toThrow('test')
    })
  })
})
