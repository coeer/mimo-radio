---
author: ZCode（规划者，派给 MiNiMax 执行）
task: 剩余事项 3 批（SSRF + backlog + InputArea/F4）
created: 2026-07-18
executor: MiNiMax
basis: docs/ZCode/audits/full-review-2026-07-18.md + 已修订的 F4/backlog 规格
baseline: 后端 288 passed / 32 文件，前端 189 passed / 23 文件，tsc 双零（ZCode 2026-07-18 实跑核实）
---

# 剩余事项计划（MiNiMax 执行，3 批）

> **来源**：全面审核 + 短期清理后的剩余项。本计划是 mimo-radio 进入"日常使用"前的最后一批技术债清理。
>
> **不含（你做，非代码）**：
> - 🔴 **撤销 GitHub PAT + 改 SSH**（full-review P0-1）—— 这是用户操作，MiNiMax 做不了。命令见 §附。
>
> **纪律**：严格按规格，遇规格未覆盖 → NEEDS_CONTEXT 停下问。每批跑 tsc+vitest 全绿才 commit。

---

## 〇、写给 MiNiMax 的话（前科提醒）

### ⚠️ 前科 1（SSRF 改造）：同步 → 异步的传导

批 1 的 SSRF 改造要把 `isSafeUrl` 从同步改成异步（`dns.lookup` 返回 Promise）。**传导面**：所有调 `isSafeUrl` 的地方都要 await。改之前先 grep 全部调用点（fetchWithTimeout），确认每处都在 async 函数里 + 改成 await。**别漏调用点**——漏一处 tsc 会报错，但逻辑上的"忘了 await 直接拿 Promise 当 boolean 用"tsc 不一定报（取决于写法），会静默失效。

### ⚠️ 前科 2（F4 仲裁层）：规格已修订，照修订版做

F4 规格 `docs/KIMI/plans/plan-f4-isplaying-arbiter-2026-07-18-KIMI.md` 经 ZCode 修订（带 `[ZCode 修订]` 标记）。**以修订版为准**，特别注意：
- §3.1 的 nextSong/prevSong **两阶段改法**（原方案漏洞，ZCode 补的）
- §四场景 1 的 ZCode 裁决（用户优先放歌）
- §四场景 8（nextSong → 旧 transition onEnd 丢弃）

### ⚠️ 前科 3（InputArea 结构性改动）：先读 djIntroToSong 测试

InputArea 改造涉及录音生命周期。**改前先 Read** `djIntroToSong.test.ts` / `djIntroToSong.e2e.test.ts`，理解 ASR 链路怎么用 InputArea 的录音产物。改完确保这俩测试不回归（它们是 InputArea 的契约保护）。

### ⚠️ 前科 4（铁律 5 性能证据）：F4 仲裁层是性能/竞态改动

F4做完要 E2E 证据（连发 chat + 快速换歌 + DJ 串词，DOM 观察无双 PLAYING 错乱）。不接受"待实测"。

---

## 批 1：SSRF IPv6 + DNS 解析校验（commit：`fix: SSRF IPv6 绕过修复 + DNS 解析校验`）

> 全面审核 P0-2。当前 `isSafeUrl` 只做字符串正则，IPv6 全形态绕过 + 无 DNS rebinding 防护。

### B1-1 isSafeUrl 补 IPv6 字面量匹配

**根因**（ZCode 核实）：`ssrfGuard.ts:82` `hostname = parsed.hostname.toLowerCase()`，Node URL 对 IPv6 返回**带方括号** `[::1]`，而正则 `/^::1$/`（无方括号）永不匹配。

**改法**（`backend/src/utils/ssrfGuard.ts`）：
```ts
// PRIVATE_IP_PATTERNS 之前，hostname 提取处
const rawHostname = parsed.hostname.toLowerCase()
// IPv6 字面量 Node URL 返回带方括号 [::1]，正则去方括号后匹配
const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
  ? rawHostname.slice(1, -1)
  : rawHostname

// PRIVATE_IP_PATTERNS 补 IPv4-mapped IPv6（::ffff:127.0.0.1 等绕过形态）
const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
  /^0\./, /^169\.254\./,
  /^::1$/, /^fc00:/i, /^fe80:/i,
  // IPv4-mapped IPv6（::ffff:127.0.0.1 → 绕过 v4 规则）
  /^::ffff:/i,
  // IPv6 6to4（2002: 开头，可能映射私网）—— 保守拦截
  /^2002:/i,
]
```

