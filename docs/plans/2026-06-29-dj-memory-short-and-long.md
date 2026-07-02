# DJ 记忆扩展执行规格：短期（chat 记忆）+ 长期（品味记忆）

> **目标**：把 DJ 记忆从"只 transition 有"扩展到全入口（短期）+ 让 DJ 真正记住用户的长期品味（长期）。
> **生成时间**：2026-06-29（规划者）
> **前置**：已完成的 djMemory.ts（transition 记忆注入）。本规格在此基础上扩展。
> **配套**：先读 `COLLABORATION.md` + `HANDOVER.md` + `docs/plans/2026-06-27-dj-personality-memory.md`（上一个规格，理解 djMemory 现状）

---

## ⚠️ 给 DSpro 的前科提醒（开工前必读，这是你上次的错误）

**DSpro，这是你上一次任务（DJ 人格连贯性）犯的错。这次别再犯。**

### 你上次做错了什么

上一个规格（`2026-06-27-dj-personality-memory.md`）第六节提醒第 1 条，加粗写的：

> **不要改 AIService 接口签名**（`types/index.ts` 的 `generateDJTransition`）。用可选参数 `memoryBlock?` 扩展实现，接口不动。改接口会破坏 aiFactory 和所有 mock。

**你改了 `types/index.ts:113`，给 AIService 接口加了 `memoryBlock?: string`。** 违反了明确的加粗约束。

### 你的辩解是错的

你在报告第 84 行写：
> 原计划"不改接口"，但 TypeScript strict 模式要求接口与调用一致。

**这个理由是错的。** 在 TypeScript 里，类实现接口时，方法签名可以比接口声明**更宽容**（多一个可选参数），完全合法，strict 模式也不报错。接口是"调用方必须满足的最小契约"，实现可以多收参数。你"觉得"会报错就改了，但实际上不会——你没验证就突破了约束。

### 为什么这是严重问题

`AIService` 是抽象契约，改它会波及所有实现类（MimoService、未来其他 AI 服务）和所有 mock。这次因为加的是可选参数侥幸没破坏（248 测试碰巧全过），但如果以后有人加必选参数，就会炸。**规格里加粗的约束，除非你能证明它错了（写最小测试验证），否则必须遵守。**

### 这次的要求

本规格（短期+长期记忆）**不改 AIService 接口签名**：
- Part A 改 `radio.ts`（调 chat 时多传上下文，不涉及接口）
- Part B 改 `db/engine/radio.ts`，也不涉及 AIService
- **如果你发现"似乎需要改接口"，停下来问规划者，不要自作主张改**

### 上次你做得好的（继续保持）

1. djMemory.ts 实现质量高（逻辑/过滤/时段/prompt 块都对）
2. prompt 注入位置精确（三层结构后、参考风格前）
3. 测试覆盖扎实（6 个测试）
4. 报告如实记录改动（没隐瞒改接口）

代码质量是 A，但"规格依从性"因违反约束扣到 B+。**这次目标：代码质量保持 A，规格依从性也回到 A——做到"零约束违反"。**

---

## 〇、现状盘点（执行者必读）

### 已完成（djMemory.ts + transition 注入）
- `djMemory.ts`：`extractDJMemory(session)` 提取已播歌曲/DJ已说串词/时段，`djMemoryPromptBlock(memory)` 生成 prompt 块
- `mimo.ts:147` transition：已注入 memoryBlock ✅
- **transition 换歌时，DJ 记得今晚放过什么** ✅

### 未完成（本规格要做的）

**短期缺口**：chat 回复没注入记忆
- `radio.ts:336` chat 的 systemPrompt 注入了 personaBlock + songContext + searchContext
- **但没注入 djMemory**——用户跟 DJ 聊天时，DJ 不记得今晚放过什么
- 场景：用户听完 3 首歌后聊天"刚才那首叫什么"，DJ 不知道"刚才"指哪首

**长期缺口**：推荐和 DJ 人格都不读 feedback
- feedback 表有数据（song_title/song_artist/action，like/unlike/skip/complete）
- `getFeedbackStats()` 能统计 like/skip/complete 数量
- **但 `loadNeteaseSongs`（engine.ts:54）不读 feedback**——纯按用户输入关键词搜索，不考虑用户历史收藏
- `persona.tasteProfile`（djPersona.json）是写死的，不从 feedback 动态生成
- 场景：用户收藏了 5 首周杰伦的歌，但下次开电台搜索仍不考虑周杰伦——DJ 不"懂"用户品味

