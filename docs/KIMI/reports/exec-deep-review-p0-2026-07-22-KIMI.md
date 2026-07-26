---
author: KIMI
task: 深度 review 批次 1（🔴 必修代码项）：R-6 lint 修复 + R-1/N-6 timer 清理 + R-2 withTimeout clearTimeout
created: 2026-07-22
spec: docs/ZCode/decisions/decision-deep-review-2026-07-22.md §九-2 批次 1
status: DONE_WITH_CONCERNS（push 过程有一次 PAT 脱敏处理，见 §四偏差声明）
---

# 执行报告：深度 review 批次 1（R-6 / R-1+N-6 / R-2）

## 一、执行摘要

按 decision §九-2 批次 1 规格完成 3 个 Task，改动 3 个文件（eslint.config.mjs / index.ts / planner.ts），全部验证通过：后端 lint **0 errors**（19 warnings 保留）、tsc 双端零错误、后端 305 / 前端 204 全绿。push 时被 GitHub Push Protection 拦截一次——ZCode 的 deep-review 文档 R-7 节引用了完整 PAT，已按项目既有先例（MiNiMax 案例）脱敏后 amend 重推成功（master `473f140..660bfc0`）。

## 二、改动明细

| 文件 | 改动 | 行号 |
|------|------|------|
| `backend/eslint.config.mjs` | ignores 块加 `src/**/*.test.ts` + 注释说明原因 | :35 |
| `backend/eslint.config.mjs` | rules 加 `'no-undef': 'off'` + 注释（typescript-eslint 官方建议） | :30 |
| `backend/src/index.ts` | 模块级新增 `stopAudioCleanup` / `plannerWarmupTimer` 两个句柄变量 | :56-61 |
| `backend/src/index.ts` | `startPeriodicCleanup` 返回值接入 `stopAudioCleanup` | :67 |
| `backend/src/index.ts` | planner 预热 `setTimeout` 句柄存入 `plannerWarmupTimer` | :76 |
| `backend/src/index.ts` | `gracefulShutdown` 补调 `stopAudioCleanup?.()` + `clearTimeout(plannerWarmupTimer)`，均置 null | :127-135 |
| `backend/src/services/planner.ts` | `withTimeout` 改 async + await，timer ref + finally clearTimeout（对齐 readBodySafely 写法），race 语义不变 | :154-175 |
| `docs/ZCode/audits/deep-review-2026-07-22.md` | R-7 节完整 PAT 脱敏为 `ghp_***REDACTED***`（push 拦截处理，见 §四） | :110 |

## 三、验证结果

**分 Task 验证（每个改后即跑）**：
- Task 1 后：`npm run lint` → 0 errors / 19 warnings；`tsc --noEmit` → 0 错误
- Task 2 后：`tsc --noEmit` → 0 错误；`vitest run` → 305 passed
- Task 3 后：`tsc --noEmit` → 0 错误；`vitest run` → 305 passed

**全量终验（三个 Task 全部完成后）**：
- 后端 lint：**✖ 19 problems (0 errors, 19 warnings)**（修复前 53 problems / 34 errors）
- 后端 tsc：0 错误
- 后端 vitest：**Test Files 32 passed (32) / Tests 305 passed (305)**
- 前端 tsc：0 错误
- 前端 vitest：**Test Files 24 passed (24) / Tests 204 passed (204)**

基线无回退（≥305/204 红线守住）。

**Task 1 过程记录**：加 ignores 后 lint 从 34 errors 降到 **2 errors**——暴露出 2 个此前被 parse error 掩盖的真实 error：`db/index.ts:277,304` 的 `NodeJS.Timeout` 类型标注被 core `no-undef` 误报。按 typescript-eslint 官方建议在 config 加 `'no-undef': 'off'`（未改 db/index.ts 一行代码），降到 0 errors。

## 四、与规格的偏差

**有偏差，两处，均如实声明**：

