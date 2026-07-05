'use client'

import { Component, ReactNode } from 'react'
import { logger } from '../lib/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /**
   * 错误回调：每条路由的内层 ErrorBoundary 可以传自己的 logger / 上报函数。
   * 默认仍走 logger.error（保留全局兜底能力）。
   * 注意：堆栈不要原样暴露到 UI，仅在回调中用于上报。
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 默认行为：内部 logger 上报（不抛错、不影响 UI）
    logger.error('MiMo ErrorBoundary caught', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
    // 路由级回调（可有可无），用于注入额外上下文（路由名/用户态等）。
    // 安全调用，避免 onError 自身抛错导致 React 二次崩。
    try {
      this.props.onError?.(error, errorInfo)
    } catch (cbErr) {
      logger.warn('MiMo ErrorBoundary onError callback threw', {
        error: cbErr instanceof Error ? cbErr.message : String(cbErr),
      })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-void)' }}>
            <div
              className="rounded-[28px] p-8 text-center max-w-sm"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--surface-border)',
              }}
            >
              <div className="mb-4 flex justify-center" aria-hidden="true">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1} style={{ color: 'var(--accent-warm)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}>
                电台信号中断
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--fg-secondary)' }}>
                MiMo 遇到了一点小故障，刷新页面即可恢复。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all hover:scale-[1.02] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  background: 'var(--accent-glow)',
                  color: 'var(--accent-warm)',
                  border: '1px solid var(--accent-glow-strong)',
                  outlineColor: 'var(--accent-warm)',
                }}
              >
                重新连接电台
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
