'use client'

import React, { memo, useState, useEffect } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { fmtTime } from '@/lib/utils'
import AudioWaveform from './AudioWaveform'

const PlayerBar = memo(function PlayerBar({ getFrequencyData }: { getFrequencyData?: (() => Uint8Array | null) | null }) {
  const currentSong = useRadioStore((state) => state.currentSong)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const duration = useRadioStore((state) => state.duration)

  // Local time drive: init from store, tick every 1s, sync back every 5s to avoid drift
  const [localTime, setLocalTime] = useState(0)

  useEffect(() => {
    setLocalTime(useRadioStore.getState().currentTime)
  }, [])

  // P1-2c（F5）：换歌时重置 localTime——原实现只在 mount 时 init（依赖 []），
  // 换歌后从旧值继续 tick，时间滞留最多 5 秒（等 sync 校正）
  useEffect(() => {
    setLocalTime(useRadioStore.getState().currentTime)
  }, [currentSong?.id])

  useEffect(() => {
    if (!isPlaying) return
    const tick = setInterval(() => {
      setLocalTime((t) => Math.min(t + 1, duration || 0))
    }, 1000)
    const sync = setInterval(() => {
      setLocalTime(useRadioStore.getState().currentTime)
    }, 5000)
    return () => {
      clearInterval(tick)
      clearInterval(sync)
    }
  }, [isPlaying, duration])

  if (!currentSong) return null

  return (
    <div className="card-enter">
      <div className="rounded-2xl px-4 py-3 surface-card">
        {/* Top row: spectrum + song info + status */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 shrink-0">
            <AudioWaveform
              isPlaying={isPlaying}
              barCount={12}
              color="var(--neon-green)"
              height={24}
              variant="mini"
              getFrequencyData={getFrequencyData}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate text-[var(--fg-primary)] font-[var(--font-display)]">
                {currentSong.title} - {currentSong.artist}
              </span>
              <span className="status-badge status-badge--playing">PLAYING</span>
              {currentSong.platform && currentSong.platform !== 'mock' && (
                <span className={`status-badge ${currentSong.platform === 'qq' ? 'status-badge--qq' : 'status-badge--netease'}`}>
                  {currentSong.platform === 'qq' ? 'QQ' : 'NetEase'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info row: time + mini progress (controls live in KimiCard) */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-[var(--fg-muted)] font-[var(--font-mono)]">
            {fmtTime(localTime)}
          </span>
          <div className="flex-1 mx-3 h-[2px] rounded-full overflow-hidden bg-[var(--surface-bg-subtle)]">
            <div
              className="h-full rounded-full bg-[var(--accent-warm)]"
              style={{
                width: `${duration > 0 ? (localTime / duration) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-[var(--fg-muted)] font-[var(--font-mono)]">
            {fmtTime(duration || 0)}
          </span>
        </div>
      </div>
    </div>
  )
})

export default PlayerBar
