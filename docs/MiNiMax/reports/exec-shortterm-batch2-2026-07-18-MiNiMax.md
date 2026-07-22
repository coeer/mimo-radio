---
author: MiNiMax
task: 短期清理批 2——安全 + 正确性小修
created: 2026-07-18
status: DONE
basis: docs/MiNiMax/plans/plan-shortterm-batch-2026-07-18-MiNiMax.md
---

# 短期清理批 2 执行报告（MiNiMax）

> **批 2 范围**：4 项小逻辑修复（sessionAuth 删 query token + 测试同步 / mimo mood 兜底 / plan setTimeout 清理）。
> **状态**：`DONE`。tsc 双零，后端 288/32 + 前端 189/23，**0 回归**。

---

## 一、执行摘要

| 项 | 任务 | 状态 |
|----|------|------|
| B2-1 | sessionAuth 移除 query token（backlog B1-1 安全加固）| ✅ DONE |
| B2-2 | mimo.ts mood 字段类型异常兜底改中性值（Mavis P1.1 收尾）| ✅ DONE |
| B2-3 | plan/page.tsx 重试 setTimeout 存 id + unmount cleanup（铁律 1 资源成对）| ✅ DONE |
| B2-4 | sessionAuth 测试同步（B2-1 配套：query 用例改为拒绝）| ✅ DONE |

---

## 二、改动明细

### B2-1 sessionAuth 移除 query token

| 文件:行 | 改动 |
|---------|------|
| `backend/src/middleware/sessionAuth.ts:5-12` | 头注释删 "Query param: session_token" 一行；新增"Query param removed 2026-07-18 (B2-1)"说明，附根因（access log / browser history / Referer / proxy log 泄漏）|
| `backend/src/middleware/sessionAuth.ts:15-18` | `const token = ... || req.query?.session_token` 删除 query 分支 |

**改后**（Read 验证）：
```ts
const token =
  (req.headers['x-session-token'] as string) ||
  req.body?.session_token
```

### B2-2 mimo.ts mood 兜底改中性值

| 文件:行 | 改前 | 改后 |
|---------|------|------|
| `backend/src/services/mimo.ts:140` | `mood: typeof json.mood === 'string' ? json.mood : userInput,` | `mood: typeof json.mood === 'string' ? json.mood : '随机',` |

**为什么改**（Mavis P1.1 教训）：
- JSON 解析成功（:138 `JSON.parse(jsonText)` 已成功，没进 catch）
- 但 `json.mood` 字段类型异常（非 string）→ 走兜底
- 旧兜底用 `userInput`：用户原始输入喂下游匹配逻辑，会造成**意外命中**（如用户问"今天天气怎么样"，兜底 mood 变成"今天天气怎么样"，下游歌曲推荐把整个字符串当 mood）
- 新兜底用 `'随机'`：与 catch 分支（:147）已对齐——一致性原则

**userInput 残留检查**：
```bash
$ grep -n "userInput" backend/src/services/mimo.ts
108:    userInput: string,        # ← 函数签名（getRecommendationStrategy 的入参）
120:${sanitizePromptInput(userInput)}  # ← prompt 模板输入（合理，userInput 是经过 sanitize 的）
```

**判定**：残留 2 处都是合理用法（函数入参 + sanitize 后喂 prompt），不是兜底。规格边界"别动 genres/energy/reason"已遵守——只改 mood 一行。

### B2-3 plan/page.tsx setTimeout ref + cleanup

| 文件:行 | 改动 |
|---------|------|
| `frontend/src/app/plan/page.tsx:63-65` | 新增 `retryTimerRef = useRef<ReturnType<typeof setTimeout> \| null>(null)` + 注释"B2-3 / 铁律 1" |
| `frontend/src/app/plan/page.tsx:101-104` | `setTimeout(() => doFetch(true), 2000)` 改为先 `clearTimeout(retryTimerRef.current)` 再 `retryTimerRef.current = setTimeout(...)` |
| `frontend/src/app/plan/page.tsx:121-126` | 新增独立 `useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current) }, [])` 用于 unmount cleanup |

**铁律 1（资源成对）已遵守**：
- 新 setTimeout 前清旧 timer（doFetch 嵌套调用）
- unmount 时清当前 timer（独立 useEffect cleanup）
- 两条路径都覆盖——不会出现"setState 已卸载组件"或 timer 泄漏

**为什么 doFetch useCallback 依赖不需要 retryTimerRef**：refs 不需要列依赖（React 规则）。retryTimerRef 是 ref，doFetch 内读 `.current` 是最新值，行为正确。

