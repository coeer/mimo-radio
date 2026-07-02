/**
 * 前端 API 类型权威定义 —— 与后端 backend/src/types/index.ts 对齐。
 *
 * 前端为独立工程，无法直接 import 后端，故在此维护一份镜像。
 * 后端类型是超集（多 genre/year/fee/playable 等字段），前端只声明用到的那部分。
 * 新增字段时以「后端为准」在此同步，radioStore 等处一律从此 re-export，不重复定义。
 */

/** 音乐来源平台 */
export type MusicPlatform = 'mock' | 'netease' | 'qq'

/**
 * 歌曲信息 —— 对齐后端 Song（前端用到的字段子集）
 * 后端额外有 genre/year/fee/playable/neteaseId，前端暂未消费，故不声明。
 */
export interface Song {
  id: string
  title: string
  artist: string
  album?: string
  coverUrl?: string
  playUrl?: string
  duration?: number
  emotionTags: string[]
  sceneTags: string[]
  moodScore?: number
  platform?: MusicPlatform
  qqMusicMid?: string
  neteaseId?: string
}

/** 聊天消息 */
export interface ChatMessage {
  id: string
  sender: 'kimi' | 'user'
  text: string
  timestamp: number
  audioUrl?: string
  /** DJ 消息附带的推荐歌曲卡片（前端专用，后端 reply 里以 recommendations 字段下发） */
  recommendations?: RecommendSong[]
  /** 占位标记：AI 正在生成回复，UI 显示"思考中"动画；回复就绪后原地替换 text 并清除 */
  isPending?: boolean
}

/**
 * 推荐歌曲卡片 —— 聊天中展示的精简形态
 * 后端 DJ 回复的 recommendations 数组元素即此结构。
 */
export interface RecommendSong {
  title: string
  artist: string
  qqMusicMid?: string
  neteaseId?: string
  coverUrl?: string
  selected?: boolean
}
