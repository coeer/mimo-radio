import { describe, it, expect, vi, afterEach } from 'vitest'
import { getCurrentPlaylist } from './scheduler'
import { loadMockSongs } from './engine'

/**
 * 补充跨午夜时段边界测试（V2.0 §10.2 重点）。
 * scheduler.test.ts 已覆盖基础结构，这里专注 23:00-01:00 跨午夜逻辑。
 */
describe('getCurrentPlaylist 跨午夜时段边界', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('23:30 命中跨午夜时段 23:00-01:00（深夜独处）', () => {
    loadMockSongs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T23:30:00'))
    const current = getCurrentPlaylist()
    expect(current).not.toBeNull()
    expect(current!.slot.start).toBe('23:00')
    expect(current!.slot.end).toBe('01:00')
  })

  it('00:30 仍命中前一天的跨午夜时段 23:00-01:00', () => {
    loadMockSongs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-26T00:30:00'))
    const current = getCurrentPlaylist()
    expect(current).not.toBeNull()
    expect(current!.slot.start).toBe('23:00')
  })

  it('00:30 不会错误命中 01:00-06:00 睡眠时段（边界排除）', () => {
    loadMockSongs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-26T00:30:00'))
    const current = getCurrentPlaylist()
    // 00:30 < 01:00，应属深夜独处而非睡眠
    expect(current!.slot.start).not.toBe('01:00')
  })

  it('01:30 命中睡眠时段 01:00-06:00', () => {
    loadMockSongs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-26T01:30:00'))
    const current = getCurrentPlaylist()
    expect(current).not.toBeNull()
    expect(current!.slot.start).toBe('01:00')
  })

  it('正常白天时段 10:30 命中深度工作 10:00-12:00', () => {
    loadMockSongs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T10:30:00'))
    const current = getCurrentPlaylist()
    expect(current!.slot.start).toBe('10:00')
  })
})
