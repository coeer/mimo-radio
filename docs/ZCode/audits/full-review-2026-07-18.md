---
author: 规划者（ZCode）
task: mimo-radio 全面审核（master @ 87915cd）——安全/正确性/工程卫生三维度 + P0b/P1/P2 diff 核实
created: 2026-07-18
audience: 用户、KIMI、MiNiMax
method: 3 个 Explore agent 横扫 + ZCode 亲自核实高风险点 + 独立跑基线
status: 完成
---

# ZCode 全面审核报告：mimo-radio master 现状

> **审核范围**：master HEAD `87915cd`，含 KIMI 未审先合的 P0a+P0b+P1+P2（4 commit）。
> **方法**：①3 个 Explore agent 并行横扫（安全/正确性/工程卫生）；②ZCode 亲自核实 5 个高风险点；③独立跑 tsc+vitest 确认基线。
> **原则**：不盲信任何报告（含 KIMI 自审 + agent 扫描），关键发现逐条源码核实。

---

## 〇、基线核实（独立实跑）

| 层 | 文件数 | 测试数 | tsc |
|----|--------|--------|-----|
| 后端 | 32 | **288 passed** | 零错误 |
| 前端 | 23 | **189 passed** | 零错误 |

与文档（README/HANDOVER）一致，无回退。

---

## 一、总体结论：**B+（良好，有 2 个必须立即处理的 P0）**

| 维度 | 评级 | 一句话 |
|------|------|--------|
| **安全** | 🟡 **C+** | 2 个 P0（git PAT 泄漏 + SSRF IPv6 绕过）必须立即处理；其余多为 backlog 未落地 |
| **正确性** | 🟢 **A-** | 核心 hook 修复扎实（cleanupRef/ttsAbortRef/chatAbortRef/handleLike getState），无 🔴bug |
| **工程卫生** | 🟢 **B+** | 构建产物零入库、Git 历史干净；有 2 处死代码 + 文档漂移待清 |

**KIMI 的 P0a~P2 执行质量核实**：高。P0b-2 鉴权方向严格按我的调整（非 KIMI 原案）；app 工厂拆分启动顺序完整；异步修复（F2/F3）模式正确。**唯一流程问题是未过 ZCode 复核先 commit**（见前份 review-p0a §二）。

---

## 二、🔴 P0 发现（必须立即处理，2 项）

### P0-1：git remote URL 含明文 GitHub PAT

**核实**：`git remote -v` 输出 `https://coeer:ghp_***@github.com/...`（PAT 已脱敏）。

**风险**：PAT 写进本地 `.git/config`，任何能读该文件的进程/备份都能拿到。虽不在仓库内容里（不随 clone 外泄），但本地泄漏面真实。

**处理（建议你做，不是代码改动）**：
1. **立即在 GitHub 撤销该 token**（Settings → Developer settings → Personal access tokens → 删除）
2. 改用 SSH 或 git credential helper：
   ```bash
   git remote set-url origin git@github.com:coeer/mimo-radio.git
   # 或 https + credential helper（不把 token 写进 URL）
   ```
3. 这是你的操作（规划者不代改 git 配置）

### P0-2：SSRF 防护 IPv6 全形态绕过 + 无 DNS 解析校验

**核实**（`ssrfGuard.ts:3-13` + `:55-84`）：
```ts
const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
  /^0\./, /^169\.254\./,
  /^::1$/,    // ← 无方括号
  /^fc00:/i, /^fe80:/i,
]
// hostname = parsed.hostname.toLowerCase()  ← Node URL 对 IPv6 返回 [::1] 带方括号
```

**绕过实测**（agent 已验）：`http://[::1]:8080/`、`http://[fd00::1]/`、`http://[::ffff:127.0.0.1]/` 全部判 `safe:true`，因为：
- Node `URL.hostname` 对 IPv6 返回**带方括号**的 `[::1]`
- 正则 `/^::1$/` 无方括号 → 永不匹配
- `[::ffff:127.0.0.1]`（IPv4-mapped）连 v4 规则也绕过

**另**：无 `dns.lookup` 校验 → DNS rebinding 可绕（公网域名解析到内网 IP）。

**当前实际风险**：**低**。出站 fetch 目标都是硬编码可信域（mimo/netease/qqmusic）+ env 可控的 mimoBaseUrl/webbridgeUrl，**无用户可控 URL 入口**。但 ssrfGuard 作为防御层形同虚设，一旦未来加用户可控 URL（如"播这个链接"功能）即变高危。

**处理建议**：进 backlog 优先级提升（B1-4 原项）。修法：
```ts
// 1. IPv6 hostname 去方括号再匹配
const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
// 2. 加 dns.lookup 验真实 IP（防 rebinding + IPv4-mapped）
import { lookup } from 'dns/promises'
const { address } = await lookup(hostname)
if (isPrivateIp(address)) return { safe: false, reason: 'resolves to private IP' }
```

---

## 三、P0a~P2 执行质量核实（ZCode 亲自抽验）

