---
author: 规划者
task: chat 防重入（AbortController + 按 id 精确替换）+ composeSystemPrompt 统一 4 入口
created: 2026-07-13
executor: DSpro
priority: 🟠 P2 + 🟡 P3（一轮做完）
baseline: 后端 274 / 前端 173，tsc 零错误
---

# 第 5 轮执行规格：chat 防重入 + prompt 统一（2 项）

> **背景**：P1 残留（String(err)/req as any 各 1 处）已由规划者于 2026-07-13 清零（提交 `6ffe1aa`）。本轮是打磨轮收尾的两件事，做完项目进入"日常使用"阶段。
> **配套**：先读 `COLLABORATION.md`（铁律 1-6）+ `HANDOVER.md`（§四决策 / §五待办）。
> **本规格基于 2026-07-13 代码实况逐行核实**，不是凭记忆。

---

## 任务总览

| 序 | 任务 | 优先级 | 成本 | 风险点 |
|---|------|--------|------|--------|
| **序 1** | chat 防重入（P2） | 🟠 | 中 | AbortError 处理 + pending id 精确替换 |
| **序 2** | composeSystemPrompt 统一 4 入口（P3）| 🟡 | 中 | 4 入口 prompt 结构差异大，勿强行僵化 |

**执行顺序**：序 1 → 序 2（序 1 改 useSession/radioStore，序 2 改 mimo/radio/djPersona，互不冲突）。

---

## 序 1：chat 防重入（AbortController + 按 id 精确替换）

### 1.1 根因（Mavis P1.4）

用户连发 3 条消息 → 3 个 fetch 同时飞 → `updateLastKimiMessage` 用 reverse findIndex 只更新"最后一条 kimi" → **前两个 AI 回复静默丢失**（token 已消耗，用户不知道）。

### 1.2 现状（2026-07-13 核实）

- `useSession.ts:144` 推 pending 消息（内部 `addMessage` 自动生成 id）
- `useSession.ts:146` fetch `/api/v1/radio/${sid}/chat`，**无 signal**
- `useSession.ts:158` 成功：`updateLastKimiMessage(data.reply, {...})` —— 按"最后一条 kimi"模糊匹配
- `useSession.ts:183` 失败：`updateLastKimiMessage('网络有点卡...', {...})`
- `radioStore.ts:198` `updateLastKimiMessage` 实现：`reverse().findIndex(m => m.sender === 'kimi')` —— **竞态根源**

**关键边界**：`updateLastKimiMessage` 仅在 useSession.ts 有 2 个调用点（chat 成功 + chat 失败）。换歌流程（`nextSong` in radioStore.ts:283）用的是 `addMessage`（非 updateLastKimiMessage），**不受影响**。

### 1.3 改法（3 处，严格按此实施）

#### 1.3a：`radioStore.ts` — addMessage 支持外部 id

当前 `addMessage`（radioStore.ts:186-193）内部强制 `id: crypto.randomUUID()`，调用方拿不到 id，无法精确替换。

**改法**：让 addMessage 接受可选 `id`，没传则内部生成（向后兼容，其他 5 个调用点 page.tsx/useAudioPlayer/useSession createSession 都不用改）。

```ts
// radioStore.ts:186 当前
addMessage: (msg) =>
  set(
    (s) => ({
      messages: [...s.messages, { ...msg, id: crypto.randomUUID() }],
    }),
    false,
    'chat/addMessage',
  ),

// 改后
addMessage: (msg) =>
  set(
    (s) => ({
      messages: [...s.messages, { ...msg, id: msg.id ?? crypto.randomUUID() }],
    }),
    false,
    'chat/addMessage',
  ),
```

**ChatMessage 类型**（types/api.ts:33）`id: string` 已是必填，msg 里传 id 合法，无需改类型。

#### 1.3b：`radioStore.ts` — updateLastKimiMessage 支持 id 精确匹配

当前签名（radioStore.ts:76）：
```ts
updateLastKimiMessage: (text: string, extra?: Partial<Pick<ChatMessage, 'recommendations' | 'isPending'>>) => void
```

**改法**：extra 增加 `id?: string`。有 id 精确匹配，没 id 走原 reverse findIndex 兜底（保持向后兼容，失败兜底那条不用传 id）。

