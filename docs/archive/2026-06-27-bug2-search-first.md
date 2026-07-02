# Bug 2 方案 B 执行规格:点歌一致性架构修复(含精准点歌)

> **目标**:让"DJ 说的歌 = 实际播放的歌"。用户实测命中"DJ 说周杰伦的晴天但播了别的歌"——F5/F6 只治标(prompt 约束),本规格做架构修复(搜索前置)+ 精准点歌(关键词提取)。
> **生成时间**:2026-06-27(规划者)
> **方法**:把 chat 流程从"AI 先自由说→后搜索"改成"规则识别意图→先搜索→真实结果喂 AI→AI 基于真实歌曲说"
> **配套**:先读 `COLLABORATION.md` + 本规格的"设计决策"节(理解为什么这么改)

---

## 〇、设计决策(执行者必读,理解原理再动手)

### 问题本质
当前 `radio.ts:325` AI 先自由回复(可能说"为你找了周杰伦的晴天"),后端再 `:351` 用 AI 输出的标签搜索,`:352 find(s => s.playUrl)` 取第一个可播的——**第一个可播的可能不是晴天**。DJ 文本和实际播放是两条解耦的链路。

### 方案 B 核心思路:搜索前置
```
【现有】AI 自由说(可能编造) → 解析标签 → 搜索 → find(playUrl)  ← 两条链路解耦
【方案B】规则识别意图+提取关键词 → 先搜索(拿真实歌曲) → 真实歌曲喂AI → AI基于真实歌曲说 → newSong=搜索结果[0]
                                                                              ↑ 同源
```

### 三个关键决策(规划者已定,执行者照做)

**决策 1:意图识别用规则(正则),不依赖 AI 标签**
- 现有流程依赖 AI 输出 `[QQ音乐:xxx]` 标签才知道要搜索——这要求 AI 在说之前就决定搜索,但 AI 不知道曲库
- 方案 B 用规则识别"用户想点歌/推荐",搜索在 AI 之前发生
- **保留 AI 标签作为兜底**:规则识别不出的(如纯聊天),仍走 AI 自由回复

**决策 2:搜索结果作为 system context 喂给 AI**
- 拿到真实歌曲列表后,作为"曲库真实可播的歌曲"注入 AI 的 system prompt
- AI 基于"真实有 A/B/C 三首"来回复,不会编造
- 同时让 AI **选定一首作为主推**(它的回复会围绕这首),newSong 就取这首

**决策 3:精准点歌(关键词提取)合并做**
- 用户说"周杰伦的晴天" → 提取"歌手=周杰伦,歌名=晴天" → 精确匹配
- 而非整句搜索"周杰伦的晴天"(可能搜不到精确版本)
- 这和方案 B 同源(都改搜索逻辑),合并做避免改两次

### 延迟权衡(执行者要心里有数)
方案 B 把"搜索"从 AI 之后移到 AI 之前,**总耗时不变**(搜索 1-2s + AI 3-5s ≈ 5-7s,原来顺序相反也是 5-7s)。但用户感知变化:**原来先听到 DJ 说话再换歌,现在要等更久才听到 DJ**。这是可接受的(总时间一样),但 AI prompt 要让 DJ 第一句就提到歌名(给用户即时反馈"搜到了")。

---

## 一、任务拆解(3 步,顺序执行)

| 步骤 | 内容 | 文件 |
|------|------|------|
| **S1** | 新增意图识别 + 关键词提取工具函数 | 新建 `backend/src/utils/songIntent.ts` |
| **S2** | 重构 chat handler 为"搜索前置"流程 | 改 `backend/src/routes/radio.ts` |
| **S3** | 测试 + 验证 | 跑测试 + E2E |

---

## 二、S1:新建意图识别 + 关键词提取工具

**新建文件**:`backend/src/utils/songIntent.ts`

