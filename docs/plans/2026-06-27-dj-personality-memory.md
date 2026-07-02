# DJ 人格连贯性执行规格：让 DJ 有记忆、有承接、有统一声音

> **目标**：把 DJ 从"每次换歌都重新自我介绍的断片主持人"升级为"有连续人格、记得刚才放了什么、会用承接方式过渡的真正 DJ"。
> **生成时间**：2026-06-27（规划者）
> **这是当前最大的体验缺口**：Bug 1/Bug 2 修好了骨架（主题不乱、点歌准），这一步注入灵魂（DJ 像同一个人在主持一整晚）。
> **配套**：先读 `COLLABORATION.md`（历史决策）+ `HANDOVER.md`（项目状态）+ `docs/claudio-rebuild-plan-v2.2.md` §3.2.1/§9.2（视频规格：DJ 人格）

---

## 〇、现状盘点（执行者必读，理解改造点）

### 现有 DJ 人格机制（已有基础，不是从零开始）
- `djPersona.ts`：持久化的 DJ 人设档案（voiceTone/knowsUser/tasteProfile/transitionStyle 等），`personaPromptBlock()` 把人设浓缩成 prompt 注入块
- `mimo.ts`：intro / transition / chat 三个入口**都已注入** `personaPromptBlock()`（人格是统一的，这点已做对）
- **人格层面已经一致**——三个入口用同一套 voiceTone/tasteProfile

### 真正的缺口：DJ 没有"会话记忆"
代码铁证：`mimo.ts:147` 的 `generateDJTransition(prevSong, nextSong, _context)`——**第三个参数 `_context` 带下划线，表示接收但不用**。

当前 transition 只知道"前一首"和"下一首"，**不知道**：
- 这已经是今晚第几首了（是第 2 首 还是第 8 首？语气应不同）
- 之前 DJ 说过什么（会重复"这首歌很适合深夜"如果上一首也说了）
- 当前时间/天气（intro 用了 `context.time/weather`，transition 没用——晚上 11 点和凌晨 2 点的串词语境不同）

**后果**：连听 5 首歌，DJ 每次的串词互相独立，像 5 个不同的人在说话，没有"一个主持人主持一整晚"的连贯感。这正是视频里 Claudio 和我们的最大差距。

### 记忆素材已经存在（不用新建数据结构）
`RadioSession`（`types/index.ts:33-42`）里已经有：
- `session.queue` + `session.currentIndex` → **今晚已播歌曲列表**（queue[currentIndex] 往前的都播过了）
- `session.messages`（sender='kimi' 且非 chat 回复的）→ **DJ 已说过的串词**
- `session.context.time` / `weather` → 当前时刻

**这些数据现成，只是没被 transition 用上**。本规格的工作是：把这些数据提取出来，注入 transition 的 prompt。

---

## 一、改造方案（3 步）

| 步骤 | 内容 | 文件 |
|------|------|------|
| **S1** | 提取"会话记忆"工具函数 | 新建 `backend/src/utils/djMemory.ts` |
| **S2** | 改造 transition prompt 注入记忆 | 改 `backend/src/services/mimo.ts` |
| **S3** | 测试 + 验证 | 跑测试 + E2E |

---

## 二、S1：新建会话记忆工具

**新建文件**：`backend/src/utils/djMemory.ts`

```ts
import type { Song, RadioSession } from '../types'

/**
 * DJ 会话记忆 —— 从当前 session 提取"今晚的上下文"。
 *
 * 用于 transition prompt：让 DJ 知道现在是第几首、之前放了什么、说过什么，
 * 从而生成有承接感、不重复的连贯串词。
 */

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
}

/**
 * 从 session 提取 DJ 记忆。
 * @param session 当前会话
 * @param currentSongIndex 当前正在播放的歌在 queue 里的位置（默认用 session.currentIndex）
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
  // chat 回复特征：含 [QQ音乐:] 等标签，或非常短（<20字的可能也是闲聊）
  // transition 串词特征：较长（80-150字），不含标签
  const kimiMessages = session.messages
    .filter(m => m.sender === 'kimi')
    .map(m => m.text)
    .filter(text => text.length > 30 && !text.includes('[')) // 排除短闲聊和带标签的
    .slice(-3) // 最近 3 段
    .reverse() // 最近的在前

  return {
    playedCount: session.currentIndex + 1,
    recentPlayed,
    recentDJSpoken: kimiMessages,
    timeOfDay: getTimeOfDay(session.context.time),
    weatherDesc: session.context.weather?.description || '未知',
  }
}

/** 从 "22:30" 这样的时间字符串提取时段描述 */
function getTimeOfDay(timeStr: string): string {
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

  parts.push(`请基于以上记忆，让这次的过渡和之前的有承接感，不要重复之前用过的句式或意象。`)

  return parts.join('\n')
}
```

