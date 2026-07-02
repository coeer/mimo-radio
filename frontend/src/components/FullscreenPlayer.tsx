'use client'

import React, { memo, useEffect, useRef } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { fmtTime } from '@/lib/utils'
import { logger } from '@/lib/logger'
import AudioWaveform from './AudioWaveform'
import { useLyric } from '@/hooks/useLyric'
import { useTheme } from '@/hooks/useTheme'
import SpeakingParticles from './SpeakingParticles'
import CoverArt from './CoverArt'

/**
 * Progress bar + time display — isolated to prevent full FullscreenPlayer re-render.
 */
const FullscreenProgressBar = memo(function FullscreenProgressBar() {
  const currentTime = useRadioStore((s) => s.currentTime)
  const duration = useRadioStore((s) => s.duration)
  const setCurrentTime = useRadioStore((s) => s.setCurrentTime)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <>
      <div
        className="flex-1 h-[3px] rounded-full bg-[#e0e0e0] relative cursor-pointer"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
          const t = p * duration
          setCurrentTime(t)
        }}
        role="slider"
        tabIndex={0}
        aria-label="进度"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
      >
        <div
          className="h-full rounded-full bg-[#1a1a1a] transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-[#666]" style={{ fontFamily: 'var(--font-mono)' }}>
        {fmtTime(currentTime)} / {fmtTime(duration || 180)}
      </span>
    </>
  )
})

/**
 * Bottom bar current time display — isolated to prevent full FullscreenPlayer re-render.
 */
const BottomTimeDisplay = memo(function BottomTimeDisplay() {
  const currentTime = useRadioStore((s) => s.currentTime)
  return (
    <span className="text-[11px] tabular-nums text-[#666]" style={{ fontFamily: 'var(--font-mono)' }}>
      {fmtTime(currentTime)}
    </span>
  )
})

/**
 * Lyric display — subscribes to currentTime independently to avoid re-rendering FullscreenPlayer.
 */
const LyricDisplay = memo(function LyricDisplay({ currentSong }: { currentSong: NonNullable<ReturnType<typeof useRadioStore.getState>['currentSong']> }) {
  const currentTime = useRadioStore((s) => s.currentTime)
  const lrc = useLyric(currentSong)

  const lrcCurrentIndex = (() => {
    if (!lrc.hasLyric || lrc.lines.length === 0) return -1
    let idx = -1
    for (let i = 0; i < lrc.lines.length; i++) {
      if (lrc.lines[i].time <= currentTime) idx = i
      else break
    }
    return idx < 0 ? 0 : idx
  })()

  return (
    <div className="flex-1 overflow-y-auto px-5 py-3" style={{ scrollbarWidth: 'thin' }}>
      {lrc.hasLyric && lrc.lines.length > 0 ? (
        lrc.lines.map((line, i) => (
          <div key={i} className="mb-3">
            <p
              className={`lyric-line ${i === lrcCurrentIndex ? 'is-current' : ''}`}
              style={{
                opacity: i === lrcCurrentIndex ? 1 : i < lrcCurrentIndex ? 0.45 : 0.3,
              }}
            >
              {line.text}
            </p>
            {line.translation && (
              <p
                className="text-[12px] text-[#888] mt-0.5"
                style={{ opacity: i === lrcCurrentIndex ? 0.8 : 0.3 }}
              >
                {line.translation}
              </p>
            )}
          </div>
        ))
      ) : lrc.loading ? (
        <div className="text-center text-[#999] text-[13px] py-10">
          歌词加载中...
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="w-12 h-12 mb-4 text-[#ccc]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h10v9a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h2v6z" />
          </svg>
          <p className="text-[14px] text-[#666] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            这首歌暂无歌词
          </p>
          <p className="text-[11px] text-[#999]">
            闭上眼，专注听音乐吧
          </p>
        </div>
      )}
    </div>
  )
})

/**
 * 全屏播放器（浅色主题）
 * 对应视频 0-4s / 204-248s：大歌名 + 波形 + 歌词逐句高亮 + Speaking 状态
 *
 * 进入时强制浅色主题，退出恢复用户原主题。
 */
