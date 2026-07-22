---
author: ZCode（规划者，派给 MiNiMax 执行）
task: P0a 机械清理 5 项（从 fix-plan-integrated 抽取 + MiNiMax 专属前科提醒）
created: 2026-07-18
executor: MiNiMax
basis: docs/KIMI/fix-plan-integrated-2026-07-17.md §P0a
baseline: 后端 277 passed / 32 文件，前端 179 passed / 23 文件，tsc 双零（ZCode 2026-07-18 实跑核实）
---

# P0a 机械清理任务规格（MiNiMax 执行）

> **你（MiNiMax）要做的**：5 项机械清理。本规格每项都给了**根因 / 精确行号（可能漂移，改前 Read 确认）/ 改法 / 验证 / 边界**。
>
> **纪律**：严格按规格做，不偏离、不加戏、不删减。遇规格未覆盖 → `NEEDS_CONTEXT` 停下问，不要猜。
>
> **每项做完跑 tsc + 相关 vitest；全部做完跑全量验证，一次性 commit**（详见 §交付）。

---

## 〇、写给 MiNiMax 的话（前科提醒，必读）

### ⚠️ 前科 1（你的历史教训，最高危）：删功能只删代码不删文档

你在 2026-07-05 删 MediaSession 时，删了 `.ts/.tsx` 但漏了 HANDOVER.md 5 处 `.md` 文档引用，导致文档残留"已实现"误导后人。这条教训已经写进 **COLLABORATION §10.6 最后一条**和**铁律 6**。

**本次 P0a-5 是删除任务**。删 `TtsEngineSwitcher.tsx` / `MarkdownText.tsx` 时：
- 不只 grep `.ts/.tsx`，必须 `grep -rn "功能名" --include="*.md"` 连文档一起查
- `.md` 里的引用：历史报告（docs/*/reports）里的**可标注"已删除"或不改**（历史记录要保真）；但 HANDOVER / COLLABORATION / AGENTS.md / ARCHITECTURE 这类**当前契约文档**的引用必须清理或标注
- **代码零残留 ≠ 功能零残留**——删完报"`*.ts` 零引用"不够，要报"`.md` 引用 X 处，处理方式：..."

### ⚠️ 前科 2（fix-plan 已标注）：aiLimiter 别各自 new

P0a-4 要把 aiLimiter 从 `index.ts` 抽到共享模块 `middleware/aiLimiter.ts`，`radio.ts` 和 `dj.ts` import 同一个实例。
**别在两个文件里各自 `new RateLimit(...)`**——限流配额会翻倍（两套独立计数器）。必须 import 同一个。

### ⚠️ 前科 3：F4 全屏 seek 照搬 KimiCard 模式，别自己发明

P0a-3 的改法在 `KimiCard.tsx:43-86` 的 ProgressBar 已经验证过（`setCurrentTime + onSeek` 双调用）。**照搬那个模式**，别想"换个更优雅的写法"。铁律 4：替换已验证方案前必须理解原方案为什么这么写。

---

## 一、P0a-1 helmet 测试同步（抽共享配置）

**根因**：`index.ts:49` 已是 `styleSrc: ["'self'"]`，但 `security-headers.test.ts:19` 还是旧的 `["'self'","'unsafe-inline'"]`。测试测自己的副本，配置改坏也照绿。

**改法**（3 步）：

1. 新建 `backend/src/config/securityHeaders.ts`：
```ts
import type { ContentSecurityPolicyOptions } from 'helmet'

/** CSP 配置单一来源 —— index.ts 和 security-headers.test.ts 共享，杜绝快照漂移 */
export const CSP_DIRECTIVES: ContentSecurityPolicyOptions = {
  useDefaults: false,
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],            // 纯 JSON 后端，无 CSS 资源
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  // 其余 directive 从 index.ts:46-58 原样搬过来（改前 Read index.ts 确认完整列表）
}
```

2. `index.ts` 改为引用：
```ts
import { CSP_DIRECTIVES } from './config/securityHeaders'
// 原 helmet({ contentSecurityPolicy: { directives: {...} } }) 改为
app.use(helmet({ contentSecurityPolicy: CSP_DIRECTIVES }))
```

3. `security-headers.test.ts` 改为引用 CSP_DIRECTIVES，断言用 `CSP_DIRECTIVES.styleSrc`，不再手写字符串。

**验证**：
- `cd backend && npx tsc --noEmit`（零错误）
- `npx vitest run src/middleware/security-headers.test.ts`
- 故障注入验证：把 CSP_DIRECTIVES 的 styleSrc 改成带 `'unsafe-inline'`，测试应**红**（证明测试现在测的是真实配置）

**边界**：不改 CSP 策略本身（仍是 `'self'` 严格策略），只是抽共享来源。

---

## 二、P0a-2 端口口径统一

**根因**：前端真实端口是 3000（不是 3001），多处文档/脚本/配置写错。

**改法**（逐文件）：

| 文件 | 当前 | 改为 |
|------|------|------|
| `backend/.env.example:2` | `PORT=8000` | `PORT=8001` |
| `backend/src/config.ts:15` CORS 白名单 | 缺 3000 | 补 `'http://localhost:3000'`（**保留** 3001/3002/3003，兼容显式指定端口的场景）|
| `start.sh:74,94` | `localhost:3001` | `localhost:3000` |
| `start.bat:51,63` | `localhost:3001` | `localhost:3000` |
| `start.ps1:62,83` | `localhost:3001` | `localhost:3000` |

**改前 Read 每个文件确认行号**（可能漂移）。CORS 白名单补 3000 是**追加**不是替换。

**验证**：
- `cd backend && npx tsc --noEmit`
- `grep -rn "3001" start.sh start.bat start.ps1`（应只剩注释里的历史说明，或零匹配）
- 后端测试全跑：`npx vitest run`（确认 CORS 改动没破坏测试）

**边界**：不改 `.env`（真实密钥文件），只改 `.env.example`。不改前端端口配置（Next.js 默认 3000 本就对）。

---

## 三、P0a-3 F4 全屏进度条 seek

**根因**：`FullscreenPlayer.tsx` 的进度条 onClick 只 `setCurrentTime(t)`，没调 `handleSeek`，点击后进度条"弹跳"（UI 更新了但音频没 seek）。

**改法**（3 处，照搬 KimiCard 模式）：

1. `FullscreenPlayer.tsx` 主组件加 `onSeek` prop（改签名）
2. `FullscreenProgressBar` 接收并使用：
```tsx
onClick={(e) => {
  const r = e.currentTarget.getBoundingClientRect()
  const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  const t = p * duration
  setCurrentTime(t)
  onSeek?.(t)        // ← 新增：真正 seek audio
}}
```
3. `page.tsx` 传 prop：`<FullscreenPlayer onSeek={handleSeek} />`

**对照参考**：`KimiCard.tsx:43-86` 的 ProgressBar（`setCurrentTime + onSeek` 双调用）已验证正确。**照搬**。

**改前 Read**：
- `FullscreenPlayer.tsx` 全文（确认 FullscreenProgressBar 定义位置 + onClick 当前实现 + prop 传递链）
- `KimiCard.tsx:43-86`（对照模式）
- `page.tsx` 里 `<FullscreenPlayer` 的调用处（确认怎么传 onSeek）

**验证**：
- `cd frontend && npx tsc --noEmit`
- `npx vitest run src/components/FullscreenPlayer.test.tsx`
- **E2E（铁律 5 不强制，但推荐）**：webbridge 打开前端，进全屏，点进度条中段，观察音频是否跳到中段（不只是 UI 跳）

**边界**：不动 KimiCard 的 ProgressBar（它本来就对）。不动 `setCurrentTime` 逻辑（它管 UI 状态）。只补 `onSeek` 这条线。

---

## 四、P0a-4 aiLimiter 拆挂载

**根因**：`index.ts:148-149` 整个 router 挂 aiLimiter，GET `/radio/models`、`/radio/songs`、`/:id/queue` 都消耗 10 次/分钟配额；feedback 的 30/分钟 limiter 永远到不了。

**改法**（3 步）：

1. **抽共享模块** `backend/src/middleware/aiLimiter.ts`：
```ts
import rateLimit from 'express-rate-limit'

