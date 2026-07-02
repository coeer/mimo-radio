import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioPlayer } from './useAudioPlayer'
import { useRadioStore } from '@/store/radioStore'

// useAudioPlayer 依赖 Audio / AudioContext，这里只 mock 到让它能挂载不抛错。
// 重点验证对外暴露的稳定逻辑：addTimer（定时器注册+清理）、handleSeek（seek 委托）。
// 播放/暂停/ended→nextSong 等副作用链路由 djIntroToSong.e2e.test.ts 端到端覆盖。

class AudioMock {
  src = ''
  currentTime = 0
  duration = 0
  listeners: Record<string, (() => void)[]> = {}
  addEventListener(ev: string, cb: () => void) {
    ;(this.listeners[ev] ||= []).push(cb)
  }
  removeEventListener(ev: string, cb: () => void) {
    this.listeners[ev] = (this.listeners[ev] || []).filter((c) => c !== cb)
  }
  load() {}
  play() {
    return Promise.resolve()
  }
  pause() {}
}

describe('useAudioPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as Record<string, unknown>).Audio = vi.fn(() => new AudioMock())
    // 重置 store 到干净态
    useRadioStore.setState({
      currentSong: null,
      isPlaying: false,
      isSpeaking: false,
      queue: [],
      currentTime: 0,
      duration: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应暴露 audioRef / handleSeek / addTimer / getFrequencyData', () => {
    const { result } = renderHook(() => useAudioPlayer())
    expect(result.current.audioRef).toBeDefined()
    expect(typeof result.current.handleSeek).toBe('function')
    expect(typeof result.current.addTimer).toBe('function')
    expect(typeof result.current.getFrequencyData).toBe('function')
  })

  it('addTimer 应在指定延时后触发回调', () => {
    const { result } = renderHook(() => useAudioPlayer())
    const cb = vi.fn()
    act(() => {
      result.current.addTimer(cb, 1000)
    })
    expect(cb).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('addTimer 触发后应从内部定时器集合中清理（避免累积）', () => {
    const { result } = renderHook(() => useAudioPlayer())
    act(() => {
      result.current.addTimer(vi.fn(), 500)
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    // 再注册一个，验证不会因前一个残留而重复触发
    const cb2 = vi.fn()
    act(() => {
      result.current.addTimer(cb2, 500)
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('handleSeek 应委托设置 audio.currentTime', () => {
    const { result } = renderHook(() => useAudioPlayer())
    // 手动塞一个 mock audio 进 ref
    const mockAudio = new AudioMock()
    ;(result.current.audioRef as React.MutableRefObject<AudioMock | null>).current = mockAudio
    act(() => {
      result.current.handleSeek(42)
    })
    expect(mockAudio.currentTime).toBe(42)
  })

  it('handleSeek 在无 audio 元素时不应抛错', () => {
    const { result } = renderHook(() => useAudioPlayer())
    expect(() => {
      act(() => {
        result.current.handleSeek(10)
      })
    }).not.toThrow()
  })
})
