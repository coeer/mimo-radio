'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * 歌词逐句高亮引擎
 *
 * 输入：一段 DJ 串词文本（可能含 **关键词** markdown 标记 + 多句）
 * 输出：分行后的歌词 + 当前高亮句索引 + 关键词渲染函数
 *
 * 三档降级策略：
 * 1. 理想：传入 timestamps（TTS 时间戳）→ 精确逐句高亮
 * 2. 次优：无时间戳 → 按总时长/句数估算，定时器推进
 * 3. 最简：整段文案 + 进度条（fallback，不逐句）
 */

export interface LyricLine {
  id: number
  raw: string                 // 原文（含 **关键词** 标记）
  cleanText: string           // 去掉标记的纯文本
  keywords: string[]          // 要标绿的关键词
  startTime: number           // 该句开始秒数（秒）
}

export interface LyricSegment {
  text: string
  isKeyword: boolean
}

interface UseLyricHighlightOptions {
  /** DJ 串词全文，多句用换行分隔。关键词用 **xxx** 标记 */
  script: string
  /** 当前播放时间（秒），用于驱动高亮 */
  currentTime: number
  /** 总时长（秒），用于估算每句时段 */
  duration?: number
  /** 是否正在播放，控制推进 */
  isPlaying: boolean
  /** speaker 前缀显示文本 */
  speaker?: string
}

/**
 * 把一行含 **关键词** 的文本拆成 segments
 * "imaging a **mother**" → [{mother, true}, ...]
 */
function parseLine(raw: string): { cleanText: string; keywords: string[] } {
  const keywords: string[] = []
  const cleanText = raw.replace(/\*\*(.+?)\*\*/g, (_, k: string) => {
    keywords.push(k)
    return k
  })
  return { cleanText, keywords: keywords }
}

export function useLyricHighlight({
  script,
  currentTime,
  duration = 60,
  // isPlaying 为公开 API 预留 option（调用方均传入），当前高亮由 currentTime 驱动，故暂未消费
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isPlaying,
  speaker = 'Claudio',
}: UseLyricHighlightOptions) {
  // 解析脚本为行
  const lines: LyricLine[] = useMemo(() => {
    const rawLines = script.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    if (rawLines.length === 0) return []

    // 按字符数估算每句时长（方案 B）：长句分配更多时间，比平均分配更接近真实语速。
    // 仅用纯文本长度（去掉 ** 标记）参与计算，避免标记字符干扰。
    const parsed = rawLines.map((raw) => parseLine(raw))
    const totalChars = parsed.reduce((sum, p) => sum + p.cleanText.length, 0) || 1

    let currentTime = 0
    return parsed.map((p, i) => {
      const charRatio = p.cleanText.length / totalChars
      const lineDuration = duration * charRatio
      const startTime = currentTime
      currentTime += lineDuration
      return {
        id: i,
        raw: rawLines[i],
        cleanText: p.cleanText,
        keywords: p.keywords,
        startTime,
      }
    })
  }, [script, duration])

  // 当前高亮索引（基于 currentTime 落在哪一句的时段）
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (lines.length === 0) return
    // 找到 currentTime 落入的最后一个 startTime <= currentTime 的行
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startTime <= currentTime) idx = i
      else break
    }
    setCurrentIndex(idx)
  }, [currentTime, lines])

  // 渲染单行：把关键词包成绿色 span
  const renderLine = (line: LyricLine): LyricSegment[] => {
    const segments: LyricSegment[] = []
    let remaining = line.raw
    const regex = /\*\*(.+?)\*\*/
    let match
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > 0) {
        segments.push({ text: remaining.slice(0, match.index), isKeyword: false })
      }
      segments.push({ text: match[1], isKeyword: true })
      remaining = remaining.slice(match.index + match[0].length)
    }
    if (remaining) segments.push({ text: remaining, isKeyword: false })
    return segments
  }

  return {
    lines,
    currentIndex,
    renderLine,
    speaker,
  }
}
