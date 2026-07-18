---
author: 规划者（ZCode）
task: mimo-radio 后续完整计划（P0b-1 之后）
created: 2026-07-18
basis: docs/KIMI/fix-plan-integrated-2026-07-17.md + 实际核实
status: 规划中
---

# mimo-radio 后续完整计划（P0b-1 之后）

> **背景**：P0b-1（R1 body 上限）已完成 + ZCode 复核通过（A+）。本文档梳理**从 P0b-2 起到 backlog 全部剩余事项**，作为给 KIMI 的执行路线图。
>
> **数据基准**：2026-07-18 实测——后端 281 / 前端 179（P0b-1 的 +4 已计入）/ tsc 双零 / git 工作区未提交（P0b-1 等提交）。

---

## 一、当前快照

### 1.1 已完成

| 阶段 | 任务 | 状态 | 测试增量 | commit |
|------|------|------|---------|--------|
| 第 5 轮 | chat 防重入 + composeSystemPrompt | ✅ | +9（前 6 后 3）| `b32ad68` + `6656838` |
| P1 残留 | String(err)/req as any 各 1 处 | ✅ | 0 | `6ffe1aa` |
| **P0b-1** | R1 body 上限 | ✅ **待提交** | +4（后端）| 未提交 |

### 1.2 未提交的工作区改动

```
 M COLLABORATION.md                          ← §10.6 加了 body-parser 案例行
 M backend/src/index.ts                      ← P0b-1 路径级 body-parser
 M backend/src/middleware/error.test.ts      ← P0b-1 测试
 M backend/src/middleware/error.ts           ← P0b-1 413 识别
 M docs/KIMI/fix-plan-integrated-2026-07-17.md ← 挂载顺序修订
?? docs/KIMI/reports/exec-p0b-1-...md        ← KIMI 报告
?? docs/KIMI/review-p0b-1-plan-...md         ← ZCode 方案反馈
?? docs/KIMI/review-p0b-1-exec-...md         ← ZCode 复核结论
?? docs/KIMI/verdict-p0b-1-...md             ← 顺序裁决文档
```

**第一件事**：让 KIMI 把 P0b-1 commit + push（提交信息已写好，见 `review-p0b-1-exec-2026-07-18.md` §三.2）。文档变更（COLLABORATION 案例 + 4 份 docs/KIMI）一并入库。

---

## 二、剩余计划总览（14 项 + backlog）

按整合方案 + ZCode 复核调整后的真实顺序：

| 序 | 任务 | 优先级 | 执行者 | 成本 | 依赖 |
|----|------|--------|--------|------|------|
| **P0b-2** | R2 鉴权 fail-closed | 🔴 | KIMI | 0.5 天 | 无 |
| **P0b-3** | F1 收藏上报反向 + 改误导注释 | 🔴 | KIMI | 0.5 天 | 无 |
| **P0b-4** | B6 tasteCache 按 limit 分 key | 🔴 | KIMI | 0.5 天 | 无 |
| **P1-1** | B2 fetchWithTimeout body 超时 + 5xx 熔断 | 🟠 | KIMI | 0.5 天 | 无 |
| **P1-2a** | F2 useAudioPlayer QQ 监听泄漏（ref 模式）| 🟠 | KIMI | 0.5 天 | 无 |
| **P1-2b** | F3 useTTS 加 AbortController | 🟠 | KIMI | 0.5 天 | 无 |
| **P1-2c** | F5 PlayerBar 换歌重置 localTime | 🟠 | KIMI | 0.5 天 | 无 |
| **P1-3** | UPnP 下线（含入口注册清理）| 🟠 | KIMI | 0.5 天 | 无 |
| **P0a-1** | B5 helmet 测试同步（抽 config 单一来源）| 🟡 | ZCode | 1h | 无 |
| **P0a-2** | B7 端口口径统一 | 🟡 | ZCode | 1h | 无 |
| **P0a-3** | F4 全屏进度条 seek | 🟡 | ZCode | 1h | 无 |
| **P0a-4** | B1 aiLimiter 拆挂载 | 🟡 | ZCode | 1.5h | P0b-1 已完成（不冲突）|
| **P0a-5** | 死代码清理（TtsEngineSwitcher/MarkdownText）| 🟡 | ZCode | 0.5h | 无 |
| **P2-1** | C2 tsconfig exclude test + C3 gitignore + git rm | 🟢 | 任意 | 0.5 天 | 无 |
| **P2-2** | B7 死配置 + C6 仓库卫生 + app 工厂函数抽取（B5 根治）| 🟢 | 任意 | 0.5 天 | P2-1 |
| **P2-3** | C4/C5 文档更新（README/HANDOVER/ARCHITECTURE）| 🟢 | 任意 | 0.5 天 | 全部完成后 |

