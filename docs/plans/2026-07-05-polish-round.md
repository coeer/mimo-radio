---
author: 规划者
task: 打磨轮——chat 防重入 + composeSystemPrompt + 残留补完 + F4 仲裁层
created: 2026-07-05
---

# 打磨轮执行规格（4 项，按优先级排序）

> **目标**：把剩余 4 项工程债清零，项目进入"日常使用"阶段
> **基线**：后端 274 / 前端 173，tsc 零错误
> **配套**：先读 `COLLABORATION.md`（铁律 1-6）+ `HANDOVER.md`（第五节待办）

---

## 任务总览

| 序 | 优先级 | 任务 | 成本 | 建议执行者 |
|---|--------|------|------|-----------|
| P1 | 🟠 | **残留 2 处补完**（String(err) 1处 + req as any 1处） | 10 分钟 | 任意 |
| P2 | 🟠 | **chat 防重入**（AbortController + 按 id 精确替换） | 中（1天） | DSpro |
| P3 | 🟡 | **composeSystemPrompt 统一 4 入口** | 中（1天） | DSpro |
| P4 | 🟡 | **F4 isPlaying 仲裁层**（MediaSession 删后降级，13处） | 大（3天） | DSflash |

**执行顺序**：P1（顺手）→ P2+P3（DSpro 一轮做）→ P4（DSflash 独立一轮）

---

## P1：残留 2 处补完（10 分钟）

### P1a：String(err) 最后 1 处

**位置**：`backend/src/index.ts:236`
```ts
// 当前
logger.error('uncaughtException, shutting down', { error: err.stack || String(err) })
```

**改法**：
```ts
logger.error('uncaughtException, shutting down', { ...toErrorMeta(err) })
```

**注意**：这是 process-level uncaughtException handler，`err` 可能是非 Error 对象。`toErrorMeta` 已有 `err instanceof Error ? ... : String(err)` 兜底（logger.ts:195），安全。

**需确认**：index.ts 顶部是否已 import toErrorMeta。如果没有，加 `import { toErrorMeta } from './utils/logger'`。

### P1b：req as any 最后 1 处

**位置**：`backend/src/index.ts:94`
```ts
// 当前
const reqId = (req as any).requestId || '-'
```

**改法**：`types/express.d.ts` 已声明 `requestId: string`，直接读：
```ts
const reqId = req.requestId || '-'
```

**验证**：
```bash
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run  # ≥274
grep -rn "String(err)" src/ --include="*.ts" | grep -v test | grep -v toErrorMeta  # 应为空
grep -rn "req as any" src/ --include="*.ts" | grep -v test  # 应为空
```

---

## P2：chat 防重入（AbortController + 按 id 精确替换）

### 根因（Mavis P1.4）
用户连发 3 条消息 → 3 个 fetch 同时飞 → `updateLastKimiMessage` 用 reverse findIndex 只更新最后一条 kimi → 前两个 AI 回复**静默丢失**，token 已消耗。

### 改法（3 处）

#### P2a：useSession.ts 加 AbortController

`frontend/src/hooks/useSession.ts` 的 `sendChatMessage`：

```ts
// 新增 ref（文件顶部 useRef 区域）
const chatAbortRef = useRef<AbortController | null>(null)

// sendChatMessage 内，fetch 前：
// 取消上一个 chat 请求
if (chatAbortRef.current) {
  chatAbortRef.current.abort()
}
const controller = new AbortController()
chatAbortRef.current = controller

// fetch 加 signal：
const res = await fetch(`${API_BASE}/api/v1/radio/${sid}/chat`, {
  method: 'POST',
  headers: getApiHeaders(),
  body: JSON.stringify({ text, model: s.currentModel, session_token: s.sessionToken }),
  signal: controller.signal,  // ← 新增
})

// catch 里处理 abort（abort 不是错误，静默忽略）：
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return  // 用户发了新消息，旧请求被取消，正常
  }
  // 原有错误处理...
  s.updateLastKimiMessage('网络有点卡，稍后再聊。', { isPending: false })
}
```

