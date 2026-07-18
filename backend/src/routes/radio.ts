import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Song, ChatMessage } from '../types'
import { createSession, getSongPool, loadMockSongs, loadNeteaseSongs } from '../services/engine'
import { getAIService, listAvailableModels } from '../services/aiFactory'
import { weatherService } from '../services/weather'
import { getCurrentPlaylist } from '../services/scheduler'
import { getMusicSource } from '../services/musicSource'
import { composeSystemPrompt } from '../services/djPersona'
import { validateBody } from '../middleware/validate'
import { sessionAuth } from '../middleware/sessionAuth'
import { aiLimiter } from '../middleware/aiLimiter'
import { signSession } from '../utils/sessionToken'
import { sanitizePromptInput } from '../utils/promptGuard'
import { extractDJMemory, djMemoryPromptBlock } from '../utils/djMemory'
import { extractIntent } from '../utils/songIntent'
import { logger, toErrorMeta } from '../utils/logger'
import { tasteCache } from '../utils/tasteCache'
import { setSession, getSession, saveFeedback } from '../db'
import { AI_CHAT_HISTORY_LIMIT, AI_MESSAGES_RETURN_LIMIT } from '../constants'

const router = Router()

// P6 修复：feedback 独立限流（不共享全局配额，避免快速收藏触发 429）
const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 30,              // 每分钟 30 次（debounce 后足够）
  standardHeaders: true,
  legacyHeaders: false,
})

// Lazy-load mock songs on first request
let songsLoaded = false
function ensureSongsLoaded() {
  if (!songsLoaded) {
    loadMockSongs()
    songsLoaded = true
  }
}

/**
 * 根据 mood 提取搜索关键词（网易云搜索需要明确关键词）
 */
function moodToKeywords(mood?: string): string[] {
  if (!mood) {
    // 默认：兼顾多元品味
    return ['华语流行', 'YOASOBI', '钢琴纯音乐', '深夜']
  }
  const kw = mood.trim()
  // 简单中文关键词直接用，外加两个补充
  return [kw, '流行', '轻音乐']
}

const createSchema = z.object({
  mood: z.string().max(100).optional(),
  dj_enabled: z.boolean().optional(),
  user_input: z.string().max(500).optional(),
  model: z.string().max(50).optional(),
})


const nextBodySchema = z.object({
  model: z.string().max(50).optional(),
})

const chatSchema = z.object({
  text: z.string().min(1).max(2000),
  model: z.string().max(50).optional(),
})

const feedbackSchema = z.object({
  action: z.enum(['skip', 'like', 'unlike', 'complete']),
})

// Chat response can include a new song to play
interface RecommendItem {
  title: string
  artist: string
  qqMusicMid?: string
  neteaseId?: string
  coverUrl?: string
  selected?: boolean
}

interface ChatResponse {
  reply: string
  action: string | null
  action_data: string | null
  messages: ChatMessage[]
  model: string
  new_song?: Song
  recommendations?: RecommendItem[]
}

// GET /api/radio/models
router.get('/models', (_req, res) => {
  res.json({ models: listAvailableModels() })
})

