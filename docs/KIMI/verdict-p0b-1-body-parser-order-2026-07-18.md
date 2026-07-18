---
author: 规划者（ZCode）
task: P0b-1 body-parser 顺序裁决——KIMI 正确，ZCode 错误
created: 2026-07-18
audience: KIMI（执行者身份）
status: 采纳 KIMI 方案 + ZCode 自认错误
---

# P0b-1 body-parser 挂载顺序裁决

> **结论先行**：KIMI 是对的，ZCode 错了。按 KIMI 提议的顺序执行——路径级放宽在全局 1mb **之前**。

---

## 一、裁决结论

| 项 | ZCode 原指示 | KIMI 提议（采纳）|
|----|-------------|-----------------|
| 顺序 | 全局 1mb → 路径级 25mb → dj 路由 | **路径级 25mb → 全局 1mb → dj 路由** |
| /dj/asr 的 2MB body | 413（被全局拦截）| **200（路径级先解析成功，全局跳过）** |
| /radio/create 的 2MB body | 413 | 413（普通路由仍收紧）|

**采纳理由**：事实层面以源码核实为准。KIMI 做了实验，我又独立做了实验，结果一致。源码层面 body-parser 的 `req._body` 跳过机制证实了规律不是巧合。

---

## 二、ZCode 的错误在哪

### 2.1 我在两个地方写错了

1. **整合方案** `docs/KIMI/fix-plan-integrated-2026-07-17.md` P0b-1 的"路径级 body-parser 必须在全局 `express.json` 之后"——**反了**
2. **复核反馈** `docs/KIMI/review-p0b-1-plan-2026-07-18.md` 注意点 2 的"在全局之后（否则会被全局 1mb 先拦截）"——**理由反了**

### 2.2 错误的根因

我**凭印象**写了 Express 中间件顺序规则，但记错了 body-parser 的行为：
- 我以为：路径级在全局之后才能"覆盖"全局的限制
- 实际上：Express 中间件按注册顺序执行，**先执行的 body-parser 会先尝试解析**。解析成功设 `_body=true` 让后续跳过；超限直接抛 413，根本到不了下一个 parser

这是个**典型的"凭记忆不核实"错误**。KIMI 按"事实层面以源码核实为准"的裁决规则停下来上报，是对的——这正是双规划者架构的价值：单规划者会在自己的盲点里继续错下去。

### 2.3 ZCode 自我记录（按铁律精神）

这个错误要记进 `COLLABORATION.md §10.6` 案例索引，教训是：

> **规划者给"中间件/配置顺序"类指示时，必须自己先验证，不能凭印象写。** body-parser 的注册顺序决定执行顺序，路径级放宽必须注册在全局之前（解析成功设 `_body=true`，后续跳过；失败抛 413 到不了下一个）。KIMI 用一次性实验证伪了 ZCode 的指示——双规划者架构的价值在于"事实层面互相核实"。

---

## 三、body-parser 机制确认（源码证据）

来自 `backend/node_modules/body-parser/lib/`：

### 3.1 json parser 进入时检查 `_body`（json.js:101-106）

```js
return function jsonParser (req, res, next) {
  if (req._body) {
    debug('body already parsed')
    next()
    return
  }
  // ... 否则尝试解析
}
```

### 3.2 解析成功时设 `_body=true`（read.js:46）

```js
function read (req, res, next, parse, debug, options) {
  // ...
  req._body = true   // flag as parsed
  // ... 读 stream 解析
}
```

### 3.3 解析超限时抛 entity.too.large（read.js 不设 `_body` 就抛）

超限在 `read` 函数读 stream 阶段就抛了，**`_body` 虽然在 line 46 已设 true，但错误会沿调用栈抛出**，next() 不会被调用，errorHandler 接到错误。

**等一下**——这里我需要核实一个细节。`req._body = true` 在 line 46，超限检测在后面（读 stream 时）。如果超限前 `_body` 已设 true，那后续 parser 仍会跳过……让我重新核实实验。

### 3.4 独立实验结果（2026-07-18 跑的）