### 3.1 P0b-2 鉴权方向 ✅（最高风险点，过关）

**规格要求**（review-supplement 调整 1）：显式 `NODE_ENV=production` 才严格，没配就警告但能跑。

**核实**（`sessionToken.ts:23-33` + `index.ts:16-25`）：
```ts
function getSecret(): string {
  if (config.nodeEnv === 'production') {
    if (!config.sessionSecret && !config.apiKey) throw new Error('FATAL...')
    return config.sessionSecret || config.apiKey!
  }
  return config.sessionSecret || config.apiKey || DEV_FALLBACK_SECRET  // 非 prod 用 fallback
}
```
**完全符合我的调整**。KIMI 没有按它原案"非 dev 拒绝启动"做。✅

### 3.2 P1 异步修复 ✅（F2/F3 模式正确）

- **F2 useAudioPlayer**（`useAudioPlayer.ts:11-15,56-98`）：`cleanupRef` 模式正确，sync cleanup 调 `cleanupRef.current?.()`。✅
- **F3 useTTS**（`useTTS.ts:35-37,55-60,81-111`）：`ttsAbortRef` 复用 chatAbortRef 模式，catch AbortError 静默 return null（不兜底 speechSynth，否则照样双音轨）。✅
- **P1-1 fetchWithTimeout**：5xx 计熔断 + `readBodySafely` 导出，timer 分配/清理同一 try/finally。✅

### 3.3 P2 app 工厂 ✅（启动顺序完整）

**核实**（`app.ts` + `index.ts` 全文）：
- `createApp()` 纯构建，无副作用（不 initDb/listen）✅
- index.ts 启动顺序：`assertSecretConfigured → P0b-2 检查 → initDb → loadPersona → 注册音源/TTS → listen → cleanup + planner 预热` ✅
- 路径级 body-parser 注册在全局之前（R1 顺序正确）✅
- 比我预期干净——这步 KIMI 做得很好

### 3.4 P0a~P2 各项落地状态汇总

| 项 | 规格 | KIMI 执行 | ZCode 核实 |
|----|------|----------|-----------|
| P0a-1 helmet 共享源 | 抽 config | ✅ `HELMET_OPTIONS` | ✅ app.ts:43 引用 |
| P0a-2 端口口径 | 3000/8001 | ✅ 5 文件 | ✅（COLLABORATION/ARCHITECTURE 漂移见 §五）|
| P0a-3 全屏 seek | 照搬 KimiCard | ✅ | ✅ 双调用模式 |
| P0a-4 aiLimiter | 共享单例 | ✅ + skip 偏差合理 | ✅ |
| P0a-5 死代码 | 删 2 文件 | ✅ | ⚠️ HANDOVER:135 残留（我已补标）|
| P0b-1 body 上限 | 路径级覆盖 | ✅ | ✅ 顺序正确 |
| P0b-2 鉴权 | 显式 prod 严格 | ✅ | ✅ **方向正确**（§3.1）|
| P0b-3 F1 收藏 | getState 读最新 | ✅ | ✅（正确性 agent 确认）|
| P0b-4 tasteCache | 分 key | ✅ | ✅ |
| P1-1 fetch | 熔断+readBody | ✅ | ✅ |
| P1-2a F2 监听 | cleanupRef | ✅ | ✅（E2E 环境不具备，单测兜底可接受）|
| P1-2b F3 TTS | ttsAbortRef | ✅ | ✅（同上）|
| P1-2c F5 PlayerBar | 换歌重置 | ✅ | ✅ E2E 实测 |
| P1-3 UPnP 下线 | 铁律 6 | ✅ 代码 | ⚠️ **node-ssdp 死依赖残留**（§5.1）|
| P2-1 构建 | tsconfig+gitignore | ✅ | ✅ dist 零 test.js |
| P2-2 app 工厂 | createApp | ✅ | ✅（§3.3）|
| P2-3 文档 | 更新 | ✅ | ⚠️ 残留漂移（§5.2）|

---

## 四、🟡 正确性债务（非 bug，按优先级）

正确性 agent 结论：**无 🔴bug**。剩余 7 项 🟡 隐患：

| # | 项 | 位置 | 状态 | 优先级 |
|---|----|------|------|--------|
| 1 | **F4 setIsPlaying 仲裁层**（9 处直写）| page/useSession/useAudioPlayer/3 组件 + store | 未修 | 🟡 P1（规格已修订待执行）|
| 2 | InputArea MediaRecorder 无 unmount cleanup | InputArea.tsx:20,46 | 未修 | 🟡（录音中卸载泄漏）|
| 3 | plan/page 重试 setTimeout 未存 id | plan/page.tsx:99 | 未修 | 🟢 低 |
| 4 | mimo.ts mood 字段类型异常仍兜底 userInput | mimo.ts:140 | **部分修** | 🟡（Mavis P1.1 未完全对齐）|
| 5 | API 成功响应无统一 envelope | radio/dj/djPersona/import 多处 | 未修 | 🟢（契约不一致，非 bug）|
| 6 | create 端 current_song 前端未消费 | radio.ts:176 vs useSession:99 | 未修 | 🟢（耦合脆弱）|
| 7 | settings previewVoice fetch 无 AbortController | settings/page.tsx:65 | 未修 | 🟢（连点双 fetch）|

