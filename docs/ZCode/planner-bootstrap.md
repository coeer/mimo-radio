---
author: 规划者（ZCode）
task: 规划者新会话快速恢复文档（项目状态 + 待办 + 关键决策）
created: 2026-07-18
purpose: 新会话进场时，ZCode 读这份 + AGENT.md 就能恢复 80% 工作状态
update_rule: 每轮任务完成后更新；状态变化时立即更新
---

# ZCode 规划者快速恢复文档

> **新会话使用方法**：把 `AGENT.md` + 本文件喂给 ZCode，它就能恢复当前项目状态、知道下一步做什么。
>
> **更新纪律**：每完成一轮任务、测试基线变化、新增约束、新增案例，立即更新本文件。这是新会话恢复的唯一入口——过时了就误导自己。

---

## 一、当前项目状态（2026-07-22 核实）

### 1.1 测试基线（不可降级）

| 层 | 文件数 | 测试数 | tsc |
|----|--------|--------|-----|
| 后端 | 32 | **305 passed** | 零错误 |
| 前端 | 24 | **204 passed** | 零错误 |

> 📌 基线较 277/179（起始）净增 +28/+25：P0a~P2（+11/+10）+ SSRF IPv6/DNS（+17）+ F4 仲裁层（+15）+ backlog 零增 + 短期清理零增。

### 1.2 Git 状态

- **分支**：master（trunk-based，直接 commit，不建分支）
- **远程**：已 push 到 GitHub（`https://github.com/coeer/mimo-radio.git`）
- **最新提交**：见 `git log --oneline -3`（trunk-based，持续演进）
- **本地 vs 远程**：一致
- **2026-07-18 ~ 2026-07-22 技术债清理 commit 链**（KIMI 执行 P0a~P2 + MiNiMax 执行短期/剩余 + ZCode 收尾）：
  - `3e8024c` SSRF IPv6+DNS / `2205ae4` backlog 6 项 / `2616b39` InputArea cleanup / `1fcf694` F4 仲裁层
  - `0cd8c64` 死代码清理 / `cf227e5` sessionAuth+mood+plan / 及更早 P0a~P2
- **审查报告**（docs/ZCode/audits/）：review-p0a / review-shortterm-batch / review-remaining / full-review / review-kimi-plans

### 1.3 环境

| 项 | 值 | 备注 |
|----|-----|------|
| 项目根 | `D:\Coder\mimo-radio` | |
| 后端端口 | 8001 | `backend/` |
| 前端端口 | **3000** | ✅ 口径已统一（.env.example + start 脚本 + CORS + COLLABORATION/ARCHITECTURE）|
| webbridge | 127.0.0.1:10086 | daemon，uptime 长 |
| workspace 指令 | `D:\Coder\AGENTS.md` | mimo-radio + ai-radio + 根级脚本 |

---

## 二、技术债清理总结（2026-07-22 完成）

### 2.1 已完成的清理（全部 ZCode 复核通过）

| 阶段 | 内容 | 执行者 | 复核 |
|------|------|--------|------|
| **P0a** | helmet 共享源 / 端口口径 / F4 全屏 seek / aiLimiter 拆挂载 / 死代码 | KIMI（fe0f166）| ✅ A- |
| **P0b** | R1 body 上限 / R2 鉴权 fail-closed / F1 收藏反向 / B6 tasteCache | KIMI（c3096b0+af9e120）| ✅（全面审核抽验）|
| **P1** | B2 fetchWithTimeout / F2 监听泄漏 / F3 TTS AbortController / F5 PlayerBar + UPnP 下线 | KIMI（540a92d）| ✅（全面审核抽验）|
| **P2** | tsconfig / gitignore / app 工厂 / 文档 | KIMI（87915cd）| ✅（全面审核抽验）|
| **短期清理** | node-ssdp 死依赖 / icons.tsx / 端口漂移 / 串词字数 / sessionAuth query / mood 兜底 / plan setTimeout | MiNiMax（0cd8c64+cf227e5）| ✅ A |
| **SSRF P0** | IPv6 字面量 + DNS 解析校验 + async 传导 | MiNiMax（3e8024c）| ✅ A |
| **backlog 剩余** | generalLimiter skip / logger sanitize / timestamp / sanitize 合并 / feedback TTL / API envelope | MiNiMax（2205ae4）| ✅ A |
| **InputArea** | MediaRecorder unmount cleanup + setState 守卫 | MiNiMax（2616b39）| ✅ A |
| **F4 仲裁层** | playRequest 单点仲裁 + 两阶段 + R1-R5 | MiNiMax（1fcf694）| ✅ A |
| **前端 timestamp** | 7 处 timestamp:0 → Date.now() | ZCode 自做 | ✅ |

### 2.2 关键决策（不可违反）

