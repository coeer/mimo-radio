/**
 * 用户输入意图识别 + 关键词提取。
 *
 * 用于 chat 路由的"搜索前置"：在调 AI 之前，先用规则识别用户是否想点歌/推荐，
 * 并提取搜索关键词（优先精确"歌手+歌名"，退回整句）。
 * 这样搜索在 AI 之前发生，AI 能基于真实搜索结果回复，避免"DJ说A播B"。
 */

export type ChatIntent = 'point_song' | 'recommend' | 'chat'

export interface ExtractedIntent {
  intent: ChatIntent
  /** 提取出的搜索关键词（优先"歌名 歌手"，退回整句片段） */
  keyword: string
  /** 精确匹配提示：如果能识别出"歌手+歌名"，给搜索加权重 */
  artist?: string
  title?: string
}

/**
 * 点歌意图的正则模式（按优先级排序，先匹配先返回）
 * - "周杰伦的晴天" / "晴天 周杰伦" → 歌手+歌名
 * - "来首周杰伦" / "想听周杰伦" → 歌手
 * - "来点爵士" / "推荐轻音乐" → 风格/氛围
 */
const ARTIST_TITLE_PATTERNS: Array<{ re: RegExp; group: (m: RegExpMatchArray) => { artist?: string; title?: string } }> = [
  // "周杰伦的晴天" / "周杰伦的《晴天》"
  {
    re: /^(.+?)的[《]?([^《》的]{1,30})[》]?$/,
    group: (m) => ({ artist: m[1].trim(), title: m[2].trim() }),
  },
  // "晴天 周杰伦" / "晴天-周杰伦"（歌名在前）
  {
    re: /^([^的]{1,30})\s*[-—]\s*(.+)$/,
    group: (m) => ({ title: m[1].trim(), artist: m[2].trim() }),
  },
]

// 过滤通用词：这些词不算是具体歌名
const GENERIC_WORDS = /^(歌|音乐|曲子|旋律|歌曲|专辑|单曲|唱片|歌谣)$/

// 纯点歌意图的关键词（"来点"移出到推荐，因为"来点轻音乐"是推荐行为）
const POINT_SONG_KEYWORDS = /想听|来首|播放|听下|换首|换歌|点首|下一首.*吧|给我.*歌/
// 推荐意图的关键词
const RECOMMEND_KEYWORDS = /推荐|来点|来些|找.*首|想听点|换个.*风格/

/**
 * 从用户输入提取意图和搜索关键词。
 */
export function extractIntent(input: string): ExtractedIntent {
  const text = input.trim()

  // 1. 优先尝试"歌手+歌名"精确匹配
  for (const pattern of ARTIST_TITLE_PATTERNS) {
    const m = text.match(pattern.re)
    if (m) {
      const { artist, title } = pattern.group(m)
      if (artist && title && artist.length >= 1 && title.length >= 1 && !GENERIC_WORDS.test(title)) {
        return {
          intent: 'point_song',
          keyword: `${title} ${artist}`,
          artist,
          title,
        }
      }
    }
  }

  // 2. 推荐意图（先检查，解决"来点轻音乐"→推荐）
  if (RECOMMEND_KEYWORDS.test(text)) {
    const keyword = text
      .replace(/^(推荐[点些]?|来点|来些|找|想听点|换个)/, '')
      .replace(/的(歌|音乐|曲子|旋律|风格)$/, '')
      .replace(/^(一些|这个|那个|点|些)/, '')  // 去除残留的"一些""点""些"
      .trim() || text
    return { intent: 'recommend', keyword: keyword.slice(0, 30) }
  }

  // 3. 含"想听/来首/播放"等 → 点歌意图
  if (POINT_SONG_KEYWORDS.test(text)) {
    const keyword = text
      .replace(/^(想听|来首|播放|听下|换首|换歌|点首|给我)/, '')
      .replace(/的(歌|音乐|曲子|旋律)$/, '')
      .trim() || text
    return { intent: 'point_song', keyword: keyword.slice(0, 30) }
  }

  // 4. 其他 → 纯聊天
  return { intent: 'chat', keyword: text.slice(0, 30) }
}
