---
author: ZCode（规划者，派给 MiNiMax 执行）
task: 短期清理两批（基于全面审核 full-review-2026-07-18）
created: 2026-07-18
executor: MiNiMax
basis: docs/ZCode/audits/full-review-2026-07-18.md（全面审核报告）
baseline: 后端 288 passed / 32 文件，前端 189 passed / 23 文件，tsc 双零（ZCode 2026-07-18 实跑核实）
---

# 短期清理计划（MiNiMax 执行，2 批）

> **来源**：全面审核（full-review-2026-07-18.md）筛出的"短期 + 机械 + 适合 MiNiMax"事项。
> **不含**：F4 仲裁层（已有独立规格 `docs/KIMI/plans/plan-f4-isplaying-arbiter-...`）、InputArea 录音 cleanup（结构性改动，留 F4 那批）、SSRF DNS 校验（B1-4，含外部调用，单独派）。
>
> **纪律**：严格按规格，不偏离/不加戏/不删减。遇规格未覆盖 → `NEEDS_CONTEXT` 停下问。每批做完跑 tsc+vitest，全绿才 commit。

---

## 〇、写给 MiNiMax 的话（前科提醒）

### ⚠️ 前科 1（你的历史教训）：删功能/依赖 grep 全项目

2026-07-05 删 MediaSession 漏 .md（§10.6 案例）；本轮 P1-3 下线 UPnP 时 KIMI 漏删 node-ssdp（full-review §七）。**删依赖/文件时**：
- 关键词要覆盖该功能的**全部技术栈**（UPnP = upnp-device-client + node-ssdp + ssdp）
- grep 不只 `.ts/.tsx`，必须 `--include="*.md"` 查文档
- 契约文档（HANDOVER/COLLABORATION/AGENTS/README/ARCHITECTURE）残留要清理或标注"已删除"
- 历史报告（docs/*/reports）保留原文（时点记录保真）

### ⚠️ 前科 2：改行号前 Read 确认（行号会漂移）

本规格的行号是 ZCode 2026-07-18 核实的，但**你改之前必须重新 Read 确认**——可能因之前的 commit 漂移。在那行能直接改才算核实到位。

### ⚠️ 前科 3（Mavis P1.1 教训）：catch 兜底不能用用户原始输入

批 2 的 B2-mimo 项正是修这个——`mood: ... : userInput` 兜底要改成中性值 `'随机'`。别"觉得 userInput 也挺合理"就保留，这是已裁决的教训。

---

## 批 1：死代码/死依赖/文档漂移清理（commit 1：`chore: 死代码+死依赖+文档漂移清理`）

> 纯机械删除/替换，无逻辑改动，无架构决策。

### B1-1 删 node-ssdp 死依赖（P1-3 UPnP 下线收尾）

**根因**：UPnP 已于 2026-07-18 下线（commit `540a92d`），`upnp-device-client` 已删，但 **`node-ssdp` 残留**。源码零 import（3 个 agent + ZCode 四方确认）。

**改法**（3 步）：
1. `backend/package.json:21` 删 `"node-ssdp": "^4.0.1",`
2. 删 `backend/src/types/node-ssdp.d.ts`（类型声明 stub，随依赖一起清）
3. `cd backend && npm install`（清理 node_modules + lockfile）

**验证（铁律 6，你的前科重灾区，严格执行）**：
```bash
# 改前确认零引用
grep -rn "node-ssdp\|ssdp" backend/src/ --include="*.ts" | grep -v "\.test\." | grep -v "\.d\.ts"
# 应只剩 node-ssdp.d.ts 自身（即将删）→ 改前应为 0 或仅 .d.ts

# 改后确认
grep -rn "node-ssdp\|ssdp" backend/src/ --include="*.ts"   # 零匹配
grep -n "node-ssdp" backend/package.json                   # 零匹配
grep -rn "node-ssdp" --include="*.md" . | grep -v "docs/.*reports\|docs/.*audits\|docs/KIMI/code-review\|docs/KIMI/fix-plan\|docs/KIMI/batch-execution\|docs/KIMI/roadmap\|docs/KIMI/prompt-batch\|docs/MiNiMax/plans\|docs/MiNiMax/reports/exec-p0a\|docs/ZCode/audits"
# 契约文档（HANDOVER/COLLABORATION/AGENTS/README/ARCHITECTURE）零残留；历史报告保留
```
跑 `cd backend && npx tsc --noEmit`（零错误，证明删依赖不破坏构建）。

**边界**：只删 node-ssdp 相关。别"顺手"删别的看起来没用的依赖。

### B1-2 删 icons.tsx 死组件

**根因**：`frontend/src/components/icons.tsx` 导出 6 个图标组件（PlayIcon/PauseIcon/PrevIcon/NextIcon/KimiIcon/SendIcon），全前端零 import（代码库用内联 SVG）。

**改法**：
1. 改前 grep 确认零引用（防规格错）：
   ```bash
   grep -rln "from.*components/icons\|from.*'@/components/icons'\|from.*'\./icons'" frontend/src/
   # 空=零引用，继续；有输出=NEEDS_CONTEXT 停下
   ```
2. 删 `frontend/src/components/icons.tsx`

**验证**：
```bash
grep -rn "from.*icons" frontend/src/ --include="*.ts" --include="*.tsx"  # 零匹配
cd frontend && npx tsc --noEmit   # 零错误
```

**边界**：只删 icons.tsx。别删别的无引用文件（如 OnAirBadge 等——那些可能被 JSX 直接用，需另核）。

### B1-3 COLLABORATION.md 端口漂移修正

**根因**：COLLABORATION.md 3 处写前端 `:3001`，实际 3000（config.ts/.env.example/README/start.* 全是 3000）。

**改法**（逐处，改前 Read 确认行号）：
- `COLLABORATION.md` §2.2 架构图：`PWA 前端（...）  :3001` → `:3000`
- `COLLABORATION.md` §5.2：`前端 :3001（next dev 默认 3000，看实际）` → `前端 :3000（next dev 默认 3000）`
- `COLLABORATION.md` §5.3：`python wb.py navigate '{"url":"http://localhost:3001"}'` → `3000`

**注意**：这是 ZCode 维护的主契约文件，但端口口径统一是机械替换，MiNiMax 可代执行（ZCode 授权）。**只改这 3 处端口，别动其他内容**。

**验证**：`grep -n ":3001" COLLABORATION.md` → 零匹配（或只剩注释性历史说明）。

### B1-4 ARCHITECTURE.md 端口修正

**根因**：ARCHITECTURE.md §七写 `PORT=8000`、§八写 `localhost:8000`，实际 8001。

**改法**：
- `ARCHITECTURE.md` `PORT=8000` → `PORT=8001`（2 处，改前 grep 定位）
- 该文件已有"已过时"头注，**只修端口数字，不重写正文**（正文 Claude/UPnP 残留是已知过时，重写是另一个任务）

**验证**：`grep -n ":8000\|PORT=8000" ARCHITECTURE.md` → 零匹配。

### B1-5 HANDOVER.md DJ 串词字数矛盾

**根因**：HANDOVER §四第 7 条说"intro/transition/chat 三入口统一 60-120 字"，但 §七"已达成"仍写"DJ 串词深度（80-150字）"——同一文档两处打架。

**改法**：§七的 `80-150字` → `60-120字`（对齐 §四的已裁决规格）。

**验证**：`grep -n "80-150\|80～150\|80—150" HANDOVER.md` → 零匹配。

---

## 批 2：安全 + 正确性小修（commit 2：`fix: sessionAuth query token 移除 + mood 兜底 + plan setTimeout 清理`）

> 每项都是小切口逻辑修复，有明确根因和改法。

### B2-1 sessionAuth 移除 query token（backlog B1-1）

**根因**：`sessionAuth.ts:17-18` 仍接受 `req.query?.session_token`。token 走 URL 会进 access log/browser history/Referer/proxy log，被动泄漏。前端零引用 query 传参（ZCode 已 grep 确认 `grep -rn "session_token=" frontend/src` 零匹配）。

**改法**（`backend/src/middleware/sessionAuth.ts`，改前 Read :14-18 确认）：
```ts
// 改前
const token =
  (req.headers['x-session-token'] as string) ||
  req.body?.session_token ||
  req.query?.session_token

// 改后（删 query 分支）
const token =
  (req.headers['x-session-token'] as string) ||
  req.body?.session_token
```
同时更新文件头注释（如有提到 "Query param: session_token" 的，删掉该行）。

**验证**：
- 改后 grep `query.*session_token\|req.query` in sessionAuth.ts → 零匹配
- `cd backend && npx vitest run src/middleware/`（确认 sessionAuth 测试不回归）
- **若现有测试有用 query 传 token 的用例**：那些用例断言的是旧行为，需同步改为"query 传 token → 401"。这属于规格要求的测试同步（非"为过测试改断言"）。

**边界**：只删 query 分支。保留 header + body 两种传法。

### B2-2 mimo.ts mood 字段类型异常兜底（Mavis P1.1 收尾）

**根因**：`backend/src/services/mimo.ts:140` `mood: typeof json.mood === 'string' ? json.mood : userInput`——JSON 解析成功但 mood 字段类型错时，仍用**用户原始输入**兜底。Mavis P1.1 教训正是"catch 兜底不能用用户原始输入"（会喂下游匹配逻辑造成意外命中）。JSON 完全 parse 失败的 catch（:147）已修为 `'随机'`，但字段类型异常分支未对齐。

**改法**（单行，改前 Read :135-148 确认）：
```ts
// 改前（:140）
mood: typeof json.mood === 'string' ? json.mood : userInput,

// 改后
mood: typeof json.mood === 'string' ? json.mood : '随机',
```

**验证**：
- `cd backend && npx vitest run src/services/mimo.test.ts`（确认推荐策略测试不回归）
- grep `: userInput` in mimo.ts → 应只剩 reason 字段（如 :143 `reason: ... response.slice(0,50)`，那个不是 userInput 是 response 切片，合理保留）；mood 兜底不再用 userInput

**边界**：只改 mood 字段兜底。别动 genres/energy/reason 的兜底逻辑（它们用 `[]`/`'medium'`/`response.slice` 是合理的）。

### B2-3 plan/page.tsx 重试 setTimeout 存 id + cleanup（资源泄漏小修）

**根因**：`frontend/src/app/plan/page.tsx:99` `setTimeout(() => doFetch(true), 2000)` 未保存 timer id，组件 unmount 时无法 clearTimeout，doFetch 会 setState 已卸载组件。

**改法**（改前 Read :40-105 理解 doFetch 结构）：
```ts
// 需要一个 ref 存重试 timer
const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// 在 setTimeout 处（:99）
if (data.tracksLoaded === false && retryCountRef.current < MAX_RETRIES) {
  retryCountRef.current += 1
  if (retryTimerRef.current) clearTimeout(retryTimerRef.current)  // 清上一个
  retryTimerRef.current = setTimeout(() => doFetch(true), 2000)
}

// 组件 unmount cleanup（加 useEffect 或在既有 cleanup 里补）
useEffect(() => {
  return () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
  }
}, [])
```

**铁律 1（资源成对）**：retryTimerRef 的 setTimeout 与 clearTimeout 必须成对——新 setTimeout 前清旧，unmount 时清当前。

**验证**：
- `cd frontend && npx tsc --noEmit`（零错误）
- `cd frontend && npx vitest run`（全前端测试，确认 plan 页不回归）
- 若有 plan/page 测试：确认重试逻辑仍工作（retryCount 上限保护不变）

**边界**：只修这个 setTimeout。别动 doFetch 的其他逻辑（retryCount/MAX_RETRIES/setData）。

### B2-4 sessionAuth 测试同步（B2-1 配套）

如果 B2-1 删 query 分支后，现有 sessionAuth 测试有用 query 传 token 的用例（预期 200/next），需同步改为预期 401（query 不再被接受）。**先 grep 测试文件确认有无此类用例**：
```bash
grep -rn "session_token.*query\|query.*session_token\|session_token=" backend/src/middleware/sessionAuth.test.ts backend/src/middleware/*.test.ts 2>/dev/null
```
- 有用例：改为"query 传 token → 401 missing/invalid"
- 无用例：新增一个用例覆盖"query 传 token 被拒"

---

## 交付与验收

### 每批验证
```bash
# 后端（批 1 的 B1-1/B1-3/B1-4 + 批 2 全涉及）
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run
# 前端（批 1 的 B1-2 + 批 2 的 B2-3）
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run
```
**验收线**：后端 ≥ 288 / 前端 ≥ 189，tsc 双零。测试数只允许因新增用例上升。

### Commit（2 个）
```bash
# 批 1
git add -A && git commit -m "chore: 死代码+死依赖+文档漂移清理（node-ssdp/icons.tsx/端口口径/串词字数）"
git push origin master

# 批 2
git add -A && git commit -m "fix: sessionAuth query token 移除 + mood 兜底改中性值 + plan setTimeout 清理"
git push origin master
```

### 执行报告（强制落盘，2 份）

- `docs/MiNiMax/reports/exec-shortterm-batch1-2026-07-18-MiNiMax.md`
- `docs/MiNiMax/reports/exec-shortterm-batch2-2026-07-18-MiNiMax.md`

**8 节齐全**（摘要/改动明细/验证/偏差/自评/前科复盘/状态/落款）。重点：
- 批 1 的 B1-1：**铁律 6 复盘**——node-ssdp grep `.md` 查到几处、哪些是契约文档已清/哪些是历史报告保留，逐条说明
- 批 2 的 B2-1：测试同步情况（有无 query 用例、怎么改的）
- 数字必须真实（288/189 实测）

---

## 不在本计划内（边界）

- ❌ F4 isPlaying 仲裁层（独立规格 `docs/KIMI/plans/plan-f4-isplaying-arbiter-...`）
- ❌ InputArea MediaRecorder cleanup（结构性，留 F4 那批）
- ❌ SSRF DNS 校验（B1-4，含外部调用，单独派）
- ❌ API 响应 envelope 统一（musicSource/qqmusic，多文件契约改动，另开规格）
- ❌ generalLimiter skip /health（B1-2，留 backlog 批）
- ❌ logger 换行 sanitize（B1-3，留 backlog 批）
- ❌ feedback TTL 清理（B2-5，留 backlog 批）
- ❌ git PAT 撤销（用户自己做，非代码）
- ❌ 不重写 ARCHITECTURE.md 正文（只修端口数字）

---

*本计划由 ZCode 规划者派出。MiNiMax 完成后报告落盘，用户中转给 ZCode 复核。*
