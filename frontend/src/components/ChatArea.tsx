'use client'

import React, { memo, useMemo, useRef, useEffect } from 'react'
import { useRadioStore } from '@/store/radioStore'
import RecommendCardList from './RecommendCardList'
import TypewriterText from './TypewriterText'

interface ChatAreaProps {
  onReplay?: (text: string) => void
}

const ChatArea = memo(function ChatArea({ onReplay }: ChatAreaProps) {
  const messages = useRadioStore((state) => state.messages)
  const sessionId = useRadioStore((state) => state.sessionId)
  // F3 修复：找到最新一条 kimi 消息 id，用于标记旧解说
  const lastKimiMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'kimi' && !messages[i].isPending) return messages[i].id
    }
    return null
  }, [messages])
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // Track whether user is (near) the bottom of the scroll area
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      isAtBottomRef.current = distanceFromBottom < 50
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll to bottom only when user is already at the bottom
  useEffect(() => {
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!sessionId) return null

  if (messages.length === 0) {
    return (
      <div className="card-enter card-enter-delay-2">
        <div className="rounded-2xl px-4 py-3 surface-card">
          <div className="text-center py-6">
            <p className="text-[12px] mb-2 text-[var(--fg-secondary)]">
              电台已启动，和 Claudio 聊聊吧
            </p>
            <p className="text-[11px] text-[var(--fg-muted)]">
              试试：「换一首中文歌」、「有点困了」、「推荐爵士」
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-enter card-enter-delay-2">
      <div
        className="rounded-2xl px-4 py-3 surface-card flex flex-col"
        style={{ maxHeight: '420px' }}
      >
        {/* Chat header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot bg-[var(--neon-green)]" />
            <span className="text-[11px] text-[var(--neon-green)] font-[var(--font-mono)]">
              Claudio
            </span>
            <span className="text-[11px] text-[var(--fg-muted)]">LIVE</span>
          </div>
          <span className="text-[11px] text-[var(--fg-dim)] font-[var(--font-mono)]">
            Connected to Claudio server
          </span>
        </div>

        {/* Messages — scrollable */}
        <div
          ref={scrollRef}
          className="space-y-2.5 overflow-y-auto flex-1 min-h-0"
          aria-live="polite"
          aria-atomic="false"
          style={{ scrollbarWidth: 'thin' }}
        >
          {messages.slice(-20).map((msg) => {
            const timeStr = new Date(msg.timestamp || Date.now())
              .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
            return (
              <div key={msg.id} className="flex gap-2.5">
                {msg.sender === 'kimi' && (
                  <div
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-warm), var(--accent-copper))',
                    }}
                    aria-hidden="true"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
                    </svg>
                  </div>
                )}
                <div className={`flex-1 ${msg.sender === 'user' ? 'text-right' : ''}`}>
                  <div
                    className="flex items-center gap-1.5 mb-0.5"
                    style={{ justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}
                  >
                    <span className={`text-[11px] ${msg.sender === 'kimi' ? 'text-[var(--accent-warm)]' : 'text-[var(--fg-secondary)]'}`}>
                      {msg.sender === 'kimi' ? 'Claudio' : 'You'}
                    </span>
                  </div>
                  <div
                    className="inline-block text-[12px] leading-relaxed px-3 py-2 rounded-xl text-[var(--fg-secondary)] text-left"
                    style={{
                      background: msg.sender === 'kimi' ? 'var(--surface-bg-subtle)' : 'var(--accent-glow)',
                      border: `1px solid ${msg.sender === 'kimi' ? 'var(--surface-border-subtle)' : 'var(--accent-glow-strong)'}`,
                    }}
                  >
                    {msg.isPending ? (
                      <span className="inline-flex items-center gap-1" aria-label="AI 正在思考">
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="ml-1 text-[11px] text-[var(--fg-muted)]">正在思考</span>
                      </span>
                    ) : msg.sender === 'kimi' ? (
                      <TypewriterText text={msg.text} speed={30} />
                    ) : (
                      <span>{msg.text}</span>
                    )}
                  </div>

                  {/* DJ 消息：时间戳 + REPLAY + (旧解说标记) + 出处 —— 对齐视频 25s */}
                  {msg.sender === 'kimi' && !msg.isPending && (
                    <div className="flex items-center gap-2 mt-1 ml-0.5">
                      <span className="text-[10px] text-[var(--fg-muted)] font-[var(--font-mono)]">
                        {timeStr}
                      </span>
                      <button
                        className="text-[10px] text-[var(--fg-muted)] hover:text-[var(--accent-warm)] transition-colors font-[var(--font-mono)]"
                        aria-label="重播"
                        onClick={() => onReplay?.(msg.text)}
                      >
                        REPLAY
                      </button>
                      {/* F3 修复：非最新 DJ 解说标记为"(旧解说)"，提示歌名可能已换 */}
                      {msg.id !== lastKimiMsgId && (
                        <span className="text-[9px] text-[var(--fg-dim)] font-[var(--font-mono)]">(旧解说)</span>
                      )}
                    </div>
                  )}

                  {/* 推荐歌曲卡片列表 */}
                  {msg.sender === 'kimi' && msg.recommendations && msg.recommendations.length > 0 && (
                    <RecommendCardList songs={msg.recommendations} />
                  )}

                  {/* DJ 出处标注 */}
                  {msg.sender === 'kimi' && !msg.isPending && (
                    <div className="text-[9px] text-[var(--fg-dim)] mt-1.5 font-[var(--font-mono)]">
                      MMGUO · 刚才在说话的是我的 AI DJ
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export default ChatArea
