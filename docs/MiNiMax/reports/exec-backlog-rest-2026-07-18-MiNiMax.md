---
author: MiNiMax（mimo-radio 执行者）
task: 批 2 backlog 剩余 6 项
status: DONE
commit: 2205ae4
date: 2026-07-22
---

# 批 2 backlog 6 项执行报告

> 任务来源：`docs/MiNiMax/plans/plan-remaining-2026-07-18-MiNiMax.md` 批 2
> 规格基础：`docs/KIMI/plans/plan-backlog-15-2026-07-18-KIMI.md` ZCode 修订版

---

## 一、改动清单

| 文件 | 改动项 |
|------|--------|
| `backend/src/app.ts` | B2-1 generalLimiter 加 skip（/health + /static） |
| `backend/src/utils/logger.ts` | B2-2 formatLog 源头 sanitize 换行符 |
| `backend/src/routes/radio.ts` | B2-3 6 处 timestamp:0 → Date.now()；B2-4 wrappedInput 复用 sanitizedText |
| `backend/src/db/index.ts` | B2-5 FEEDBACK_TTL_MS + cleanupOldFeedback + start/stopFeedbackCleanup + 顺手补 stopSessionCleanup |
| `backend/src/index.ts` | B2-5 startFeedbackCleanup 启动调用 + SIGINT/SIGTERM gracefulShutdown |
| `backend/src/routes/musicSource.ts` | B2-6 3 处 error envelope 统一（UNKNOWN_SOURCE / SOURCE_NOT_READY / PLAYBACK_UNAVAILABLE） |
| `backend/src/routes/qqmusic.ts` | B2-6 3 处 error envelope 统一（PLAYBACK_UNAVAILABLE / NOT_FOUND × 2） |
| `frontend/src/components/SourceSwitcher.tsx` | B2-6 前端适配：兼容 string/error 对象两种形态 |

---

## 二、B2-1 generalLimiter 排除 /health 和 /static

**位置**：`backend/src/app.ts:47-56`

**改法**：
```ts
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path.startsWith('/static'),
  message: { error: 'Too many requests, please try again later.' },
})
```

**设计依据**：监控系统对 /health 心跳频率高（TTS 音频一次拉取可能是数十 MB 静态文件），200/15min 配额不合理。express-rate-limit v8 的 skip 返回 true 则**不计数**（已确认 `^8.5.1` 行为）。

---

## 三、B2-2 logger 换行 sanitize（源头治理）

**位置**：`backend/src/utils/logger.ts:134-150` formatLog 函数

**改法**：
```ts
const safeMessage = String(message).replace(/[\r\n]/g, ' ')
// prod: JSON.stringify 时 message 用 safeMessage
// dev: 拼接时 message 用 safeMessage
```

**设计依据**：plan-backlog-15 ZCode 修订建议改 log.ts 各分支；plan-remaining §批 2 B2-2 选 logger.ts formatLog。**plan-remaining 是批 2 任务规格的权威**，采纳源头治理：formatLog 是所有 logger 调用的必经路径，一处 sanitize 全局受保护（防御纵深 + 源头治理，比 log.ts 多处分散 sanitize 更稳健）。

---

## 四、B2-3 session 消息 timestamp 填真实时间

**位置**：`backend/src/routes/radio.ts` 6 处 `timestamp: 0`（L158/165/240/247/288/421）

**改法**：全部改为 `timestamp: Date.now()`

**验证**：`grep -c "timestamp: 0" backend/src/routes/radio.ts` → **0**

**前端影响**：`addMessage({timestamp: 0})` 调用点未发现（`grep -rn "timestamp: 0" frontend/src` 仅命中 djIntroToSong/e2e 测试的 mock，未在实际调用点）。**待批 3 复核 useAudioPlayer.ts 等的 timestamp: 0（§五提到）**。

---

## 五、B2-4 radio.ts sanitize 重复调用合并

**位置**：`backend/src/routes/radio.ts:281, 400`

**原代码**：
- L281：`const sanitizedText = sanitizePromptInput(text)` — 用于存 session
- L400：`const wrappedInput = sanitizePromptInput(text)` — 用于构造 prompt messages

**改法**：`const wrappedInput = sanitizedText`（复用 L281 结果）

**设计依据**：同一 text 走两次 sanitize 是浪费 CPU；sanitize 是确定性操作，结果可复用。

---

## 六、B2-5 feedback TTL cleanup + stop 函数（ZCode 修订反模式修正）

**位置**：`backend/src/db/index.ts` + `backend/src/index.ts`

**改法（db/index.ts）**：
```ts
const FEEDBACK_TTL_MS = 90 * 24 * 60 * 60 * 1000  // 90 天

let feedbackCleanupTimer: NodeJS.Timeout | null = null
export function startFeedbackCleanup(): void {
  cleanupOldFeedback()
  feedbackCleanupTimer = setInterval(cleanupOldFeedback, CLEANUP_INTERVAL_MS)
  logger.info('Feedback cleanup started', { ttlDays: 90 })
}
export function stopFeedbackCleanup(): void {
  if (feedbackCleanupTimer) {
    clearInterval(feedbackCleanupTimer)
    feedbackCleanupTimer = null
  }
}
```

