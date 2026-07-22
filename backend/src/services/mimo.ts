import { config } from '../config'
import { Song, SessionContext, DJTransition, AIChatMessage, AIService } from '../types'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { sanitizePromptInput, validatePromptOutput } from '../utils/promptGuard'
import { logger, toErrorMeta } from '../utils/logger'
import { extractJsonObject } from '../utils/extractJson'
import { AI_MAX_TOKENS } from '../constants'
import { personaPromptBlock, composeSystemPrompt } from './djPersona'

export class MimoService implements AIService {
  private apiKey: string
  public model: string
  private baseUrl: string

  constructor(model?: string) {
    this.apiKey = config.mimoApiKey
    this.model = model || config.mimoDefaultModel
    this.baseUrl = config.mimoBaseUrl
  }

  async chat(messages: AIChatMessage[], opts?: { timeoutMs?: number; maxTokens?: number }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('MIMO_API_KEY not configured')
    }

    const timeoutMs = opts?.timeoutMs ?? 30000
    const maxTokens = opts?.maxTokens ?? AI_MAX_TOKENS
    const startTime = Date.now()
    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages,
      }),
    }, timeoutMs)

    const duration = Date.now() - startTime

    if (!res.ok) {
      const err = await res.text()
      logger.error('MiMo API error', { status: res.status, duration: `${duration}ms`, model: this.model, error: err.slice(0, 200) })
      throw new Error(`Mimo API error: ${err}`)
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const rawContent = data.choices[0]?.message?.content || ''

    // Validate LLM output for control characters and injection payloads
    const { text: cleanedText, flagged } = validatePromptOutput(rawContent)
    if (flagged) {
      logger.warn('MiMo output flagged', { model: this.model, duration: `${duration}ms` })
    }

    logger.debug('MiMo API call', { model: this.model, duration: `${duration}ms`, outputLength: cleanedText.length })
    return cleanedText
  }

  async chatWithImage(text: string, imageBase64: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('MIMO_API_KEY not configured')
    }

    const startTime = Date.now()
    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: AI_MAX_TOKENS,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        }],
      }),
    })

    const duration = Date.now() - startTime

    if (!res.ok) {
      const err = await res.text()
      logger.error('MiMo vision API error', { status: res.status, duration: `${duration}ms`, model: this.model, error: err.slice(0, 200) })
      throw new Error(`Mimo API error: ${err}`)
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const rawContent = data.choices[0]?.message?.content || ''
    const { text: cleanedText, flagged } = validatePromptOutput(rawContent)
    if (flagged) {
      logger.warn('MiMo vision output flagged', { model: this.model, duration: `${duration}ms` })
    }

    logger.debug('MiMo vision API call', { model: this.model, duration: `${duration}ms` })
    return cleanedText
  }

  async generateRecommendationStrategy(
    userInput: string,
    context: SessionContext,
    _history: Song[]
  ): Promise<{
    mood: string
    genres: string[]
    energy: string
    reason: string
  }> {
    const prompt = `你是一个有品位的 AI DJ，叫 KIMI。

<用户输入>
${sanitizePromptInput(userInput)}
</用户输入>
当前时间：${context.time}
当前天气：${context.weather?.description || '未知'}

请输出推荐策略（JSON格式）：
{
  "mood": "心情标签",
  "genres": ["流派1", "流派2"],
  "energy": "high/medium/low",
  "reason": "推荐理由（50字以内）"
}`

    const response = await this.chat([{ role: 'user', content: prompt }])

    try {
      const jsonText = extractJsonObject(response)
      if (!jsonText) throw new Error('no JSON object found')
      const json = JSON.parse(jsonText)
      return {
        mood: typeof json.mood === 'string' ? json.mood : '随机',
        genres: Array.isArray(json.genres) ? json.genres : [],
        energy: ['high', 'medium', 'low'].includes(json.energy) ? json.energy : 'medium',
        reason: typeof json.reason === 'string' ? json.reason : response.slice(0, 50),
      }
    } catch (err) {
      logger.warn('recommendation strategy JSON parse failed, using neutral fallback', { ...toErrorMeta(err) })
      return { mood: '随机', genres: [], energy: 'medium', reason: response.slice(0, 50) }
    }
  }

  async generateDJTransition(
    prevSong: Song | null,
    nextSong: Song,
    _context: SessionContext,
    memoryBlock?: string,
  ): Promise<DJTransition> {
    const safeTags = nextSong.emotionTags.map(t => sanitizePromptInput(t)).join(', ')
    const system = composeSystemPrompt({ memoryBlock })
    const prompt = `现在要从 <前一首歌>${sanitizePromptInput(prevSong?.title || '开场')}</前一首歌> 过渡到 <下一首歌>${sanitizePromptInput(nextSong.title)}（${sanitizePromptInput(nextSong.artist)}）。

请按你的人设风格，写一段 60-120 字的过渡解说，包含三层：
1. 承接：用一两句承接上一首留下的情绪余韵
2. 故事：讲一点这首歌给你的感觉——旋律的色彩、歌手声线的特质、或它为什么动人（像在和朋友聊一张老唱片）。不要编造具体的发行年份或未经核实的事实。
3. 此刻：说明为什么此刻适合听它，把人轻轻送进下一段

参考风格（不要照抄，按你的语气重写）：
"This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Every line ends in a whisper — you'll feel yourself lift off the ground a little. This one's for the quiet hour."

【强制规则】情绪/氛围/场景类关键词必须用双星号 ** 包裹，例如：这首**温暖**的旋律，适合**深夜**独处。

歌曲信息：
- 歌名：${sanitizePromptInput(nextSong.title)}
- 歌手：${sanitizePromptInput(nextSong.artist)}
- 专辑：${sanitizePromptInput(nextSong.album || '未知')}
- 标签：${safeTags}

只输出过渡解说，不要其他内容、不要标题。`

    const text = await this.chat([
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ])
    return { text: text.trim() }
  }

  async generateIntro(mood: string, context: SessionContext): Promise<string> {
    const system = composeSystemPrompt()
    const prompt = `现在电台要开播了。用户想听"${sanitizePromptInput(mood)}"氛围的音乐。
当前时间：${context.time}，天气：${context.weather?.description || '未知'}。

请按你的人设风格写一段 60-120 字的开场白，包含：
1. 一句贴合此刻时间/天气的问候
2. 定调今晚的氛围，把人从白天的喧嚣里接过来
3. 预告第一首歌的方向，像一个轻轻的邀请

【强制规则】情绪/氛围/场景类关键词必须用双星号 ** 包裹，例如：**夜晚**带着**微凉**的晚风，陪你听**安静**的歌。

只输出开场白，不要其他内容。`

    return await this.chat([
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ])
  }

  async analyzePersonality(songs: Song[]): Promise<{
    type: string
    description: string
  }> {
    const prompt = `分析以下用户的音乐品味，给出人格类型和描述（50字以内）。

用户歌曲（共${songs.length}首，展示前50首）：
${songs.slice(0, 50).map(s => `${sanitizePromptInput(s.title)}(${sanitizePromptInput(s.artist)})[${s.emotionTags.join(',')}]`).join('; ')}

输出JSON：
{
  "type": "人格类型（如深夜怀旧型）",
  "description": "描述"
}`

    const response = await this.chat([{ role: 'user', content: prompt }])
    try {
      return JSON.parse(response.replace(/```json\n?|\n?```/g, ''))
    } catch {
      return { type: '音乐探索者', description: '你的音乐品味独特而多元' }
    }
  }
}

export const mimoService = new MimoService()