**配套测试**：`backend/src/utils/djMemory.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { extractDJMemory, djMemoryPromptBlock, getTimeOfDay } from './djMemory'
import type { RadioSession } from '../types'

// 构造测试用 session
function makeSession(overrides: Partial<RadioSession> = {}): RadioSession {
  return {
    id: 'test',
    queue: [
      { id: '1', title: '歌A', artist: '歌手A', emotionTags: [], sceneTags: [] },
      { id: '2', title: '歌B', artist: '歌手B', emotionTags: [], sceneTags: [] },
      { id: '3', title: '歌C', artist: '歌手C', emotionTags: [], sceneTags: [] },
    ],
    currentIndex: 2,
    djEnabled: true,
    context: { time: '23:30', weather: { city: '北京', temp: 22, condition: '晴', description: '晴 22℃' } },
    messages: [
      { id: 'm1', sender: 'kimi', text: '这是一段很长的开场白，超过三十个字的开场白，用于测试记忆提取功能是否正常工作。', timestamp: 0 },
      { id: 'm2', sender: 'kimi', text: '短', timestamp: 0 }, // 应被过滤（<30字）
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RadioSession
}

describe('extractDJMemory', () => {
  it('提取已播歌曲数', () => {
    const m = extractDJMemory(makeSession())
    expect(m.playedCount).toBe(3) // currentIndex=2 → +1 = 3
  })

  it('提取最近已播歌曲（不含当前）', () => {
    const m = extractDJMemory(makeSession())
    expect(m.recentPlayed.length).toBe(2) // 歌A 歌B（歌C是当前，不含）
    expect(m.recentPlayed[0].title).toBe('歌B') // 最近的在前
  })

  it('过滤短消息和带标签消息', () => {
    const m = extractDJMemory(makeSession())
    expect(m.recentDJSpoken.length).toBe(1) // 只有开场白那段，"短"被过滤
  })

  it('提取时段', () => {
    expect(getTimeOfDay('23:30')).toBe('深夜')
    expect(getTimeOfDay('08:00')).toBe('清晨')
    expect(getTimeOfDay('14:00')).toBe('下午')
  })
})

describe('djMemoryPromptBlock', () => {
  it('包含时段和已播数', () => {
    const m = extractDJMemory(makeSession())
    const block = djMemoryPromptBlock(m)
    expect(block).toContain('深夜')
    expect(block).toContain('已播 3 首')
  })

  it('包含已播歌名', () => {
    const m = extractDJMemory(makeSession())
    expect(djMemoryPromptBlock(m)).toContain('歌B')
  })
})
```

**验证**：`cd backend && npx vitest run src/utils/djMemory.test.ts`（6 个测试全过）

---

## 三、S2：改造 transition prompt 注入记忆

**改文件**：`backend/src/services/mimo.ts` 的 `generateDJTransition`

### S2a：启用 `_context` 参数，扩展签名

**第 147 行**——把 `_context` 改成 `context`，并新增 `memory` 参数：

```ts
// 改前
async generateDJTransition(prevSong: Song | null, nextSong: Song, _context: SessionContext): Promise<DJTransition> {

// 改后
async generateDJTransition(
  prevSong: Song | null,
  nextSong: Song,
  _context: SessionContext,  // 保留（签名由接口定义，不破坏 AIService 契约）
  memoryBlock?: string,      // 新增：DJ 记忆 prompt 块（来自 djMemoryPromptBlock）
): Promise<DJTransition> {
```

**注意**：`AIService` 接口（`types/index.ts`）定义了 `generateDJTransition` 的签名。**不要改接口签名**（会破坏 aiFactory 和测试）。用可选参数 `memoryBlock?` 扩展，接口里不加这个参数（实现层多一个可选参数不违反接口）。

### S2b：注入 memoryBlock 到 prompt