1. **sessionToken**：`sessionId.sig`（HMAC-SHA256），不持久化，不过期（上线前再加）
2. **SSRF 白名单**含 127.0.0.1:10086（webbridge）；**isSafeUrl 已改 async + DNS 校验**（防 rebinding + IPv6 绕过）
3. **dev 模式 API 认证放行**；显式 `NODE_ENV=production` 才严格（fail-closed）
4. **DJ 串词**：intro/transition/chat 统一 60-120 字
5. **F4 仲裁层**：所有 isPlaying 写入走 `playRequest(action, source)`，setIsPlaying 标私有；nextSong/prevSong 两阶段（切歌 → 仲裁）
6. **Fish Audio / 飞书 / UPnP / MediaSession / TtsEngineSwitcher / MarkdownText**：全部删除（代码+依赖+文档）

### 2.3 剩余 backlog（低优先级，不阻塞日常使用）

- 🟡 ARCHITECTURE.md 正文重写（已知过时，有头注，单独任务）
- 🟢 F4 真机 E2E（各浏览器 autoplay policy，需真浏览器手测）
- 🟢 trust proxy 1（确认部署在反代后再加）
- 🔴 **git PAT 撤销**（用户操作，非代码——见 §五提醒）

---

## 三、关键决策（不可违反）

### 3.1 sessionToken（HANDOVER §四 决策 1-3）

- 格式：`sessionId.sig`（HMAC-SHA256）
- **不持久化**到 localStorage（partialize 只存 `djEnabled/currentModel/ttsVoice`）
- 不过期（开发期便利，上线前再加）
- queue/currentSong/sessionId/sessionToken 都不持久化（内存态）

### 3.2 安全

- **SSRF 白名单**含 `127.0.0.1`/`localhost`（webbridge daemon 是合法本地调用，只放行 10086 端口）
- **dev 模式 API 认证放行**（没配 API_KEY 时，auth.ts 的 dev 便利性，生产 fail-fast —— 但 R2 待修，当前是 fail-open）
- **Fish Audio / 飞书已删除**（代码 + 文档 + 构建产物全清）

### 3.3 AI/DJ

- **DJ 串词字数**：intro / transition / chat 三入口统一 **60-120 字**
- **搜索前置架构**（Bug 2 修复）：extractIntent → 搜索 → 真实结果喂 AI → newSong = 搜索结果[0]
- **DJ 三层记忆**：persona（personaPromptBlock）+ 短期（djMemory.ts）+ 长期（feedback → tasteCache → 搜索加权）
- **chat 防重入**（DSpro 2026-07-13 完成）：AbortController + 按 pendingId 精确替换

### 3.4 前端架构

- **进度条/歌词 memo 子组件**：ProgressBar / LyricDisplay 抽离，隔离 currentTime（4Hz）订阅，避免重渲染风暴
- **isTransitioning 防重入**：换歌时"换台中..."反馈 + 4 入口统一守卫
- **主题切换 ref 模式**：`prevThemeRef = useRef` + cleanup 里 `setTheme(prevThemeRef.current)`，避免闭包陈旧（DSflash 曾经踩过回归坑）

### 3.5 协作

