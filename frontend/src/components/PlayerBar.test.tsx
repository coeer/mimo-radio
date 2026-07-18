import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import PlayerBar from './PlayerBar'
import { useRadioStore } from '@/store/radioStore'

// PlayerBar 内嵌 AudioWaveform——mock 掉避免 AudioContext/getFrequencyData 依赖
vi.mock('./AudioWaveform', () => ({
  default: () => <div data-testid="waveform" />,
}))

const songA = {
  id: 'a1',
  title: 'Song A',
  artist: 'Artist A',
  playUrl: 'http://x/a.mp3',
  duration: 200,
  emotionTags: [],
  sceneTags: [],
}

const songB = {
  id: 'b2',
  title: 'Song B',
  artist: 'Artist B',
  playUrl: 'http://x/b.mp3',
  duration: 180,
  emotionTags: [],
  sceneTags: [],
}

describe('PlayerBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useRadioStore.setState({
      currentSong: songA,
      isPlaying: false,
      currentTime: 0,
      duration: 200,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('显示歌名与时间', () => {
    render(<PlayerBar />)
    expect(screen.getByText(/Song A - Artist A/)).toBeInTheDocument()
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('播放中 localTime 每秒递增', () => {
    useRadioStore.setState({ isPlaying: true })
    render(<PlayerBar />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('0:03')).toBeInTheDocument()
  })

  // P1-2c（F5）：换歌时 localTime 立即重置（原实现滞留最多 5 秒等 sync 校正）
  it('换歌时 localTime 立即重置（F5 回归）', () => {
    useRadioStore.setState({ isPlaying: true })
    render(<PlayerBar />)
    act(() => {
      vi.advanceTimersByTime(3000) // localTime = 3
    })
    expect(screen.getByText('0:03')).toBeInTheDocument()

    act(() => {
      // 换歌：store currentTime 归零（换歌真实行为）
      useRadioStore.setState({ currentSong: songB, currentTime: 0, duration: 180 })
    })
    // 立即重置，不等 5s sync
    expect(screen.getByText('0:00')).toBeInTheDocument()
    expect(screen.getByText(/Song B - Artist B/)).toBeInTheDocument()
  })
})