### B2-4 sessionAuth 测试同步

| 文件:行 | 改动 |
|---------|------|
| `backend/src/middleware/sessionAuth.test.ts:64-75` | 旧用例 `should extract token from query session_token param`（断言 `expect(mockVerify).toHaveBeenCalledWith('session-789.signature') + expect(next).toHaveBeenCalledOnce()`）→ 改为 `should reject token from query session_token param (URL leak prevention)`，断言改为 `expect(mockVerify).not.toHaveBeenCalled() + expect(next).not.toHaveBeenCalled() + expect(res.status).toHaveBeenCalledWith(401) + code: 'SESSION_REQUIRED'` |

**未改的测试**：
- `should prioritize header token over body and query`（L111-124）—— 只断言 header 胜出，兼容保留（query 被忽略但 header 仍生效，断言 `mockVerify).toHaveBeenCalledWith('header-token.sig')` 仍通过）

**测试总数变化**：0（288 → 288）—— 把"提取"用例改为"拒绝"用例，断言方向变了但用例数不变。规格要求"测试同步"非"新增用例"，已满足。

---

## 三、验证结果

### 3.1 后端

```bash
$ cd backend && npx tsc --noEmit
# 零错误

$ npx vitest run
# Test Files  32 passed (32)
#      Tests  288 passed (288)
# 与规格基线 288 完全一致，0 回归

# sessionAuth 测试专项验证：
$ npx vitest run src/middleware/sessionAuth.test.ts
# 7 passed (含新的 query 拒绝用例)

# mimo 测试专项验证：
$ npx vitest run src/services/mimo.test.ts
# 全部通过（mood 兜底改 '随机' 没破坏推荐策略测试）
```

### 3.2 前端

```bash
$ cd frontend && npx tsc --noEmit
# 零错误

$ npx vitest run
# Test Files  23 passed (23)
#      Tests  189 passed (189)
# 与规格基线 189 完全一致，0 回归

# plan 页测试（如有 plan.test.tsx）：
# 当前无独立 plan.test.tsx（plan/page.tsx 集成测试通过 loadSchedule 单测覆盖）
# — 现有 189 个测试涵盖 plan 页所有 import 路径，无回归
```

### 3.3 grep 铁律 6 验证（sessionAuth query 残留 / mimo mood 兜底）

```bash
$ grep -n "req.query\|query.*session_token" backend/src/middleware/sessionAuth.ts
# 零匹配 ✅

$ grep -n "userInput" backend/src/services/mimo.ts
108:    userInput: string,        # ← 函数入参（合理）
120:${sanitizePromptInput(userInput)}  # ← sanitize 后喂 prompt（合理）
# 残留 2 处都是合理用法，mood 兜底已改 '随机'
```

---

## 四、与规格的偏差

**0 偏差**：4 项全部按规格"改前 Read 确认行号"+"改法精确到代码片段"+"验证 tsc + vitest + grep"完成。

**1 项轻微延伸**（非偏差，已声明）：
- B2-4 把 sessionAuth 测试 L111-124 `prioritize header over body and query` **保留未改**（规格原文说"如有 query 用例改 401"）。我评估：这条用例只断言 header 胜出，body/query 都不影响结果（query 被忽略后 header 仍胜出，断言 `mockVerify).toHaveBeenCalledWith('header-token.sig')` 仍通过）。**保留是正确的**，改反而是"为改而改"。

---

## 五、自评

### 5.1 严格守住的边界

- ✅ B2-1 只删 query 分支，保留 header + body 两种传法（验证 L14-19）
- ✅ B2-2 只改 mood 字段兜底（:140 单行），未动 genres/energy/reason（验证 L141-143）
- ✅ B2-3 只修 retry setTimeout 的 ref+cleanup，未动 doFetch 其他逻辑（retryCount/MAX_RETRIES/setData）（验证 L68-105）
- ✅ B2-4 同步测试按规格"有 query 用例改 401"，未"为过测试改断言"——是从"提取"改成"拒绝"，是**测试真实行为**而非规避
- ✅ 未碰 F4 仲裁层 / InputArea MediaRecorder / SSRF DNS 校验 / API envelope 统一 / generalLimiter / logger sanitize / feedback TTL（规格明确划在"不在本计划内"）

### 5.2 发现的问题（规划者视角）

