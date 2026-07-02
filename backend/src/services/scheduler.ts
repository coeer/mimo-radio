import { Song } from '../types'
import { getSongPool } from './engine'

export interface TimeSlot {
  start: string // HH:mm
  end: string
  label: string
  icon: string
  description: string
  tags: string[]
  device?: string
}

export interface DailySchedule {
  date: string
  weather: string
  temperature: string
  sunrise: string
  sunset: string
  calendar: {
    meetings: number
    workout: number
    meditation: number
  }
  totalSongs: number
  recentStyles: string[]
  slots: TimeSlot[]
  playlist: { slot: TimeSlot; songs: Song[] }[]
}

export const DEFAULT_SLOTS: TimeSlot[] = [
  { start: '06:00', end: '09:00', label: '晨间唤醒', icon: '🌅', description: '轻柔唤醒，开启一天', tags: ['早晨', '温暖', '治愈'] },
  { start: '09:00', end: '10:00', label: '房间先醒', icon: '🏠', description: '华语温暖，慢慢清醒', tags: ['华语', '温暖', '慵懒'], device: 'naim宝宝' },
  { start: '10:00', end: '12:00', label: '深度工作', icon: '💻', description: '电子/爵士，专注流', tags: ['工作', '专注', '电子', '爵士'], device: 'sony小黑' },
  { start: '12:00', end: '13:00', label: '午休韩语', icon: '🇰🇷', description: 'K-indie 与电子', tags: ['韩语', '慵懒', '午后'], device: 'naim宝宝' },
  { start: '13:00', end: '14:00', label: '会议间歇', icon: '☕', description: '轻松过渡', tags: ['轻松', '午后', '咖啡'], device: 'sony小黑' },
  { start: '14:00', end: '17:00', label: '午后专注', icon: '📖', description: 'Neo-classical / Ambient', tags: ['工作', '古典', '安静'] },
  { start: '17:00', end: '18:00', label: '运动时间', icon: '💪', description: '节奏感强的电子/摇滚', tags: ['运动', '节奏', '电子', '摇滚'] },
  { start: '18:00', end: '19:00', label: '通勤路上', icon: '🚗', description: '流行/摇滚，释放一天', tags: ['开车', '流行', '摇滚'] },
  { start: '19:00', end: '20:00', label: '晚餐时光', icon: '🍽️', description: '爵士/民谣，温馨氛围', tags: ['晚餐', '爵士', '民谣', '温馨'] },
  { start: '20:00', end: '21:00', label: '晚间阅读', icon: '📚', description: '轻音乐/古典', tags: ['阅读', '安静', '古典'] },
  { start: '21:00', end: '22:00', label: '夜间冥想', icon: '🧘', description: 'Ambient / 白噪音', tags: ['冥想', '深夜', '安静', '环境音'] },
  { start: '22:00', end: '23:00', label: '夜跑', icon: '🏃', description: '电子/嘻哈，夜行动物', tags: ['夜跑', '运动', '电子', '嘻哈'] },
  { start: '23:00', end: '01:00', label: '深夜独处', icon: '🌙', description: 'Indie / 后摇 / R&B', tags: ['深夜', '独处', '后摇', 'R&B'] },
  { start: '01:00', end: '06:00', label: '睡眠模式', icon: '💤', description: '白噪音 / 极简 Ambient', tags: ['睡眠', '安静', '环境音'] },
]

function getCurrentSlot(hour: number): TimeSlot {
  return DEFAULT_SLOTS.find(s => {
    const [sh] = s.start.split(':').map(Number)
    const [eh] = s.end.split(':').map(Number)
    if (eh < sh) return hour >= sh || hour < eh // overnight slot
    return hour >= sh && hour < eh
  }) || DEFAULT_SLOTS[DEFAULT_SLOTS.length - 1]
}

function filterSongsByTags(songs: Song[], tags: string[]): Song[] {
  const lowerTags = tags.map(t => t.toLowerCase())
  const matched = songs.filter(s =>
    lowerTags.some(tag =>
      s.emotionTags.some(e => e.toLowerCase().includes(tag)) ||
      s.sceneTags.some(sc => sc.toLowerCase().includes(tag))
    )
  )
  return matched.length > 0 ? matched : songs.slice(0, 10)
}

export function generateDailySchedule(): DailySchedule {
  const now = new Date()
  const songs = getSongPool()

  const schedule: DailySchedule = {
    date: now.toISOString().split('T')[0],
    weather: '晴 22/8℃',
    temperature: '22/8℃',
    sunrise: '05:42',
    sunset: '18:56',
    calendar: {
      meetings: 3,
      workout: 1,
      meditation: 1,
    },
    totalSongs: 3247,
    recentStyles: ['摇滚', '90s华语', '电子', '爵士'],
    slots: DEFAULT_SLOTS,
    playlist: DEFAULT_SLOTS.map(slot => ({
      slot,
      songs: filterSongsByTags(songs, slot.tags).slice(0, 5),
    })),
  }

  return schedule
}

export function getCurrentPlaylist(): { slot: TimeSlot; songs: Song[] } | null {
  const now = new Date()
  const hour = now.getHours()
  const songs = getSongPool()
  const slot = getCurrentSlot(hour)
  if (!slot) return null
  return {
    slot,
    songs: filterSongsByTags(songs, slot.tags).slice(0, 10),
  }
}