```ts
// radioStore.ts:76 改后签名
updateLastKimiMessage: (
  text: string,
  extra?: Partial<Pick<ChatMessage, 'recommendations' | 'isPending' | 'id'>>,
) => void

// radioStore.ts:198 实现改后
updateLastKimiMessage: (text, extra) => {
  const s = get()
  let realIdx: number
  if (extra?.id) {
    // 精确匹配（P2 防重入核心）
    realIdx = s.messages.findIndex((m) => m.id === extra.id)
    if (realIdx === -1) return  // 消息已被清理，静默跳过
  } else {
    // 兜底：找最后一条 kimi（保留原行为，避免破坏其他调用路径）
    const lastKimiIdx = [...s.messages].reverse().findIndex((m) => m.sender === 'kimi')
    if (lastKimiIdx === -1) return
    realIdx = s.messages.length - 1 - lastKimiIdx
  }
  const updated = [...s.messages]
  updated[realIdx] = {
    ...updated[realIdx],
    text,
    isPending: extra?.isPending ?? false,
    recommendations: extra?.recommendations ?? updated[realIdx].recommendations,
  }
  set({ messages: updated }, false, 'chat/updateLastKimiMessage')
},
```

#### 1.3c：`useSession.ts` — sendChatMessage 加 AbortController + 精确替换

**新增 ref**（useSession.ts 顶部，handlersRegistered 附近）：
```ts
// 防重入：用户连发消息时，abort 上一个 chat fetch（旧 AI 回复直接丢弃）
const chatAbortRef = useRef<AbortController | null>(null)
```

**sendChatMessage 改后**（useSession.ts:137-190，关键改动用注释标出）：
```ts
const sendChatMessage = useCallback(
  async (text: string) => {
    const s = useRadioStore.getState()
    const sid = s.sessionId
    if (!sid) return false

    // P2：abort 上一个 chat 请求（用户连发时旧请求直接取消，省 token + 避免回复错位）
    if (chatAbortRef.current) {
      chatAbortRef.current.abort()
    }
    const controller = new AbortController()
    chatAbortRef.current = controller

    s.setIsCreating(true)
    // P2：生成 pending id，传给 addMessage，后续按 id 精确替换
    const pendingId = crypto.randomUUID()
    s.addMessage({ id: pendingId, sender: 'kimi', text: '', timestamp: 0, isPending: true })
    try {
      const res = await fetch(`${API_BASE}/api/v1/radio/${sid}/chat`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ text, model: s.currentModel, session_token: s.sessionToken }),
        signal: controller.signal,  // P2：可被 abort
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`HTTP ${res.status}: ${errText}`)
      }
      const data = await res.json()
      if (data.reply) {
        // P2：按 pendingId 精确替换（不再用"最后一条 kimi"模糊匹配）
        s.updateLastKimiMessage(data.reply, {
          id: pendingId,
          recommendations: data.recommendations || undefined,
          isPending: false,
        })
        if (djEnabled) {
          speakAIMessage(data.reply)
        }
      }
      if (data.new_song) {
        const song = data.new_song
        s.setQueue([...s.queue, song])
        s.setCurrentSong(song)
        s.setDuration(song.duration || 180)
        if (!djEnabled || !data.reply) {
          s.setIsPlaying(true)
        }
      }
      return true
    } catch (err) {
      // P2：abort 不是错误，静默忽略（用户发了新消息，旧请求被取消是预期行为）
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false
      }
      logger.error('[Chat] sendChatMessage failed', { error: err instanceof Error ? err.message : String(err) })
      // 失败兜底也按 id 精确替换（避免误改下一个请求的 pending 消息）
      s.updateLastKimiMessage('网络有点卡，稍后再聊。', { id: pendingId, isPending: false })
      return false
    } finally {
      s.setIsCreating(false)
    }
  },
  [speakAIMessage, djEnabled]
)
```

**注意 abort 的边界**：
- `fetch` 被 abort 后，`res.ok` 那行永远不会执行（fetch 直接 reject 抛 AbortError）—— catch 接住即可
- **不要**在 finally 里 `chatAbortRef.current = null`：如果设了 null，下个请求的 `if (chatAbortRef.current)` 判断会失败。让 ref 持续指向最后一个 controller，下次进入时自然被 abort（已完成的 controller 再 abort 是 no-op，安全）

### 1.4 验证

```bash
cd D:/Coder/mimo-radio/frontend
npx tsc --noEmit                    # 零错误
npx vitest run                      # ≥173
# 新增/更新测试（见 1.5）
```

**E2E（webbridge 或手测）**：
1. 连发 3 条消息（间隔 < 1 秒）
2. 后端日志：只有 1 个 `POST /chat` 完成（前 2 个被 abort，可能日志看到 abort 也正常）
3. 前端：最终只显示 1 条 AI 回复（对应最后一条用户消息），没有 3 条 pending 卡住

