import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import KimiCard from './KimiCard'
import { useRadioStore } from '@/store/radioStore'

const mockSong = {
  id: 's1',
  title: '夜に駆ける',
  artist: 'YOASOBI',
  album: 'Album',
  playUrl: 'http://x/1.mp3',
  duration: 200,
  emotionTags: ['深夜'],
  sceneTags: ['工作'],
  platform: 'netease' as const,
}

describe('KimiCard', () => {
  beforeEach(() => {
    useRadioStore.setState({
      currentSong: mockSong,
      isPlaying: false,
      isSpeaking: false,
      currentTime: 30,
      duration: 200,
      likedSongIds: [],
    })
  })

  it('无 currentSong 时不应渲染', () => {
    useRadioStore.setState({ currentSong: null })
    const { container } = render(<KimiCard />)
    expect(container.firstChild).toBeNull()
  })

  it('应显示歌名和歌手', () => {
    render(<KimiCard />)
    expect(screen.getByText('夜に駆ける')).toBeInTheDocument()
    expect(screen.getByText('YOASOBI')).toBeInTheDocument()
  })

  it('点击歌名应进入全屏播放器', () => {
    render(<KimiCard />)
    fireEvent.click(screen.getByText('夜に駆ける'))
    expect(useRadioStore.getState().isFullscreenPlayer).toBe(true)
  })

  it('点击播放按钮应切换播放状态', () => {
    render(<KimiCard />)
    const playBtn = screen.getByRole('button', { name: '播放' })
    fireEvent.click(playBtn)
    expect(useRadioStore.getState().isPlaying).toBe(true)
  })

  it('播放中点击应暂停', () => {
    useRadioStore.setState({ isPlaying: true })
    render(<KimiCard />)
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(useRadioStore.getState().isPlaying).toBe(false)
  })

  it('点击收藏应加入 likedSongIds', () => {
    render(<KimiCard />)
    fireEvent.click(screen.getByRole('button', { name: '收藏' }))
    expect(useRadioStore.getState().likedSongIds).toContain('s1')
  })

  it('再次点击收藏应取消', () => {
    useRadioStore.setState({ likedSongIds: ['s1'] })
    render(<KimiCard />)
    fireEvent.click(screen.getByRole('button', { name: '收藏' }))
    expect(useRadioStore.getState().likedSongIds).not.toContain('s1')
  })

  it('点击全屏按钮应进入全屏', () => {
    render(<KimiCard />)
    fireEvent.click(screen.getByRole('button', { name: '全屏' }))
    expect(useRadioStore.getState().isFullscreenPlayer).toBe(true)
  })

  it('应显示当前播放时间', () => {
    render(<KimiCard />)
    expect(screen.getByText(/0:30/)).toBeInTheDocument()
  })
})