### B1-2 isSafeUrl 改异步 + 加 DNS 解析校验

**根因**：无 `dns.lookup`，DNS rebinding 可绕（公网域名解析到内网 IP）。

**改法**（`isSafeUrl` 签名 + 实现改为 async）：
```ts
import { lookup } from 'dns/promises'
import { isIP } from 'net'

// 改为 async
export async function isSafeUrl(urlString: string): Promise<{ safe: true } | { safe: false; reason: string }> {
  // ... 原协议/localhost/正则检查（同步部分，先过滤明显非法）

  // 新增：DNS 解析校验（防 rebinding + IPv4-mapped）
  // 只对"看起来是域名"的 host 解析（IP 字面量跳过，已由正则覆盖）
  if (!isIP(hostname)) {
    try {
      const { address } = await lookup(hostname, { all: true }).then(rs => rs[0])
      const lowerAddr = address.toLowerCase()
      // 解析结果若是私网 IP → 拒绝（fail-closed）
      const resolvedIsPrivate = PRIVATE_IP_PATTERNS.some(p =>
        p.test(lowerAddr.startsWith('::ffff:') ? lowerAddr.slice(7) : lowerAddr)
      )
      if (resolvedIsPrivate) {
        return { safe: false, reason: `hostname resolves to private IP ${address}` }
      }
    } catch {
      // DNS 解析失败 → fail-closed（视为 unsafe）
      return { safe: false, reason: 'DNS resolution failed' }
    }
  }

  return { safe: true }
}
```

**注意**：
- 白名单 host（SSRF_ALLOW_HOSTS）解析到内网不应拦截（它们是可信的）——**先查白名单再 DNS 校验**（白名单优先）。当前 isSafeUrl 没查白名单（白名单在 fetchWithTimeout 里查），**改前 Read fetchWithTimeout 确认白名单查询位置**，确保改造后白名单仍优先于 DNS 校验。
- `dns.lookup` 是真实外部调用，测试要 mock（vi.mock('dns/promises')）。

### B1-3 调用点传导：fetchWithTimeout 改 await

**grep 调用点**：
```bash
grep -rn "isSafeUrl" backend/src/ --include="*.ts" | grep -v "\.test\."
```
预期命中 `fetchWithTimeout.ts`。**改前 Read** 该文件确认调用方式，改成 `await isSafeUrl(url)`。

### 验证
```bash
cd backend && npx tsc --noEmit   # 零错误（async 传导正确）
cd backend && npx vitest run     # 全过
```
**新增测试** `ssrfGuard.test.ts`（若已有则补用例）：
- `http://[::1]:8080/` → safe:false（IPv6 字面量不再绕过）
- `http://[fd00::1]/` → safe:false
- `http://[::ffff:127.0.0.1]/` → safe:false（IPv4-mapped）
- mock dns.lookup 返回 127.0.0.1 → safe:false（rebinding 防护）
- mock dns.lookup 失败 → safe:false（fail-closed）
- 白名单 host 解析到内网 → safe:true（白名单优先）—— **需确认白名单查询点，可能此用例在 fetchWithTimeout.test.ts**

**边界**：不改 SSRF_ALLOW_HOSTS / SSRF_ALLOW_HOST_PORTS 白名单内容。不改 fetchWithTimeout 的熔断逻辑。

---

## 批 2：backlog 剩余 6 项（commit：`fix: backlog 剩余 6 项`）

> 全部是已修订 backlog 方案 `docs/KIMI/plans/plan-backlog-15-2026-07-18-KIMI.md` 里的项，ZCode 已修订过规格。**以那份修订版为准**（带 `[ZCode 修订]` 标记），本批只列要做的项 + 关键约束。

### B2-1 generalLimiter 排除 /health 和 /static（backlog B1-2）
- 位置：`backend/src/app.ts:47-56`
- 改法：rateLimit 配置加 `skip: (req) => req.path === '/health' || req.path.startsWith('/static')`
- 验证：express-rate-limit v8 的 skip 返回 true 不计数