### 1.5 必须新增的测试

`frontend/src/store/radioStore.test.ts`（如不存在则新建）追加：

```ts
describe('updateLastKimiMessage (P2 精确替换)', () => {
  it('传 id 时按 id 精确匹配', () => {
    // 塞两条 kimi 消息，updateLastKimiMessage 带 id 指向第一条
    // 断言：只有第一条被改，第二条不变
  })
  it('不传 id 时走兜底（最后一条 kimi）', () => {
    // 保持向后兼容
  })
  it('id 不存在时静默跳过', () => {
    // 消息已被清理的场景
  })
})

describe('addMessage (P2 外部 id)', () => {
  it('传 id 时用外部 id', () => {})
  it('不传 id 时自动生成', () => {})
})
```

**useSession.test.ts** 如有 mock fetch 的测试，追加：
- abort 后 fetch 抛 AbortError → catch 静默返回 false（不显示"网络有点卡"）

---

## 序 2：composeSystemPrompt 统一 4 入口

### 2.1 根因（Mavis P1.3）

personaBlock + tasteBlock + memoryBlock + 关键词高亮规则在 intro/transition/chat/recommend 4 处独立拼接。改 persona 文案要改 4 次，易漂移。

### 2.2 现状（2026-07-13 核实，4 入口真实结构）

| 入口 | 文件:行 | system 内容 | user 内容 |
|------|---------|-------------|-----------|
| **intro** | `mimo.ts:189` | personaBlock | 开场白模板（时间/天气/氛围/关键词高亮）|
| **transition** | `mimo.ts:151` | personaBlock | 过渡解说模板（承接/故事/此刻 + 关键词高亮 + 歌曲信息）|
| **chat** | `radio.ts:364` | personaBlock + 聊天角色 + songContext + 关键词高亮 + 意图分类 + 点歌规则 + searchContext + tasteMemoryBlock + chatMemoryBlock + 时间天气 + 推荐数量规则 | 用户消息 |
| **recommend** | `mimo.ts:107` | （无 persona，纯 task prompt）| 推荐策略 JSON 任务 |

**关键差异（必须理解）**：
- intro/transition 的 persona 是 `system` role，user 是模板
- chat 的 persona + 全部上下文都塞进一个 `systemPrompt`，user 是用户消息
- recommend **完全不用 persona**，是纯 JSON 任务，结构跟前 3 个根本不同

### 2.3 改法（务实版，不强行僵化）

> ⚠️ **警告**：不要把 4 个入口强行套进一个统一模板。recommend 跟前 3 个结构不同，强行统一会破坏推荐策略的 JSON 输出。

**目标**：抽一个 `composeSystemPrompt(extras)` 只统一**可复用的 extras 拼接**（persona + memory + taste + search + song context），各入口的 intent 特定规则仍各自写。

#### 2.3a：`djPersona.ts` 新增 composeSystemPrompt

在 `personaPromptBlock`（djPersona.ts:172）下方新增：

```ts
/**
 * 统一构造 AI DJ 的 system prompt（P3：避免 4 入口独立拼接导致漂移）。
 *
 * 只统一"可复用的 extras 拼接"（persona + 记忆 + 品味 + 搜索上下文 + 歌曲上下文），
 * 各入口的 intent 特定规则（开场白模板/过渡解说模板/聊天意图分类）仍各自写在 user prompt 里。
 *
 * @param extras 可选的上下文块，按固定顺序拼接
 * @returns 拼接好的 system prompt 字符串
 */
export interface PromptExtras {
  /** DJ 短期记忆（换歌时的 recentPlayed/recentDJSpoken 等），来自 djMemoryPromptBlock */
  memoryBlock?: string
  /** 用户长期品味（来自历史收藏/跳过），来自 tasteCache */
  tasteBlock?: string
  /** 搜索前置结果（点歌/推荐时喂给 AI 的真实可播歌曲），来自 searchContext */
  searchContext?: string
  /** 当前歌曲上下文（chat 时说明正在放什么）*/
  songContext?: string
}

export function composeSystemPrompt(extras: PromptExtras = {}): string {
  const sections: string[] = [personaPromptBlock()]
  if (extras.songContext) sections.push(extras.songContext)
  if (extras.searchContext) sections.push(extras.searchContext)
  if (extras.tasteBlock) sections.push(extras.tasteBlock)
  if (extras.memoryBlock) sections.push(extras.memoryBlock)
  return sections.join('\n\n')
}
```