#### P2b：updateLastKimiMessage 改按 id 精确替换

`frontend/src/store/radioStore.ts` 的 `updateLastKimiMessage`：

```ts
// 改前：用 reverse findIndex 找"最后一条 kimi"
const lastKimiIdx = [...s.messages].reverse().findIndex((m) => m.sender === 'kimi')

// 改后：在 sendChatMessage 里记录 pending 消息的 id，传给 updateLastKimiMessage
// sendChatMessage 改为：
const pendingId = crypto.randomUUID()
s.addMessage({ id: pendingId, sender: 'kimi', text: '', timestamp: 0, isPending: true })
// ... fetch 完成后：
s.updateLastKimiMessage(data.reply, { id: pendingId, recommendations: ..., isPending: false })
```

`updateLastKimiMessage` 改为按 id 查找：
```ts
updateLastKimiMessage: (text, extra) => {
  const s = get()
  const targetId = extra?.id
  const idx = targetId
    ? s.messages.findIndex((m) => m.id === targetId)
    : [...s.messages].reverse().findIndex((m) => m.sender === 'kimi')  // 兜底
  // ... 后续替换逻辑不变
}
```

**注意**：`addMessage` 当前内部生成 id（`crypto.randomUUID()`），需改为接受外部 id。或 sendChatMessage 不走 addMessage、直接 set messages。

#### P2c：InputArea Enter 防抖（前端兜底）

`frontend/src/components/InputArea.tsx`：Enter 发送后 500ms 内 disabled。但 handleSend 里已有 `if (isCreating) return` 守卫，这是双保险。

### 验证
```bash
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run  # ≥173
# E2E：连发 3 条 → 只发 1 个 fetch（前 2 个 abort）→ 1 个回复正常显示
# 后端日志：只有 1 个 POST /chat（不是 3 个）
```

---

## P3：composeSystemPrompt 统一 4 入口

### 根因（Mavis P1.3）
personaBlock + tasteBlock + memoryBlock 在 intro/transition/chat/recommend 4 处独立拼接。改 persona 要改 4 次。

### 改法

`backend/src/services/djPersona.ts` 新增统一构造函数：

```ts
export interface PromptExtras {
  memoryBlock?: string
  tasteBlock?: string
  searchContext?: string
  songContext?: string
}

export function composeSystemPrompt(
  intent: 'intro' | 'transition' | 'chat' | 'recommend',
  extras: PromptExtras
): { system: string; user: string } {
  const persona = personaPromptBlock()

  const sections: string[] = [persona]

  if (extras.songContext) sections.push(extras.songContext)
  if (extras.searchContext) sections.push(extras.searchContext)
  if (extras.tasteBlock) sections.push(extras.tasteBlock)
  if (extras.memoryBlock) sections.push(extras.memoryBlock)

  const system = sections.join('\n\n')

  // intent 特定规则
  const rules: Record<typeof intent, string> = {
    intro: `请用温暖自然的语气回复，60-120字。\n【关键词高亮】情绪/氛围/场景类关键词用 ** 包裹。`,
    transition: `请按你的人设风格，写一段 60-120 字的过渡解说。\n【关键词高亮】情绪/氛围/场景类关键词用 ** 包裹。`,
    chat: `请用温暖自然的语气回复，60-120字。\n【关键词高亮】每句 1-3 个 ** 标记。\n【推荐数量规则】不要声明具体数量。`,
    recommend: `请用温暖自然的语气回复，60-120字。\n【关键词高亮】情绪/氛围/场景类关键词用 ** 包裹。`,
  }

  return { system, user: rules[intent] }
}
```

然后 4 个调用点改为用它：
- `mimo.ts generateIntro` → `composeSystemPrompt('intro', {})`
- `mimo.ts generateDJTransition` → `composeSystemPrompt('transition', { memoryBlock, tasteBlock })`
- `radio.ts chat` → `composeSystemPrompt('chat', { memoryBlock, tasteBlock, searchContext, songContext })`
- `mimo.ts generateRecommendationStrategy` → `composeSystemPrompt('recommend', {})`

