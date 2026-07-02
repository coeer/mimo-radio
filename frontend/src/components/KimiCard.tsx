'use client'

import React, { memo, useEffect, useRef, useState, useCallback } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { fmtTime } from '@/lib/utils'
import { logger } from '@/lib/logger'
import AudioWaveform from './AudioWaveform'
import CoverArt from './CoverArt'

/**
 * Elapsed time display — isolated to prevent full KimiCard re-render every 100ms.
 */
const ElapsedTime = memo(function ElapsedTime({ isPlaying }: { isPlaying: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    setElapsedMs(0)
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => setElapsedMs((p) => p + 100), 100)
    return () => clearInterval(timer)
  }, [isPlaying])

  return (
    <span
      className="text-[11px] tabular-nums"
      style={{
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {fmtTime(elapsedMs / 1000)}
    </span>
  )
})

/**
 * Progress bar + time display — isolated to prevent full KimiCard re-render every 100ms.
 */
const ProgressBar = memo(function ProgressBar({ onSeek }: { onSeek?: (time: number) => void }) {
  const currentTime = useRadioStore((state) => state.currentTime)
  const duration = useRadioStore((state) => state.duration)
  const setCurrentTime = useRadioStore((state) => state.setCurrentTime)
  const progressRef = useRef<HTMLDivElement>(null)

  const onProgress = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !duration) return
      const r = progressRef.current.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      const newTime = p * duration
      setCurrentTime(newTime)
      onSeek?.(newTime)
    },
    [duration, setCurrentTime, onSeek]
  )

  return (
    <>
      <div
        ref={progressRef}
        className="flex-1 h-[3px] rounded-full bg-black/5 relative cursor-pointer group"
        onClick={onProgress}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
        aria-orientation="horizontal"
        onKeyDown={(e) => {
          if (!duration) return
          const step = duration / 20
          if (e.key === 'ArrowLeft') {
            const newTime = Math.max(0, currentTime - step)
            setCurrentTime(newTime)
            onSeek?.(newTime)
          } else if (e.key === 'ArrowRight') {
            const newTime = Math.min(duration, currentTime + step)
            setCurrentTime(newTime)
            onSeek?.(newTime)
          } else if (e.key === 'Home') {
            setCurrentTime(0)
            onSeek?.(0)
          } else if (e.key === 'End') {
            setCurrentTime(duration)
            onSeek?.(duration)
          }
        }}
      >
        <div
          className="h-full rounded-full relative transition-all duration-100"
          style={{
            width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            background: 'linear-gradient(90deg, var(--accent-warm), var(--accent-warm-bright))',
          }}
        >
          <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--accent-warm)' }} />
        </div>
      </div>
      <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--fg-muted)' }}>
        {fmtTime(currentTime)} / {fmtTime(duration || 180)}
      </span>
    </>
  )
})