#### 2.3b：4 个入口改用它

**intro（mimo.ts:189）**：
```ts
// 当前
const personaBlock = personaPromptBlock()
return await this.chat([
  { role: 'system', content: personaBlock },
  { role: 'user', content: prompt },
])

// 改后（intro 无 extras）
const system = composeSystemPrompt()  // 等价于 personaPromptBlock()，但走统一入口
return await this.chat([
  { role: 'system', content: system },
  { role: 'user', content: prompt },
])
```

**transition（mimo.ts:151）**：
```ts
// 当前
const personaBlock = personaPromptBlock()
const memorySection = memoryBlock || ''
const prompt = `... ${memorySection} ...`  // memory 塞在 user prompt 中间

// 改后（memory 移到 system）
const system = composeSystemPrompt({ memoryBlock })
const prompt = `...`  // user prompt 去掉 ${memorySection}
return await this.chat([
  { role: 'system', content: system },
  { role: 'user', content: prompt },
])
```
**注意**：transition 当前把 memorySection 夹在 user prompt 中间（mimo.ts:167），改后要确保 memoryBlock 从 user prompt 里干净移除，不能残留空行或重复。

**chat（radio.ts:364）**：
```ts
// 当前：一个巨大的 systemPrompt 模板字符串，含 persona + 聊天角色 + songContext + 关键词高亮 + 意图 + 点歌规则 + searchContext + taste + chatMemory + 时间天气 + 数量规则
const systemPrompt = `${personaPromptBlock()}\n\n你正在和用户聊天...${songContext}...${searchContext}...${tasteMemoryBlock}...${chatMemoryBlock}...`

// 改后：persona + extras 走 composeSystemPrompt，chat 特定规则（关键词高亮/意图/点歌/数量）仍在 systemPrompt 里手写
const systemPrompt = `${composeSystemPrompt({
  songContext,
  searchContext,
  tasteBlock: tasteMemoryBlock,
  memoryBlock: chatMemoryBlock,
})}

你正在和用户聊天，同时担任电台 DJ 的角色。

【最重要规则 - 关键词高亮】...（原样保留）
用户可能想：...（原样保留）
请用温暖自然的语气回复，60-120字。
如果是点歌/换歌请求...（原样保留）
... 当前时间/天气
【推荐数量规则】...（原样保留）`
```

**recommend（mimo.ts:107）**：
> ⚠️ **不改**。recommend 是纯 JSON 任务，不用 persona，结构跟前 3 个不同。强行套 composeSystemPrompt 会注入 persona 干扰 JSON 输出。**保持原样**，在本规格里明确记录"recommend 不纳入统一"的决策。

#### 2.3c：import 调整

- `mimo.ts:8` 当前 `import { personaPromptBlock } from './djPersona'` → 改为 `import { personaPromptBlock, composeSystemPrompt } from './djPersona'`
- `radio.ts:11` 当前 `import { personaPromptBlock } from '../services/djPersona'` → 改为 `import { composeSystemPrompt } from '../services/djPersona'`（personaPromptBlock 不再直接用）
- **不改 AIService 接口**（铁律：接口约束；generateDJTransition 的 memoryBlock 参数已存在）

### 2.4 验证

```bash
cd D:/Coder/mimo-radio/backend
npx tsc --noEmit                    # 零错误
npx vitest run                      # ≥274
grep -rn "personaPromptBlock()" src/ --include="*.ts" | grep -v test | grep -v djPersona.ts
# 期望：只剩 djPersona.ts 自身定义 + composeSystemPrompt 内部调用，业务代码 0 处直接用
```

**E2E（三入口风格一致）**：
1. 创建电台 → intro 开场白正常（60-120 字，关键词 ** 高亮）
2. 换歌 → transition 解说正常（含 memoryBlock 时 DJ 能引用上一首/用户说过的话）
3. 聊天 → chat 回复正常（含 searchContext 时点歌一致）

### 2.5 必须新增的测试

`backend/src/services/djPersona.test.ts`（如不存在则新建，已有则追加）：
```ts
describe('composeSystemPrompt (P3)', () => {
  it('无 extras 时等价于 personaPromptBlock()', () => {
    expect(composeSystemPrompt()).toBe(personaPromptBlock())
  })
  it('按固定顺序拼接 songContext/searchContext/tasteBlock/memoryBlock', () => {
    // 传入 4 个 block，断言顺序
  })
  it('undefined 的 extras 不产生空行', () => {})
})
```