/** AI 路由限流器（全局唯一实例，radio.ts / dj.ts 共用，别各自 new） */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  // ... 其余配置从 index.ts 原样搬
})
```

2. `index.ts:148-149` **移除** router 级 aiLimiter：
```ts
app.use('/api/v1/radio', radioRoutes)   // 去掉 aiLimiter
app.use('/api/v1/dj', djRoutes)          // 去掉 aiLimiter
```

3. `radio.ts` 和 `dj.ts` 内部**只在 POST 路由**挂 aiLimiter：
```ts
// radio.ts —— 只挂 create/next/chat
router.post('/create', aiLimiter, validateBody(...), ...)
router.post('/:id/next', aiLimiter, sessionAuth, ...)
router.post('/:id/chat', aiLimiter, sessionAuth, validateBody(...), ...)
// GET（models/songs/queue）不挂；feedback 保留自己的 feedbackLimiter

// dj.ts —— 只挂 tts/intro/asr/analyze-image/transition
router.post('/tts', aiLimiter, validateBody(...), ...)
router.post('/intro', aiLimiter, validateBody(...), ...)
router.post('/asr', aiLimiter, validateBody(...), ...)
router.post('/analyze-image', aiLimiter, validateBody(...), ...)
router.post('/transition', aiLimiter, validateBody(...), ...)
```

**改前 Read**：`radio.ts` 和 `dj.ts` 全部路由定义，确认哪些是 POST、哪些是 GET；`index.ts:148-149` 确认 aiLimiter 当前配置（windowMs/max）。

**验证**：
- `cd backend && npx tsc --noEmit`
- `npx vitest run`（全后端测试，确认限流测试不回归）
- `grep -n "aiLimiter" backend/src/index.ts`（应只剩 import 或零引用）
- `grep -rn "new rateLimit\|rateLimit(" backend/src/routes/radio.ts backend/src/routes/dj.ts`（应只 import 不 new）

**边界**：不改 aiLimiter 的限流参数（10 次/分钟）。不改 feedbackLimiter。GET 路由不挂任何 AI 限流。

---

## 五、P0a-5 死代码清理（⚠️ 铁律 6，你的前科重灾区）

**删除目标**（grep 确认零引用后删）：
- `frontend/src/components/TtsEngineSwitcher.tsx`
- `frontend/src/components/MarkdownText.tsx`

**改法（严格按这个顺序，别跳步）**：

1. **先 grep 代码引用**：
```bash
grep -rn "TtsEngineSwitcher\|MarkdownText" frontend/src/ backend/src/ --include="*.ts" --include="*.tsx"
```
若返回 import / `<TtsEngineSwitcher>` / `<MarkdownText>` 等引用 → **停下，NEEDS_CONTEXT 报告**（说明不是死代码，规格错了）。若零引用 → 继续。

2. **再 grep 文档引用**（⚠️ 你的历史教训，别漏这步）：
```bash
grep -rn "TtsEngineSwitcher\|MarkdownText" --include="*.md" .
```
分类处理：
- **当前契约文档**（HANDOVER.md / COLLABORATION.md / AGENTS.md / ARCHITECTURE.md / README.md）：有引用则清理或标注"已删除（2026-07-18）"
- **历史报告**（docs/*/reports, docs/*/audits）：**不改**（历史记录要保真）
- 报告里查到的引用数和处理方式写进执行报告

3. **删文件**。

**验证**：
- 删后 `grep -rn "TtsEngineSwitcher\|MarkdownText" frontend/src/ backend/src/ --include="*.ts" --include="*.tsx"` 零匹配
- `cd frontend && npx tsc --noEmit`（零错误，证明无残留依赖）
- `npx vitest run`（全前端测试）

**边界**：只删这 2 个文件。别"顺手"删别的看起来没用的文件。

---

## 六、交付与 commit

### 验证（全部 5 项做完后跑一次）

```bash
# 后端
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run
# 前端
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run
```

**验收线**：后端 ≥ 277 / 前端 ≥ 179，tsc 双零。低于基线 = 回归，停下报告。

### Commit（一次性）

5 项全做完、验证全过，**一次性 commit**（不要每项一个 commit）：

```bash
git add -A
git commit -m "fix(P0a): helmet 共享源 + 端口口径 + F4 全屏 seek + aiLimiter 拆挂载 + 死代码清理"
git push origin master
```

### 执行报告（强制落盘）

位置：`docs/MiNiMax/reports/exec-p0a-2026-07-18-MiNiMax.md`

**8 节齐全**（缺节打回，见 COLLABORATION §四报告规范）：
1. 执行摘要（5 项各一句话）
2. 改动明细（表格：文件 | 改动内容 | 行号）
3. 验证结果（tsc 零错 + 后端 N passed / 前端 N passed + P0a-5 的 `.md` grep 结果）
4. 与规格的偏差（有则声明，无则写"无偏差"）
5. 自评（你发现的问题/风险）
6. 前科复盘（⚠️ 重点：P0a-5 铁律 6 你怎么守的——.md 引用查到几处、怎么处理的；P0a-4 怎么保证只 import 不 new 的）
7. 状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）
8. 落款 `*报告由 MiNiMax 生成。*`

**报告里的数字必须真实**——别写"测试通过"，写"后端 277 passed / 32 文件"。P0a-5 的 `.md` 引用处理要逐条说明。

---

## 七、边界汇总（不要做这些）

- ❌ 不改 CSP 策略内容（P0a-1 只抽来源）
- ❌ 不改 `.env` 真实密钥文件（P0a-2 只改 `.env.example`）
- ❌ 不删 CORS 白名单里的 3001/3002/3003（P0a-2 是追加 3000）
- ❌ 不动 KimiCard 的 ProgressBar（P0a-3 只改 FullscreenPlayer）
- ❌ 不改 aiLimiter 限流参数 / 不改 feedbackLimiter（P0a-4 只改挂载位置）
- ❌ 不改 start 脚本以外的端口引用（P0a-2 只管那 5 个文件）
- ❌ 不"顺手"删目标外的文件（P0a-5 只删 2 个）
- ❌ 不碰 F4 仲裁层 / backlog 15 项 / P0b（那些是别的阶段）

---

*本规格由 ZCode 规划者派出。MiNiMax 完成后报告落盘 `docs/MiNiMax/reports/exec-p0a-2026-07-18-MiNiMax.md`，然后用户中转给 ZCode 复核。*