### B2-2 logger 换行 sanitize（backlog B1-3）
- 位置：`backend/src/utils/logger.ts` formatLog 函数（:134+），message 拼进日志串前
- 改法：`const safeMsg = String(message).replace(/[\r\n]/g, ' ')`，日志拼接用 safeMsg
- 验证：新增用例，带 `\n` 的 msg → 输出单行

### B2-3 session 消息 timestamp 填真实时间（backlog B2-3）
- 位置：`backend/src/routes/radio.ts` **6 处** `timestamp: 0`（line 158/165/240/247/288/421，改前 grep 确认）
- 改法：6 处全改 `timestamp: Date.now()`
- 验证：`grep -c "timestamp: 0" backend/src/routes/radio.ts` → 0

### B2-4 radio.ts sanitize 重复调用合并（backlog B2-4）
- 位置：`backend/src/routes/radio.ts:281,400`（同一 text 二次 sanitize）
- 改法：第一次 sanitize 结果复用，第二次直接用变量
- 验证：chat 相关测试全绿

### B2-5 feedback 表 TTL 清理（backlog B2-5，⚠️ 修正反模式）
- 位置：`backend/src/db/index.ts` + `backend/src/index.ts:52`
- **关键（ZCode 修订）**：feedback 表有 `created_at`（已核实），无需降级。但**别照抄 startSessionCleanup**——它只有 setInterval 无 clearInterval（反模式）。新代码要更规范：
  ```ts
  let feedbackCleanupTimer: NodeJS.Timeout | null = null
  export function startFeedbackCleanup(): void {
    cleanupOldFeedback()
    feedbackCleanupTimer = setInterval(cleanupOldFeedback, CLEANUP_INTERVAL_MS)
  }
  export function stopFeedbackCleanup(): void {
    if (feedbackCleanupTimer) { clearInterval(feedbackCleanupTimer); feedbackCleanupTimer = null }
  }
  ```
  并在 index.ts 进程退出钩子（SIGINT/SIGTERM，若无则新增）里调 stopFeedbackCleanup + stopSessionCleanup（顺带给 session cleanup 也补停止）。
- cleanupOldFeedback：`DELETE FROM feedback WHERE created_at < ?`（cutoff = now-90d）
- 验证：新增用例（插过期 feedback → cleanup 后查空）

### B2-6 API 响应结构统一（backlog B2-1）
- 位置：`backend/src/routes/musicSource.ts:49,65,73,83` + `qqmusic.ts:46,66,82`
- 改法：统一为 `{ success: false, error: { message, code } }`
  - musicSource `:49` `{ error: '无法...' }` → `{ success:false, error:{ message:'无法...', code:'PLAYBACK_UNAVAILABLE' } }`
  - musicSource `:65,83` `{ error:'未知音源' }` → `{ success:false, error:{ message:'未知音源', code:'UNKNOWN_SOURCE' } }`
  - musicSource `:73` 保留 switchedTo 字段，error 改对象
  - qqmusic `:46` Read 确认当前结构后统一
  - qqmusic `:66,82` `{ success:false, error:'...', mid }` → `{ success:false, error:{ message:'...', code:'NOT_FOUND' }, mid }`
- 验证：相关测试同步；前端若有解构这些 error 的地方 grep 确认不破坏（`grep -rn "error.message\|\.error" frontend/src`）

### 验证（批 2 全部）
```bash
cd backend && npx tsc --noEmit && npx vitest run   # ≥288
cd frontend && npx tsc --noEmit && npx vitest run  # ≥189
```

---

## 批 3：InputArea 录音 cleanup + F4 仲裁层（commit：2 个，分别 commit）

> 这批是结构性改动，最高风险。**两项分别 commit**（不要混在一个 commit）。

### B3-1 InputArea MediaRecorder/stream unmount cleanup

**根因**：`InputArea.tsx:20` `mediaRecorderRef` + :45 `stream` 在事件回调创建，**组件无 unmount cleanup effect**。录音中跳页/卸载 → MediaRecorder + audio track 泄漏，onstop 回调继续 setState 已卸载组件。

**改前必读**：
- `frontend/src/components/InputArea.tsx` 全文（178 行）
- `frontend/src/hooks/djIntroToSong.test.ts` + `.e2e.test.ts`（ASR 链路契约）

