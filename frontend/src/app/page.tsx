'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import KimiCard from '@/components/KimiCard'
import DotMatrixClock from '@/components/DotMatrixClock'
import OnAirBadge from '@/components/OnAirBadge'
import QueueList from '@/components/QueueList'
import TerminalLog from '@/components/TerminalLog'
import TopBar from '@/components/TopBar'
import FullscreenPlayer from '@/components/FullscreenPlayer'
import ParticleBackground from '@/components/ParticleBackground'
import PlayerBar from '@/components/PlayerBar'
import ChatArea from '@/components/ChatArea'
import InputArea from '@/components/InputArea'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useSession } from '@/hooks/useSession'
import { useRadioStore } from '@/store/radioStore'

export default function Home() {
  const [inputText, setInputText] = useState('')

  const { handleSeek, getFrequencyData } = useAudioPlayer()
  const { createSession, sendChatMessage, speakAIMessage, stopTTS } = useSession()

  const sessionId = useRadioStore((state) => state.sessionId)
  const currentSong = useRadioStore((state) => state.currentSong)
  const queue = useRadioStore((state) => state.queue)
  const isCreating = useRadioStore((state) => state.isCreating)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const isOnline = useRadioStore((state) => state.isOnline)
  const isFullscreenPlayer = useRadioStore((state) => state.isFullscreenPlayer)
  const audioUnlocked = useRadioStore((state) => state.audioUnlocked)
  const introScript = useRadioStore((state) => state.introScript)
  const introPlayed = useRadioStore((state) => state.introPlayed)
  const pendingTtsText = useRadioStore((state) => state.pendingTtsText)
  const pendingTtsStop = useRadioStore((state) => state.pendingTtsStop)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          useRadioStore.getState().togglePlay()
          break
        case 'ArrowLeft':
          handleSeek(Math.max(0, (useRadioStore.getState().currentTime || 0) - 10))
          break
        case 'ArrowRight':
          handleSeek(Math.min(
            useRadioStore.getState().duration || 0,
            (useRadioStore.getState().currentTime || 0) + 10
          ))
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSeek])

  // 首屏引导态：不自动创建会话，等用户首次输入再触发 createSession。
  // （对照视频：用户主动告诉 DJ 想听什么，电台才开播）
  // ref 守卫防止 StrictMode/HMR 重复触发（虽然此处不再自动创建，
  // 但保留给未来可能的预加载场景）。
  const autoCreated = useRef(false)
  useEffect(() => {
    autoCreated.current = true
  }, [])

  // 浏览器自动播放策略：首次用户交互后标记"音频已解锁"。
  // 这里只设闸门，不耦合业务逻辑，避免竞态（之前 once 监听器在 createSession 完成前被消耗，导致开场白播不出）。
  useEffect(() => {
    const onInteract = () => {
      if (!useRadioStore.getState().audioUnlocked) {
        useRadioStore.getState().setAudioUnlocked(true)
      }
    }
    window.addEventListener('click', onInteract)
    window.addEventListener('keydown', onInteract)
    return () => {
      window.removeEventListener('click', onInteract)
      window.removeEventListener('keydown', onInteract)
    }
  }, [])

  // 播放编排（订阅驱动，消除竞态）：音频解锁后，按优先级自动触发播放。
  // ① 有未播开场白且歌曲尚未开始过 → 播开场白（其 onEnd 会自动放第一首歌）
  // ② 无开场白（或已播完）且有歌未播、未在说话 → 放歌
  // 注意：一旦放过歌就不再回头播开场白，避免歌曲已响又插开场白的音轨冲突。
  useEffect(() => {
    if (!audioUnlocked) return
    const s = useRadioStore.getState()
    // 优先开场白：仅在歌曲尚未开始播放时
    if (s.introScript && !s.introPlayed && !s.isSpeaking && !s.isPlaying) {
      s.setIntroPlayed(true)
      // F4（2026-07-22）：双保险改走 playRequest('pause','dj')，仲裁层统一处理
      s.playRequest('pause', 'dj')
      speakAIMessage(s.introScript)
      return
    }
    // 无开场白（或已播完/已在播歌）且有歌未播、未在说话 → 放歌
    if ((!s.introScript || s.introPlayed) && s.currentSong && !s.isPlaying && !s.isSpeaking) {
      // F4（2026-07-22）：unlockAudio 由用户手势触发 → playRequest('play','user')
      s.playRequest('play', 'user')
    }
  }, [audioUnlocked, introScript, introPlayed, speakAIMessage])

  // 换歌串词 TTS 消费：nextSong 写入 pendingTtsText 后触发播报。
  // 一次性信号——消费后立即 clear，避免残留导致重触发。
  // 守卫：DJ 关闭或正在说话（开场白/上一条串词）时跳过并清除，不打断。
  useEffect(() => {
    if (!pendingTtsText) return
    const s = useRadioStore.getState()
    if (!s.djEnabled || s.isSpeaking) {
      s.clearPendingTtsText()
      return
    }
    void speakAIMessage(pendingTtsText)
    s.clearPendingTtsText()
  }, [pendingTtsText, speakAIMessage])

  // P2 修复：换歌时停止当前 TTS（打断旧 transition，播新的）
  useEffect(() => {
    if (!pendingTtsStop) return
    stopTTS()
    useRadioStore.getState().clearPendingTtsStop()
  }, [pendingTtsStop, stopTTS])

  // Network status
  useEffect(() => {
    const handleOnline = () => useRadioStore.getState().setOnline(true)
    const handleOffline = () => useRadioStore.getState().setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isCreating) return
    const text = inputText.trim()
    const s = useRadioStore.getState()
    s.addMessage({ sender: 'user', text, timestamp: Date.now() })
    setInputText('')

    if (sessionId) {
      await sendChatMessage(text)
    } else {
      await createSession(text)
    }
  }, [inputText, isCreating, sessionId, sendChatMessage, createSession])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend()
  }, [handleSend])

  // 重播某条 DJ 消息（REPLAY 按钮）。useTTS.speak 内部已先 stop，这里再显式 stop 双保险。
  const handleReplay = useCallback(
    (text: string) => {
      stopTTS()
      void speakAIMessage(text)
    },
    [stopTTS, speakAIMessage],
  )

  return (
    <>
      {/* 全屏播放器（条件渲染）—— P0a-3（F4）：透传 handleSeek 让进度条点击真正 seek */}
      {isFullscreenPlayer && <FullscreenPlayer onSeek={handleSeek} />}

      {/* Skip to content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--bg-surface)] focus:text-[var(--fg-primary)] focus:outline focus:outline-2 focus:outline-[var(--accent-warm)] focus:outline-offset-2"
      >
        跳转到主内容
      </a>
      <main id="main-content" className="min-h-screen relative overflow-x-hidden bg-[var(--bg-void)]">
      <ParticleBackground />
      <div className="ambient-glow" />
      <div className="dot-grid" />

      <div className="relative z-10 mx-auto w-full max-w-[440px] px-4 py-6 flex flex-col gap-3">
        {/* 顶栏：头像+Claudio / 齿轮设置 */}
        <TopBar />

        {/* 主内容区域包一层 ErrorBoundary：
           - 任何子组件（KimiCard / ChatArea / InputArea 等）崩溃都不会带崩 TopBar，
             用户依然可以点击顶栏跳到 /plan /profile /settings 继续用。
           - 不包 layout.tsx 的全局 ErrorBoundary（仍作为最后兜底）。
         */}
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl px-4 py-6 surface-card text-center" style={{ border: '1px solid var(--surface-border)' }}>
              <p className="text-[13px] mb-1" style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}>
                电台主界面加载失败
              </p>
              <p className="text-[11px] mb-3" style={{ color: 'var(--fg-muted)' }}>
                部分视图暂时不可用，可点击顶栏跳转其他页面，或刷新页面恢复。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-[11px] px-3 py-1.5 rounded-full"
                style={{ background: 'var(--accent-glow)', color: 'var(--accent-warm)', border: '1px solid var(--accent-glow-strong)' }}
              >
                重新加载
              </button>
            </div>
          }
        >
        {/* 单列内容流 */}
        {/* Clock + ON AIR */}
        <div className="flex flex-col items-center gap-3">
          <div className="animate-text-glow">
            <DotMatrixClock />
          </div>
          <OnAirBadge isLive={isPlaying} />
        </div>

        {/* Offline indicator */}
        {!isOnline && (
          <div className="rounded-full px-3 py-1.5 text-center text-[11px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
            网络已断开，部分功能不可用
          </div>
        )}

        {/* Player Bar (info only) */}
        {sessionId && currentSong && <PlayerBar getFrequencyData={getFrequencyData} />}

        {/* Terminal Log —— 引导态：无会话时显示（首屏 + 切音源重置后） */}
        {!sessionId && (
          <div className="card-enter max-h-[300px] overflow-y-auto rounded-2xl" style={{ scrollbarWidth: 'none' }}>
            <TerminalLog />
          </div>
        )}

        {/* Player Card */}
        {currentSong && (
          <KimiCard onSeek={handleSeek} getFrequencyData={getFrequencyData} />
        )}

        {/* Loading Skeleton */}
        {isCreating && (
          <div className="card-enter">
            <div className="rounded-[16px] p-5 space-y-3 surface-card">
              <div className="flex items-center gap-3">
                <div className="skeleton w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton w-24 h-3" />
                  <div className="skeleton w-16 h-2" />
                </div>
              </div>
              <div className="skeleton w-full h-10 rounded-lg" />
              <div className="flex gap-2">
                <div className="skeleton w-20 h-2" />
                <div className="skeleton w-16 h-2" />
              </div>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <ChatArea onReplay={handleReplay} />

        {/* Input Area */}
        <InputArea
          inputText={inputText}
          setInputText={setInputText}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
        />

        {/* Queue */}
        {sessionId && queue.length > 0 && (
          <div className="card-enter card-enter-delay-1">
            <QueueList />
          </div>
        )}
        </ErrorBoundary>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-3 pb-6">
        <span className="text-[11px] text-[var(--fg-dim)] font-[var(--font-mono)]">CLAUDIO FM</span>
        <span className="w-1 h-1 rounded-full bg-[var(--fg-dim)]" />
        <span className="text-[11px] font-[var(--font-mono)]" style={{ color: isOnline ? 'var(--color-success)' : 'var(--color-error)' }}>
          {isOnline ? 'CONNECTED' : 'OFFLINE'}
        </span>
      </div>
    </main>
  </>
  )
}