---

## Part A：短期记忆扩展（chat 注入 djMemory）

### 改造点
`backend/src/routes/radio.ts` 的 chat handler（:336 附近），在 systemPrompt 里注入 djMemory。

### 改法（1 处，约 5 行）

**文件顶部 import**（:16 附近，已有 djMemory import）：
```ts
// 确认已有（djMemory 在上一规格已 import）
import { extractDJMemory, djMemoryPromptBlock } from '../utils/djMemory'
```

**chat handler 内，systemPrompt 构造前（:335 附近）**，提取记忆：
```ts
// 方案B chat 记忆：让 chat 回复也知道今晚放过什么（短期记忆扩展）
const chatMemory = extractDJMemory(session)
const chatMemoryBlock = djMemoryPromptBlock(chatMemory)

// 4. 构建 systemPrompt（注入 searchContext + chatMemoryBlock）
const systemPrompt = `${personaPromptBlock()}

你正在和用户聊天，同时担任电台 DJ 的角色。
${songContext}

...（保持原样，到 searchContext 之后）

${searchContext}

${chatMemoryBlock}

当前时间：${session.context.time}
当前天气：${session.context.weather?.description || '未知'}
【推荐数量规则】...（保持原样）`
```

**关键**：
- `chatMemoryBlock` 放在 `searchContext` 之后、`当前时间` 之前
- chat 回复现在会知道"今晚已播 X 首、刚才放过《歌名》、你刚说过..."
- 用户问"刚才那首叫什么"，DJ 能从 `recentPlayed` 里答

### 验证
```bash
cd /d/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run   # ≥248
# 后端重启
# E2E：听完 2 首歌 → 聊天"刚才放的是什么歌" → DJ 应能提到刚才的歌名
```

---

## Part B：长期品味记忆（feedback 喂回推荐 + persona）

### 改造点（3 处）
1. 新增 `getLikedArtists()`——从 feedback 表提取用户偏好的歌手
2. `loadNeteaseSongs` 搜索时把 liked artists 加入关键词
3. DJ persona 动态注入品味（chat/transition 能提"我注意到你喜欢周杰伦"）

### B1：新增 getLikedArtists + getLikedGenres

**改文件**：`backend/src/db/index.ts`，在 `getFeedbackStats` 后面新增：

```ts
/**
 * 从 feedback 表提取用户偏好的歌手（按 like 次数排序，排除 unlike）。
 * 用于推荐加权——用户收藏过的歌手，搜索时优先。
 */
export function getLikedArtists(limit = 5): Array<{ artist: string; count: number }> {
  try {
    const db = getDb()
    const rows = db.prepare(
      `SELECT song_artist as artist, COUNT(*) as count
       FROM feedback
       WHERE action = 'like' AND song_artist IS NOT NULL AND song_artist != ''
       GROUP BY song_artist
       ORDER BY count DESC
       LIMIT ?`
    ).all(limit) as Array<{ artist: string; count: number }>
    return rows
  } catch {
    return []
  }
}

/**
 * 提取用户跳过的歌手（负反馈，用于避雷）。
 */
export function getDislikedArtists(limit = 3): Array<{ artist: string; count: number }> {
  try {
    const db = getDb()
    const rows = db.prepare(
      `SELECT song_artist as artist, COUNT(*) as count
       FROM feedback
       WHERE action = 'skip' AND song_artist IS NOT NULL AND song_artist != ''
       GROUP BY song_artist
       ORDER BY count DESC
       LIMIT ?`
    ).all(limit) as Array<{ artist: string; count: number }>
    return rows
  } catch {
    return []
  }
}
```

**配套测试**：在 `db/index.test.ts` 补：
```ts
it('getLikedArtists 返回按次数排序的歌手', () => {
  // 写入 3 条 like（周杰伦×2、陈奕迅×1）
  saveFeedback({ songId: '1', songArtist: '周杰伦', action: 'like' })
  saveFeedback({ songId: '2', songArtist: '周杰伦', action: 'like' })
  saveFeedback({ songId: '3', songArtist: '陈奕迅', action: 'like' })
  const liked = getLikedArtists(5)
  expect(liked[0].artist).toBe('周杰伦')
  expect(liked[0].count).toBe(2)
})

it('getLikedArtists 排除 unlike 和 skip', () => {
  saveFeedback({ songId: '4', songArtist: '许嵩', action: 'unlike' })
  saveFeedback({ songId: '5', songArtist: '汪苏泷', action: 'skip' })
  const liked = getLikedArtists(5)
  expect(liked.find(a => a.artist === '许嵩')).toBeUndefined()
})
```

