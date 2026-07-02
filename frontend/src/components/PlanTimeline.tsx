'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRadioStore } from '@/store/radioStore'
import type { DailySchedule, SchedulePlaylistEntry } from '@/types/schedule'
import type { Song } from '@/types/api'

interface PlanTimelineProps {
  schedule: DailySchedule | null
  loading: boolean
}

/** 终端配色：不同场景用不同强调色，呼应视频 §3.1.5 彩色圆点 */
const SCENE_COLORS = [
  '#00c853', // 晨间 - 绿
  '#4fc3f7', // 工作 - 蓝
  '#ffb74d', // 午后 - 橙
  '#ba68c8', // 夜间 - 紫
  '#7986cb', // 冥想 - 靛
  '#e57373', // 深夜 - 红
]

/** 当前小时落在哪个时段（支持跨午夜，如 23:00-01:00） */
function findCurrentSlotIndex(slots: Array<{ start: string; end: string }>): number {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (let i = 0; i < slots.length; i++) {
    const startMin = parseTimeToMin(slots[i].start)
    const endMin = parseTimeToMin(slots[i].end)
    if (endMin <= startMin) {
      // 跨午夜时段（如 23:00-01:00）：落在 [start,24:00) 或 [00:00,end)
      if (nowMin >= startMin || nowMin < endMin) return i
    } else {
      if (nowMin >= startMin && nowMin < endMin) return i
    }
  }
  return -1
}

function parseTimeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function PlanTimelineImpl({ schedule, loading }: PlanTimelineProps) {
  const currentSong = useRadioStore((s) => s.currentSong)
  const isPlaying = useRadioStore((s) => s.isPlaying)
  const setCurrentSong = useRadioStore((s) => s.setCurrentSong)
  const setDuration = useRadioStore((s) => s.setDuration)
  const setIsPlaying = useRadioStore((s) => s.setIsPlaying)

  const currentSlotIdx = useMemo(
    () => (schedule?.slots ? findCurrentSlotIndex(schedule.slots) : -1),
    [schedule?.slots],
  )

  // P7 修复：点歌后不跳转回首页，直接在 /plan 页开始播放
  const handlePlaySong = (song: Song) => {
    setCurrentSong(song)
    setDuration(song.duration || 180)
    setIsPlaying(true)
  }

  if (loading) {
    return (
      <div className="card-enter rounded-2xl px-4 py-5 surface-card font-[var(--font-mono)]">
        <div className="skeleton w-32 h-3 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-2 h-2 rounded-full" />
              <div className="skeleton flex-1 h-3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="card-enter rounded-2xl px-4 py-8 surface-card text-center">
        <p className="text-[12px] text-[var(--fg-muted)]">今日电台计划生成失败，稍后重试</p>
      </div>
    )
  }

  const slots = schedule.slots || []
  const playlist = schedule.playlist || []

  return (
    <div className="card-enter rounded-2xl px-4 py-4 surface-card font-[var(--font-mono)]">
      {/* 终端头部：天气 + 日期 */}
      <div className="mb-4 pb-3 border-b border-[var(--surface-border)]">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--neon-green)] animate-pulse-dot" />
          <span className="text-[11px] text-[var(--neon-green)]">CLAUDIO DJ</span>
          <span className="text-[11px] text-[var(--fg-muted)]">{schedule.date || new Date().toISOString().slice(0, 10)}</span>
        </div>
        {schedule.summary && (
          <p className="text-[11px] text-[var(--fg-secondary)] leading-relaxed mb-2">
            {schedule.summary}
          </p>
        )}
        <div className="flex items-center gap-3 text-[10px] text-[var(--fg-muted)]">
          {schedule.weather && (
            <span>
              <span className="text-[var(--fg-dim)]">天气</span> {schedule.weather}
              {schedule.temperature ? ` · ${schedule.temperature}` : ''}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-[var(--surface-bg-subtle)] text-[9px]">
            {schedule.source === 'ai' ? 'AI PLANNED' : 'FALLBACK'}
          </span>
        </div>
      </div>

      {/* 时段时间轴 */}
      <div className="space-y-1">
        {slots.map((slot, i) => {
          const isCurrent = i === currentSlotIdx
          const color = SCENE_COLORS[i % SCENE_COLORS.length]
          // 匹配对应的 playlist 条目
          const entry: SchedulePlaylistEntry | undefined = playlist.find(
            (p) => p.slot.start === slot.start && p.slot.end === slot.end,
          )
          return (
            <div
              key={`${slot.start}-${slot.end}`}
              className={`rounded-lg px-3 py-2.5 transition-all ${
                isCurrent ? 'bg-[var(--accent-glow)]' : 'hover:bg-[var(--surface-bg-hover)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* 彩色圆点（当前时段呼吸） */}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: color,
                    boxShadow: isCurrent ? `0 0 8px ${color}` : 'none',
                    animation: isCurrent ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                  }}
                />
                {/* 时段 */}
                <span className="text-[10px] tabular-nums text-[var(--fg-muted)] shrink-0 w-[90px]">
                  {slot.start}-{slot.end}
                </span>
                {/* 场景标签 */}
                <span
                  className="text-[12px] truncate"
                  style={{
                    color: isCurrent ? color : 'var(--fg-secondary)',
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {slot.label}
                </span>
                {isCurrent && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto shrink-0" style={{ backgroundColor: color, color: '#000' }}>
                    NOW
                  </span>
                )}
              </div>
              {/* 场景描述 */}
              {slot.description && (
                <p className="text-[10px] text-[var(--fg-dim)] mt-1 ml-[58px] leading-relaxed">
                  {slot.description}
                </p>
              )}
              {/* 歌曲候选（可点击播放） */}
              {entry && entry.songs.length > 0 && (
                <div className="mt-1.5 ml-[58px] space-y-0.5">
                  {entry.songs.slice(0, 2).map((song, j) => (
                    <button
                      key={song.id || j}
                      onClick={() => handlePlaySong(song)}
                      className="flex items-center gap-1.5 text-[10px] text-[var(--fg-muted)] hover:text-[var(--accent-warm)] transition-colors w-full text-left group"
                    >
                      <svg className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span className="truncate">{song.title}</span>
                      <span className="text-[var(--fg-dim)]">— {song.artist}</span>
                    </button>
                  ))}
                  {entry.candidates && entry.candidates.length > entry.songs.length && (
                    <p className="text-[9px] text-[var(--fg-dim)]">
                      +{entry.candidates.length - entry.songs.length} 待解析
                    </p>
                  )}
                </div>
              )}
              {/* 候选歌名（tracks 尚未解析时显示原始候选） */}
              {entry && entry.songs.length === 0 && entry.candidates && entry.candidates.length > 0 && (
                <div className="mt-1.5 ml-[58px] space-y-0.5">
                  {entry.candidates.slice(0, 2).map((c, j) => (
                    <p key={j} className="text-[10px] text-[var(--fg-dim)]">
                      {c.name} — {c.artist}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部统计 */}
      <div className="mt-3 pt-3 border-t border-[var(--surface-border)] flex items-center justify-between text-[9px] text-[var(--fg-dim)]">
        <span>{slots.length} SLOTS</span>
        <span>{playlist.reduce((n, p) => n + (p.songs?.length || p.candidates?.length || 0), 0)} TRACKS</span>
      </div>

      {/* P7: /plan 点歌后显示 mini player bar，让用户知道"正在播 + 可回主页" */}
      {currentSong ? (
        <div className="mt-3 pt-3 border-t border-[var(--surface-border)] flex items-center gap-3">
          <button
            onClick={() => useRadioStore.getState().togglePlay()}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--accent-warm)] text-black shrink-0"
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium truncate text-[var(--fg-primary)]">{currentSong.title}</p>
            <p className="text-[9px] text-[var(--fg-muted)] truncate">{currentSong.artist}</p>
          </div>
          <span className="text-[9px] text-[var(--neon-green)] shrink-0">{isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}</span>
        </div>
      ) : (
        // Q4 修复：currentSong 为 null（如全页 navigate 进 /plan 丢 session）时引导用户回首页
        <div className="mt-3 pt-3 border-t border-[var(--surface-border)] text-center">
          <Link href="/" className="text-[10px] text-[var(--fg-muted)] hover:text-[var(--accent-warm)] transition-colors">
            ← 返回电台开始播放
          </Link>
        </div>
      )}
    </div>
  )
}

export default memo(PlanTimelineImpl)