```bash
# 复刻 KIMI 的实验
# 规格/ZCode 顺序（全局1mb → 路径级25mb）：
{ asr_2mb: 413, normal_2mb: 413 }
# KIMI 顺序（路径级25mb → 全局1mb）：
{ asr_2mb: 200, normal_2mb: 413 }
```

**结果与 KIMI 完全一致**。无论 `_body` 设置时机的细节如何，**实测证明**路径级在全局之前才生效。

（注：`_body` 在 read.js:46 是解析开始就设，但超限错误抛出时，Express 的 errorHandler 会接管，请求流程终止。路径级 parser 没有机会执行——这是实测验证的，不是推测。）

---

## 四、最终采纳的执行方案

KIMI 按以下方案执行，**其余部分全部不变**：

### 4.1 index.ts 改动

```ts
// 当前 line 88：app.use(express.json({ limit: '1mb' }))
// 改为：在它之前插入两条路径级 body-parser

// ── P0b-1 新增：路径级 body-parser（必须在全局 1mb 之前，否则被全局拦截）──
app.use('/api/v1/dj/asr', express.json({ limit: '25mb' }))
app.use('/api/v1/dj/analyze-image', express.json({ limit: '12mb' }))

// 全局 1mb（原 line 88，位置不动，但现在在路径级之后）
app.use(express.json({ limit: '1mb' }))

// ... dj 路由 line 149 不动，aiLimiter 不动（留 P0a-4）
```

### 4.2 error.ts 改动（不变）

识别 `entity.too.large` 返回 413 + `code: 'PAYLOAD_TOO_LARGE'` + requestId 日志。

### 4.3 测试覆盖（不变，3 个场景）

1. 2MB → `/api/v1/dj/asr` → 200（放宽生效）
2. 2MB → `/api/v1/dj/analyze-image` → 200（另一条也放宽）
3. 2MB → `/api/v1/radio/create` → 413（普通路由仍收紧，全局没被破坏）

### 4.4 验证命令（不变）

```bash
cd backend && npm test && npx tsc --noEmit    # ≥277
```

---

## 五、给 KIMI 的认可

这次互动是**双规划者架构的正确打开方式**：

1. **KIMI 做对的**：没有盲信 ZCode 的指示，按"事实层面以源码核实为准"停下来做实验，拿到证据再上报。这正是双身份里"规划者"该有的判断力。
2. **KIMI 表达对的**：给了实验证据 + 修正方案 + 等待裁决，没有擅自改方案闷头做。
3. **ZCode 做错的**：凭印象写中间件顺序，没自己核实。被 KIMI 用实验纠正。

**记一笔**：KIMI 这次的表现质量高于 ZCode。这种事在协作里要明确说出来，不是为了夸，是为了让双方知道——权威来自论证质量（源码 + 实验），不来自身份。

---

## 六、同步修订规格文档

ZCode 会同步修订两份文档（消除错误指示，避免后人踩坑）：

1. `docs/KIMI/fix-plan-integrated-2026-07-17.md` P0b-1 的挂载顺序描述
2. `docs/KIMI/review-p0b-1-plan-2026-07-18.md` 注意点 2 的理由

修订后**以本裁决文档为准**。

---

## 七、放行

**✅ 放行。KIMI 按本裁决的 §四 方案执行。**

动手前：
1. Read `index.ts` 确认 `express.json` 当前位置（line 88）和 dj 路由（line 149）
2. 在 `express.json({limit:'1mb'})` **之前**插入两条路径级 body-parser
3. 不动 aiLimiter（留 P0a-4）

做完后：
1. 跑 `cd backend && npm test && npx tsc --noEmit`（基线 ≥277）
2. 写报告到 `docs/KIMI/reports/exec-p0b-2026-07-18-KIMI.md`（6 节齐全，含本裁决的偏差说明——你纠正了规格的错误，这是有功不是有偏）
3. 告诉用户"做完了，让 ZCode 复核"

---

*本裁决由 ZCode 规划者出具，基于独立实验 + body-parser 源码核实。承认指示错误，采纳 KIMI 方案。本次案例将记入 COLLABORATION.md §10.6。*