const KimiCard = memo(function KimiCard({ onSeek, getFrequencyData }: { onSeek?: (time: number) => void; getFrequencyData?: (() => Uint8Array | null) | null }) {
  const currentSong = useRadioStore((state) => state.currentSong)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const togglePlay = useRadioStore((state) => state.togglePlay)
  const isSpeaking = useRadioStore((state) => state.isSpeaking)
  const isTransitioning = useRadioStore((state) => state.isTransitioning)
  const setFullscreenPlayer = useRadioStore((state) => state.setFullscreenPlayer)
  const nextSong = useRadioStore((state) => state.nextSong)
  const prevSong = useRadioStore((state) => state.prevSong)
  const toggleLike = useRadioStore((state) => state.toggleLike)
  // F1 修复：订阅 likedSongIds 数组（触发 re-render）而非 isLiked 函数引用
  const likedSongIds = useRadioStore((state) => state.likedSongIds)
  const isSongLiked = (id: string) => likedSongIds.includes(id)
  const sessionId = useRadioStore((state) => state.sessionId)
  const sessionToken = useRadioStore((state) => state.sessionToken)

  // 收藏：本地切换 + 上报后端 feedback（形成品味闭环）
  // P6 修复：debounce 500ms，快速连点只发最后一次状态，避免触发 429 限流
  const likeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleLike = useCallback(() => {
    if (!currentSong) return
    toggleLike(currentSong.id)
    const liked = isSongLiked(currentSong.id) // toggleLike 已执行，isSongLiked 返回切换后的值
    // 本地立即响应，上报 debounce 500ms
    if (likeDebounceRef.current) clearTimeout(likeDebounceRef.current)
    likeDebounceRef.current = setTimeout(() => {
      if (sessionId) {
        fetch(`${API_BASE}/api/v1/radio/${sessionId}/feedback`, {
          method: 'POST',
          headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: sessionToken,
            action: liked ? 'like' : 'unlike',
          }),
        }).catch(() => { /* 静默失败，不影响交互 */ })
      }
    }, 500)
  }, [currentSong, isSongLiked, toggleLike, sessionId, sessionToken])
  const volume = useRadioStore((state) => state.volume)
  const setVolume = useRadioStore((state) => state.setVolume)
  const [showVol, setShowVol] = useState(false)

  // P4 修复：全屏切换 debounce 300ms，防止快速连点导致 DOM 状态不一致
  const lastToggleRef = useRef(0)
  const openFullscreen = useCallback(() => {
    const now = Date.now()
    if (now - lastToggleRef.current < 300) return
    lastToggleRef.current = now
    setFullscreenPlayer(true)
  }, [setFullscreenPlayer])

  if (!currentSong) {
    return null
  }

  return (
    <div className="w-full card-enter card-enter-delay-1">
      <div className="radio-card rounded-[28px] overflow-hidden relative">
        {/* ─── Top Bar ─── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2 relative z-10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent-warm) 0%, var(--accent-copper) 100%)',
                boxShadow: '0 0 12px var(--accent-glow-strong)',
              }}
              aria-hidden="true"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
              </svg>
            </div>
            <span
              className="text-sm font-medium"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
            >
              MiMo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                  isSpeaking ? 'animate-pulse-dot' : ''
                }`}
                style={{
                  backgroundColor: isSpeaking ? 'var(--neon-green)' : 'var(--fg-muted)',
                  boxShadow: isSpeaking
                    ? '0 0 8px var(--neon-green-glow)'
                    : 'none',
                }}
              />
              <span
                className="text-[11px] transition-colors duration-300"
                style={{
                  color: isSpeaking ? 'var(--neon-green)' : 'var(--fg-muted)',
                }}
              >
                {isTransitioning ? '换台中...' : isSpeaking ? 'Speaking...' : 'Idle'}
              </span>
            </div>
            <ElapsedTime isPlaying={isPlaying} />
          </div>
        </div>

        {/* ─── Large Waveform ─── */}
        <div className="px-4 py-3 relative z-10">
          <AudioWaveform
            isPlaying={isPlaying}
            barCount={64}
            color="var(--fg-secondary)"
            height={52}
            variant="large"
            getFrequencyData={getFrequencyData}
          />
        </div>

        {/* ─── Song Info Card ─── */}
        <div className="px-5 pb-3 relative z-10">
          <div className="song-info-card">
            <div className="flex items-center gap-3">
              <CoverArt src={currentSong.coverUrl} size={72} radius={12} />
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={openFullscreen}
                role="button"
                tabIndex={0}
                aria-label="展开全屏播放器"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openFullscreen()
                  }
                }}
              >
                <h2
                  className="text-[22px] font-bold leading-tight tracking-tight hover:opacity-80 transition-opacity truncate"
                  style={{ color: 'var(--song-info-fg)', fontFamily: 'var(--font-display)' }}
                >
                  {currentSong.title}
                </h2>
                {currentSong.album && (
                  <p className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--song-info-fg-secondary)' }}>
                    {currentSong.album}
                  </p>
                )}
                <p className="text-[12px] mt-1 truncate" style={{ color: 'var(--song-info-fg-muted)' }}>
                  {currentSong.artist}
                </p>
              </div>
            </div>

            {/* Progress inside white card */}
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-warm)] bg-black/[0.06]"
              >
                {isPlaying ? (
                  <svg
                    className="w-3.5 h-3.5 text-[var(--song-info-fg)]"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg
                    className="w-3.5 h-3.5 ml-0.5 text-[var(--song-info-fg)]"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <ProgressBar onSeek={onSeek} />
            </div>

            {/* 控制按钮组：上一首/暂停/下一首/收藏/HIDE/LIST/FAV/VOL —— 对齐视频规格 */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
              <div className="flex items-center gap-1">
                <button
                  onClick={prevSong}
                  aria-label="上一首"
                  className="control-group-btn"
                  style={{ color: 'var(--song-info-fg-secondary)' }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </button>
                <button
                  onClick={togglePlay}
                  aria-label={isPlaying ? '暂停' : '播放'}
                  className="control-group-btn"
                  style={{ color: 'var(--song-info-fg)' }}
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => nextSong().catch((e) => logger.error('nextSong failed', { source: 'KimiCard', error: e instanceof Error ? e.message : String(e) }))}
                  aria-label="下一首"
                  disabled={isTransitioning}
                  className="control-group-btn"
                  style={{ color: 'var(--song-info-fg-secondary)' }}
                >
                  {isTransitioning ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4M16.24 7.76l2.83-2.83M18 12h4M16.24 16.24l2.83 2.83M12 18v4M7.76 16.24l-2.83 2.83M6 12H2M7.76 7.76L4.93 4.93" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleLike}
                  aria-label="收藏"
                  className={`control-group-btn ${currentSong && isSongLiked(currentSong.id) ? 'is-active' : ''}`}
                  style={{ color: 'var(--song-info-fg-secondary)' }}
                >
                  <svg className="w-4 h-4" fill={currentSong && isSongLiked(currentSong.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={openFullscreen}
                  aria-label="全屏"
                  className="control-group-btn"
                  style={{ color: 'var(--song-info-fg-secondary)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15" />
                  </svg>
                </button>
                <button
                  aria-label="音量"
                  onClick={() => setShowVol((v) => !v)}
                  className="control-group-btn"
                  style={{ color: 'var(--song-info-fg-secondary)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 音量条（点击 VOL 弹出） */}
            {showVol && (
              <div className="mt-2 flex items-center gap-2 animate-fade-in">
                <span className="text-[10px] text-[var(--song-info-fg-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>VOL</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(volume * 100)}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                  className="flex-1 h-1 accent-black/40"
                  aria-label="音量"
                />
              </div>
            )}
          </div>
        </div>


      </div>
    </div>
  )
})

export default KimiCard
