import { describe, it, expect } from 'vitest'
import { fmtTime } from './utils'

describe('fmtTime', () => {
  it('should format seconds to m:ss', () => {
    expect(fmtTime(0)).toBe('0:00')
    expect(fmtTime(5)).toBe('0:05')
    expect(fmtTime(65)).toBe('1:05')
    expect(fmtTime(125)).toBe('2:05')
    expect(fmtTime(3600)).toBe('60:00')
  })

  it('should pad seconds correctly', () => {
    expect(fmtTime(1)).toBe('0:01')
    expect(fmtTime(10)).toBe('0:10')
    expect(fmtTime(61)).toBe('1:01')
  })
})