```ts
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

// 纯点歌/推荐意图的关键词（不含具体歌名时用整句搜索）
const POINT_SONG_KEYWORDS = /想听|来首|来点|播放|听下|换首|换歌|点首|下一首.*吧|给我.*歌/
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
      if (artist && title && artist.length >= 1 && title.length >= 1) {
        return {
          intent: 'point_song',
          keyword: `${title} ${artist}`,
          artist,
          title,
        }
      }
    }
  }

  // 2. 含"想听/来首/播放"等 → 点歌意图，关键词用整句（去停用词）
  if (POINT_SONG_KEYWORDS.test(text)) {
    // 去掉引导词，保留核心内容
    const keyword = text
      .replace(/^(想听|来首|来点|播放|听下|换首|换歌|点首|给我)/, '')
      .replace(/的(歌|音乐|曲子|旋律)$/, '')
      .trim() || text
    return { intent: 'point_song', keyword: keyword.slice(0, 30) }
  }

  // 3. 含"推荐/找/换个风格" → 推荐意图
  if (RECOMMEND_KEYWORDS.test(text)) {
    const keyword = text
      .replace(/^(推荐|来点|来些|找|想听点|换个)/, '')
      .replace(/(的歌|音乐|风格)$/, '')
      .trim() || text
    return { intent: 'recommend', keyword: keyword.slice(0, 30) }
  }

  // 4. 其他 → 纯聊天
  return { intent: 'chat', keyword: text.slice(0, 30) }
}
```

**配套测试**:`backend/src/utils/songIntent.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { extractIntent } from './songIntent'

describe('extractIntent', () => {
  it('精确匹配"歌手+歌名"', () => {
    const r = extractIntent('周杰伦的晴天')
    expect(r.intent).toBe('point_song')
    expect(r.artist).toBe('周杰伦')
    expect(r.title).toBe('晴天')
    expect(r.keyword).toBe('晴天 周杰伦')
  })

  it('"歌名-歌手"格式', () => {
    const r = extractIntent('晴天 - 周杰伦')
    expect(r.intent).toBe('point_song')
    expect(r.title).toBe('晴天')
    expect(r.artist).toBe('周杰伦')
  })

  it('点歌意图但无具体歌名', () => {
    const r = extractIntent('来首周杰伦')
    expect(r.intent).toBe('point_song')
    expect(r.keyword).toBe('周杰伦')
  })

  it('推荐意图', () => {
    const r = extractIntent('推荐点爵士')
    expect(r.intent).toBe('recommend')
    expect(r.keyword).toBe('爵士')
  })

  it('纯聊天', () => {
    const r = extractIntent('今天天气真好')
    expect(r.intent).toBe('chat')
  })
})
```

**验证**:`cd backend && npx vitest run src/utils/songIntent.test.ts`(5 个测试全过)

---

## 三、S2:重构 chat handler 为"搜索前置"流程

**改文件**:`backend/src/routes/radio.ts` 的 `/:id/chat` handler(第 247-440 行)

### 整体新流程(替换 :323-419 这段)

```ts
// ===== 方案B：搜索前置流程 =====
import { extractIntent } from '../utils/songIntent'  // 文件顶部加 import

// ...（session 校验、history 构建不变，到 :321 messages 构建之前）

// 1. 意图识别 + 关键词提取（在调 AI 之前）
const intent = extractIntent(text)  // 用原始 text（未 sanitize），规则匹配更准
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
    logger.error('Pre-search failed', { keyword: intent.keyword, error: String(err) })
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

// 4. 修改 systemPrompt：在末尾追加 searchContext（其他不变）
const systemPrompt = `${personaPromptBlock()}

你正在和用户聊天，同时担任电台 DJ 的角色。
${songContext}

【最重要规则 - 关键词高亮】...（保持原样）

${searchContext}

