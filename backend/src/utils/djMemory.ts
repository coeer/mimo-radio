/**
 * DJ 会话记忆 —— 从当前 session 提取"今晚的上下文"。
 *
 * 用于 transition prompt：让 DJ 知道现在是第几首、之前放了什么、说过什么，
 * 从而生成有承接感、不重复的连贯串词。
 */

import type { Song, RadioSession } from '../types'

export interface DJMemory {
  /** 今晚已播歌曲数（含当前正在播的） */
  playedCount: number
  /** 今晚已播过的歌名列表（最近的在前，最多 5 首，供 DJ 回顾） */
  recentPlayed: Array<{ title: string; artist: string }>
  /** DJ 之前说过的串词（最近的在前，最多 3 段，供 DJ 避免重复） */
  recentDJSpoken: string[]
  /** 当前时段（从 context.time 提取，如"深夜"、"清晨"） */
  timeOfDay: string
  /** 当前天气描述 */
  weatherDesc: string
  /** 用户最近说过的话（最近的在前，最多 3 条） */
  recentUserSaid: string[]
}

/**
 * 从 session 提取 DJ 记忆。
 * @param session 当前会话
 */
export function extractDJMemory(session: RadioSession): DJMemory {
  // 已播歌曲：queue 里 currentIndex 及之前的（最多回看 5 首，不含当前正要解说的那首）
  const playedSongs = session.queue.slice(
    Math.max(0, session.currentIndex - 5),
    session.currentIndex
  )
  const recentPlayed = playedSongs
    .slice()
    .reverse() // 最近的在前
    .map(s => ({ title: s.title, artist: s.artist }))

  // DJ 已说过的串词：从 messages 里取 sender='kimi' 的，排除 chat 回复
  // chat 回复特征：含 [QQ音乐:] 等标签，或非常短（<30字的可能也是闲聊）
  // transition 串词特征：较长（80-150字），不含标签
  const kimiMessages = session.messages
    .filter(m => m.sender === 'kimi')
    .map(m => m.text)
    .filter(text => text.length > 30 && !text.includes('[')) // 排除短闲聊和带标签的
    .slice(-3) // 最近 3 段
    .reverse() // 最近的在前

  // 用户最近说过的话：取 sender='user' 的，长度 > 2，最近 3 条（最近的在前）
  const userMessages = session.messages
    .filter(m => m.sender === 'user')
    .map(m => m.text)
    .filter(text => text.length > 2)
    .slice(-3)
    .reverse()

  return {
    playedCount: session.currentIndex + 1,
    recentPlayed,
    recentDJSpoken: kimiMessages,
    timeOfDay: getTimeOfDay(session.context.time),
    weatherDesc: session.context.weather?.description || '未知',
    recentUserSaid: userMessages,
  }
}

/** 从 "22:30" 这样的时间字符串提取时段描述 */
export function getTimeOfDay(timeStr: string): string {
  const hour = parseInt(timeStr.split(':')[0], 10)
  if (isNaN(hour)) return '此刻'
  if (hour >= 5 && hour < 9) return '清晨'
  if (hour >= 9 && hour < 12) return '上午'
  if (hour >= 12 && hour < 14) return '午后'
  if (hour >= 14 && hour < 18) return '下午'
  if (hour >= 18 && hour < 22) return '夜晚'
  return '深夜'
}

/**
 * 把 DJ 记忆浓缩成可注入 prompt 的文本块。
 */
export function djMemoryPromptBlock(memory: DJMemory): string {
  const parts: string[] = []

  parts.push(`【今晚的电台记忆】`)
  parts.push(`- 现在是${memory.timeOfDay}（已播 ${memory.playedCount} 首）`)

  if (memory.weatherDesc !== '未知') {
    parts.push(`- 天气：${memory.weatherDesc}`)
  }

  if (memory.recentPlayed.length > 0) {
    parts.push(`- 刚才放过的歌：${memory.recentPlayed.map(s => `《${s.title}》${s.artist}`).join('、')}`)
  }

  if (memory.recentDJSpoken.length > 0) {
    parts.push(`- 你刚才说过的话（不要重复相同的表达）：`)
    memory.recentDJSpoken.forEach((text, i) => {
      parts.push(`  ${i + 1}. ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`)
    })
  }

  if (memory.recentUserSaid.length > 0) {
    parts.push(`- 用户刚才说过的话（可以参考这些回应）：`)
    memory.recentUserSaid.forEach((text, i) => {
      parts.push(`  ${i + 1}. ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`)
    })
  }

  parts.push(`请基于以上记忆，让这次的过渡和之前的有承接感，不要重复之前用过的句式或意象。`)

  return parts.join('\n')
}