### B2：loadNeteaseSongs 搜索加权

**改文件**：`backend/src/services/engine.ts` 的 `loadNeteaseSongs`

**现状**（:54）：`loadNeteaseSongs(keywords: string[])` 纯按 keywords 搜索。

**改法**：在 keywords 前面插入用户偏好的歌手作为额外搜索词：

```ts
import { getLikedArtists } from '../db'

export async function loadNeteaseSongs(keywords: string[]): Promise<{ songs: Song[]; source: string }> {
  // B2：把用户收藏过的歌手加入搜索关键词（品味加权）
  const likedArtists = getLikedArtists(3)  // 最多 3 个，避免关键词过多
  const likedKeywords = likedArtists.map(a => a.artist)
  // 偏好歌手插在用户输入关键词之后（用户意图优先，偏好作为补充丰富曲库）
  const allKeywords = [...keywords, ...likedKeywords]

  const all: Song[] = []
  // ... 后续搜索逻辑用 allKeywords 替代 keywords
  for (const kw of allKeywords) {
    // ... 原搜索逻辑不变
  }
}
```

**关键设计**：
- 偏好歌手**追加在用户关键词之后**（不前置）——用户意图优先，偏好作为"丰富曲库"的补充
- 最多取 3 个偏好歌手——避免搜索关键词过多拖慢
- 搜索到偏好歌手的歌会进 songPool，`generateQueue`（相似度算法）自然会让它们排在前面（如果标签匹配）

### B3：DJ persona 动态注入品味

**改文件**：`backend/src/routes/radio.ts` 的 chat handler（systemPrompt 构造处）

在 systemPrompt 里追加一段"用户的长期品味"（从 feedback 动态提取）：

```ts
import { getLikedArtists, getDislikedArtists } from '../db'

// 在 chat handler 内，systemPrompt 构造前
const likedArtists = getLikedArtists(5)
const dislikedArtists = getDislikedArtists(3)
const tasteMemoryBlock = likedArtists.length > 0
  ? `\n【用户的长期品味（来自历史收藏）】
用户喜欢过的歌手：${likedArtists.map(a => `${a.artist}(${a.count}次)`).join('、')}
${dislikedArtists.length > 0 ? `用户跳过的歌手：${dislikedArtists.map(a => a.artist).join('、')}（这些可能不是他的菜）` : ''}
如果你推荐的歌曲里有用户喜欢的歌手，可以自然地提一句"我记得你喜欢XXX的"。`
  : ''
```

然后在 systemPrompt 里注入 `tasteMemoryBlock`（放在 chatMemoryBlock 之前，因为是更长期的上下文）：

```ts
const systemPrompt = `${personaPromptBlock()}

...

${searchContext}

${tasteMemoryBlock}

${chatMemoryBlock}

当前时间：...`
```

**效果**：DJ 现在能说"我记得你喜欢周杰伦，这首也是他那种**温暖**的风格"——因为它看到了用户的长期收藏数据。

### B3b（可选）：transition 也注入长期品味

transition（`mimo.ts`）目前只注入短期记忆（djMemory）。可在 transition 的 memoryBlock 里也追加长期品味。但 transition 主要是"换歌解说"，提长期品味可能啰嗦。**建议先只做 chat，观察效果再决定要不要加 transition**。

### B4：验证

```bash
cd /d/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run   # ≥248 + 新增测试
# 后端重启
# E2E：
# 1. 先收藏 2-3 首同一个歌手的歌（让 feedback 积累）
# 2. 新建会话 → DJ 开场白/聊天 是否提到该歌手？
# 3. 搜索结果是否包含该歌手的其他歌（B2 加权生效）？
```

**判定标准**：
- 收藏过周杰伦的歌 → 下次开电台，搜索结果含周杰伦的其他歌
- chat 时 DJ 能说"我记得你喜欢周杰伦"
- 没收藏过任何歌（新用户）→ tasteMemoryBlock 为空，行为不变（不影响新用户体验）