function FullscreenPlayer() {
  const currentSong = useRadioStore((s) => s.currentSong)
  const isPlaying = useRadioStore((s) => s.isPlaying)
  const isSpeaking = useRadioStore((s) => s.isSpeaking)
  const isTransitioning = useRadioStore((s) => s.isTransitioning)
  const togglePlay = useRadioStore((s) => s.togglePlay)
  const setFullscreenPlayer = useRadioStore((s) => s.setFullscreenPlayer)
  const nextSong = useRadioStore((s) => s.nextSong)
  const prevSong = useRadioStore((s) => s.prevSong)
  const messages = useRadioStore((s) => s.messages)

  // 补丁修复：ref 同步读 DOM + setTheme 统一写入（F2 的同步原理 + useTheme 的写入优势）
  const { setTheme } = useTheme()    // 只要 setTheme，不要 theme state（异步初始值 'dark' 会导致回归）
  const prevThemeRef = useRef<string>('dark')
  useEffect(() => {
    // 同步读 DOM 拿真实主题（getAttribute 是同步的，state 是异步的——用 ref 绕过）
    prevThemeRef.current = document.documentElement.getAttribute('data-theme') || 'dark'
    setTheme('light')
    return () => {
      // 退出：用 setTheme 恢复（比直接 setAttribute 好——setTheme 会同步 localStorage）
      setTheme(prevThemeRef.current as 'dark' | 'light')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenPlayer(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setFullscreenPlayer])

  if (!currentSong) return null

  // 艺术化大歌名：若歌曲有特殊"电台主题名"用 title，否则用歌名
  const displayTitle = currentSong.title

  return (
    <div className="fullscreen-player fs-enter" role="dialog" aria-label="全屏播放器">
      {/* Speaking 紫蓝粒子背景 */}
      <SpeakingParticles active={isSpeaking} />

      {/* ─── 顶部状态栏 ─── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #c9a87c 0%, #b07d5a 100%)',
              }}
              aria-hidden="true"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
              </svg>
            </div>
            <span className="text-[15px] font-medium text-[#1a1a1a]" style={{ fontFamily: 'var(--font-display)' }}>
              Claudio
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: '#00c853',
                animation: isSpeaking || isPlaying ? 'pulse-dot 2s ease-in-out infinite' : 'none',
              }}
            />
            <span className="text-[11px] text-[#00c853]">
              {isTransitioning ? '换台中...' : isSpeaking ? 'Speaking...' : isPlaying ? 'On Air' : 'Paused'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setFullscreenPlayer(false)}
          aria-label="收起播放器"
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#666] hover:bg-black/5 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 13H5m0 0l6 6m-6-6l6-6" />
          </svg>
        </button>
      </div>

      {/* ─── 大波形 ─── */}
      <div className="px-5 py-3 shrink-0">
        <AudioWaveform
          isPlaying={isPlaying || isSpeaking}
          barCount={72}
          color="#1a1a1a"
          height={90}
          variant="large"
        />
      </div>

      {/* ─── 歌曲信息 + 进度 ─── */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-start gap-4 mb-3">
          <CoverArt src={currentSong.coverUrl} size={120} radius={14} />
          <div className="flex-1 min-w-0 pt-1">
            <h1
              className="text-[28px] font-bold leading-tight tracking-tight text-[#1a1a1a] truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {displayTitle}
            </h1>
            <p className="text-[13px] text-[#666] mt-1 truncate">
              {currentSong.artist}
              {currentSong.album ? ` — ${currentSong.album}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={prevSong}
            aria-label="上一首"
            className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] hover:scale-110 transition-transform"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#1a1a1a] hover:bg-black/5 transition-colors"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => nextSong().catch((e) => logger.error('nextSong failed', { source: 'FullscreenPlayer', error: e instanceof Error ? e.message : String(e) }))}
            aria-label="下一首"
            disabled={isTransitioning}
            className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] hover:scale-110 transition-transform"
          >
            {isTransitioning ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4M16.24 7.76l2.83-2.83M18 12h4M16.24 16.24l2.83 2.83M12 18v4M7.76 16.24l-2.83 2.83M6 12H2M7.76 7.76L4.93 4.93" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            )}
          </button>

          <FullscreenProgressBar />
        </div>
      </div>

      {/* ─── 歌词/解说区（双轨：真实 LRC 优先，无则降级 DJ 解说） ─── */}
      <LyricDisplay currentSong={currentSong} />

      {/* ─── 底部控制栏 ─── */}
      <div className="flex items-center justify-between px-5 pb-6 pt-2 shrink-0 border-t border-black/5">
        <BottomTimeDisplay />
        <div className="w-32">
          <AudioWaveform
            isPlaying={isPlaying}
            barCount={24}
            color="#999999"
            height={20}
            variant="mini"
          />
        </div>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? '暂停' : '播放'}
          className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center text-white hover:scale-105 transition-transform"
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
      </div>
    </div>
  )
}

export default memo(FullscreenPlayer)