- **trunk-based Git**：直接 commit master，conventional commits，push 前 tsc+vitest 必跑
- **双规划者**：ZCode（原任，COLLABORATION.md 维护者）+ KIMI（双身份），僵持找用户
- **报告 6 节**：摘要 / 改动明细 / 验证 / 偏差说明 / 自评 / 铁律回顾
- **署名三要素**：文件名 `-<代号>` + 头部 `author: <代号>` + 尾部 `*报告由 <代号> 生成。*（ZCode 作为默认规划者不带后缀）

---

## 四、诊断陷阱（HANDOVER §六，别重蹈）

### ❌ 陷阱 1：用 localStorage 读 zustand store

```js
// 错！partialize 不存的字段永远读不到
JSON.parse(localStorage.getItem('mimo-radio-store')).state.queue  // 永远 []
```

**正确**：用 DOM 反映真实渲染，或 `useRadioStore.getState()` 在组件内读内存值。

### ❌ 陷阱 2：后台启动后端 + 改代码不重启

tsx watch 的热重载在 stdout 重定向到文件时失效。改后端代码后**必须手动重启**（杀 8001 端口进程）。

### ❌ 陷阱 3：把单用户本地应用当高并发服务设计

不引入 Redis/锁/复杂并发控制。tasteCache 用 30s TTL 内存缓存就够了。

### ❌ 陷阱 4：git push 前不跑测试

push 前必跑：`cd backend && npm test && npx tsc --noEmit` + `cd frontend && npm test && npx tsc --noEmit`

### ❌ 陷阱 5：硬编码 webm 却后端只收 wav/mp3

改一端必须查另一端的 schema（dj.ts asrSchema 的 enum）。

---

## 五、六铁律 + 12 个案例（COLLABORATION §10.3 + §10.6 摘要）

### 5.1 六铁律

1. 资源分配与清理必须成对出现在同一个 try/finally 里
2. 不要用复制粘贴做重试，用循环
3. 写完异步逻辑，问自己三个问题（资源释放？错误处理？取消机制？）
4. 替换已验证的修复方案前，必须理解原方案为什么这么写
5. 性能类改动必须附 Profiler 实测证据（不接受"待实测"）
6. 删除功能时必须 grep 全项目（含 .md 文档）

### 5.2 案例索引（前人踩过的坑，派活时附相关教训）

| 案例 | 教训 |
|------|------|
| ASR 格式契约不一致 | 改一端必须查另一端 schema |
| handleLike 双重否定 | 写 `!` 前推演 toggle 后状态 |
| 无限轮询 | 异步流程必须列出所有终态 |
| 定时器泄漏 | 复制粘贴是抽象信号，用循环 |
| AIService 接口违反 | TS 实现可比接口多可选参数，不要"觉得报错就改" |
| FullscreenPlayer 闭包回归 | `[]` 依赖下闭包捕获初始值；ref 读 DOM 是同步的，state 是异步的 |
| E2E 全标"待实测" | "待实测"不是验证是拖延；跑一次 E2E 就能抓到回归 |
| 性能改动无 Profiler | 性能优化不看 Profiler 等于没验证 |
| F4 isPlaying 升级 P0 | "暂缓"的技术债触发条件变化时要重新评估 |
| JSON 兜底 mood=userInput | catch 兜底返回值不能用用户原始输入 |
| String(err) 13 处漏改 | 新工具引入后要 grep 全仓确认无残留旧写法 |
| chat 无取消 + 连发丢回复 | 异步 fetch + last-write-wins = 连发静默丢失 |
| 删 MediaSession 只删代码不删文档 | **代码零残留 ≠ 功能零残留**（铁律 6 的来源）|

完整版见 `COLLABORATION.md §10.6`。

---

## 六、已有执行者与最近产出

| 执行者 | 身份 | 最近产出 | ZCode 评价 |
|--------|------|---------|-----------|
| **DSpro** | 执行者 | chat 防重入 + composeSystemPrompt（2026-07-13）| A，零偏差 |
| **DSflash** | 执行者 | MediaSession 删除（2026-07-05）| B+，闭包回归教训 |
| **MiNiMax** | 执行者 | Context7 文档审计（2026-07-11）| A+，4 份子报告 |
| **KIMI** | **双身份** | code-review-2026-07-17 + fix-plan-2026-07-17 | A，14 发现全属实 |

KIMI 的对齐文档：`docs/KIMI/alignment-2026-07-18.md`（双身份协议，ZCode 也是签约方）。

---

## 七、下一步行动（新会话进场后的优先级）

### 🔴 第一优先：复核 KIMI 已执行的 P0b / P1 / P2

**背景**：KIMI 在 2026-07-18 18:03~19:14 未经 ZCode 复核连续执行了 P0a+P0b+P1+P2（4 个 commit）。P0a 已复核完成（A-）。**P0b/P1/P2 尚未过 ZCode 复核**，测试虽全绿，但代码质量需逐项核实（不盲信测试绿 = 代码对）。

复核顺序（按风险）：
1. **P0b**（`c3096b0` + `af9e120`）：R1 body 上限 / R2 鉴权 fail-closed / F1 收藏反向 / B6 tasteCache 分 key
   - 报告：`docs/KIMI/reports/exec-p0b-batch-2026-07-18-KIMI.md`
   - 重点：**R2 方向**（必须按 ZCode 调整后的"显式 production 才严格"，不是 KIMI 原案的"非 dev 拒绝启动"——这是 review-supplement 的 4 点调整之一）；**F1 收藏闭包**（前科：必须用 getState() 读最新值）
2. **P1**（`540a92d`）：B2 fetchWithTimeout / F2 监听泄漏 / F3 TTS AbortController / F5 PlayerBar 重置 + UPnP 下线
   - 报告：`docs/KIMI/reports/exec-p1-batch-2026-07-18-KIMI.md`
   - 重点：**F2 cleanupRef 模式**（前科：cancelled=true 单独不够）；**F3 复用 chatAbortRef 模式**；**UPnP 下线铁律 6**（HANDOVER/COLLABORATION 等契约文档引用）
3. **P2**（`87915cd`）：tsconfig + gitignore + app 工厂 + 文档
   - 报告：`docs/KIMI/reports/exec-p2-batch-2026-07-18-KIMI.md`
   - 重点：app 工厂改造是否破坏 P0a-1 的共享配置引用链

每阶段复核完写审查报告到 `docs/ZCode/audits/review-p0b-...` / `review-p1-...` / `review-p2-...`。

### 🟠 第二优先：commit 整理（文档落盘）

复核完成后，把未跟踪的文档一次性 commit：
- `docs/KIMI/plans/`（KIMI 的 F4 + backlog 方案，已修订）
- `docs/KIMI/review-batch-all-2026-07-18.md`（KIMI 自审报告）
- `docs/MiNiMax/plans/`（派给 MiNiMax 的 P0a 规格）
- `docs/MiNiMax/reports/exec-p0a-2026-07-18-MiNiMax.md`（MiNiMax 核实报告）
- `docs/ZCode/audits/`（ZCode 审查报告 ×3：review-kimi-plans / review-p0a / 后续 P0b/P1/P2）

### 🟡 第三优先：追加案例到 COLLABORATION §10.6

两条新案例（见 `docs/ZCode/audits/review-kimi-plans-2026-07-18.md` §七 + `review-p0a-2026-07-18.md` §2.4）：
1. "基线数字照抄未实跑核实"（KIMI 两份方案 288/189 vs 实际 277/179）
2. "双身份自审后未过 ZCode 复核即 commit"（KIMI P0a 批）
3. "复用反模式"（B2-5 startSessionCleanup 无 clearInterval）

### 🟢 第四优先：下一阶段任务

P0a~P2 全部复核通过后，进入 fix-plan-integrated 之后的任务：
- **F4 isPlaying 仲裁层**（规格已修订：`docs/KIMI/plans/plan-f4-isplaying-arbiter-2026-07-18-KIMI.md`，P1 阶段，KIMI 执行）
- **backlog 15 项**（规格已修订：`docs/KIMI/plans/plan-backlog-15-2026-07-18-KIMI.md`，P2 之后）

---

## 七-二、协作流程纪律提醒（本轮新增）

> 本轮发现 KIMI 绕过 ZCode 复核连续执行了 P0a~P2。代码质量 A-（可接受），但流程违规。重申：

**KIMI（双身份）的必守流程**：
1. 做完自审后，**必须通过用户中转告诉 ZCode"做完了，请复核"**
2. 等 ZCode 复核通过（或用户明确说"不用复核直接进下一项"）才算完成
3. **自审报告 ≠ ZCode 复核通过**（自审有盲点，对方视角能补）
4. 计划批量执行前，**先告知规划者意图**（避免规划者重复派活 → MiNiMax 空转）

---

## 八、必读文档清单（新会话喂给 ZCode）

### 8.1 最小恢复集（80% 状态）

1. `docs/ZCode/AGENT.md`（身份）
2. `docs/ZCode/planner-bootstrap.md`（本文件，状态 + 待办）

### 8.2 完整恢复集（100% 状态）

1. `docs/ZCode/AGENT.md`
2. `docs/ZCode/planner-bootstrap.md`（本文件）
3. `D:\Coder\mimo-radio\COLLABORATION.md`（主契约）
4. `D:\Coder\mimo-radio\HANDOVER.md`（历史决策）
5. `docs/KIMI/alignment-2026-07-18.md`（双身份协议）
6. `docs/KIMI/fix-plan-integrated-2026-07-17.md`（当前任务）

### 8.3 给新会话的进场提示词（用户复制粘贴用）

```
你是 mimo-radio 项目的规划者 ZCode，原任，COLLABORATION.md 维护者。新会话开始，你需要快速恢复上下文。

