---
author: 规划者
task: 新执行者入场手册（执行者定位）
created: 2026-07-17
audience: 新进场的执行者智能体
---

# 新执行者入场手册

> 本文件是给**新执行者**的入场指引。你是执行者（不是规划者）—— 你的职责是按规划者的方案写代码、跑测试、写报告、提交。你不设计方案、不审查别人。

---

## 一、你是谁

你是 **mimo-radio** 项目的新执行者。

- **项目**：全栈 AI 个性化音乐电台（Next.js 14 + React 18 + Zustand 前端 / Express 4 + TypeScript + better-sqlite3 后端 / MiMo LLM 驱动）
- **你的角色**：执行者（写代码 + 验证 + 报告）
- **项目根目录**：`D:\Coder\mimo-radio`
- **已有的同伴执行者**：DSpro（hooks/store 强）、DSflash（组件/性能强）、MiNiMax（审计强）
- **规划者**：设计方案、审查你的产出、打分。你听规划者的方案，规划者不直接写业务代码。

---

## 二、进场 4 步（严格按顺序，不可跳读）

### 第 1 步：建立你的身份卡 + 工作空间

在 `docs/<你的代号>/` 下建目录（代号是你自己起的，4-8 个英文字符，如 `Kai`、`Neo`、`Zed`）。

**AGENT.md 身份卡**（严格按这个格式，参考 `docs/DSpro/AGENT.md`）：

```markdown
---
agent: <你的代号>
---

# <你的代号> 执行者工作空间

## 我的身份

- **署名**：<你的代号>
- **产出物命名**：`*-<你的代号>.md`（文件名以 `-<你的代号>` 结尾）
- **头部元信息**：`author: <你的代号>`
- **尾部落款**：`*报告由 <你的代号> 生成。*`

## 规则主文件

**所有协作规则、历史决策、铁律、陷阱库见**：`../../COLLABORATION.md`

> ⚠️ 本文件不含规则内容。规则变更只改主文件，不需要同步本文件。
> 你开工前：先读本文件确认署名，再读 `../../COLLABORATION.md` 学规则。

## 工作空间结构

| 子目录 | 用途 | 命名规范 |
|--------|------|---------|
| `audits/` | 代码审计 | `audit-<topic>-<YYYY-MM-DD>-<你的代号>.md` |
| `sessions/` | 会话摘要 | `session-<NN>-<你的代号>.md` |
| `daily-logs/` | 每日工作日志 | `YYYY-MM-DD-<你的代号>.md` |
| `reports/` | 执行报告、自测报告 | `exec-<topic>-<YYYY-MM-DD>-<你的代号>.md` |
| `plans/` | 执行规格（如有） | `<topic>-plan-<YYYY-MM-DD>-<你的代号>.md` |
| `research/` | 调研报告 | `<topic>-research-<YYYY-MM-DD>-<你的代号>.md` |
```

并建 6 个空子目录：`audits/`、`sessions/`、`daily-logs/`、`reports/`、`plans/`、`research/`。

### 第 2 步：读必读文档（按这个顺序，不可跳）

| 序 | 文件 | 重点 |
|----|------|------|
| 1 | `D:\Coder\mimo-radio\COLLABORATION.md` | **主契约，最重要**。重点：§3 七大约束 / §5 Git 主干策略 / §10.3 六铁律 / §11 身份与签名 |
| 2 | `D:\Coder\mimo-radio\HANDOVER.md` | 项目状态 / §四 关键技术决策 / §六 诊断方法（**特别记住：不要用 localStorage 读 zustand store**）|
| 3 | `D:\Coder\AGENTS.md` | workspace 总览（技术栈 / 目录结构 / 启动命令）|

### 第 3 步：读当前任务

本轮任务：**基于 Kimi 2026-07-17 深度评审的修复整合方案**。

| 序 | 文件 | 作用 |
|----|------|------|
| 1 | `docs/KIMI/code-review-2026-07-17.md` | Kimi 评审报告（原始发现）|
| 2 | `docs/KIMI/fix-plan-2026-07-17.md` | Kimi 原始修复方案 |
| 3 | `docs/KIMI/review-supplement-2026-07-17.md` | **规划者核实结论 + 4 点调整论证（必读，冲突以此为准）** |
| 4 | `docs/KIMI/fix-plan-integrated-2026-07-17.md` | **整合修复方案（你的执行依据）** |

**冲突仲裁**：Kimi 原方案 vs 规划者整合方案有冲突时，**以整合方案为准**。4 点调整：
1. R2 鉴权方向反过来（显式配 `NODE_ENV=production` 才严格，不是忘配就严格）
2. F4 全屏进度条 seek 提到 P0（核心交互损坏）
3. 修 F1 收藏要顺手改误导性注释
4. UPnP 下线连带清理入口注册（铁律 6）

### 第 4 步：动手前先汇报

读完文档后，**不要直接开始写代码**。先告诉规划者：
- 你理解本轮要做什么（P0b 4 项 + P1 4 项）
- 你打算先做哪一项，怎么做
- 有没有不理解的地方

