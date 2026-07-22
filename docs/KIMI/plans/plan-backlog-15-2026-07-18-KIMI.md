---
author: KIMI
task: 整合方案「顺带提醒」backlog 15 项批量清理（方案规格，ZCode 已审修订版）
created: 2026-07-18
status: ZCode 已审（2026-07-18），规格修订版 → 执行者实现
basis: docs/KIMI/fix-plan-integrated-2026-07-17.md 顺带提醒节（line 575-593）
revision: 2026-07-18 ZCode 源码核实修订（基线数字 / B1-3 行号 / B2-3 六处 / B2-5 时间字段已确认 + 反模式修正 / B3-2 改法精确化）
---

# backlog 15 项批量清理 任务规格

> 全部为小切口机械修复。按"安全 4 项 / 正确性 6 项 / 体验 5 项"分 3 个 commit。
> **基线：后端 277 passed / 32 文件，前端 179 passed / 23 文件，tsc 双零（ZCode 2026-07-18 实跑核实）**[ZCode 修订：原写 288/189，实跑为 277/179]——每项做完跑对应端验证，失败即停。
>
> **修订说明（ZCode 2026-07-18）**：本方案经 ZCode 源码核实后修订。修订项见各节 `[ZCode 修订]` 标记。

## 批 B1：安全（commit 1：`fix: backlog 安全 4 项`）

### B1-1 sessionAuth 仅 header 传 token
- 位置：`backend/src/middleware/sessionAuth.ts`（读 query 的分支）
- 改法：删除 `req.query.session_token` 回退，只认 `X-Session-Token` header；前端 grep 确认无 query 传参（`grep -rn "session_token=" frontend/src`）
- 验证：sessionAuth 测试更新（query 传 token → 401）；全量后端测试

### B1-2 generalLimiter 排除 /static 和 /health
- 位置：`backend/src/app.ts:47` generalLimiter 定义（[ZCode 修订] 确认在 app.ts 不在 index.ts）
- 改法：加 `skip: (req) => req.path === '/health' || req.path.startsWith('/static')`（TTS 音频拉取消耗 200/15min 配额不合理）
- 验证：新增用例或手测 200+ 次 /health 不 429
- **[ZCode 修订] 补充**：express-rate-limit v8（已确认 `^8.5.1`）的 `skip` 返回 true 的请求**不计数器**（符合预期）。执行者报告里验证一次：`skip` 生效后 /health 连打不触发 429。

### B1-3 log.ts 防日志伪造
- 位置：`backend/src/routes/log.ts` **POST handler 内，msg 拼进日志字符串之前**（`logger.xxx('[frontend] ${msg}', meta)` 各分支）[ZCode 修订：原写 `:36` 错误——:36 是 `msg: z.string().max(2000)` schema 定义行；msg 并不"入库"，而是经 logger 写日志文件。改法位置应为 4 个 logger 分支的 msg 拼接处]
- 改法：msg 拼进日志串前 `String(msg).replace(/[\r\n]/g, ' ')`（防换行伪造日志行）。建议在 handler 开头解构后立即 sanitize：
  ```ts
  const { level, ctx } = req.body as z.infer<typeof logSchema>
  const msg = String(req.body.msg).replace(/[\r\n]/g, ' ')  // ← 防日志伪造
  ```
- 验证：新增用例：带 `\n` 的 msg → logger 输出为单行（mock logger 捕获写入内容）

### B1-4 ssrfGuard 补 DNS 解析校验
- 位置：`backend/src/utils/ssrfGuard.ts`
- 改法：isSafeUrl 增加 `dns.lookup` 解析真实 IP 校验（域名解析到内网 IP 也拦）+ IPv6 方括号形态（`[::1]`、`[fd00::]`）识别
- 验证：新增用例：`[::1]` 形态、内网域名 mock dns.lookup → blocked
- ⚠️ 本项是 15 项里唯一涉及外部调用的，dns.lookup 失败时的终态要写清（fail-closed：解析失败视为 unsafe）

## 批 B2：正确性（commit 2：`fix: backlog 正确性 6 项`）

### B2-1 错误响应结构统一
- 位置：`backend/src/routes/qqmusic.ts:48`、`backend/src/services/musicSource.ts:49`
- 改法：统一为 `{ success: false, error: { message, code } }`（对齐 apiResponse）
- 验证：grep 两文件响应结构；相关测试更新

### B2-2 djPersona POST /generate 补 zod 校验
- 位置：`backend/src/routes/djPersona.ts:29`
- 改法：加 validateBody（字段约束抄 dj.ts 既有 schema 风格）
- 验证：非法 body → 400 用例

### B2-3 session 消息 timestamp 填真实时间
- 位置：`backend/src/routes/radio.ts` **6 处 `timestamp: 0`**（line 158/165/240/247/288/421）[ZCode 修订：原写"恒 0"单数，实为 6 处，全改]
- 改法：6 处全部改为 `timestamp: Date.now()`；前端 `addMessage({timestamp: 0})` 各调用点同步评估（`grep -rn "timestamp: 0" frontend/src`，一并改真实值或由 addMessage 内部默认）
- 验证：`grep -c "timestamp: 0" backend/src/routes/radio.ts` 返回 0；消息时间非 0；前端 KimiCard/chat 渲染不回归