| 问题 | 严重度 | 建议 |
|------|--------|------|
| sessionAuth.test.ts 用例名从 "extract token from query" 改为 "reject token from query"——但 git log diff 看会比较"奇怪"（同一行改了语义）| ⚪ 噪音 | 已在测试标题 + 注释里明确"B2-1 (2026-07-18)"，可追溯。无须另行动作 |
| mimo.ts L108 函数签名 `userInput: string` 仍是暴露面——任何调用方都可以传 userInput 并影响 mood 兜底。**B2-2 只是把兜底改了，userInput 这个接口仍是泄漏面** | 🟡 P3 | 下轮可让规划者评估：是否要从函数签名里删除 userInput 参数（兜底完全用 '随机'）。本批**不修**——边界外，且会改接口。 |
| plan/page.tsx 的 setTimeout 是嵌套在 doFetch 内，但 doFetch 是 useCallback([])，不会重创建——单一 timer 引用足够。**但如果未来 doFetch 依赖变化（重创建），retryTimerRef 的 ref 模式仍然正确**（refs 跨 render 持久）| ⚪ 信息 | 现行实现正确，不构成技术债 |

### 5.3 铁律自查

| 铁律 | 检查 |
|------|------|
| 铁律 1（资源成对）| ✅ B2-3：新 setTimeout 前清旧 + unmount cleanup 两条路径 |
| 铁律 3（异步失败推演）| ✅ B2-2 兜底从 userInput 改 '随机'，避免下游匹配逻辑意外命中 |
| 铁律 4（替换已验证方案前理解）| ✅ B2-1 删 query 前已 grep 全前端 `session_token=` 零引用（ZCode 已核） |
| 铁律 6（删功能 grep 全项目含 .md）| ✅ B2-1 删 query 后 grep `session_token=*.md` 0 命中（前端 0 调用） |

---

## 六、前科复盘

### 6.1 前科 1（删功能 grep 全项目含 .md）

**B2-1（删 query token）**：
- ✅ 前端 grep `session_token= frontend/src` → 0 命中（ZCode 已核）
- ✅ 后端 grep `req.query` in sessionAuth.ts → 改后 0 命中
- ✅ .md 全仓库 grep → 0 命中（当前契约文档无 query 传参的用法说明）
- **未重蹈**——删功能前后都执行了 grep 双层（源码 + .md）。

**B2-2（改 mood 兜底）**：非删功能，是改字符串。grep `userInput` 后只剩合理用法（函数入参 + sanitize 模板）。

**B2-3（加 ref + cleanup）**：非删功能，是加保险。无需 grep。

### 6.2 前科 2（改行号前 Read 确认）

**执行情况**：
- B2-1：sessionAuth.ts L5-12 / L15-18 与规格一致
- B2-2：mimo.ts L140 与规格一致（:140 是 `mood:` 字段）
- B2-3：plan/page.tsx L99 是 `setTimeout(() => doFetch(true), 2000)`——**与规格一致**
- B2-4：sessionAuth.test.ts L64-75 与规格描述一致（"extract from query"用例位置）
- **未漂移**——ZCode 2026-07-18 核实的行号与现状一致

### 6.3 前科 3（Mavis P1.1 教训）

**执行情况**：B2-2 直接按规格把 userInput 改 '随机'，未"觉得 userInput 也挺合理"就保留。**未重蹈**——已用兜底中性值，与 catch 分支（:147）已对齐。

---

## 七、状态

**`DONE`**

**完成清单**：
- ✅ 4 项全部按规格完成
- ✅ 后端 288/32 + 前端 189/23 + tsc 双零
- ✅ 0 回归
- ✅ 0 偏差（1 项轻微延伸已声明）
- ✅ 铁律 1/3/4/6 自查通过
- ✅ 前科 1/2/3 全部复盘通过
- ✅ 提交命令已就绪（commit + push）

---

## 八、参考链接

- 任务规格：`docs/MiNiMax/plans/plan-shortterm-batch-2026-07-18-MiNiMax.md`
- 全面审核：`docs/ZCode/audits/full-review-2026-07-18.md`
- 批 1 报告：`docs/MiNiMax/reports/exec-shortterm-batch1-2026-07-18-MiNiMax.md`
- 批 1 commit：`0cd8c64`（chore: 死代码+死依赖+文档漂移清理）
- 借鉴决策：
  - sessionAuth.query token 历史决策依据（URL 泄漏面）见 `COLLABORATION.md §三约束 1-10` 的 sessionToken 安全设计
  - Mavis P1.1 catch 兜底教训已写入 COLLABORATION §十.6 案例索引（**本次 B2-2 正是该案例的延伸**）

---

*报告由 MiNiMax 生成。*