**总剩余成本**：约 4-5 天（KIMI 3 天 + ZCode 0.5 天 + P2 任意 1.5 天）。

---

## 三、推荐执行顺序（按风险/依赖排）

### 阶段 1：KIMI 收尾 P0b（3 项，1.5 天）

**先做 P0b-2 / P0b-3 / P0b-4**，三项独立无依赖，可顺序做。每项做完**单项 commit + push + 报告 + ZCode 复核**（沿用 P0b-1 流程）。

#### P0b-2：R2 鉴权 fail-closed（最关键的安全项）

- **位置**：`backend/src/middleware/auth.ts` + `backend/src/utils/sessionToken.ts` + `backend/src/index.ts`
- **规格**：`fix-plan-integrated-2026-07-17.md` line 194-241
- **ZCode 调整 1（必读）**：方向反转——**显式配 `NODE_ENV=production` 才严格，没配就警告但能跑**。不是"非 dev 拒绝启动"。
- **关键点**：
  1. `auth.ts` 当前 `!apiKey && nodeEnv!=='production'` 放行逻辑**保留不动**
  2. `sessionToken.ts:20` 的 `DEV_FALLBACK_SECRET`：production 用它 → 启动抛错；非生产可用但日志警告
  3. `index.ts` 启动时加警告日志：`⚠️ API_KEY not set and NODE_ENV != production — auth DISABLED`
  4. 启动校验：`NODE_ENV=production + 无 API_KEY` → throw 拒绝启动
- **验证**：不设 NODE_ENV+API_KEY → 启动成功+警告 / `NODE_ENV=production`+无 API_KEY → 启动抛错 / `NODE_ENV=production`+有 API_KEY → 启动成功+鉴权生效
- **新增测试**：`sessionToken.test.ts` 加 production 无 secret 抛错用例

#### P0b-3：F1 收藏上报反向 + 改误导注释

- **位置**：`frontend/src/components/KimiCard.tsx:121-148`
- **规格**：`fix-plan-integrated-2026-07-17.md` line 243-293
- **关键点**：
  1. `handleLike` 用 `useRadioStore.getState().likedSongIds.includes(id)` 读最新值（绕闭包陈旧）
  2. **改掉 KimiCard.tsx:121 的误导注释**（原"F1 修复：订阅数组"只解决一半）
  3. `useCallback` 依赖数组去掉 `isSongLiked`（改用 getState）
- **参考模式**：chat 防重入的 `pendingId`（也是用 getState 绕闭包）
- **验证**：点收藏→后端 `Feedback: like` / 取消→`Feedback: unlike` / 快速连点→只发最后一次+action 一致
- **新增测试**：`KimiCard.test.tsx`（如不存在则建）断言 toggleLike 后上报 action 与新状态一致

#### P0b-4：B6 tasteCache 按 limit 分 key

- **位置**：`backend/src/utils/tasteCache.ts`
- **规格**：`fix-plan-integrated-2026-07-17.md` line 295-348
- **关键点**：缓存 key 改 `liked:${limit}` / `disliked:${limit}`，用 Map 替代单槽
- **验证**：30s 内先调 `getLikedArtists(3)` 再调 `getLikedArtists(5)` 返回不同长度
- **新增测试**：`tasteCache.test.ts` 加不同 limit 不互相污染用例

---

### 阶段 2：KIMI 做 P1（4 项，2 天）

#### P1-1：fetchWithTimeout body 超时 + 5xx 熔断

- **位置**：`backend/src/utils/fetchWithTimeout.ts` + `backend/src/index.ts:136`
- **规格**：line 350-398
- **关键点**：
  1. body 超时：导出 `readBodySafely(res, timeoutMs)` 包装函数（推荐方案 A），让调方显式选择是否加超时
  2. `fetchWithTimeout.ts:121` 加 `else if (res.status >= 500)` 分支计入熔断失败
  3. `index.ts:136` 的 `req.setTimeout` 回调加 `req.destroy()`（中止 handler）
- **前科提醒**：别在 fetchWithTimeout 内覆盖整个 body 读取（职责混淆）

#### P1-2a：F2 useAudioPlayer QQ 监听泄漏