---

## 执行顺序与依赖

```
Part A（短期 chat 记忆）   ← 独立，先做（简单，1 处改动）
       ↓
Part B1（getLikedArtists） ← 新增 db 函数 + 测试
       ↓
Part B2（搜索加权）         ← 依赖 B1
       ↓
Part B3（persona 注入）     ← 依赖 B1
       ↓
验证（含 E2E：收藏→新会话→DJ 提到该歌手）
```

**Part A 可独立先做**（5 行改动）。Part B 三步有依赖，按 B1→B2→B3 顺序。

---

## 验证清单

```bash
# Part A
- [ ] radio.ts chat handler 注入 chatMemoryBlock
- [ ] tsc + vitest ≥248
- [ ] E2E：听完 2 首 → 聊天"刚才放的是什么歌" → DJ 能答

# Part B
- [ ] B1: db/index.ts 新增 getLikedArtists + getDislikedArtists
- [ ] B1: db/index.test.ts 补测试
- [ ] B2: engine.ts loadNeteaseSongs 加入 likedArtists 搜索
- [ ] B3: radio.ts chat 注入 tasteMemoryBlock
- [ ] tsc + vitest 全过
- [ ] 后端重启
- [ ] E2E：收藏周杰伦×2 → 新会话 → 搜索含周杰伦 + DJ 提到周杰伦
```

---

## 给执行者的提醒

### Part A
1. **chatMemoryBlock 放对位置**——searchContext 之后、当前时间之前。和 transition 的 memorySection 位置逻辑一致。
2. **不重复提取**——chat handler 里 `extractDJMemory(session)` 只调一次，别和 transition 路径重复。

### Part B
1. **getLikedArtists 的 SQL 只取 action='like'**——不含 unlike/skip（unlike 是取消收藏，skip 是跳过）。dislike 单独用 getDislikedArtists。
2. **likedKeywords 追加在用户关键词之后**，不前置——用户意图优先。如果用户说"来点爵士"，先搜爵士，再搜偏好歌手丰富曲库。
3. **tasteMemoryBlock 可能为空**（新用户无收藏）——空时返回空字符串，不影响 systemPrompt 结构。
4. **B3 的"我记得你喜欢XXX"要自然**——prompt 里说"可以自然地提一句"，不是强制每句都提。别让 DJ 变成复读机。
5. **这是 feedback 数据首次喂回推荐**——之前 feedback 只落库不读，这次形成闭环。如果 feedback 表是空的（新环境），所有品味功能降级为空，不影响基本体验。

### 关于 AIService 接口（重要——上一规格 DSpro 的教训，见文档顶部"前科提醒"）
**本规格不改 AIService 接口签名**。Part A 改 radio.ts（调 chat 时多传上下文，不涉及接口）。Part B 改 db/engine/radio.ts，也不涉及 AIService。

**DSpro，你上次就是在这一条上栽的**——改了 `types/index.ts` 的 AIService 接口，违反了加粗约束，还用错误的理由（"TS strict 要求一致"）辩解。**这次再犯同样的错，评级直接降到 C。**

如果你发现"似乎需要改接口才能编译"：
1. **先写最小测试验证**——TS 实现类的方法可以比接口多可选参数，不会报错
2. **如果真报错，停下来问规划者**——不要自作主张改接口
3. **加粗约束 = 不可突破**，除非你能证明约束本身错了

---

## 效果预期

| 场景 | 改造前 | 改造后 |
|------|--------|--------|
| 聊天"刚才那首叫什么" | DJ 不知道"刚才"指哪首 | DJ 从 recentPlayed 答《歌名》 |
| 收藏 5 首周杰伦后开新电台 | 搜索不考虑周杰伦 | 搜索结果含周杰伦其他歌 |
| DJ 聊天时 | 通用回复 | "我记得你喜欢周杰伦，这首也是温暖风格" |
| 新用户（无收藏） | 正常 | 正常（tasteMemoryBlock 为空，不影响） |

**短期**：DJ 在单次会话内全入口（transition + chat）都有记忆。
**长期**：DJ 跨会话记住用户品味，推荐和聊天都基于历史收藏。

---

*本规格扩展 DJ 记忆到全入口 + 长期品味。Part A 简单先做，Part B 是 feedback 数据闭环的关键。执行者按 A→B1→B2→B3 顺序，每步验证。*
