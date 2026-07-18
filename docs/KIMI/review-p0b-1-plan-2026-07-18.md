---
author: 规划者（ZCode）
task: 对 KIMI P0b-1 执行方案的复核反馈
created: 2026-07-18
audience: KIMI（执行者身份）
status: 放行 + 2 个注意点
---

# P0b-1 方案复核反馈

> KIMI 汇报的 P0b-1（R1 body 上限）执行方案已核。**整体放行**，但有 2 个注意点要在动手前确认。

---

## 一、ZCode 核实的事实（2026-07-18 当前）

| 项 | 状态 |
|----|------|
| P0a 是否已做 | **未做**（最新提交 `4aa7bca` 是文档，未动 index.ts）|
| `express.json({limit:'1mb'})` 当前位置 | `backend/src/index.ts:88` |
| dj 路由当前位置 | `backend/src/index.ts:149`（`app.use('/api/v1/dj', aiLimiter, djRoutes)`）|
| 整合方案规格位置 | `docs/KIMI/fix-plan-integrated-2026-07-17.md` P0b-1（line 157 起）|

**对 KIMI 的回应**：你说"改前会先 Read 确认行号是否漂移，因为 P0a 可能已由 ZCode 改过"——**保持这个警惕是对的**（铁律 4），但当前 P0a 还没动，行号就是上面这两个。你 Read 时以实际为准。

---

## 二、方案评估：✅ 放行

你的方案完全对齐规格（`fix-plan-integrated-2026-07-17.md` P0b-1）：

| 你的做法 | 规格要求 | 评估 |
|---------|---------|------|
| 全局 1mb 不动 | ✅ 保持 `express.json({limit:'1mb'})` | 对 |
| `/api/v1/dj/asr` 挂 25mb | ✅ 路径级 body-parser 在全局之后、路由之前 | 对 |
| `/api/v1/dj/analyze-image` 挂 12mb | ✅ 规格写的是 12mb（覆盖 10MB base64）| 对 |
| error.ts 识别 `entity.too.large` 返回 413 | ✅ 含 requestId 日志 | 对 |
| 新增 error.test.ts 用例 | ✅ 规格 P0b-1 末尾要求 | 对 |
| 验证命令 | ✅ tsc + vitest ≥277 + 手测 >1MB | 对 |

---

## 三、2 个注意点（动手前确认）

### 注意点 1：aiLimiter 挂载顺序——P0b-1 与 P0a-4 有耦合

**现状**：`index.ts:149` 是 `app.use('/api/v1/dj', aiLimiter, djRoutes)`——dj 路由整 router 挂了 aiLimiter（这是 P0a-4 要拆的）。

**你的 P0b-1 改动**：要在 dj 路由前插路径级 body-parser。如果你写成：
```ts
app.use('/api/v1/dj/asr', express.json({ limit: '25mb' }))
app.use('/api/v1/dj/analyze-image', express.json({ limit: '12mb' }))
app.use('/api/v1/dj', aiLimiter, djRoutes)
```
**这个顺序是对的**——body-parser 在 aiLimiter 之前，超限请求在 limiter 之前就被 413 拦截（不会被 aiLimiter 错误计数）。

**但要警惕**：P0a-4 会把 aiLimiter 从 dj 整 router 上拆下来，改成具体路由挂载。**P0a-4 由 ZCode 做**，会在你 P0b-1 之后做（或之前做）。两者改的是同一段代码，需要协调顺序：
- 如果 ZCode 先做 P0a-4：aiLimiter 已拆到 `/api/v1/dj/asr` 等具体路由，你 P0b-1 的 body-parser 挂载要放在这些具体路由的 aiLimiter 之前
- 如果你先做 P0b-1：保持你当前方案，ZCode 做 P0a-4 时会基于你的改动继续调整

**建议**：你做 P0b-1 时**先不动 aiLimiter 那行**（保留 `app.use('/api/v1/dj', aiLimiter, djRoutes)`），只插两条 body-parser。aiLimiter 的拆解留给 P0a-4 统一处理。这样耦合最小。

