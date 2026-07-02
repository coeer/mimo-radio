/**
 * 每日电台时间轴类型 —— 对齐后端 GET /api/v1/schedule/today 响应。
 */

/** 时段槽位（场景描述） */
export interface ScheduleSlot {
  start: string
  end: string
  label: string
  icon?: string
  description?: string
  tags?: string[]
}

/** 时段对应的播放列表 */
export interface SchedulePlaylistEntry {
  slot: { start: string; end: string; label: string }
  songs: import('./api').Song[]
  candidates?: Array<{ name: string; artist: string }>
  mood?: string
}

/** 每日计划完整响应 */
export interface DailySchedule {
  date?: string
  weather?: string
  temperature?: string
  summary?: string
  source?: 'ai' | 'static'
  tracksLoaded?: boolean
  slots?: ScheduleSlot[]
  playlist?: SchedulePlaylistEntry[]
}