**改法**（加 unmount cleanup + 守卫 setState）：
```tsx
// 1. stream 也用 ref 存（当前只有 mediaRecorderRef）
const streamRef = useRef<MediaStream | null>(null)

// 2. startRecording 里创建 stream 后存 ref
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
streamRef.current = stream   // ← 新增

// 3. 加 unmount cleanup effect（铁律 1：注册与清理同 effect）
useEffect(() => {
  return () => {
    // 组件卸载时主动停录音 + 释放 track
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }
}, [])

// 4. onstop 回调里的 setState 加 mounted 守卫（防卸载后 setState）
//    用一个 mountedRef，mount 时 true，cleanup 时 false
const mountedRef = useRef(true)
useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
// onstop 内每次 setState 前：if (!mountedRef.current) return
```

**验证**：
```bash
cd frontend && npx tsc --noEmit
cd frontend && npx vitest run   # ≥189，djIntroToSong 两测试文件必须全绿
```
**E2E（推荐）**：录音中切换页面 → 观察 DevTools Media 面板 track 是否释放（无残留红色录制指示）。

**边界**：不动 ASR 上传逻辑（onstop 里的 fetch）、不动 UI 渲染。只加生命周期清理。

### B3-2 F4 isPlaying 仲裁层

**规格**：`docs/KIMI/plans/plan-f4-isplaying-arbiter-2026-07-18-KIMI.md`（ZCode 修订版，带 `[ZCode 修订]` 标记）

**执行要点**（见规格，不重复）：
- store 新增 `playRequest(action, source)` + `pendingResume`
- 12 写点迁移（8 组件/hook + 4 store 内部）
- **nextSong/prevSong 两阶段**（§3.1，ZCode 补的设计）
- 场景 1 裁决：用户优先放歌
- 新增场景 8 测试

**验证**：规格 §五（覆盖矩阵 1-8 + djIntroToSong 不回归 + E2E 证据）。

**commit**：`fix: F4 isPlaying 仲裁层——单点 playRequest 取代 12 处直写`

---

## 交付与验收

### Commit 顺序
```bash
# 批 1
git add -A && git commit -m "fix: SSRF IPv6 绕过修复 + DNS 解析校验"
# 批 2
git add -A && git commit -m "fix: backlog 剩余 6 项（limiter skip/logger/timestamp/sanitize/feedback TTL/API envelope）"
# 批 3（2 个 commit）
git add -A && git commit -m "fix: InputArea MediaRecorder unmount cleanup + setState 守卫"
git add -A && git commit -m "fix: F4 isPlaying 仲裁层——单点 playRequest 取代 12 处直写"
git push origin master
```

### 执行报告（4 份，每批/每项一份）
- `docs/MiNiMax/reports/exec-ssrf-2026-07-18-MiNiMax.md`
- `docs/MiNiMax/reports/exec-backlog-rest-2026-07-18-MiNiMax.md`
- `docs/MiNiMax/reports/exec-inputarea-cleanup-2026-07-18-MiNiMax.md`
- `docs/MiNiMax/reports/exec-f4-arbiter-2026-07-18-MiNiMax.md`

8 节齐全。重点：
- 批 1：async 传导完整性（grep 调用点数 + 每处改了）+ IPv6 测试矩阵
- 批 2：B2-5 feedback cleanup 的 stop 函数 + 进程钩子
- 批 3-1：djIntroToSong 测试不回归 + mounted 守卫
- 批 3-2：F4 场景 1-8 矩阵 + E2E 证据（铁律 5）

---

## §附：用户自己做的事（非本计划代码任务）

### 🔴 撤销 GitHub PAT（全面审核 P0-1，拖了多轮）

```bash
# 1. 在 GitHub 撤销：Settings → Developer settings → Personal access tokens → 删除 ghp_lYWv... 那个
# 2. 改 SSH（推荐）
git remote set-url origin git@github.com:coeer/mimo-radio.git
git remote -v   # 确认不再含 token
# 3. 配 SSH key（若未配）：ssh-keygen + 上传公钥到 GitHub
```
**这是你的操作，MiNiMax 做不了。建议现在就做**——每多拖一轮多一份泄漏风险。

---

*本计划由 ZCode 规划者派出。MiNiMax 完成后报告落盘，用户中转给 ZCode 复核。批 3（F4）做完后，mimo-radio 进入"日常使用"阶段。*