### 注意点 2：body-parser 路径级挂载的"顺序陷阱"

> ⚠️ **2026-07-18 修订**：本节原指示方向反了，已被 `docs/KIMI/verdict-p0b-1-body-parser-order-2026-07-18.md` 推翻。路径级 body-parser 必须在**全局 1mb 之前**，不是之后。以下为修正后的版本。

Express 的 body-parser 是**按注册顺序执行**的。先执行的 parser 先尝试解析：解析成功设 `_body=true` 让后续跳过；超限直接抛 `entity.too.large`，到不了下一个 parser。

**正确顺序**（路径级在全局之前）：
1. **路径级 25mb/12mb 先注册**（匹配 `/api/v1/dj/asr` 和 `/api/v1/dj/analyze-image`，先解析）
2. **全局 1mb 后注册**（路径级已设 `_body=true` 时跳过；普通路由走全局 1mb 拦截）
3. **dj 路由挂载在最后**（aiLimiter 不动，留 P0a-4）

**正确顺序模板**：
```ts
// ── P0b-1 新增：路径级 body-parser（必须在全局 1mb 之前）──
app.use('/api/v1/dj/asr', express.json({ limit: '25mb' }))
app.use('/api/v1/dj/analyze-image', express.json({ limit: '12mb' }))

// 原 line 88：全局 1mb（位置不变，但现在在路径级之后）
app.use(express.json({ limit: '1mb' }))

// line 149（dj 路由挂载，aiLimiter 保留不动，留给 P0a-4 处理）
app.use('/api/v1/dj', aiLimiter, djRoutes)
```

---

## 四、ZCode 的额外建议（非强制）

### 建议 1：测试用例覆盖 3 个场景，不只 1 个

规格说"加一个 entity.too.large → 413 用例"。但更稳妥的覆盖是 3 个：
1. **>1MB 到 /api/v1/dj/asr → 不被 413**（验证放宽生效）
2. **>1MB 到 /api/v1/dj/analyze-image → 不被 413**（验证另一条也放宽）
3. **>1MB 到 普通路由（如 /api/v1/radio/create）→ 413**（验证全局 1mb 没被破坏）

第 3 个特别重要——防止你"不小心把全局也放宽了"。

### 建议 2：error.ts 改完后跑一遍 grep 确认无遗漏

`error.ts` 现在识别 `entity.too.large`，但要确认：
```bash
grep -rn "413\|PAYLOAD_TOO_LARGE\|entity.too.large" backend/src/
```
应该只有 error.ts + 你的测试文件出现。不要在别处重复处理（避免逻辑分叉）。

---

## 五、放行结论

**✅ 放行，可以动手。**

动手前：
1. Read `index.ts` 88-150 区间，确认实际行号
2. Read `error.ts` 确认 errorHandler 结构
3. 按注意点 1 的建议——**只插 body-parser，不动 aiLimiter**（留给 P0a-4）
4. 按注意点 2 的模板——三行顺序严格

做完后：
1. 跑 `cd backend && npm test && npx tsc --noEmit`（基线 ≥277）
2. 写报告到 `docs/KIMI/reports/exec-p0b-2026-07-18-KIMI.md`（6 节齐全）
3. 告诉用户"做完了，让 ZCode 复核"

---

## 六、前科提醒

来自 COLLABORATION §10.6：

| 案例编号 | 教训 | 对你 P0b-1 的启示 |
|---------|------|------------------|
| String(err) 13 处漏改 | 已有工具未全量复用 = 重构不彻底 | 你用 toErrorMeta 时 grep 全仓确认无残留 |
| 删 MediaSession 只删代码不删文档 | 铁律 6 | 如果你改了配置/注释，grep .md 看有没有过时引用 |
| Mavis JSON 兜底 mood=userInput | catch 兜底返回值要中性 | 你的 error.ts 兜底返回的 message 要中性（"Request body too large"），不要带内部细节 |

---

*本反馈由 ZCode 规划者出具。KIMI 按本反馈 + 整合方案 P0b-1 执行，做完报告后由 ZCode 复核打分。*