// POST /api/radio/create
router.post('/create', aiLimiter, validateBody(createSchema), async (req, res, next) => {
  try {
    ensureSongsLoaded()
    const { mood, dj_enabled, user_input, model } = req.body

    // 基于用户 mood 用网易云真实搜索构建可播放曲库（替代 MOCK）
    try {
      const keywords = moodToKeywords(user_input || mood)
      await loadNeteaseSongs(keywords)
      songsLoaded = true
    } catch (err) {
      logger.error('网易云曲库加载失败，继续用现有曲库', { ...toErrorMeta(err) })
    }

    const ai = getAIService(model)

    // 天气上下文（失败不阻断电台创建）
    let weather: Awaited<ReturnType<typeof weatherService.getCurrent>> | undefined
    try {
      weather = await weatherService.getCurrent()
    } catch {
      weather = undefined
    }
    const now = new Date()
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`

    // If no mood provided, use current time slot
    let effectiveMood = mood
    let contextMood = mood
    if (!effectiveMood) {
      const current = getCurrentPlaylist()
      if (current) {
        effectiveMood = current.slot.label
        contextMood = current.slot.tags.join('、')
      }
    }

    const context = {
      weather,
      time: timeStr,
      userInput: user_input || effectiveMood,
      mood: contextMood || effectiveMood,
    }

    // Create session
    const session = createSession(effectiveMood, dj_enabled !== false, undefined, context)

    // Generate intro if DJ enabled
    if (session.djEnabled) {
      try {
        const intro = await ai.generateIntro(effectiveMood || '随机', context)
        session.messages.push({
          id: randomUUID(),
          sender: 'kimi',
          text: intro,
          timestamp: 0,
        })
      } catch {
        session.messages.push({
          id: randomUUID(),
          sender: 'kimi',
          text: effectiveMood ? `你好，我为你准备了一些${effectiveMood}氛围的音乐。` : '你好，欢迎收听 MiMo 电台。',
          timestamp: 0,
        })
      }
    }

    setSession(session.id, session)

    res.json({
      session_id: session.id,
      session_token: signSession(session.id),
      queue: session.queue,
      current_song: session.queue[0] || null,
      intro_script: session.messages[0]?.text || null,
      model: ai.model,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/radio/:id/next
router.post('/:id/next', aiLimiter, sessionAuth, validateBody(nextBodySchema), async (req, res, next) => {
  try {
    const { model } = req.body
    const ai = getAIService(model)

    const sessionId = req.sessionId!
    const session = getSession(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session not found', code: 'SESSION_NOT_FOUND' },
      })
    }

    // Bounds check before incrementing
    if (session.currentIndex >= session.queue.length - 1) {
      return res.json({
        song: null,
        transition: null,
        has_more: false,
        model: ai.model,
      })
    }

    session.currentIndex += 1

    // Generate DJ transition
    const prev = session.queue[session.currentIndex - 1] || null
    const next = session.queue[session.currentIndex]
    let transition = null

    if (next && session.djEnabled) {
      try {
        const memory = extractDJMemory(session)
        let memoryBlock = djMemoryPromptBlock(memory)

        // 注入长期品味（用户历史收藏的歌手）—— 走 30s 缓存避免每请求查 DB
        const likedArtistsForTransition = await tasteCache.getLikedArtists(3)
        const dislikedArtistsForTransition = await tasteCache.getDislikedArtists(3)
        const tasteBlockForTransition = likedArtistsForTransition.length > 0
          ? `\n【用户的长期品味（来自历史收藏）】
用户喜欢过的歌手：${likedArtistsForTransition.map(a => `${a.artist}(${a.count}次)`).join('、')}
${dislikedArtistsForTransition.length > 0 ? `用户跳过的歌手：${dislikedArtistsForTransition.map(a => a.artist).join('、')}（这些可能不是他的菜）` : ''}
如果下一首歌里有用户喜欢的歌手，可以自然地提一句"我记得你喜欢XXX的"。`
          : ''
        if (tasteBlockForTransition) {
          memoryBlock += tasteBlockForTransition
        }

        transition = await ai.generateDJTransition(prev, next, session.context, memoryBlock)
        session.messages.push({
          id: randomUUID(),
          sender: 'kimi',
          text: transition.text,
          timestamp: 0,
        })
      } catch {
        session.messages.push({
          id: randomUUID(),
          sender: 'kimi',
          text: `接下来是 ${next.artist} 的《${next.title}》。`,
          timestamp: 0,
        })
      }
    }

    setSession(session.id, session)

    res.json({
      song: next || null,
      transition: transition?.text || null,
      has_more: session.currentIndex < session.queue.length - 1,
      model: ai.model,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/radio/:id/chat
router.post('/:id/chat', aiLimiter, sessionAuth, validateBody(chatSchema), async (req, res, next) => {
  try {
    const { text, model } = req.body
    const ai = getAIService(model)

    const sessionId = req.sessionId!
    const session = getSession(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session not found', code: 'SESSION_NOT_FOUND' },
      })
    }

    // Sanitize user input before storage and prompt embedding
    const sanitizedText = sanitizePromptInput(text)

    // Save user message
    session.messages.push({
      id: randomUUID(),
      sender: 'user',
      text: sanitizedText,
      timestamp: 0,
    })

    // Build conversation history for AI
    const history: { role: 'user' | 'assistant'; content: string }[] = session.messages.map(m => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }))

	    // Current song context
	    const currentSong = session.queue[session.currentIndex]
	    const songContext = currentSong
	      ? `当前正在播放：${currentSong.title} - ${currentSong.artist}（${currentSong.album || '未知专辑'}），标签：${currentSong.emotionTags.join('、')}`
	      : '当前没有播放歌曲'

	    // ===== 方案B：搜索前置流程 =====
	    // 1. 意图识别 + 关键词提取（在调 AI 之前）
	    const intent = extractIntent(text)
	    let searchResults: Song[] = []
	    let newSong: Song | undefined = undefined
	    let recommendations: RecommendItem[] | undefined = undefined
	    let action: string | null = null
	    let actionData: string | null = null

	    // 2. 如果是点歌/推荐意图，先搜索真实歌曲
	    if (intent.intent === 'point_song' || intent.intent === 'recommend') {
	      try {
	        searchResults = await getMusicSource().searchPlayable(intent.keyword, 5)
	        action = intent.intent === 'point_song' ? 'play_qqmusic' : 'recommend'
	        actionData = intent.keyword
	      } catch (err) {
	        logger.error('Pre-search failed', { keyword: intent.keyword, ...toErrorMeta(err) })
	      }

	      // 取第一个可播的作为 newSong（点歌场景）
	      const playable = searchResults.find((s) => s.playUrl) || searchResults[0]
	      if (playable) {
	        newSong = playable
	        // 插入队列当前歌之后
	        session.queue.splice(session.currentIndex + 1, 0, playable)
	      }

	      // 推荐卡片
	      if (searchResults.length > 0) {
	        recommendations = searchResults.slice(0, 5).map((s, i) => ({
	          title: s.title,
	          artist: s.artist,
	          neteaseId: s.neteaseId,
	          qqMusicMid: s.qqMusicMid,
	          coverUrl: s.coverUrl,
	          selected: i === 0 && !!s.playUrl,
	        }))
	      }
	    }

	    // 3. 构造 AI messages：如果有真实搜索结果，作为 context 注入 system prompt
	    const searchContext = searchResults.length > 0
	      ? `\n\n【曲库真实可播的歌曲（仅供你参考，不要编造未列出的歌名）】\n${
	          searchResults.slice(0, 5).map((s, i) => `${i + 1}. ${s.title} - ${s.artist}`).join('\n')
	        }\n${intent.intent === 'point_song' && newSong ? `我已选定第 1 首「${newSong.title} - ${newSong.artist}」作为主推，请围绕它说。` : ''}`
	      : ''

		    // 4. 提取短期记忆（chat 也能知道今晚放过什么）
		    const chatMemory = extractDJMemory(session)
		    const chatMemoryBlock = djMemoryPromptBlock(chatMemory)

		    // B3：提取长期品味（用户历史收藏的歌手）—— 走 30s 缓存避免每请求查 DB
			    const likedArtistsForTaste = await tasteCache.getLikedArtists(5)
			    const dislikedArtistsForTaste = await tasteCache.getDislikedArtists(3)
		    const tasteMemoryBlock = likedArtistsForTaste.length > 0
		      ? `\n【用户的长期品味（来自历史收藏）】
		用户喜欢过的歌手：${likedArtistsForTaste.map(a => `${a.artist}(${a.count}次)`).join('、')}
		${dislikedArtistsForTaste.length > 0 ? `用户跳过的歌手：${dislikedArtistsForTaste.map(a => a.artist).join('、')}（这些可能不是他的菜）` : ''}
		如果你推荐的歌曲里有用户喜欢的歌手，可以自然地提一句"我记得你喜欢XXX的"。`
		      : ''

		    // 5. 构建 systemPrompt（persona+extras 走 composeSystemPrompt，chat 规则手写）
		    const systemPrompt = `${composeSystemPrompt({
		      songContext,
		      searchContext,
		      tasteBlock: tasteMemoryBlock,
		      memoryBlock: chatMemoryBlock,
		    })}

你正在和用户聊天，同时担任电台 DJ 的角色。

【最重要规则 - 关键词高亮】你的每一句回复，都必须把情绪、氛围、场景类的关键词用双星号 ** 包裹。
示例：
- 好呀，**深夜**的**爵士**最有氛围了，让思绪慢慢**沉淀**。
- 这首**温暖**的歌，陪你度过**宁静**的夜晚。
- 当**疲惫**的时候，听点**治愈**的旋律吧。
每句必须有 1-3 个 ** 标记的关键词，这是强制要求。

用户可能想：
1. 聊天（问候、分享心情）
2. 点歌/换歌（"换一首"、"我想听周杰伦"）
3. 询问当前歌曲信息
4. 让你推荐音乐

请用温暖自然的语气回复，60-120字。

如果是点歌/换歌请求，你有两种方式：
- 从本地曲库换歌：回复中注明[换歌:风格描述]
- 从QQ音乐搜索具体歌曲：回复中注明[QQ音乐:歌曲名或歌手名]

如果是推荐请求，回复中注明[推荐:风格描述]。

当前时间：${session.context.time}
当前天气：${session.context.weather?.description || '未知'}
【推荐数量规则】不要在回复中声明具体的推荐数量（如"5首""三首"）。如果需要提及，用模糊表达如"挑了几首""找了些歌"代替具体数字，因为实际可播数量取决于曲库。`

	    // Wrap user input in isolated delimiters to prevent prompt injection
	    const wrappedInput = sanitizePromptInput(text)

	    const messages = [
	      { role: 'system' as const, content: systemPrompt },
	      ...history.slice(-AI_CHAT_HISTORY_LIMIT), // Keep last N messages for context
	      { role: 'user' as const, content: wrappedInput },
	    ]

	    // 5. 调 AI（现在 AI 知道真实歌曲了）
	    let reply = ''
	    try {
	      reply = await ai.chat(messages)
	    } catch {
	      reply = newSong ? `好呀，为你选了「${newSong.title}」，听听看。` : '收到，让我为你调整一下。'
	    }

	    // Save AI reply
	    session.messages.push({
	      id: randomUUID(),
	      sender: 'kimi',
	      text: reply,
	      timestamp: 0,
	    })

	    // 6. 兜底：如果规则识别为 chat 但用户其实想点歌（AI 输出了标签）
	    //    保留旧的标签解析作为安全网
	    if (!newSong && reply.includes('[QQ音乐:')) {
	      const match = reply.match(/\[QQ音乐:([^\]]+)\]/)
	      if (match) {
	        try {
	          const songs = await getMusicSource().searchPlayable(match[1], 5)
	          const playable = songs.find((s) => s.playUrl)
	          if (playable) {
	            newSong = playable
	            session.queue.splice(session.currentIndex + 1, 0, playable)
	          }
	          recommendations = songs.slice(0, 5).map((s, i) => ({
	            title: s.title, artist: s.artist, neteaseId: s.neteaseId,
	            qqMusicMid: s.qqMusicMid, coverUrl: s.coverUrl, selected: i === 0 && !!s.playUrl,
	          }))
	          action = 'play_qqmusic'
	          actionData = match[1]
	        } catch (err) {
	          logger.error('Fallback QQ search failed', { ...toErrorMeta(err) })
	        }
	      }
	    }
	    if (!newSong && !recommendations && reply.includes('[推荐:')) {
	      const match = reply.match(/\[推荐:([^\]]+)\]/)
	      if (match) {
	        try {
	          const songs = await getMusicSource().searchPlayable(match[1], 5)
	          recommendations = songs.slice(0, 5).map((s, i) => ({
	            title: s.title, artist: s.artist, neteaseId: s.neteaseId,
	            qqMusicMid: s.qqMusicMid, coverUrl: s.coverUrl, selected: i === 0,
	          }))
	          action = 'recommend'
	          actionData = match[1]
	        } catch (err) {
	          logger.error('Fallback recommend search failed', { ...toErrorMeta(err) })
	        }
	      }
	    }
	    if (!newSong && !recommendations && reply.includes('[换歌:')) {
	      const match = reply.match(/\[换歌:([^\]]+)\]/)
	      if (match) {
	        action = 'change_songs'
	        actionData = match[1]
	      }
	    }

	    // 旧的兜底搜索（已被新意图识别覆盖，保留注释作为参考）
	    // if (!recommendations && text && /推荐|来点|来首|找|想听|换.*首/.test(text)) { ... }

    // Clean up tags from displayed text
    const displayReply = reply.replace(/\[(QQ音乐|换歌|推荐):[^\]]+\]/g, '').trim()
    session.messages[session.messages.length - 1].text = displayReply

    setSession(session.id, session)

    const response: ChatResponse = {
      reply: displayReply,
      action,
      action_data: actionData,
      messages: session.messages.slice(-AI_MESSAGES_RETURN_LIMIT),
      model: ai.model,
    }
    if (newSong) {
      response.new_song = newSong
    }
    if (recommendations && recommendations.length > 0) {
      response.recommendations = recommendations
    }

    res.json(response)
  } catch (err) {
    next(err)
  }
})

// POST /api/radio/:id/feedback
router.post('/:id/feedback', feedbackLimiter, sessionAuth, validateBody(feedbackSchema), (req, res) => {
  const sessionId = req.sessionId!
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found', code: 'SESSION_NOT_FOUND' },
    })
  }

  const { action } = req.body
  const currentSong = session.queue[session.currentIndex]

  // 持久化反馈到 feedback 表，形成品味闭环（供 profile/personality 分析）
  if (currentSong) {
    saveFeedback({
      sessionId,
      songId: currentSong.id,
      songTitle: currentSong.title,
      songArtist: currentSong.artist,
      action,
    })
    // 写入新反馈后立即清 taste cache，保证下一次 chat 拿到新品味（P2.1）
    tasteCache.invalidate()
  }
  logger.info(`Feedback: ${action} on "${currentSong?.title}"`)

  res.json({ ok: true, action, song: currentSong?.title })
})

// GET /api/radio/:id/queue
router.get('/:id/queue', sessionAuth, (req, res) => {
  const sessionId = req.sessionId!
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found', code: 'SESSION_NOT_FOUND' },
    })
  }

  res.json({
    queue: session.queue.slice(session.currentIndex),
    current_index: session.currentIndex,
  })
})

// GET /api/radio/songs
router.get('/songs', (_req, res) => {
  res.json(getSongPool())
})

export default router
