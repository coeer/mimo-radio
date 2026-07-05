import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioPlayer } from './useAudioPlayer'
import { useRadioStore } from '@/store/radioStore'

/**
 * 补充 useAudioPlayer 的副作用链路测试（V2.0 §10.2 列为 P2）。
 * useAudioPlayer.test.ts 已覆盖 addTimer/handleSeek，这里补：
 * - 有 currentSong.playUrl 时挂载 audio 并设置 src
 * - isSpeaking=true 时暂停歌曲（DJ 解说不双音频）
 * - ended 事件触发 nextSong
 */

class AudioMock {
  src = ''
  currentTime = 0
  duration = 100
  listeners: Record<string, Array<() => void>> = {}
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

let lastAudio: AudioMock

describe('useAudioPlayer 副作用链路', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Audio 必须是构造器：用 class 实现，new 时记录最近实例
    ;(globalThis as Record<string, unknown>).Audio = class {
      constructor() {
        lastAudio = new AudioMock()
        return lastAudio
      }
    }
    useRadioStore.setState({
      currentSong: null,
      isPlaying: false,
      isSpeaking: false,
      queue: [],
      currentTime: 0,
      duration: 0,
      nextSong: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('有 playUrl 的 currentSong 应触发 audio.src 设置', () => {
    renderHook(() => useAudioPlayer())
    act(() => {
      useRadioStore.setState({
        currentSong: { id: '1', title: 't', artist: 'a', playUrl: 'http://x/song.mp3', emotionTags: [], sceneTags: [] },
      })
    })
    expect(lastAudio.src).toBe('http://x/song.mp3')
  })

  it('isPlaying=true 时调用 audio.play()', async () => {
    renderHook(() => useAudioPlayer())
    act(() => {
      useRadioStore.setState({
        currentSong: { id: '1', title: 't', artist: 'a', playUrl: 'http://x/song.mp3', emotionTags: [], sceneTags: [] },
      })
    })
    const playSpy = vi.spyOn(lastAudio, 'play')
    act(() => {
      useRadioStore.setState({ isPlaying: true })
    })
    expect(playSpy).toHaveBeenCalled()
  })

  it('isSpeaking=true 时暂停歌曲（避免 DJ 解说双音频）', () => {
    renderHook(() => useAudioPlayer())
    act(() => {
      useRadioStore.setState({
        currentSong: { id: '1', title: 't', artist: 'a', playUrl: 'http://x/song.mp3', emotionTags: [], sceneTags: [] },
        isPlaying: true,
      })
    })
    const pauseSpy = vi.spyOn(lastAudio, 'pause')
    act(() => {
      useRadioStore.setState({ isSpeaking: true })
    })
    expect(pauseSpy).toHaveBeenCalled()
  })

  it('audio ended 事件触发 nextSong', () => {
    const nextSongMock = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAudioPlayer())
    act(() => {
      useRadioStore.setState({
        currentSong: { id: '1', title: 't', artist: 'a', playUrl: 'http://x/song.mp3', emotionTags: [], sceneTags: [] },
        nextSong: nextSongMock,
      })
    })
    // 触发 ended 事件
    act(() => {
      lastAudio.listeners['ended']?.forEach((cb) => cb())
    })
    expect(nextSongMock).toHaveBeenCalled()
  })

  it('无 playUrl 的 currentSong（QQ 延迟获取）调 play-url 接口', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'http://x/real.mp3' }),
    })
    ;(globalThis as Record<string, unknown>).fetch = fetchSpy

    renderHook(() => useAudioPlayer())
    act(() => {
      useRadioStore.setState({
        currentSong: { id: 'qq1', title: 't', artist: 'a', emotionTags: [], sceneTags: [] },
      })
    })
    // 等异步 fetch 完成
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/music-source/play-url'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
