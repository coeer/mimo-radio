import { logger, toErrorMeta } from '../utils/logger'
import { extractJsonObject } from '../utils/extractJson'
import * as fs from 'fs'
import * as path from 'path'

/**
 * DJ 人设档案 —— 持久化的"AI DJ 人格"。
 *
 * 设计：用户的听歌数据是输入，AI DJ 是输出"角色"。
 * 一次性分析（基于品味数据 + 电台定位），生成一份人格档案，
 * 之后所有 DJ 解说（intro/transition/chat）都注入这份档案，
 * 让 DJ 说话有一致的人格 + 懂用户品味。
 */

export interface DJPersona {
  /** DJ 名字 */
  name: string
  /** 说话风格（一句话概括） */
  voiceTone: string
  /** DJ 对用户的认知（"我懂你"的依据） */
  knowsUser: string
  /** 品味画像（来自听歌数据） */
  tasteProfile: {
    type: string
    genres: string[]
    moodTendency: string
    signatureArtists: string[]
    sceneTags: string[]
  }
  /** 开场习惯 */
  introStyle: string
  /** 切歌过渡习惯 */
  transitionStyle: string
  /** 介绍单首歌的习惯（为什么放这首） */
  songIntroStyle: string
  /** 生成时间戳 */
  generatedAt: string
}

const PERSONA_FILE = path.join(__dirname, '../../data/dj-persona.json')

let cachedPersona: DJPersona | null = null

/** 默认人设（无听歌数据时用） */
function defaultPersona(): DJPersona {
  return {
    name: 'KIMI',
    voiceTone: '温暖、克制、有审美主张，像深夜电台的老朋友，不啰嗦但每句都到位',
    knowsUser: '你对这个用户的品味了解还不多，保持开放好奇，多观察多推荐',
    tasteProfile: {
      type: '待探索',
      genres: ['流行', '轻音乐'],
      moodTendency: '平衡',
      signatureArtists: [],
      sceneTags: ['日常'],
    },
    introStyle: '用一句问候+一个今晚的氛围定调开场，不超过30字',
    transitionStyle: '简短承接上一首的情绪，自然引出下一首，重点说"为什么是这首"',
    songIntroStyle: '一句话点出这首歌的亮点（旋律/歌词/背景），勾起聆听欲',
    generatedAt: new Date().toISOString(),
  }
}

/** 读取已持久化的人设（启动时加载） */
export function loadPersona(): DJPersona {
  if (cachedPersona) return cachedPersona
  try {
    if (fs.existsSync(PERSONA_FILE)) {
      const raw = fs.readFileSync(PERSONA_FILE, 'utf-8')
      cachedPersona = JSON.parse(raw) as DJPersona
      logger.info('DJ 人设已加载', { name: cachedPersona!.name, type: cachedPersona!.tasteProfile.type })
      return cachedPersona!
    }
  } catch (err) {
    logger.error('DJ 人设加载失败', { ...toErrorMeta(err) })
  }
  cachedPersona = defaultPersona()
  return cachedPersona
}

/**
 * 基于"用户听歌画像"生成 DJ 人设档案（一次性分析）。
 *
 * @param aiChat 调用大模型的函数（注入，避免循环依赖 AIService）
 * @param userTaste 用户听歌画像（来自网易云抓取的 netease-taste.json）
 */