项目根：D:\Coder\mimo-radio

请按顺序读这 6 份文件：
1. docs/ZCode/AGENT.md —— 你的身份卡
2. docs/ZCode/planner-bootstrap.md —— 当前项目状态 + 待办（最重要）
3. COLLABORATION.md —— 主契约（§十.3 六铁律 + §十.6 案例 + §十一署名）
4. HANDOVER.md —— 历史决策、诊断陷阱
5. docs/KIMI/alignment-2026-07-18.md —— 双身份协议（你和 KIMI 的协作矩阵）
6. docs/KIMI/fix-plan-integrated-2026-07-17.md —— 当前整合修复方案

读完后告诉我：
- 当前测试基线是多少
- 下一步该做什么（按 planner-bootstrap §七 的优先级）
- 你打算怎么推进

然后等用户确认再动手。
```

---

## 九、本文件更新日志

| 日期 | 更新内容 | 更新者 |
|------|---------|--------|
| 2026-07-18 | 初版创建（KIMI 评审整合方案 + 双身份协议 + 身份卡体系）| ZCode |

**下次需要更新的触发条件**：
- 每完成一轮任务（P0a / P0b / P1 / P2 任一阶段）
- 测试基线变化（新增测试、修复 bug 后）
- 新增案例到 COLLABORATION §10.6
- 新增约束或决策
- 执行者身份变化（新增/离开）

---

*本文件是 ZCode 规划者新会话恢复的唯一入口。过时了就误导自己——状态变化时立即更新。*
