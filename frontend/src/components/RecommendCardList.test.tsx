import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecommendCardList from './RecommendCardList'
import { useRadioStore } from '@/store/radioStore'

const songs = [
  { title: 'If', artist: 'Bread', neteaseId: 'n1', selected: true },
  { title: 'Nude', artist: 'Radiohead', neteaseId: 'n2' },
  { title: 'Wicked Game', artist: 'Chris Isaak', neteaseId: 'n3' },
]

describe('RecommendCardList', () => {
  beforeEach(() => {
    useRadioStore.setState({ currentSong: null })
  })

  it('应渲染所有推荐歌曲', () => {
    render(<RecommendCardList songs={songs} />)
    expect(screen.getByText('If')).toBeInTheDocument()
    expect(screen.getByText('Nude')).toBeInTheDocument()
    expect(screen.getByText('Wicked Game')).toBeInTheDocument()
  })

  it('首项（selected）应有星标样式', () => {
    const { container } = render(<RecommendCardList songs={songs} />)
    // 选中态有 is-selected class
    expect(container.querySelector('.is-selected')).toBeInTheDocument()
  })

  it('点击卡片应调用 setCurrentSong', () => {
    render(<RecommendCardList songs={songs} />)
    fireEvent.click(screen.getByText('Nude'))
    const state = useRadioStore.getState()
    expect(state.currentSong?.title).toBe('Nude')
  })

  it('当前播放的歌应显示 PLAYING 标记', () => {
    useRadioStore.setState({
      currentSong: { id: 'n1', title: 'If', artist: 'Bread', emotionTags: [], sceneTags: [] },
    })
    render(<RecommendCardList songs={songs} />)
    expect(screen.getByText('PLAYING')).toBeInTheDocument()
  })

  it('空列表不应崩溃', () => {
    const { container } = render(<RecommendCardList songs={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
