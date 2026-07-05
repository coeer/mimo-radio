import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

// 抛错子组件，用于触发 ErrorBoundary
function ThrowError({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('child boom')
  return <div>child ok</div>
}

describe('ErrorBoundary', () => {
  // 抑制 React 在测试环境的"未捕获错误"日志噪音（不影响测试结果）
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  it('子组件正常时直接渲染 children', () => {
    render(
      <ErrorBoundary>
        <div>hello world</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('子组件抛错时使用默认 fallback 并展示友好提示', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )
    // 默认 fallback 应该是全屏卡片：标题 + 重新连接按钮（不暴露堆栈）
    expect(screen.getByText(/电台信号中断/)).toBeInTheDocument()
    expect(screen.getByText(/重新连接电台/)).toBeInTheDocument()
    // 子组件不再渲染
    expect(screen.queryByText('child ok')).not.toBeInTheDocument()
  })

  it('子组件抛错时使用自定义 fallback', () => {
    render(
      <ErrorBoundary
        fallback={<div role="alert">时间轴加载失败，请稍后重试</div>}
        onError={vi.fn()}
      >
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('时间轴加载失败，请稍后重试')
    // 默认 fallback 不该出现
    expect(screen.queryByText(/电台信号中断/)).not.toBeInTheDocument()
  })

  it('子组件抛错时调用 onError 回调（含 Error + React.ErrorInfo）', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    const [error, errorInfo] = onError.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('child boom')
    // React.ErrorInfo.componentStack 是字符串
    expect(typeof (errorInfo as { componentStack: string }).componentStack).toBe('string')
  })

  it('onError 自身抛错不会让 ErrorBoundary 二次崩（容错）', () => {
    const brokenOnError = vi.fn(() => {
      throw new Error('callback boom')
    })
    // 应该不抛错到测试
    expect(() => {
      render(
        <ErrorBoundary onError={brokenOnError}>
          <ThrowError />
        </ErrorBoundary>,
      )
    }).not.toThrow()
    expect(brokenOnError).toHaveBeenCalledTimes(1)
    // ErrorBoundary 仍然正常渲染 fallback
    expect(screen.getByText(/电台信号中断/)).toBeInTheDocument()
  })
})