**第 150-168 行**的 prompt，在 personaBlock 之后、歌曲信息之前，注入 memoryBlock：

```ts
// 改前（第 149 行）
const personaBlock = personaPromptBlock()
const prompt = `现在要从...`

// 改后
const personaBlock = personaPromptBlock()
const memorySection = memoryBlock || ''  // 可能为空（首次换歌时无历史）
const prompt = `现在要从 <前一首歌>${sanitizePromptInput(prevSong?.title || '开场')}</前一首歌> 过渡到 <下一首歌>${sanitizePromptInput(nextSong.title)}（${sanitizePromptInput(nextSong.artist)}）。

请按你的人设风格，写一段 80-150 字的过渡解说，包含三层：
1. 承接：用一两句承接上一首留下的情绪余韵
2. 故事：讲一点这首歌给你的感觉——旋律的色彩、歌手声线的特质、或它为什么动人（像在和朋友聊一张老唱片）。不要编造具体的发行年份或未经核实的事实。
3. 此刻：说明为什么此刻适合听它，把人轻轻送进下一段

${memorySection}

参考风格（不要照抄，按你的语气重写）：
"This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Every line ends in a whisper — you'll feel yourself lift off the ground a little. This one's for the quiet hour."

【强制规则】情绪/氛围/场景类关键词必须用双星号 ** 包裹，例如：这首**温暖**的旋律，适合**深夜**独处。

歌曲信息：
- 歌名：${sanitizePromptInput(nextSong.title)}
- 歌手：${sanitizePromptInput(nextSong.artist)}
- 专辑：${sanitizePromptInput(nextSong.album || '未知')}
- 标签：${safeTags}

只输出过渡解说，不要其他内容、不要标题。`
```

**关键**：`memorySection` 放在"三层结构"之后、"参考风格"之前。这样 AI 先理解任务结构，再看到记忆约束，最后看参考风格。记忆约束是"不要重复"的提示，放在任务描述之后最有效。

### S2c：调用方（radio.ts）传入 memoryBlock

**改文件**：`backend/src/routes/radio.ts` 的 nextSong handler（第 216 行附近）

```ts
// 改前（第 216-217 行）
transition = await ai.generateDJTransition(prev, next, session.context)

// 改后
import { extractDJMemory, djMemoryPromptBlock } from '../utils/djMemory'  // 文件顶部加 import
// ...
const memory = extractDJMemory(session)
const memoryBlock = djMemoryPromptBlock(memory)
transition = await ai.generateDJTransition(prev, next, session.context, memoryBlock)
```

### S2d（可选但推荐）：intro 也注入时段记忆

intro（`mimo.ts:177`）已经用了 `context.time/weather`，但没有"已播历史"（因为是开场，本来就没有）。**intro 不需要改**——它本来就是"第一句话"，没有前文要承接。

但可以在 intro prompt 里加一句"这是今晚的第一首歌，用全新的语气开场"，强化"开始感"。可选，不强求。

---

## 四、S3：测试 + 验证

### 单元测试
```bash
cd D:/Coder/mimo-radio/backend
# S1 新工具测试
npx vitest run src/utils/djMemory.test.ts   # 6 个测试
# mimo 服务测试（确认 transition 改动不破坏现有测试）
npx vitest run src/services/mimo.test.ts
# 全量
npx tsc --noEmit && npx vitest run   # ≥242 + 6 = ≥248
```

**注意 `mimo.test.ts`**：可能有测试 mock 了 `generateDJTransition`。如果测试断言了 prompt 内容（如"包含前一首歌名"），新加的 memorySection 不影响这些断言（memorySection 是追加的）。但如果测试 mock 的函数签名严格匹配，新增可选参数可能需要更新 mock——**读测试看断言什么，必要时更新 mock，不要为了让旧测试过而破坏新功能**。