### B2-4 radio.ts sanitize 重复调用合并
- 位置：`backend/src/routes/radio.ts:280,399`（sanitizedText / wrappedInput 对同一 text 重复 sanitize）
- 改法：合并为一次 sanitize 结果复用
- 验证：chat 相关测试全绿

### B2-5 feedback 表 TTL 清理任务
- 位置：`backend/src/db/index.ts` + `backend/src/index.ts:52`（`startSessionCleanup()` 调用处）
- **[ZCode 修订] 时间字段已确认存在**：feedback 表 INSERT 含 `created_at`（`db/index.ts:102`），无需降级，直接按 created_at 做 TTL。
- 改法：feedback 加 90 天 TTL 定期清理
- **[ZCode 修订] ⚠️ 不要照抄 startSessionCleanup——它是反模式**：现 `startSessionCleanup`（db/index.ts:272-276）只有 `setInterval`，**没有 clearInterval、没有 try/finally、没有停止机制**。铁律 1 要求"资源分配与清理成对出现在同一个 try/finally 里"。新写的 feedback 清理任务必须比它更规范：
  ```ts
  // 正确模式（不是照抄 startSessionCleanup）：
  let feedbackCleanupTimer: NodeJS.Timeout | null = null
  export function startFeedbackCleanup(): void {
    cleanupOldFeedback()  // 启动即跑一次
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
  并在 `index.ts` 的进程退出钩子（SIGINT/SIGTERM，若已有则补，没有则新增）里调 `stopFeedbackCleanup()`。
- 验证：新增用例（插入 `created_at < now-90d` 的 feedback → cleanupOldFeedback() 后查询为空）

### B2-6 useSession setHandlers 挪进 useEffect
- 位置：`frontend/src/hooks/useSession.ts:16-52`（handlersRegistered ref 在渲染期执行——React 并发模式下渲染可重入，ref 模式不可靠）
- 改法：挪进 `useEffect(..., [])`（铁律 1：注册与清理同 effect）
- 验证：djIntroToSong 两个测试文件全绿（这是它的核心链路）

## 批 B3：体验与工程（commit 3：`chore: backlog 体验 5 项`）

### B3-1 manifest theme_color 对齐
- 位置：`frontend/public/manifest.json` vs `frontend/src/app/layout.tsx` 的 `#06060a`
- 改法：统一为 `#06060a`

### B3-2 settings 页试听竞态防护
- 位置：`frontend/src/app/settings/page.tsx:55-86` `previewVoice` [ZCode 修订：已源码定位，原写"grep 定位"太模糊]
- **[ZCode 修订] 现状核实**：试听逻辑**已用 `previewAudioRef.current.pause()` 停掉上一个 audio**（line 57-60），所以"无竞态防护"描述不准。真正的隐患是 **`fetch` 没有 AbortController**——连点两个音色，第一个 fetch resolve 后仍会 `new Audio(url).play()`，与第二个叠加双音轨。
- 改法：给 `previewVoice` 的 fetch 加 AbortController（复用 useTTS ttsAbortRef 同源模式）：
  ```ts
  const previewAbortRef = useRef<AbortController | null>(null)  // 新增

  const previewVoice = useCallback(async (voice: VoiceInfo) => {
    // 停掉上一个试听（audio + fetch 都要停）
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null }
    if (previewAbortRef.current) { previewAbortRef.current.abort() }  // ← 新增：取消在途 fetch
    const controller = new AbortController()
    previewAbortRef.current = controller
    setPreviewing(voice.id)
    setTtsVoice(voice.id)
    try {
      const res = await fetch(`${API_BASE}/api/v1/dj/tts`, {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ text, voice: voice.id }),
        signal: controller.signal,  // ← 新增
      })
      // ... 原有逻辑
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return  // 静默
      setPreviewing(null)
    }
  }, [setTtsVoice])

  // 组件卸载 cleanup 里也 abort（既有 line 88-94 的 useEffect 已停 audio，补上 abort）
  ```
- 验证：连点两个音色 → 只有第二个发声；第一个 fetch 被 abort（catch 到 AbortError 静默）

### B3-3 打字机文本 aria-hidden
- 位置：`frontend/src/components/TypewriterText.tsx`
- 改法：动态追加部分 `aria-hidden`，完整文本放 sr-only（屏幕阅读器不逐字复读）

### B3-4 planner.ts 补测试（并发去重 + 缓存）
- 位置：`backend/src/services/planner.ts`
- 改法：新增 planner.test.ts：并发 2 次 generateDailyPlan 只算一次；24h 内第二次走缓存
- 验证：新测试通过

### B3-5 app.set('trust proxy', 1)
- ⚠️ **先确认部署形态再动**：本地单用户直连不需要；若部署在反代后再加。规格原注"确认部署在反代之后再加"——默认**跳过本项**，执行报告注明原因

## 验收

- 每批：对应端 `npm test && npx tsc --noEmit` 全绿才 commit
- 全部做完：**基线 ≥ 277/179**（只允许因新增用例上升）[ZCode 修订：原写 288/189]
- 报告：`docs/KIMI/reports/exec-backlog-<日期>-KIMI.md`（每项一节）

## 边界

- 不做：SSE/WebSocket（已否决）、F4 仲裁层（方案 A 独立做）、songs 表删表、git filter-repo

---

*方案由 KIMI 生成。*
