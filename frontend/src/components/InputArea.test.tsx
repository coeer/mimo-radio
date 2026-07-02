import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InputArea from './InputArea'
import { useRadioStore } from '@/store/radioStore'

describe('InputArea', () => {
  const defaultProps = {
    inputText: '',
    setInputText: vi.fn(),
    onSend: vi.fn(),
    onKeyDown: vi.fn(),
  }

  it('应渲染输入框和发送按钮', () => {
    render(<InputArea {...defaultProps} />)
    expect(screen.getByPlaceholderText('Say something to the DJ...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('输入文字应触发 setInputText', () => {
    const setInputText = vi.fn()
    render(<InputArea {...defaultProps} setInputText={setInputText} />)
    fireEvent.change(screen.getByLabelText('Chat with DJ'), { target: { value: '你好' } })
    expect(setInputText).toHaveBeenCalledWith('你好')
  })

  it('点击发送按钮应触发 onSend', () => {
    const onSend = vi.fn()
    render(<InputArea {...defaultProps} inputText="hello" onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(onSend).toHaveBeenCalled()
  })

  it('输入为空时发送按钮应禁用', () => {
    render(<InputArea {...defaultProps} inputText="" />)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('isCreating 时输入框禁用且显示加载提示', () => {
    useRadioStore.setState({ isCreating: true })
    render(<InputArea {...defaultProps} />)
    expect(screen.getByPlaceholderText('正在准备电台...')).toBeDisabled()
    useRadioStore.setState({ isCreating: false })
  })

  it('回车应触发 onKeyDown', () => {
    const onKeyDown = vi.fn()
    render(<InputArea {...defaultProps} inputText="x" onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByLabelText('Chat with DJ'), { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('应显示快捷键提示', () => {
    render(<InputArea {...defaultProps} />)
    expect(screen.getByText('Space 播放/暂停')).toBeInTheDocument()
  })
})