### E2E 验证（核心）
```bash
# 后端改了 mimo.ts/radio.ts → 重启
netstat -ano | grep ":8001" | grep LISTENING
taskkill //PID <PID> //F
cd D:/Coder/mimo-radio/backend && npx tsx src/index.ts

# 浏览器先 unlockAudio
# 场景：连听 5 首，验证 DJ 记忆
#   1. 创建会话 → 听开场白 + 第 1 首
#   2. 换到第 2 首 → 听 transition（应提到"承接"第 1 首的余韵）
#   3. 换到第 3 首 → 听 transition（应和第 2 首的 transition 有不同表达）
#   4. 换到第 5 首 → 听 transition（应体现"已播 5 首"的时间感，而非像第 1 次说话）
#
# 判定标准（核心）：
#   - 第 2-5 首的 transition 互相不重复（不出现相同的意象/句式）
#   - transition 体现"承接"（提到上一首或今晚的氛围）
#   - 深夜时段的 transition 有"深夜"语境（不是通用的白天话）
```

### 判定标准（什么算"通过"）
- tsc 零错误，测试全过（≥248）
- **连听 5 首，DJ 串词不重复**（grep 5 段串词，无超过 20 字的重复片段）
- transition 体现承接感（提到上一首歌名或情绪）
- 深夜时段 transition 有"深夜"语境

---

## 五、执行检查清单

- [ ] S1a：新建 `djMemory.ts`（extractDJMemory + djMemoryPromptBlock + getTimeOfDay）
- [ ] S1b：新建 `djMemory.test.ts`（6 个测试）
- [ ] S1c：djMemory 测试全过
- [ ] S2a：mimo.ts generateDJTransition 启用 memoryBlock 可选参数
- [ ] S2b：transition prompt 注入 memorySection（位置：三层结构后、参考风格前）
- [ ] S2c：radio.ts nextSong 调用时传入 memoryBlock
- [ ] S2d（可选）：intro 加"第一首歌"强化开场感
- [ ] S3a：mimo.test.ts 不破坏（必要时更新 mock）
- [ ] S3b：tsc 零错误 + 全量 vitest ≥248
- [ ] S3c：后端重启
- [ ] S3d：E2E 连听 5 首，串词不重复 + 有承接感

---

## 六、给执行者的提醒

1. **不要改 AIService 接口签名**（`types/index.ts` 的 `generateDJTransition`）。用可选参数 `memoryBlock?` 扩展实现，接口不动。改接口会破坏 aiFactory 和所有 mock。

2. **memorySection 放对位置**——三层任务描述之后、参考风格之前。放太前 AI 会忽略任务结构，放太后 AI 会先抄参考风格。记忆约束是"不要重复"的提示，紧跟任务描述最有效。

3. **recentDJSpoken 的过滤逻辑**（`text.length > 30 && !text.includes('[')`）是启发式——排除短闲聊和带标签的 chat 回复。如果发现 transition 串词被误过滤（比如串词正好含 `[`），调整过滤条件。**过滤目的是把"DJ 串词"和"chat 闲聊"分开**，因为 chat 回复不是"电台解说"。

4. **getTimeOfDay 的时段划分**是经验值。如果用户反馈"凌晨 1 点 DJ 说'深夜'不对"，调整边界。当前：5-9 清晨、9-12 上午、12-14 午后、14-18 下午、18-22 夜晚、其他深夜。

5. **首次换歌时 memoryBlock 接近空**（只有 1 首已播，无历史串词）。这是对的——第一首 transition 就是"从开场过渡到第一首歌"，没有前文串词要避免重复。djMemoryPromptBlock 要优雅处理空记忆（只输出时段+已播数，不输出空的历史列表）。

6. **这是 prompt 工程，不是架构改动**。核心改动是"把已有数据（session.queue/messages/context）提取出来注入 prompt"。不新建数据结构，不改 session 持久化，不改前端。风险低，但要测透（连听 5 首验证不重复）。

---

## 七、为什么这是当前最该做的事

视频里的 Claudio 之所以让人觉得"这不是个工具，是个朋友"，核心在于**它的 DJ 有连续人格**——他知道现在是深夜、记得刚才放了什么、会用"承接"的方式过渡，像一个真正在主持深夜电台的人。

我们修好了骨架（Bug 1 主题、Bug 2 点歌准），但 DJ 还是"断片式"的。这一步注入记忆后，连听 5 首歌，用户会感觉"同一个 DJ 在陪我度过这个夜晚"——这才是 Claudio 的灵魂。

修完后，产品从"功能可用的 AI 电台"升级为"有人格的 AI DJ 电台"。

---

*本规格是体验演进的核心一步。执行者按 S1→S2→S3 做，重点是 S3d 的 E2E 验证——连听 5 首串词不重复、有承接感，才算真正完成。*
