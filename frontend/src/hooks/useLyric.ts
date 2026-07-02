'use client'

import { useEffect, useState } from 'react'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'
import type { Song } from '@/types/api'

/** 解析后的歌词行 */
export interface LyricLine {
  /** 该行开始时间（秒） */
  time: number
  /** 歌词原文 */
  text: string
  /** 翻译（可选） */
  translation?: string
}

interface LyricState {
  /** 解析后的歌词行（按时间升序） */
  lines: LyricLine[]
  /** 是否有真实歌词（false 表示无 LRC，应降级到 DJ 解说） */
  hasLyric: boolean
  /** 加载状态 */
  loading: boolean
}

/**
 * 解析 LRC 歌词文本为按时间排序的歌词行。
 * 支持 [mm:ss.xx] 标准格式；无时间戳的行视为无歌词。
 */
export function parseLRC(lrc: string, translation?: string): LyricLine[] {
  if (!lrc) return []

  // 翻译行：按时间戳建立映射
  const transMap = new Map<number, string>()
  if (translation) {
    const transLines = translation.split('\n')
    for (const line of transLines) {
      const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\]/)
      if (!match) continue
      const sec = parseInt(match[1], 10) * 60 + parseFloat(match[2])
      const text = line.replace(/\[[\d:.]+\]/, '').trim()
      if (text) transMap.set(sec, text)
    }
  }

  const result: LyricLine[] = []
  const lines = lrc.split('\n')
  for (const line of lines) {
    // 一行可能带多个时间戳：[00:01.00][01:30.00]同一句歌词
    const timeMatches = Array.from(line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g))
    const text = line.replace(/\[[\d:.]+\]/g, '').trim()
    if (!text) continue

    if (timeMatches.length === 0) continue

    for (const m of timeMatches) {
      const sec = parseInt(m[1], 10) * 60 + parseFloat(m[2])
      // 找最近的翻译（±0.5s 容差）
      let translation: string | undefined
      const entries = Array.from(transMap.entries())
      for (const [t, txt] of entries) {
        if (Math.abs(t - sec) < 0.5) {
          translation = txt
          break
        }
      }
      result.push({ time: sec, text, translation })
    }
  }

  return result.sort((a, b) => a.time - b.time)
}

/**
 * 根据当前歌曲获取 LRC 歌词。
 * - QQ 歌曲：用 qqMusicMid
 * - 网易云歌曲：用 neteaseId
 * - mock 歌曲：无歌词
 *
 * 歌曲变化时自动重新 fetch。失败或无歌词时 hasLyric=false，调用方降级。
 */
export function useLyric(song: Song | null): LyricState {
  const [state, setState] = useState<LyricState>({ lines: [], hasLyric: false, loading: false })

  useEffect(() => {
    if (!song) {
      setState({ lines: [], hasLyric: false, loading: false })
      return
    }

    // 确定平台和 id
    let platform: 'qq' | 'netease' | null = null
    let id = ''
    if (song.platform === 'qq' && song.qqMusicMid) {
      platform = 'qq'
      id = song.qqMusicMid
    } else if (song.platform === 'netease' && song.neteaseId) {
      platform = 'netease'
      id = song.neteaseId
    } else if (song.neteaseId) {
      platform = 'netease'
      id = song.neteaseId
    } else if (song.qqMusicMid) {
      platform = 'qq'
      id = song.qqMusicMid
    }

    if (!platform || !id) {
      setState({ lines: [], hasLyric: false, loading: false })
      return
    }

    let cancelled = false
    setState({ lines: [], hasLyric: false, loading: true })

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/lyric/${platform}/${id}`, {
          headers: getApiHeaders(false),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (cancelled) return

        const data = json.data || {}
        const lyric = data.lyric || ''
        if (!lyric || !data.hasLyric) {
          setState({ lines: [], hasLyric: false, loading: false })
          return
        }

        const lines = parseLRC(lyric, data.tlyric || data.transLyric)
        setState({ lines, hasLyric: lines.length > 0, loading: false })
      } catch (err) {
        logger.warn('[useLyric] fetch failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        if (!cancelled) setState({ lines: [], hasLyric: false, loading: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [song?.id, song?.platform, song?.qqMusicMid, song?.neteaseId])

  return state
}