当前时间：${session.context.time}
当前天气：${session.context.weather?.description || '未知'}
【推荐数量规则】...（保持原样，F6 已加）`

const messages = [
  { role: 'system' as const, content: systemPrompt },
  ...history.slice(-AI_CHAT_HISTORY_LIMIT),
  { role: 'user' as const, content: wrappedInput },
]

// 5. 调 AI（现在 AI 知道真实歌曲了）
let reply = ''
try {
  reply = await ai.chat(messages)
} catch {
  reply = newSong ? `好呀，为你选了「${newSong.title}」，听听看。` : '收到，让我为你调整一下。'
}

// 6. 保存回复
session.messages.push({
  id: randomUUID(),
  sender: 'kimi',
  text: reply,
  timestamp: 0,
})

// 7. 兜底：如果规则识别为 chat 但用户其实想点歌（AI 输出了标签）
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
      logger.error('Fallback QQ search failed', { error: String(err) })
    }
  }
}
// （[换歌:] [推荐:] 标签的兜底解析可保留或删除，建议保留作为安全网）

// 8. 清理标签 + 构造响应（保持原逻辑）
const displayReply = reply.replace(/\[(QQ音乐|换歌|推荐):[^\]]+\]/g, '').trim()
session.messages[session.messages.length - 1].text = displayReply
setSession(session.id, session)

const response: ChatResponse = {
  reply: displayReply, action, action_data: actionData,
  messages: session.messages.slice(-AI_MESSAGES_RETURN_LIMIT), model: ai.model,
}
if (newSong) response.new_song = newSong
if (recommendations && recommendations.length > 0) response.recommendations = recommendations
res.json(response)
```

### 关键改动点对照

| 原流程 | 新流程 |
|--------|--------|
| `:325` AI 先自由说 | `extractIntent` 识别意图(规则) |
| `:344` 解析 AI 标签才知道搜索 | **意图识别后立即搜索**(搜索前置) |
| `:351` 搜索(在 AI 之后) | 搜索在 AI 之前,结果作为 context 喂 AI |
| `:352` `find(playUrl)` 取第一个 | 仍取第一个可播,但现在 AI 说的是这首 |
| 无关键词提取 | `extractIntent` 提取"歌手+歌名"精确匹配 |
| AI 不知曲库瞎编 | AI 基于真实 searchResults 回复 |

### 注意事项(执行者必看)

1. **保留旧标签解析作为兜底**(:7 那段)。规则识别可能漏(如用户说"放首歌吧"无具体内容),AI 标签兜底能接住。但主路径是规则+搜索前置。

2. **`extractIntent` 用原始 `text`**(未 sanitize)。因为 sanitize 会把 `<>` 转义,但点歌关键词不含这些,影响不大。用原始 text 规则匹配更准。

3. **newSong 取 `searchResults.find(s => s.playUrl) || searchResults[0]`**。兜底取第一个——即使没 playUrl(QQ 延迟获取场景),也返回,前端 useAudioPlayer 会延迟拿 URL。

4. **searchContext 注入位置**:在 systemPrompt 的"用户可能想"列表之后、"当前时间"之前。这样 AI 先看到人格+规则,再看到真实歌曲,最后看到上下文。

5. **AI 失败兜底**(:5 的 catch):如果 AI 调用失败,用 newSong 信息生成一句简单回复,而不是通用的"收到,让我调整"。保证点歌场景即使 AI 挂了,用户也能看到歌名。

6. **删除旧的兜底搜索**(:399-419 那段 `if (!recommendations && text && /推荐|来点.../)` )。它的工作被新的意图识别+搜索前置覆盖了。但**先注释不删**,测试通过后再删(保留回退能力)。

7. **响应结构不变**。前端 `useSession.ts` 消费 `data.new_song` / `data.recommendations` / `data.reply` 的逻辑不用改——只是这些字段现在基于真实搜索结果。

---

## 四、S3:测试 + 验证

### 单元测试
```bash
cd D:/Coder/mimo-radio/backend
# S1 的新工具测试
npx vitest run src/utils/songIntent.test.ts   # 5 个测试
# radio 路由测试（确认现有 chat 测试不破坏）
npx vitest run src/routes/radio.test.ts src/routes/radio.recommend.test.ts
# 全量
npx tsc --noEmit && npx vitest run   # ≥234 + 5
```

