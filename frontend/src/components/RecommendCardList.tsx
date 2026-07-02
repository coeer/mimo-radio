'use client'

import React, { memo } from 'react'
import { useRadioStore, RecommendSong, Song } from '@/store/radioStore'
import CoverArt from './CoverArt'

interface Props {
  songs: RecommendSong[]
}

/**
 * 推荐歌曲卡片列表 —— 对齐视频 92-102s
 * 第一首带绿色星标★ + 深绿背景高亮（选中态）
 * 其余带灰色播放图标▶
 * 点击卡片 → 切换为当前播放歌曲
 */
function RecommendCardList({ songs }: Props) {
  const setCurrentSong = useRadioStore((s) => s.setCurrentSong)
  const setIsPlaying = useRadioStore((s) => s.setIsPlaying)
  const setDuration = useRadioStore((s) => s.setDuration)
  const currentSong = useRadioStore((s) => s.currentSong)

  const handlePlay = (song: RecommendSong) => {
    // 推断音源平台：优先 neteaseId（网易云），否则 qqMusicMid（QQ），兜底 qq
    const platform: Song['platform'] = song.neteaseId ? 'netease' : 'qq'
    // id 用对应平台的标识，便于后端解析真实播放地址
    const id = song.neteaseId || song.qqMusicMid || `${song.title}-${song.artist}`
    const track: Song = {
      id,
      title: song.title,
      artist: song.artist,
      coverUrl: song.coverUrl,
      emotionTags: [],
      sceneTags: [],
      platform,
      qqMusicMid: song.qqMusicMid,
      neteaseId: song.neteaseId,
      playUrl: undefined, // 后端 nextSong 会解析真实 url
    }
    setCurrentSong(track)
    setDuration(180)
    setIsPlaying(true)
  }

  if (!songs || songs.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {songs.map((song, i) => {
        const isCurrent =
          currentSong?.title === song.title && currentSong?.artist === song.artist
        const selected = isCurrent || song.selected || i === 0
        return (
          <div
            key={`${song.title}-${song.artist}`}
            className={`recommend-card ${selected ? 'is-selected' : ''}`}
            onClick={() => handlePlay(song)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handlePlay(song)
              }
            }}
          >
            <div
              className={`recommend-icon ${selected ? 'selected' : 'unselected'}`}
            >
              {selected ? (
                /* 星标 ★ */
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              ) : (
                /* 播放三角 ▶ */
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
            <CoverArt src={song.coverUrl} size={36} radius={6} />
            <div className="flex-1 min-w-0">
              <div
                className="text-[14px] font-medium truncate"
                style={{ color: 'var(--fg-primary)' }}
              >
                {song.title}
              </div>
              <div
                className="text-[11px] truncate"
                style={{ color: 'var(--fg-muted)' }}
              >
                {song.artist}
              </div>
            </div>
            {isCurrent && (
              <span className="text-[9px] text-[var(--neon-green)] font-[var(--font-mono)]">PLAYING</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default memo(RecommendCardList)
