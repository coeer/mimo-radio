import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TypewriterText from './TypewriterText'

describe('TypewriterText', () => {
  it('should render text with typing effect', async () => {
    render(<TypewriterText text="Hello" speed={10} />)

    // Initially only partial text should be visible
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument()
    })
  })

  it('should call onComplete when typing finishes', async () => {
    const onComplete = vi.fn()
    render(<TypewriterText text="Hi" speed={5} onComplete={onComplete} />)

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    }, { timeout: 2000 })
  })

  it('should use few spans instead of per-char spans', () => {
    const { container } = render(<TypewriterText text="Hello World" speed={10} />)
    const spans = container.querySelectorAll('span > span')
    // 至少 1 个（初始挂载只有基础色尾部 span），随打字推进会增加高亮 span。
    // 关键约束：不能是每字符一个 span（"Hello World" 有 11 字符，不应出现 11 个）。
    expect(spans.length).toBeLessThanOrEqual(3)
  })

  it('should render **bold** segments as highlighted <strong>', async () => {
    const { container } = render(<TypewriterText text="a **bold** b" speed={5} />)
    await waitFor(() => {
      const strongs = container.querySelectorAll('strong')
      expect(strongs.length).toBe(1)
      expect(strongs[0].textContent).toBe('bold')
    }, { timeout: 2000 })
  })
})