**注意**:`radio.test.ts` / `radio.recommend.test.ts` 可能有测试断言了旧的"AI标签→搜索"流程。如果测试因流程改变而失败:
- 先读测试看断言什么
- 如果断言的是"返回 newSong/recommendations"(结果),新流程也满足,更新 mock 即可
- 如果断言的是"AI 输出 [QQ音乐:]"(过程),这种测试要重写(新流程不依赖 AI 标签)
- **不要为了让旧测试过而改坏新流程**

### E2E 验证(核心,必须做)
```bash
# 后端改了 radio.ts → 重启
netstat -ano | grep ":8001" | grep LISTENING
taskkill //PID <PID> //F
cd D:/Coder/mimo-radio/backend && npx tsx src/index.ts

# 浏览器先 unlockAudio
# 场景 1：精确点歌
#   输入"周杰伦的晴天"
#   验证：① DJ 解说提到《晴天》② 实际播放《晴天》（h2 歌名一致）
# 场景 2：模糊点歌
#   输入"来首周杰伦"
#   验证：DJ 说一首周杰伦的歌 → 实际播放的就是那首
# 场景 3：推荐
#   输入"推荐点爵士"
#   验证：推荐卡片 ≥1 张，DJ 解说围绕这些歌
# 场景 4：纯聊天（不应触发搜索）
#   输入"今天好累"
#   验证：DJ 正常聊天回复，无 newSong，无推荐卡片
```

### 判定标准
- **场景 1**(核心):`h2` 显示的歌名 == DJ reply 文本里提到的歌名 → **歌名一致**
- **场景 4**:纯聊天不触发搜索(intent=chat,无 searchResults,无 newSong)
- tsc 零错误,测试全过(234+5)

---

## 五、执行检查清单

- [ ] S1: 新建 `songIntent.ts` + `songIntent.test.ts`,5 个测试过
- [ ] S2a: `radio.ts` 顶部 import extractIntent
- [ ] S2b: 在 messages 构建前加意图识别+搜索前置逻辑
- [ ] S2c: systemPrompt 注入 searchContext
- [ ] S2d: 保留 AI 标签解析作为兜底安全网
- [ ] S2e: 注释(暂不删)旧的兜底搜索 :399-419
- [ ] S2f: 确认响应结构不变(new_song/recommendations/reply)
- [ ] S3a: songIntent 测试过 + radio 测试不破坏(必要时更新 mock)
- [ ] S3b: tsc 零错误 + 全量 vitest ≥239
- [ ] S3c: 后端重启
- [ ] S3d: E2E 4 场景验证(精确点歌歌名一致是核心)

---

## 六、给执行者的提醒

1. **这是架构改动,不是小补丁**。改的是 chat 的核心流程。每一步改完先 tsc + 跑相关测试,不要全改完才测。

2. **保留旧标签解析作为安全网**(:7)。规则识别不可能 100% 准(用户表达千变万化),AI 标签兜底能接住规则漏掉的。但主路径必须是"搜索前置"。

3. **现有 radio 测试可能失败**。如果失败,先读测试断言的是"结果"还是"过程"。结果断言(返回了 newSong)新流程也满足,改 mock 即可;过程断言(AI 输出了标签)要重写。**不要为迁就旧测试而破坏新流程**。

4. **searchContext 是关键**。它让 AI 从"瞎编"变成"基于真实曲库说"。如果忘了注入这个,新流程退化回旧问题。改完务必确认 systemPrompt 里真有 searchContext。

5. **AI prompt 里加一句"不要编造未列出的歌名"**(searchContext 末尾那句)。双保险——既给真实数据,又禁止编造。

6. **延迟会变**(搜索移到前面)。如果测试发现总响应 >10s,检查是不是 searchPlayable 太慢(网易云/QQ 搜索超时),考虑给搜索加超时保护(`Promise.race` + 8s)。

---

*本规格是用户实测命中的核心缺陷的架构修复。修完后,"点歌"这个核心链路才真正可用:DJ 说的歌 = 实际播放的歌。执行者按 S1→S2→S3 顺序做,每步验证。*
