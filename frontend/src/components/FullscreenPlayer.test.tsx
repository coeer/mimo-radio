import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FullscreenPlayer from './FullscreenPlayer'
import { useRadioStore } from '@/store/radioStore'

const mockSong = {
  id: 's1',
  title: 'A Human Odyssey',
  artist: 'Harry Styles',
  album: 'Album',
  playUrl: 'http://x/1.mp3',
  duration: 300,
  emotionTags: [],
  sceneTags: [],
  platform: 'netease' as const,
}

describe('FullscreenPlayer', () => {
  beforeEach(() => {
    useRadioStore.setState({
      currentSong: mockSong,
      isPlaying: true,
      isSpeaking: false,
      currentTime: 60,
      duration: 300,
      isFullscreenPlayer: true,
      messages: [{ id: 'm1', sender: 'kimi', text: 'This is Claudio.\nIt is late.\nA quiet night.', timestamp: 0 }],
      aiCurrentTime: 0,
      aiVoiceDuration: 0,
    })
  })

  it('无 currentSong 时不应渲染', () => {
    useRadioStore.setState({ currentSong: null })
    const { container } = render(<FullscreenPlayer />)
    expect(container.firstChild).toBeNull()
  })

  it('应显示大歌名', () => {
    render(<FullscreenPlayer />)
    expect(screen.getByText('A Human Odyssey')).toBeInTheDocument()
  })

  it('应显示歌手', () => {
    render(<FullscreenPlayer />)
    expect(screen.getByText(/Harry Styles/)).toBeInTheDocument()
  })

  it('点击收起按钮应关闭全屏', () => {
    render(<FullscreenPlayer />)
    fireEvent.click(screen.getByRole('button', { name: '收起播放器' }))
    expect(useRadioStore.getState().isFullscreenPlayer).toBe(false)
  })

  it('点击播放/暂停应切换', () => {
    render(<FullscreenPlayer />)
    // 有两个暂停按钮（顶部+底部），取第一个
    const pauseBtns = screen.getAllByLabelText('暂停')
    fireEvent.click(pauseBtns[0])
    expect(useRadioStore.getState().isPlaying).toBe(false)
  })

  it('Speaking 时应显示 Speaking 文字', () => {
    useRadioStore.setState({ isSpeaking: true })
    render(<FullscreenPlayer />)
    expect(screen.getByText(/Speaking/i)).toBeInTheDocument()
  })

  it('非 Speaking 时应显示 On Air', () => {
    useRadioStore.setState({ isSpeaking: false, isPlaying: true })
    render(<FullscreenPlayer />)
    expect(screen.getByText(/On Air/i)).toBeInTheDocument()
  })
})