- **位置**：`frontend/src/hooks/useAudioPlayer.ts:77-86`
- **规格**：line 399-450（F2 部分）
- **关键模式**（ZCode 补充）：ref 存 cleanup
  ```ts
  const cleanupRef = useRef<(() => void) | null>(null)
  // async 分支里：cleanupRef.current = setupAudio(data.url)
  // effect cleanup：cleanupRef.current?.()
  ```
- **前科提醒**：`cancelled = true` 单独不够，必须配 cleanupRef
- **回归测试**：参考现有 `useAudioPlayer.sideffects.test.ts` 模式

#### P1-2b：F3 useTTS 加 AbortController

- **位置**：`frontend/src/hooks/useTTS.ts`
- **规格**：line 450-480（F3 部分）
- **关键模式**（ZCode 补充）：复用 chat 防重入的 `chatAbortRef`（提交 `b32ad68`）
  ```ts
  const ttsAbortRef = useRef<AbortController | null>(null)
  // speak 内：if (ttsAbortRef.current) ttsAbortRef.current.abort()
  // fetch 加 signal
  // catch 处理 AbortError 静默 return null
  // stop() 里也 abort
  ```
- **前科提醒**：不重新发明轮子，直接套用已验证的 chat 模式

#### P1-2c：F5 PlayerBar 换歌重置 localTime

- **位置**：`frontend/src/components/PlayerBar.tsx:14-32`
- **规格**：line 480-500（F5 部分）
- **关键点**：监听 `currentSong?.id` 变化时重置 `localTime`
  ```ts
  useEffect(() => {
    setLocalTime(useRadioStore.getState().currentTime)
  }, [currentSong?.id])
  ```
- **评估**：最简单的一项，可顺手评估"直接订阅 store currentTime"简化设计

#### P1-3：UPnP 下线（含入口清理）

- **位置**：多文件
- **规格**：line 503-525
- **铁律 6 重点**：删完 grep 全项目含 .md
- **删除清单**：
  - `backend/src/routes/upnp.ts`
  - `backend/src/services/upnp.ts`
  - `backend/src/index.ts:156`（改后行号）`app.use('/api/v1/upnp', upnpRoutes)` + import
  - `backend/package.json` 的 `"upnp-device-client"` 依赖
  - `npm install` 清理 node_modules
  - **文档**：ARCHITECTURE.md / HANDOVER.md / AGENTS.md 里的 UPnP 引用，标注"已下线（2026-07-18）"或删除

---

### 阶段 3：ZCode 收尾 P0a（5 项，0.5 天）

**这部分由 ZCode 直接做**（纯机械改动，不值得 KIMI 一轮交接）。KIMI 在做 P1 期间或做完后，ZCode 并行做 P0a。

#### P0a-1：B5 helmet 测试同步（ZCode 的债）

- **位置**：`backend/src/index.ts:46-58` + `backend/src/middleware/security-headers.test.ts:19`
- **做法**：抽 `backend/src/config/securityHeaders.ts` 作为单一来源，index.ts 和测试都引用
- **为什么是 ZCode 的债**：2026-07-13 收紧 styleSrc 时漏同步测试（见 review-supplement 补充 2）

#### P0a-2：B7 端口口径统一

| 文件 | 改动 |
|------|------|
| `backend/.env.example:2` | `PORT=8000` → `8001` |
| `backend/src/config.ts:15` CORS | 补 `http://localhost:3000`（保留 3001/3002/3003）|
| `start.sh/bat/ps1` | 3001 → 3000 |
| `D:\Coder\AGENTS.md` | mimo-radio 前端 3001 → 3000 |

#### P0a-3：F4 全屏进度条 seek

- **位置**：`frontend/src/components/FullscreenPlayer.tsx:16-32` + `frontend/src/app/page.tsx:171`
- **做法**：照搬 KimiCard.tsx:43-86 的 ProgressBar 模式（setCurrentTime + onSeek 双调用）
- **关键**：FullscreenPlayer 加 `onSeek` prop，page.tsx 传 `handleSeek`

#### P0a-4：B1 aiLimiter 拆挂载

- **位置**：`backend/src/index.ts:148-149`
- **做法**：抽 `middleware/aiLimiter.ts` 共享模块，只在 POST 路由挂（create/next/chat + dj 的 tts/intro/asr/analyze-image/transition）
- **GET 不挂**（models/songs/queue），feedback 保留自己的 30/min limiter
- **注意**：与 P0b-1 改动同一段代码（index.ts 88-95 + 148-149），P0b-1 已完成不冲突

#### P0a-5：死代码清理

- 删 `frontend/src/components/TtsEngineSwitcher.tsx`（grep 确认无引用）
- 删 `frontend/src/components/MarkdownText.tsx`（grep 确认无引用）
- **铁律 6**：删之前 grep 全项目（含 .md）