1. **Task 1 改法超出规格单条建议**：规格给的是"加 ignores 或配 test block"二选一。我选了 ignores，但实测后发现还有 2 个被掩盖的 `no-undef` error，**规格目标（0 errors）未达成**。为此追加了 `'no-undef': 'off'`——这是 typescript-eslint 对 TS 项目的官方标准配置（tsc 已负责未定义标识符检查），未触碰任何源码/测试文件。判断依据：规格的目标是"lint 门恢复可用（0 errors）"，此改动是达成目标的最小手段。
2. **push 拦截处理（规格外动作）**：首次 push 被 GitHub Push Protection 拒绝（repository rule violations）。定位到 `docs/ZCode/audits/deep-review-2026-07-22.md:110` 的 R-7 节引用了**完整明文 PAT**（这正是 R-7 本身的证据，但不该入 git）。按项目既有先例（§10.6 同类事件：MiNiMax 把 token 抄进文档 → 脱敏 + amend）处理：脱敏该行为 `ghp_***REDACTED***` → `git commit --amend --no-edit` → push 成功（`473f140..660bfc0`）。注意：amend 安全——被拒的 commit 从未进入 remote，无公共历史改写。**R-7 本体（撤销 token + 改 SSH）仍是用户待办，本次只处理了文档里的明文泄露。**

## 五、自评

1. **Task 3 我犯了一个错并自我纠错**：第一版 `withTimeout` 我把 `try/finally` 直接包在 `return Promise.race(...)` 外——finally 会在 race 同步返回后立即执行，timer 被同步清掉，**超时保护完全失效**（改出比原 bug 更隐蔽的 bug）。写完逐行走查时发现，改为 `async + await`（finally 在 race settle 后执行，对齐 readBodySafely 范本）后重新验证。教训：finally 的语义依赖 await，对齐范本要连 async 关键字一起对齐。
2. **commit 范围附带了一批 docs**：`git add docs/KIMI docs/ZCode` 把本轮 review 的未跟踪文档（含两份 prompt-*.md、ZCode 的 audit/decision）一并带进了 commit。这些文档本该入库，但严格说超出了"批次 1 代码修复"的 commit 语义。已随 push 上去，无害，但下次应分开 commit。
3. 19 个 warnings 保留未动（多为 `no-explicit-any`，规格允许）。

## 六、前科复盘

- **铁律 1（资源成对清理）**：本次 3 个 Task 全是铁律 1 补课。每处都做到了"分配与清理成对且同可见域"：fileCleanup dispose 有接有调（index.ts:67 ↔ :127）、预热 timer 有句柄有 clear（:76 ↔ :131-134）、withTimeout timer ref + finally（planner.ts:157 ↔ :173）。启动失败路径（initDb 抛错 / listen error）在 listen 回调前退出，两句柄保持 null，gracefulShutdown 里 `?.()` / if 判空语义完整（ZCode 加固提醒已落实）。`shuttingDown` 防重入逻辑未动。
- **铁律 4（替换方案前理解原方案）**：Task 1 没有为消 error 去改 `db/index.ts` 的 `NodeJS.Timeout` 写法（那是合法类型标注，问题在 lint 规则与 TS 的职责重叠）；Task 3 没有顺手把 Promise.race 换成 AbortController 模式（ZCode 提醒），只补清理不动 race 语义。
- **铁律 3（异步三问）**：withTimeout 改后确认——timer 被 clear 后不再 reject，无 unhandledRejection；race 输掉的 promise 挂在 race 上有 handler，无悬挂拒绝。

## 七、状态

**DONE_WITH_CONCERNS**——3 个 Task 全部完成且验证通过、push 成功；concerns 是 §四的两处偏差（lint 追加 'no-undef': 'off'、ZCode 文档 PAT 脱敏 + amend）需要 ZCode 复核确认，以及 §五.2 的 commit 范围问题。

---

*报告由 KIMI 生成。*
