'use client'

import React, { memo } from 'react'
import { useRadioStore } from '@/store/radioStore'
import CoverArt from './CoverArt'

const QueueList = memo(function QueueList() {
  const queue = useRadioStore((state) => state.queue)
  const currentSong = useRadioStore((state) => state.currentSong)

  const currentIndex = queue.findIndex((s) => s.id === currentSong?.id)
  const visibleQueue = queue.slice(Math.max(0, currentIndex))

  if (visibleQueue.length === 0) return null

  const handlePlaySong = (songId: string) => {
    const song = queue.find((s) => s.id === songId)
    if (!song || song.id === currentSong?.id) return
    const state = useRadioStore.getState()
    state.setCurrentSong(song)
    state.setCurrentTime(0)
    // F4（2026-07-22）：用户队列点歌 → playRequest('play','user')，R1 用户优先
    state.playRequest('play', 'user')
  }

  return (
    <div className="surface-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--surface-border)]">
        <span className="text-[11px] tracking-[0.15em] font-medium text-[var(--fg-muted)] font-[var(--font-mono)]">
          QUEUE
        </span>
        <span className="text-[11px] text-[var(--fg-muted)] font-[var(--font-mono)]">
          {visibleQueue.length} TRACKS
        </span>
      </div>

      {/* List —— 完整队列可滚动，避免 20 首只能看 6 首 */}
      <div className="px-2 py-2 space-y-0.5 max-h-[240px] overflow-y-auto" role="listbox" aria-label="播放队列">
        {visibleQueue.map((song, i) => {
          const isCurrent = i === 0
          const actualIndex = currentIndex + i + 1

          return (
            <div
              key={song.id}
              role="option"
              aria-selected={isCurrent}
              onClick={() => handlePlaySong(song.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer select-none ${
                isCurrent ? 'queue-item-active' : 'hover:bg-[var(--surface-bg-hover)]'
              }`}
              style={{
                background: isCurrent ? 'var(--accent-glow)' : undefined,
              }}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handlePlaySong(song.id)
                }
              }}
            >
              {/* Index or playing indicator */}
              <div className="w-5 shrink-0 flex items-center justify-center">
                {isCurrent ? (
                  <div className="flex items-end gap-[2px] h-3">
                    <span className="w-[2px] bg-[var(--neon-green)] animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                    <span className="w-[2px] bg-[var(--neon-green)] animate-pulse" style={{ height: '100%', animationDelay: '100ms' }} />
                    <span className="w-[2px] bg-[var(--neon-green)] animate-pulse" style={{ height: '70%', animationDelay: '200ms' }} />
                  </div>
                ) : (
                  <span className="text-[10px] text-center text-[var(--fg-muted)] font-[var(--font-mono)]">
                    {actualIndex}
                  </span>
                )}
              </div>

              {/* Cover */}
              <CoverArt src={song.coverUrl} size={32} radius={6} />

              {/* Song info */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] truncate"
                  style={{
                    color: isCurrent ? 'var(--neon-green)' : 'var(--fg-secondary)',
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {song.title}
                </div>
              </div>

              {/* Platform badge + Artist */}
              <div className="flex items-center gap-1.5 shrink-0">
                {song.platform && song.platform !== 'mock' && (
                  <span
                    className={`status-badge ${song.platform === 'qq' ? 'status-badge--qq' : 'status-badge--netease'}`}
                  >
                    {song.platform === 'qq' ? 'QQ' : 'NetEase'}
                  </span>
                )}
                <div className="text-[10px] truncate max-w-[90px] text-[var(--fg-muted)]">
                  {song.artist}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default QueueList