**注意**：
- 4 个入口的 prompt 细节（关键词高亮/数量规则/字数）统一到 rules 里
- 各入口的 user prompt 仍各自构造（因为内容不同：intro 讲开场、transition 讲过渡、chat 回复用户），但 system 部分（persona + extras）统一走 composeSystemPrompt
- **不改 AIService 接口**（铁律：接口约束）

### 验证
```bash
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run  # ≥274
# E2E：换歌 transition / 聊天 chat / 开场 intro 都正常（风格一致、60-120字）
```

---

## P4：F4 isPlaying 仲裁层（MediaSession 删后降级）

### 现状
MediaSession 删除后，isPlaying 写入点从 16→13（真正直接写 setIsPlaying 的约 8 处，其余是 togglePlay UI 调用）。锁屏控制这个主要竞态源已消除。

### 紧迫度评估
**降级为 P2**——页面内操作（用户不会毫秒级并发点两个按钮），竞态概率大幅下降。但 13 处无仲裁仍是架构债。

### 改法（Mavis §3 方案，简化版）

新建 `frontend/src/store/playController.ts`：
```ts
// 单点仲裁：所有 isPlaying 写入走这里
// 当前实现：直接转发 setIsPlaying（先建壳，后续逐步收拢写点）
// 目标：最终所有写点改为 dispatch(action)，reducer 算唯一 next isPlaying
```

**本轮建议**：**先不做完整仲裁层**。理由：
1. MediaSession 删了，竞态主要源消除
2. 完整仲裁层跨 8 文件，成本 3 天，当前收益模糊
3. 建议等真正出现可复现竞态 bug 时再做（"第一次遇到再动"策略）

**如果你坚持做**：按 Mavis §3 的 playController reducer 方案，DSflash 执行（附 Profiler，铁律 5）。

---

## 执行检查清单

### P1（10 分钟，立刻做）
- [ ] P1a: index.ts:236 String(err) → toErrorMeta
- [ ] P1b: index.ts:94 req as any → req.requestId
- [ ] grep String(err)/req as any 零残留
- [ ] tsc + vitest ≥274
- [ ] git commit + push

### P2（DSpro，1 天）
- [ ] P2a: useSession.ts AbortController（abort 旧请求 + signal）
- [ ] P2b: updateLastKimiMessage 按 id 精确替换
- [ ] P2c: InputArea Enter 防抖（双保险）
- [ ] tsc + vitest ≥173
- [ ] E2E：连发 3 条 → 1 个 fetch + 1 个回复
- [ ] git commit + push

### P3（DSpro，与 P2 同轮或接续）
- [ ] djPersona.ts 新增 composeSystemPrompt
- [ ] 4 个调用点改用它
- [ ] tsc + vitest ≥274
- [ ] E2E：三入口风格一致、60-120字
- [ ] git commit + push

### P4（DSflash，3 天，建议暂缓）
- [ ] playController.ts reducer
- [ ] 13 处写点改 dispatch
- [ ] playController.test.ts
- [ ] Profiler 证据（铁律 5）
- [ ] E2E 4 场景
- [ ] git commit + push

---

## 给执行者的前科提醒（P2/P3 适用）

**DSpro**：你上次做 chat 搜索前置（Bug 2 方案 B）时零偏差，很好。这次 P2/P3 同样改 radio.ts/useSession.ts，注意：
1. **不改 AIService 接口**（铁律：接口约束）
2. **chat 防重入的 AbortController 要在 catch 里处理 AbortError**（不是所有 catch 都是错误）
3. **composeSystemPrompt 保持各入口的 user prompt 独立**（intro/transition/chat 内容不同，只统一 system 部分）
4. **删完功能 grep 全项目含 .md**（铁律 6）

---

*本规格是打磨轮收尾。P1 立刻做，P2+P3 一轮做完，P4 建议暂缓（等可复现竞态再做）。做完后项目进入"日常使用"阶段。*
