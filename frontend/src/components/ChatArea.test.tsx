import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatArea from './ChatArea'
import { useRadioStore } from '@/store/radioStore'

describe('ChatArea', () => {
  beforeEach(() => {
    useRadioStore.setState({
      sessionId: 'test-session',
      messages: [],
    })
  })

  it('无 sessionId 时不应渲染', () => {
    useRadioStore.setState({ sessionId: null })
    const { container } = render(<ChatArea />)
    expect(container.firstChild).toBeNull()
  })

  it('空消息时应显示引导提示', () => {
    render(<ChatArea />)
    expect(screen.getByText(/和 Claudio 聊聊/)).toBeInTheDocument()
  })

  it('应渲染用户和 AI 消息', () => {
    useRadioStore.setState({
      messages: [
        { id: '1', sender: 'user', text: '推荐点爵士', timestamp: 0 },
        { id: '2', sender: 'kimi', text: '好的，给你推荐', timestamp: 0 },
      ],
    })
    render(<ChatArea />)
    expect(screen.getByText('推荐点爵士')).toBeInTheDocument()
    expect(screen.getByText('好的，给你推荐')).toBeInTheDocument()
  })

  it('应显示 AI 名称 Claudio 和 LIVE', () => {
    useRadioStore.setState({
      messages: [{ id: '1', sender: 'kimi', text: 'hi', timestamp: 0 }],
    })
    render(<ChatArea />)
    expect(screen.getAllByText('Claudio').length).toBeGreaterThan(0)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('AI 消息应显示 REPLAY 按钮', () => {
    useRadioStore.setState({
      messages: [{ id: '1', sender: 'kimi', text: 'hi', timestamp: 0 }],
    })
    render(<ChatArea />)
    expect(screen.getByText('REPLAY')).toBeInTheDocument()
  })

  it('AI 消息应显示 MMGUO 出处', () => {
    useRadioStore.setState({
      messages: [{ id: '1', sender: 'kimi', text: 'hi', timestamp: 0 }],
    })
    render(<ChatArea />)
    expect(screen.getByText(/MMGUO/)).toBeInTheDocument()
  })

  it('有 recommendations 应渲染推荐卡片', () => {
    useRadioStore.setState({
      messages: [{
        id: '1', sender: 'kimi', text: '推荐', timestamp: 0,
        recommendations: [
          { title: 'If', artist: 'Bread', selected: true },
          { title: 'Nude', artist: 'Radiohead' },
        ],
      }],
    })
    render(<ChatArea />)
    expect(screen.getByText('If')).toBeInTheDocument()
    expect(screen.getByText('Nude')).toBeInTheDocument()
  })
})