---

### 阶段 4：P2 仓库卫生（3 项，1.5 天，任意执行者）

#### P2-1：构建配置 + gitignore

- `backend/tsconfig.json`：`exclude` 加 `src/**/*.test.ts`，验证 `dist/` 不再含 `*.test.js`
- `.gitignore` 补：`*.tar.gz` / `*.pid` / `backend/static/audio/` / `frontend/public/sw.js` / `frontend/public/workbox-*.js` / `backend/nul` / `frontend/nul`
- `git rm --cached`：HANDOVER.tar.gz / backup_src_*.tar.gz / frontend.pid / static/audio/*.mp3 / sw.js / workbox-*.js / nul 文件

#### P2-2：死代码 + 配置清理 + app 工厂函数

- 删 `config.ts:37` 的 `neteaseCookie`（死配置）
- 删 `db/index.ts` 的 `getSongs/setSongs`（死代码）
- `qqSource.ts:20` 的 `WEBBRIDGE_URL` 收进 config.ts
- `.env.example` 补齐 CORS_ORIGINS / API_BASE_URL / WEBBRIDGE_URL / LOG_*
- 删 `@types/ws` 残留依赖
- 根 `package.json` 补 test/lint 聚合脚本
- **app 工厂函数抽取**（P0b-1 复核 §三.1 提的 B5 根治方案）：把 `index.ts` 的 app 构建抽成可导入的 `createApp()`，测试直接 supertest 真实 app，消除所有"镜像挂载顺序"的漂移风险

#### P2-3：文档更新

- README.md：测试数 277→当前值 / 删"5 个既有 tsc 错误" / 端口 8001+3000
- HANDOVER.md：同步上述 + 标注本轮修复完成
- ARCHITECTURE.md：加"本文档已过时"头注（或重写——MiMo 非 Claude、端口、路由、无 WebSocket）

---

## 四、Backlog（不阻塞，长期清单）

来自整合方案的"顺带提醒"（line 585-605）+ 后续补充：

### 4.1 安全加固（择期）
- `ssrfGuard.ts` 补 DNS 解析校验（`dns.lookup` 验真实 IP + IPv6 方括号形态）
- `sessionAuth.ts` 改为仅 header 传 token（不接受 query，防代理/浏览器历史日志）
- `app.set('trust proxy', 1)`（确认部署在反代之后再加）
- `generalLimiter` 排除 `/static` 和 `/health`

### 4.2 一致性修正
- 错误响应结构统一到 `{error:{message,code}}`（`qqmusic.ts:48` / `musicSource.ts:49`）
- `djPersona.ts:29` POST /generate 补 zod 校验（项目内唯一无校验）
- `log.ts:36` 过滤 msg 内换行（防日志伪造）
- `radio.ts` session 消息 `timestamp` 填真实时间（当前恒 0）
- `radio.ts:280/399` sanitize 重复调用合并
- `manifest.json` theme_color 与 layout `#06060a` 对齐

### 4.3 健壮性
- 补 SIGTERM/SIGINT 优雅关闭（停 setInterval、关 db）
- feedback 表 TTL 清理任务（参照 session 清理）
- `planner.ts` 补并发去重 + 缓存（避免缓存未命中时并发请求重复调 AI）

### 4.4 前端体验
- `useSession.ts` 的 `setHandlers` 挪进 useEffect（当前在渲染期执行）
- `settings/page.tsx` 试听加竞态防护（连点两个音色后返回慢的盖掉快的）
- `ChatArea.tsx` 打字机文本对屏幕阅读器 `aria-hidden`（防 30ms 刷新刷屏）
- `app/plan/page.tsx:99` 重试 setTimeout 卸载时清理

### 4.5 测试补齐
- `services/planner.ts`（188 行，全站"今日计划"核心）零测试 → 补
- `musicSource.ts` / `neteaseSource.ts` / `qqSource.ts` 音源抽象层
- `mimoAsr.ts` / `utils/fileCleanup.ts`
- 路由层 `dj.ts` / `schedule.ts` / `profile.ts` / `lyric.ts`
- 前端 `useLyric.ts` / `useTheme.ts` / `lib/logger.ts`

---

## 五、执行节奏建议

### 5.1 KIMI 的节奏（执行者+规划者双身份）

```
今天/明天：P0b-2 → 报告 → ZCode 复核 → P0b-3 → 报告 → ZCode 复核 → P0b-4 → 报告 → ZCode 复核
（每项单项提交，每项 ZCode 复核打分）

后天：P1-1 → P1-2a → P1-2b → P1-2c → P1-3
（每项单项提交，每项 ZCode 复核打分）

期间：ZCode 并行做 P0a-1~5（不阻塞 KIMI）
```

**关键纪律**：
- 每项动手前先汇报方案，ZCode 复核放行后再做
- 每项做完单项 commit + push + 报告
- 报告 6 节齐全（摘要/改动/验证/偏差/自评/铁律回顾）
- 自审后必须过 ZCode 复核（双身份的盲点）

### 5.2 ZCode 的节奏（规划者）

```
KIMI 做 P0b-2~4 / P1 期间：
  - 接 KIMI 的方案汇报 → 写反馈
  - 接 KIMI 的报告 → 核实代码 + 跑测试 + 打分

并行：P0a-1~5 直接做（5 项机械改动，1 个下午）

全部完成后：
  - P2 任意执行者做仓库卫生
  - 写"本轮总结"（KIMI 表现 + 案例入库 + 测试基线变化）
  - 更新 HANDOVER.md + README.md
```

---

## 六、完成度预估

| 维度 | 当前 | 本轮全部完成后 |
|------|------|---------------|
| 安全 | 🟡 90%（剩 R2 鉴权）| ✅ 98%（剩 ssrfGuard DNS 校验等 backlog）|
| 正确性 | 🟡 85%（剩 F1/F2/F3/F5/B6）| ✅ 95%（剩 timestamp/sanitize 等 backlog）|
| 资源管理 | 🟡 85%（剩 F2 监听泄漏/F3 TTS）| ✅ 95% |
| 仓库卫生 | 🟡 70%（剩 C2/C3 + 死代码）| ✅ 90% |
| 测试覆盖 | 🟡（277+4=281/179）| ✅（预计 +15~20 用例）|
| 文档准确性 | 🔴 60%（多处过时）| ✅ 90% |

**总完成度**：当前约 88% → 全部完成后约 95%。剩余 5% 是 backlog 里的择期项（ssrfGuard DNS / planner 测试 / 体验微调）。

---

## 七、关键风险与应对

### 7.1 P0b-2 鉴权改动风险最高

改 `auth.ts` + `sessionToken.ts` + `index.ts` 启动流程。一旦启动校验逻辑写错，可能：
- **太严**：开发环境起不来（KIMI 自己测不了）
- **太松**：生产裸奔（R2 没修好）

**应对**：KIMI 必须在方案里明确 3 种场景的预期行为（dev 放行+警告 / prod 无 key 抛错 / prod 有 key 正常），ZCode 复核时**实际跑一遍 3 场景**，不只看测试。

### 7.2 P1-2a/b 前端 hooks 改动易引入回归

F2/F3 改的是 `useAudioPlayer` / `useTTS`，这两个 hook 影响播放核心链路。

**应对**：
- 必须跑 `useAudioPlayer.sideffects.test.ts`（已有副作用测试）
- 必须跑 E2E（webbridge 真实浏览器测播放+换歌+TTS）
- 不接受"待实测"（铁律 5）

### 7.3 多人改 index.ts 的冲突

P0b-1 已改 index.ts 88-95 + 149。后续 P0b-2（启动校验）、P0a-4（aiLimiter 拆解）也改 index.ts。

**应对**：
- 单项提交（不累积），每次基于最新 master
- 提交前 `git pull` 防止冲突
- 行号每次 Read 确认（KIMI 在 P0b-1 已建立这个习惯）

---

## 八、给 KIMI 的下一步指令

完成 P0b-1 提交后，按本路线图执行：

1. **立即**：commit + push P0b-1（提交信息见 `review-p0b-1-exec-2026-07-18.md` §三.2）
2. **接着**：读本路线图 + 整合方案 P0b-2（line 194-241）+ review-supplement 调整 1
3. **动手前**：汇报 P0b-2 方案（特别说明 3 种场景的预期行为），等 ZCode 复核放行
4. **做完**：单项 commit + 报告 + 自审 + 让 ZCode 复核

**不要**：
- 不要一次性做 P0b-2~4 再一起报告（单项提交便于回滚和追溯）
- 不要跳过方案汇报直接动手（P0b-1 的经验：方案对齐能避免规格错误）
- 不要忘记每项的 ZCode 复核（双身份自审有盲点）

---

*本路线图由 ZCode 规划者出具，基于整合方案 + P0b-1 复核经验 + 实测基线。KIMI 按此节奏推进，每项单项提交 + ZCode 复核。*