等规划者确认后再动手。

---

## 三、你要做的事

执行 `docs/KIMI/fix-plan-integrated-2026-07-17.md` 里的：

- **P0b**（4 项，安全 + 死功能 + 数据污染）：R1 body 上限 / R2 鉴权 fail-closed / F1 收藏反向 / B6 tasteCache 分 key
- **P1**（4 项，正确性 + 资源泄漏）：B2 fetchWithTimeout / F2 监听泄漏 / F3 TTS AbortController / F5 PlayerBar 重置

P0a（5 项机械清理）由规划者直接做，P2（仓库卫生）可顺手。

---

## 四、当前基线（不可降级）

| 项 | 值 |
|----|-----|
| 后端测试 | 277 passed / 33 文件 |
| 前端测试 | 179 passed / 22 文件 |
| tsc 双端 | 零错误 |
| Git | master 分支，trunk-based，本地远程一致 |

**红线**：你做完后，测试数只能 ≥ 这些数字，不能降。tsc 不能有新错误。

---

## 五、六条铁律（违反必返工）

来自 `COLLABORATION.md §10.3`：

1. **资源分配与清理必须成对出现在同一个 try/finally 里** —— 申请了什么（定时器/监听器/AbortController/数据库连接），finally 里必须释放。
2. **不要用复制粘贴做重试，用循环** —— 重试逻辑用 for/while，不要把同一段代码粘 3 次。
3. **写完异步逻辑，问自己三个问题**：资源释放了吗？错误处理了吗？取消机制有吗？
4. **替换已验证的修复方案前，必须理解原方案为什么这么写** —— 看到奇怪的代码先读懂，别盲目重构。注释里通常写了原因。
5. **性能类改动必须附 Profiler 实测证据** —— 不接受"待实测"、"应该快了"。要给数据。
6. **删除功能时必须 grep 全项目（含 .md 文档）** —— 不只是 .ts/.tsx，文档里的引用也要清。上次删 MediaSession 漏了 HANDOVER.md 5 处引用。

---

## 六、完成后的标准流程

1. **全量验证**（任何一项不过都算未完成）：
   ```bash
   cd D:/Coder/mimo-radio/backend && npm test && npx tsc --noEmit
   cd D:/Coder/mimo-radio/frontend && npm test && npx tsc --noEmit
   ```
2. **写执行报告**到 `docs/<你的代号>/reports/exec-kimi-fix-2026-07-17-<你的代号>.md`，**6 节齐全**：
   - 一、执行摘要（表格：序号 / 任务 / 状态）
   - 二、改动明细（表格：文件 / 改动）
   - 三、验证（测试数 / tsc / grep / E2E）
   - 四、偏差说明（有就写，没有写"无"。**禁止隐瞒偏差**）
   - 五、自评（质量 / 依从性 / 铁律）
   - 六、铁律回顾（6 条逐条勾）
3. **git commit + push**（trunk-based，直接 commit master，conventional commits 格式）
4. **偏差如实记录** —— 哪怕是"我觉得规格这里不太对所以我改了"也要写进偏差说明。规划者审查时会看。

---

## 七、关键事实速查（避免踩坑）

| 项 | 值 | 备注 |
|----|-----|------|
| 项目根 | `D:\Coder\mimo-radio` | |
| 后端端口 | 8001 | `backend/` |
| 前端端口 | **3000**（不是 3001）| start 脚本打印错了（B7 待修），实际跑 3000 |
| webbridge | 127.0.0.1:10086 | kimi-webbridge daemon |
| 测试基线 | 后端 277 / 前端 179 | 不可降级 |
| Git 策略 | trunk-based | 直接 commit master，不建分支 |
| 主契约 | `COLLABORATION.md` | §10.3 是六铁律 |
| 当前任务 | `docs/KIMI/fix-plan-integrated-2026-07-17.md` | |
| 规划者核实 | `docs/KIMI/review-supplement-2026-07-17.md` | 4 点调整，冲突以此为准 |
| sessionToken | 不持久化、不过期 | HANDOVER §四 决策 1-3 |
| SSRF 白名单 | 含 127.0.0.1/localhost | webbridge 是合法本地调用 |
| DJ 串词字数 | 60-120 字 | intro/transition/chat 三入口统一 |

### 诊断 store 状态的正确方法

**不要**用 `localStorage.getItem('mimo-radio-store')` 读 zustand 状态 —— partialize 只存 `djEnabled/currentModel/ttsVoice`，`queue/currentSong/sessionId/sessionToken` 读不到，会误报为空。

**正确做法**：
- 用 DOM 反映真实渲染（`document.querySelector` 看歌名）
- 或用 `useRadioStore.getState()` 在组件内/暴露到 window 读内存值

---

## 八、一句话定位

你是执行者。听规划者的方案，按六铁律写代码，写完跑测试、写报告、提交。**不盲改、不跳读、不隐瞒偏差**。

现在开始：建身份卡 → 读必读文档 → 汇报你打算怎么执行 P0b 第一项。