export async function generatePersona(
  aiChat: (messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) => Promise<string>,
  userTaste?: {
    tasteType?: string
    genres?: string[]
    signatureArtists?: string[]
    sceneTags?: string[]
    sampleSongs?: Array<{ name: string; artist: string }>
  }
): Promise<DJPersona> {
  const tasteDesc = userTaste
    ? `用户的听歌画像：
- 品味类型：${userTaste.tasteType || '多元'}
- 偏好流派：${(userTaste.genres || []).join('、')}
- 代表歌手：${(userTaste.signatureArtists || []).slice(0, 8).join('、')}
- 场景标签：${(userTaste.sceneTags || []).join('、')}
- 代表歌曲：${(userTaste.sampleSongs || []).slice(0, 10).map(s => `${s.name}-${s.artist}`).join('、')}`
    : '（暂无用户听歌数据，按通用电台 DJ 设计）'

  const prompt = `你是一位资深电台制作人。现在要为一位用户设计他的"私人 AI 电台 DJ"角色。

${tasteDesc}

请基于这位用户的真实品味，设计一个 AI DJ 人设。这个 DJ 要像用户的"声音朋友"——懂他的品味，会主动开口，说话有审美、不油腻、不啰嗦。

严格按下面的 JSON 格式输出（只输出 JSON，不要其他文字）：
{
  "voiceTone": "DJ 的说话风格（一句话，具体到语气/用词偏好）",
  "knowsUser": "DJ 对用户的认知（用第一人称，例如'我注意到你深夜常听...'，2-3句）",
  "tasteProfile": {
    "type": "用一句精炼的话概括这个用户的品味类型",
    "genres": ["提取3-6个最突出的流派标签"],
    "moodTendency": "情绪倾向（如 治愈/忧郁/激昂/平衡）",
    "signatureArtists": ["提取5-8个代表歌手"],
    "sceneTags": ["提取2-4个场景标签，如 深夜/专注/通勤"]
  },
  "introStyle": "开场白习惯（DJ 怎么打开今晚的电台，具体风格）",
  "transitionStyle": "切歌过渡习惯（DJ 怎么从一首歌引到下一首）",
  "songIntroStyle": "介绍单首歌的习惯（DJ 怎么说'接下来这首'）"
}`

  try {
    const raw = await aiChat([{ role: 'user', content: prompt }])
    // 提取 JSON（容错：模型可能带 ```json 包裹；用 extractJsonObject 做长度截断防 ReDoS）
    const extracted = extractJsonObject(raw)
    if (!extracted) throw new Error('未解析到 JSON')
    const parsed = JSON.parse(extracted) as Partial<DJPersona>

    const persona: DJPersona = {
      name: 'KIMI',
      voiceTone: parsed.voiceTone || defaultPersona().voiceTone,
      knowsUser: parsed.knowsUser || defaultPersona().knowsUser,
      tasteProfile: {
        type: parsed.tasteProfile?.type || '多元',
        genres: parsed.tasteProfile?.genres || [],
        moodTendency: parsed.tasteProfile?.moodTendency || '平衡',
        signatureArtists: parsed.tasteProfile?.signatureArtists || [],
        sceneTags: parsed.tasteProfile?.sceneTags || [],
      },
      introStyle: parsed.introStyle || defaultPersona().introStyle,
      transitionStyle: parsed.transitionStyle || defaultPersona().transitionStyle,
      songIntroStyle: parsed.songIntroStyle || defaultPersona().songIntroStyle,
      generatedAt: new Date().toISOString(),
    }

    // 持久化
    fs.mkdirSync(path.dirname(PERSONA_FILE), { recursive: true })
    fs.writeFileSync(PERSONA_FILE, JSON.stringify(persona, null, 2), 'utf-8')
    cachedPersona = persona
    logger.info('DJ 人设已生成并持久化', {
      name: persona.name, type: persona.tasteProfile.type,
      artists: persona.tasteProfile.signatureArtists.slice(0, 3),
    })
    return persona
  } catch (err) {
    logger.error('DJ 人设生成失败，用默认人设', { ...toErrorMeta(err) })
    cachedPersona = defaultPersona()
    return cachedPersona
  }
}

/**
 * 把人设浓缩成可注入 prompt 的文本块。
 * 给 generateIntro / generateDJTransition / chat 用。
 */
export function personaPromptBlock(persona?: DJPersona): string {
  const p = persona || loadPersona()
  return `【你的 DJ 人设】
- 名字：${p.name}
- 说话风格：${p.voiceTone}
- 你对用户的认知：${p.knowsUser}
- 用户品味：${p.tasteProfile.type}（${p.tasteProfile.genres.join('、')}）情绪倾向：${p.tasteProfile.moodTendency}，代表歌手：${p.tasteProfile.signatureArtists.slice(0, 5).join('、')}
- 场景：${p.tasteProfile.sceneTags.join('、')}
- 开场习惯：${p.introStyle}
- 过渡习惯：${p.transitionStyle}
- 介绍单曲习惯：${p.songIntroStyle}

请始终以这个人设说话，让用户感觉"这个 DJ 真懂我"。`
}

/**
 * composeSystemPrompt 的可选上下文块。
 *
 * 注意：recommend（推荐策略）入口不纳入此统一——它是纯 JSON 任务，不用 persona。
 */
export interface PromptExtras {
  memoryBlock?: string
  tasteBlock?: string
  searchContext?: string
  songContext?: string
}

/**
 * 统一构造 AI DJ 的 system prompt（P3：避免 4 入口独立拼接导致漂移）。
 *
 * 只统一"可复用的 extras 拼接"（persona + 记忆 + 品味 + 搜索上下文 + 歌曲上下文），
 * 各入口的 intent 特定规则（开场白模板/过渡解说模板/聊天意图分类）仍各自写在 user prompt 里。
 */
export function composeSystemPrompt(extras: PromptExtras = {}): string {
  const sections: string[] = [personaPromptBlock()]
  if (extras.songContext) sections.push(extras.songContext)
  if (extras.searchContext) sections.push(extras.searchContext)
  if (extras.tasteBlock) sections.push(extras.tasteBlock)
  if (extras.memoryBlock) sections.push(extras.memoryBlock)
  return sections.join('\n\n')
}