---

## 执行检查清单

### 序 1（chat 防重入）
- [ ] 1.3a: radioStore.ts addMessage 支持外部 id（向后兼容）
- [ ] 1.3b: radioStore.ts updateLastKimiMessage 支持 id 精确匹配（兜底保留）
- [ ] 1.3c: useSession.ts sendChatMessage 加 AbortController + pendingId 精确替换
- [ ] 1.3c: catch 正确处理 AbortError（静默 return false，不显示"网络有点卡"）
- [ ] 1.5: radioStore.test.ts 追加 3+2 个测试用例
- [ ] tsc + vitest ≥173
- [ ] E2E：连发 3 条 → 最终 1 条回复（无 3 条 pending 卡住）
- [ ] grep 验证：`grep -rn "chatAbortRef" src/` 应有 2 处（声明 + 使用）
- [ ] git commit + push

### 序 2（composeSystemPrompt）
- [ ] 2.3a: djPersona.ts 新增 PromptExtras + composeSystemPrompt
- [ ] 2.3b: intro/transition/chat 3 处改用 composeSystemPrompt（**recommend 不改**）
- [ ] 2.3c: mimo.ts/radio.ts import 调整
- [ ] transition 的 memoryBlock 从 user prompt 干净移到 system（无残留空行）
- [ ] chat 的 systemPrompt 结构保持原样（只把 persona+extras 拼接换成 composeSystemPrompt）
- [ ] 2.5: djPersona.test.ts 追加 3 个测试用例
- [ ] tsc + vitest ≥274
- [ ] grep 验证：业务代码 0 处直接用 personaPromptBlock（只剩 djPersona.ts 内部）
- [ ] E2E：三入口风格一致（60-120 字 + 关键词高亮）
- [ ] git commit + push

---

## 前科提醒（DSpro 专属）

你上次做 chat 搜索前置（Bug 2 方案 B）**零偏差，很好**。本轮同样改 useSession/radioStore/radio.ts，注意：

1. **AbortController 的 catch 不是所有 catch 都是错误** —— AbortError 必须静默 return false，不能显示"网络有点卡"（否则用户连发时会看到一堆错误提示）。这是本轮最容易踩的坑。

2. **updateLastKimiMessage 的 id 参数是可选的** —— 失败兜底那条（useSession.ts:183）也要传 pendingId，否则它会误改下一个请求的 pending 消息。两个调用点都要传 id。

3. **addMessage 改向后兼容** —— 其他 5 个调用点（page.tsx/useAudioPlayer×2/useSession createSession×2）不传 id 也要正常工作。别为了"统一"把所有调用点都改成传 id（YAGNI）。

4. **recommend 不纳入 composeSystemPrompt 统一** —— 这是规划者明确决策（recommend 是纯 JSON 任务，不用 persona）。不要"为了完整性"强行改它。在 djPersona.ts 的注释里写清楚这个决策。

5. **transition 的 memoryBlock 当前夹在 user prompt 中间**（mimo.ts:167 的 `${memorySection}`）—— 移到 system 后，user prompt 里的 `${memorySection}` 要干净删除，不能留空行或重复块。

6. **铁律 1（try/finally 资源清理）** —— AbortController 的 ref 不要在 finally 里清空（见 1.3c 注意事项），已完成 controller 再 abort 是 no-op。

7. **铁律 6（删功能 grep 全项目含 .md）** —— 如果改动了某个导出函数的签名，grep 全项目（含 docs/）确认没有遗漏调用点或文档引用。

---

## 验收标准（规划者打分用）

| 维度 | 满分要求 |
|------|---------|
| 功能正确 | 序 1 连发 3 条 → 1 回复；序 2 三入口风格一致 |
| 测试覆盖 | radioStore.test.ts +5、djPersona.test.ts +3、useSession.test.ts abort 用例 |
| tsc + vitest | 后端 ≥274 / 前端 ≥173，零错误 |
| 边界处理 | AbortError 静默、id 不存在静默跳过、向后兼容 |
| 铁律遵守 | 6 条全过（重点：铁律 1 try/finally、铁律 4 理解再改 transition）|
| 报告 | 6 节齐全（摘要/改动/验证/偏差/自评/铁律回顾）|

---

*本规格是打磨轮收尾。做完后项目工程债清零（剩 P4 isPlaying 仲裁层建议暂缓，等可复现竞态再做），进入"日常使用 + 外部验证"阶段。*
