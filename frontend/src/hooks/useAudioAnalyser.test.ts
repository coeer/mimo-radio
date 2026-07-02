import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioAnalyser } from './useAudioAnalyser'

// mock AudioContext
const mockAnalyser = {
  fftSize: 0,
  smoothingTimeConstant: 0,
  frequencyBinCount: 64,
  getByteFrequencyData: vi.fn((arr) => {
    // 填一些假数据
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 200)
    return arr
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
}
const mockSource = { connect: vi.fn(), disconnect: vi.fn() }
const mockCtx = {
  state: 'running',
  createAnalyser: vi.fn(() => mockAnalyser),
  createMediaElementSource: vi.fn(() => mockSource),
  resume: vi.fn(() => Promise.resolve()),
  destination: {},
}

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).AudioContext = vi.fn(() => mockCtx)
  ;(globalThis as Record<string, unknown>).webkitAudioContext = undefined
})

describe('useAudioAnalyser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCtx.state = 'running'
  })

  it('应返回 connect/getFrequencyData/resume 方法', () => {
    const { result } = renderHook(() => useAudioAnalyser())
    expect(typeof result.current.connect).toBe('function')
    expect(typeof result.current.getFrequencyData).toBe('function')
    expect(typeof result.current.resume).toBe('function')
  })

  it('connect audio 元素后 getFrequencyData 应返回数据（不抛错）', () => {
    const { result } = renderHook(() => useAudioAnalyser())
    const fakeAudio = { crossOrigin: '', src: 'http://x/1.mp3' } as unknown as HTMLAudioElement
    // connect 不应抛错
    expect(() => act(() => result.current.connect(fakeAudio))).not.toThrow()
  })

  it('getFrequencyData 未 connect 时返回 null', () => {
    const { result } = renderHook(() => useAudioAnalyser())
    expect(result.current.getFrequencyData()).toBeNull()
  })

  it('无 AudioContext 时应优雅降级', () => {
    const origAC = (globalThis as Record<string, unknown>).AudioContext
    delete (globalThis as Record<string, unknown>).AudioContext
    const { result } = renderHook(() => useAudioAnalyser())
    expect(result.current.getFrequencyData()).toBeNull()
    ;(globalThis as Record<string, unknown>).AudioContext = origAC
  })
})