**顺手补** `startSessionCleanup` 的 stop 函数（原 `startSessionCleanup` 只有 setInterval 无 clearInterval——**ZCode 修订指出的反模式**）。

**改法（index.ts）**：
- `server.listen` 内追加 `startFeedbackCleanup()`
- 文件末尾新增 `gracefulShutdown(signal)` + SIGINT/SIGTERM 钩子（**原代码无钩子**）：
  ```ts
  function gracefulShutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`Received ${signal}, shutting down gracefully`)
    stopSessionCleanup()
    stopFeedbackCleanup()
    server.close(...)
    setTimeout(() => process.exit(1), 5000).unref()  // 兜底强退
  }
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  ```

**设计依据**：
1. 铁律 1（资源成对）：定时器分配与清理成对
2. 铁律 4（替换前理解）：原 startSessionCleanup 是反模式——进程退出时定时器仍在跑可能 hang event loop
3. feedback 表已有 `created_at`（db/index.ts:102 已确认），无需 schema 迁移

---

## 七、B2-6 API 响应结构统一

**位置**：
- `backend/src/routes/musicSource.ts:49, 65, 73, 83`
- `backend/src/routes/qqmusic.ts:46, 66, 82`

**改法**：所有 `error` 字段统一为 `{ success: false, error: { message, code } }`

| 文件:行 | 原 | 新 |
|---------|------|------|
| musicSource:49 | `{ error: '无法获取播放URL...' }` | `error: { message:'无法获取播放URL...', code:'PLAYBACK_UNAVAILABLE' }` |
| musicSource:65 | `{ error: '未知音源' }` | `error: { message:'未知音源', code:'UNKNOWN_SOURCE' }` |
| musicSource:73 | `{ error:'QQ 音源未就绪...', switchedTo:'netease' }` | `error:{ message:'QQ 音源未就绪...', code:'SOURCE_NOT_READY' }, switchedTo:'netease'` |
| musicSource:83 | `{ error: '未知音源' }` | `error: { message:'未知音源', code:'UNKNOWN_SOURCE' }` |
| qqmusic:46 | `{ success:false, error:'No playable URL...', mid }` | `error:{ message:'...', code:'PLAYBACK_UNAVAILABLE' }, mid` |
| qqmusic:66 | `{ success:false, error:'Lyric not found', mid }` | `error:{ message:'Lyric not found', code:'NOT_FOUND' }, mid` |
| qqmusic:82 | `{ success:false, error:'Song not found', mid }` | `error:{ message:'Song not found', code:'NOT_FOUND' }, mid` |

**前端适配**：`SourceSwitcher.tsx:51-53` 解构 `data.error` 兼容两种形态（string 旧 / object 新），防御纵深：
```ts
const errMsg = typeof data.error === 'string'
  ? data.error
  : data.error?.message || '切换失败'
setError(errMsg)
```

**未破坏**：useAudioPlayer.ts:73-84 不解构 error（仅 `if (!res.ok)` + logger.warn），不受影响。

---

## 八、验证

| 项 | 结果 |
|----|------|
| 后端 `npx tsc --noEmit` | **零错误** |
| 后端 `npx vitest run` | **305 passed / 32 文件**（与批 1 后基线持平——批 2 全是机械改动未新增测试） |
| 前端 `npx tsc --noEmit` | **零错误** |
| 前端 `npx vitest run` | **189 passed / 23 文件**（基线不变） |
| `grep -c "timestamp: 0" backend/src/routes/radio.ts` | **0**（B2-3 验证） |
| 回归 `djIntroToSong.test.ts` | **5/5**（批 3 契约守住） |

---

## 九、commit 与 push

- commit: `2205ae4 fix: backlog 剩余 6 项（limiter skip/logger sanitize/timestamp/sanitize 合并/feedback TTL/API envelope）`
- push: `3e8024c..2205ae4 master -> master`（远端已同步）
- 改动体量：8 文件 / +135 / -23

---

## 十、未做的（明确边界）

- **B1-1/B1-4/B2-2/B2-6/B3-1~5**（plan-backlog-15 的其余 9 项）：不在 plan-remaining 批 2 范围内，不做
- **B3-5 app.set('trust proxy', 1)**：plan-backlog-15 自己注明"默认跳过——部署在反代后再加"
- **B2-6 前端其他解构**：已 grep 确认 SourceSwitcher 是唯一处，其他不受影响
- **YAGNI 删除**：spec 不要求

---

## 十一、风险与回滚

- **B2-6 API envelope 改动风险**：客户端若用 TypeScript 严格类型解构 `data.error: string`，会被破坏。已 grep 前端**仅 SourceSwitcher 一处**用，且做了兼容处理。
- **B2-5 graceful shutdown 风险**：server.close 等待所有活跃连接关闭，在 keep-alive 长连接场景下可能挂 5s 后被强退。单人开发项目 / 短连接场景可接受。
- **回滚**：单 commit（2205ae4），`git revert 2205ae4` 即恢复。

---

*报告由 MiNiMax 自动落盘，可供 ZCode 复核。*