**重点关注 #1（F4）和 #2（InputArea）**——都是真实资源/状态问题。#4 是 Mavis 教训没完全落地（`typeof json.mood === 'string' ? json.mood : userInput` 字段类型异常仍用 userInput 兜底）。

---

## 五、🟢 工程卫生待清理（6 项，机械活）

### 5.1 死代码/死依赖（3 处）

| 项 | 位置 | 证据 | 处理 |
|----|------|------|------|
| **node-ssdp 死依赖** | `backend/package.json:21` + `types/node-ssdp.d.ts` | 源码零 import（3 agent 一致确认）| UPnP 下线残留，删依赖 + .d.ts |
| **icons.tsx 死组件** | `frontend/src/components/icons.tsx` | 6 个 export 全零引用（代码库用内联 SVG）| 删整文件 |
| radio.ts:281/400 重复 sanitize | `radio.ts` | 同一 text 跑两次（幂等无害但冗余）| 合并复用 |

### 5.2 文档漂移（3 处）

| 文档 | 问题 | 处理 |
|------|------|------|
| **COLLABORATION.md** | 3 处写 `:3001`（§2.2 架构图、§5.2、§5.3），实际 3000 | 改 3000（我维护，机械活）|
| **ARCHITECTURE.md** | 2 处写 `PORT=8000`（§七/§八）+ 正文残留 Claude/UPnP/schema.sql | 有"已过时"头注，正文数字改 8001 |
| **HANDOVER.md** | §四（60-120字）vs §七（80-150字）DJ 串词字数矛盾 | 统一为 60-120 字 |

---

## 六、Backlog 未落地项（KIMI 评审"顺带提醒"15 项中未做的）

安全 agent 确认以下 backlog 项**代码尚未落地**（KIMI 的 backlog 方案规格已修订但未执行）：

| Backlog 项 | 现状 | 风险 |
|-----------|------|------|
| B1-1 sessionAuth 移除 query token | `sessionAuth.ts:17-18` 仍接受 query | 🟡 token 走 URL 泄漏 |
| B1-2 generalLimiter 排除 /health /static | `app.ts:47-56` 无 skip | 🟡 配额可被刷光 |
| B1-3 logger 换行 sanitize | `logger.ts:134-145` dev 格式未 sanitize | 🟡 日志伪造 |
| B1-4 SSRF DNS 解析校验 | `ssrfGuard.ts` 无 dns.lookup | 🔴 见 §二 P0-2 |
| B4 UPnP 残留依赖 | node-ssdp | 🟢 见 §5.1 |

---

## 七、给 KIMI 的前科提醒（本轮新增）

### 教训：死依赖清理不彻底（node-ssdp）

P1-3 下线 UPnP 时，KIMI 删了 `upnp-device-client`（package.json + 代码），但**漏了 `node-ssdp`**（同属 UPnP 栈）。执行报告 §二写"依赖：删 upnp-device-client"，没提 node-ssdp。

**这和 MiNiMax 2026-07-05 删 MediaSession 漏 .md 是同类**——删功能时清单不全。**铁律 6 的精神延伸**：删功能时，grep 的关键词要覆盖该功能的**全部技术栈依赖**（UPnP = upnp-device-client + node-ssdp + ssdp 协议），不只 grep 功能名。

建议追加到 COLLABORATION §10.6。

---

## 八、下一步建议（按优先级）

### 🔴 立即（你做，非代码）
1. **撤销 GitHub PAT** + 改 SSH/credential helper（§二 P0-1）

### 🟠 尽快（代码，可派执行者）
2. **SSRF IPv6 + DNS 校验**（§二 P0-2）——进 B1-4 优先级提升，规格已有
3. **node-ssdp 死依赖清理**（§5.1）——P1-3 收尾，机械活

### 🟡 本轮内（我自做或派 MiNiMax）
4. **COLLABORATION 端口漂移修正**（§5.2）——我维护的文件，机械活，我直接改
5. **icons.tsx 死代码删除**（§5.1）——机械活
6. **HANDOVER 串词字数矛盾**（§5.2）——机械活

### 🟢 后续（已有规格）
7. **F4 仲裁层**（规格已修订）+ **backlog 15 项**（规格已修订）——按 planner-bootstrap §七优先级

### ⚪ 记录
8. 追加 2 条案例到 COLLABORATION §10.6（双身份未过复核 + 死依赖清理不彻底）

---

*本报告由规划者（ZCode）出具。审核方法：3 Explore agent 横扫 + ZCode 亲核 5 高风险点 + 独立跑基线。P0a~P2 执行质量认可（A-/A），发现 2 个 P0（git PAT + SSRF）+ 6 项卫生待清 + 7 项正确性债务（无 bug）。*
