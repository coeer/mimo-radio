---
author: 规划者（ZCode）
task: 批量流执行手册（KIMI 一次性做 P0b-2~4 + P1 + P0a + P2 共 13 项）
created: 2026-07-18
audience: KIMI（双身份，批量流执行）
status: 必读
---

# 批量流执行手册

> **背景**：用户选择批量流——KIMI 一次性做 P0b-2~4 + P1（5 项）+ P0a（5 项，原 ZCode 自做，现交 KIMI）+ P2（3 项）共 13 项，最后统一报告。ZCode 一次复核全部。
>
> **代价明示**（KIMI 必须知悉）：
> - 批量流的**风险**：错误发现得晚，13 项改动若有回归，定位困难，回滚面大
> - 历史教训：DSflash 视觉轮多任务单轮漏过闭包回归（案例索引）
> - **对策**：本手册内置 5 条强制纪律 + 每项验收标准 + 分批 commit 策略，把批量流的风险降到可接受

---

## 一、批量流 5 条强制纪律（违反任一 = 返工）

### 纪律 1：分批 commit，不累积（关键）

**虽然是一次性做完，但不能一次性 commit**。按以下批次提交：

| 批次 | 包含项 | commit 信息前缀 |
|------|--------|----------------|
| **批 0** | P0b-1（已做完未提交）| `fix(backend): P0b-1 ...` |
| **批 1** | P0b-2 + P0b-3 + P0b-4 | `fix: P0b-2/3/4 鉴权+收藏+tasteCache` |
| **批 2** | P1-1 + P1-2a + P1-2b + P1-2c + P1-3 | `fix: P1 fetchWithTimeout+监听+TTS+PlayerBar+UPnP` |
| **批 3** | P0a-1~5 | `chore: P0a helmet/端口/seek/aiLimiter/死代码` |
| **批 4** | P2-1 + P2-2 + P2-3 | `chore: P2 tsconfig+gitignore+文档` |

**为什么必须分批**：
- 出问题能快速定位是哪一批引入
- 回滚单批不影响其他（trunk-based 直接 revert 该 commit）
- 13 项一个 commit 是不可接受的——无法追溯单项责任

**每批做完后**：
1. 跑全量验证（`backend && frontend` 的 `npm test && npx tsc --noEmit`）
2. 验证通过才 commit + push 该批
3. 验证失败 → 立即定位修复，不能"先把所有做完再说"

### 纪律 2：每项做完立即跑该项目的验收命令

每项的验收命令见本手册 §三。**做完一项立即跑该项目的验收**，不能"全部做完再统一验证"。失败就停下修复，不要带病继续。

### 纪律 3：遇到规格模糊/矛盾，停下来问

批量流的死穴是"闷头做"——一旦误解规格，13 项全错。**遇到以下情况必须停下问 ZCode**（通过用户中转）：
- 规格描述跟代码现状对不上（行号漂移、文件结构变了）
- 规格里两处描述矛盾
- 不确定某个边界场景的预期行为
- 想偏离规格（哪怕你觉得是改进）

**不要**：自己拍脑袋决定、自己改规格、自己裁决。

### 纪律 4：每项留独立的自审笔记

在 `docs/KIMI/reports/` 下**每批一份报告**（不是每项一份，也不是全部一份）。报告里**每项一节**，包含：
- 改动文件:行
- 验证命令 + 结果
- 与规格的偏差（有就写，没有写"无"）
- 自评（风险点、隐患）

**4 批 = 4 份报告**：
- `exec-p0b-batch-2026-07-18-KIMI.md`（含 P0b-2/3/4）
- `exec-p1-batch-2026-07-18-KIMI.md`（含 P1 全部 5 项）
- `exec-p0a-batch-2026-07-18-KIMI.md`（含 P0a-1~5）
- `exec-p2-batch-2026-07-18-KIMI.md`（含 P2-1/2/3）

### 纪律 5：高风险项必须 E2E 验证（铁律 5）

以下项不能只跑单测，**必须用 webbridge 或手测做 E2E**：
- **P1-2a**（F2 监听泄漏）：播放一首 QQ 歌（如有），换歌，观察是否多份监听累积
- **P1-2b**（F3 TTS AbortController）：换歌时观察是否有"旧串词复活"双音轨
- **P0a-3**（F4 全屏 seek）：进全屏，拖进度条，观察是否"弹跳"
- **P0b-2**（鉴权）：实际启动后端，测 3 种 NODE_ENV/API_KEY 组合

**不接受"待实测"**（铁律 5）。批量流尤其不能漏，因为 ZCode 一次复核多项，漏了发现得晚。

---

## 二、13 项任务清单（按批次）

### 批 0：P0b-1（已做完，提交即可）

**提交信息**：
```
fix(backend): P0b-1 dj 路由路径级 body-parser + 413 识别（R1）

- index.ts: /api/v1/dj/asr 25mb + /api/v1/dj/analyze-image 12mb（全局 1mb 之前）
- error.ts: 识别 entity.too.large → 413 PAYLOAD_TOO_LARGE
- error.test.ts: +4 用例（直测 413 + 3 场景镜像）

基线 277→281，tsc 零错误。详见 docs/KIMI/reports/exec-p0b-2026-07-18-KIMI.md
```

**一并提交**：COLLABORATION.md（§10.6 案例）+ docs/KIMI/ 下所有评审/复核/裁决文档。

---

### 批 1：P0b 安全 + 数据污染（3 项）

#### P0b-2：R2 鉴权 fail-closed

- **位置**：`backend/src/middleware/auth.ts` + `backend/src/utils/sessionToken.ts` + `backend/src/index.ts`
- **规格**：`docs/KIMI/fix-plan-integrated-2026-07-17.md` line 194-241
- **方向调整（必读）**：`docs/KIMI/review-supplement-2026-07-17.md` 调整 1——**显式配 `NODE_ENV=production` 才严格，没配就警告但能跑**。不是"非 dev 拒绝启动"。
- **预期行为**（3 场景）：
  1. 不设 NODE_ENV + 不设 API_KEY → 启动成功 + 打印警告（dev 放行）
  2. 设 `NODE_ENV=production` + 不设 API_KEY → **启动抛错**（fail-closed）
  3. 设 `NODE_ENV=production` + 设 API_KEY → 启动成功 + 鉴权生效
- **关键点**：
  - `auth.ts` 当前 `!apiKey && nodeEnv!=='production'` 放行逻辑**保留不动**
  - `sessionToken.ts:20` 的 `DEV_FALLBACK_SECRET`：production 用它 → 启动抛错；非生产可用但日志警告
  - `index.ts` 启动时加警告日志
- **验收**：实际启动后端测 3 场景（不只看测试）+ 新增 sessionToken.test.ts production 无 secret 抛错用例

#### P0b-3：F1 收藏上报反向 + 改误导注释

- **位置**：`frontend/src/components/KimiCard.tsx:121-148`
- **规格**：line 243-293
- **关键点**：
  1. `handleLike` 用 `useRadioStore.getState().likedSongIds.includes(id)` 读最新值（绕闭包陈旧）
  2. **改掉 KimiCard.tsx:121 的误导注释**（原"F1 修复：订阅数组"只解决一半）
  3. `useCallback` 依赖数组去掉 `isSongLiked`
- **参考**：chat 防重入的 `pendingId` 模式（提交 `b32ad68`）
- **验收**：点收藏→后端日志 `Feedback: like` / 取消→`unlike` + 新增 KimiCard.test.tsx 测试

#### P0b-4：B6 tasteCache 按 limit 分 key

- **位置**：`backend/src/utils/tasteCache.ts`
- **规格**：line 295-348
- **关键点**：缓存 key 改 `liked:${limit}` / `disliked:${limit}`，用 Map 替代单槽
- **验收**：30s 内先调 `getLikedArtists(3)` 再调 `getLikedArtists(5)` 返回不同长度 + 新增 tasteCache.test.ts 测试

**批 1 验证**：
```bash
cd backend && npm test && npx tsc --noEmit    # 基线 ≥281 + 新增
cd frontend && npm test && npx tsc --noEmit   # 基线 ≥179 + 新增
```

---

### 批 2：P1 正确性 + 资源泄漏（5 项）

#### P1-1：B2 fetchWithTimeout body 超时 + 5xx 熔断

- **位置**：`backend/src/utils/fetchWithTimeout.ts` + `backend/src/index.ts:136`
- **规格**：line 350-398
- **关键点**：
  1. body 超时：导出 `readBodySafely(res, timeoutMs)` 包装函数（推荐方案 A），让调方显式选择是否加超时
  2. `fetchWithTimeout.ts:121` 加 `else if (res.status >= 500)` 分支计入熔断失败
  3. `index.ts:136` 的 `req.setTimeout` 回调加 `req.destroy()`
- **前科**：别在 fetchWithTimeout 内覆盖整个 body 读取（职责混淆）
- **验收**：新增慢 body 流超时用例 + 上游持续 500 熔断 OPEN 用例

#### P1-2a：F2 useAudioPlayer QQ 监听泄漏

- **位置**：`frontend/src/hooks/useAudioPlayer.ts:77-86`
- **规格**：line 399-450
- **关键模式**（ZCode 补充）：ref 存 cleanup
  ```ts
  const cleanupRef = useRef<(() => void) | null>(null)
  // async 分支：cleanupRef.current = setupAudio(data.url)
  // effect cleanup：cleanupRef.current?.()
  ```
- **前科**：`cancelled = true` 单独不够，必须配 cleanupRef
- **验收**：跑 `useAudioPlayer.sideffects.test.ts` + E2E（铁律 5）

#### P1-2b：F3 useTTS 加 AbortController

- **位置**：`frontend/src/hooks/useTTS.ts`
- **规格**：line 450-480
- **关键模式**（ZCode 补充）：复用 chat 防重入的 `chatAbortRef`（提交 `b32ad68`）
  ```ts
  const ttsAbortRef = useRef<AbortController | null>(null)
  // speak 内 abort 旧的 + fetch 加 signal
  // catch 处理 AbortError 静默 return null
  // stop() 里也 abort
  ```
- **前科**：不重新发明轮子，直接套用已验证的 chat 模式
- **验收**：E2E 换歌无双音轨（铁律 5）

#### P1-2c：F5 PlayerBar 换歌重置 localTime

- **位置**：`frontend/src/components/PlayerBar.tsx:14-32`
- **规格**：line 480-500
- **关键点**：监听 `currentSong?.id` 变化重置 `localTime`
  ```ts
  useEffect(() => {
    setLocalTime(useRadioStore.getState().currentTime)
  }, [currentSong?.id])
  ```
- **验收**：换歌后 localTime 归零（或与 store currentTime 一致）

#### P1-3：UPnP 下线（铁律 6 重点）

- **位置**：多文件
- **规格**：line 503-525
- **删除清单**：
  - `backend/src/routes/upnp.ts`
  - `backend/src/services/upnp.ts`
  - `backend/src/index.ts`（改后行号）`app.use('/api/v1/upnp', upnpRoutes)` + import
  - `backend/package.json` 的 `"upnp-device-client"` 依赖
  - `npm install` 清理 node_modules
- **铁律 6 grep**：删完 `grep -rn "upnp\|UPnP" . --include="*.md"` 清文档引用（ARCHITECTURE.md / HANDOVER.md / AGENTS.md）
- **验收**：grep 零残留（含 .md）+ 测试不降

**批 2 验证**：
```bash
cd backend && npm test && npx tsc --noEmit
cd frontend && npm test && npx tsc --noEmit
# E2E（铁律 5）：播放+换歌+TTS，无回归
```

---

### 批 3：P0a 机械清理（5 项，原 ZCode 自做，现交 KIMI）

> 这部分原本是 ZCode 直接做，但批量流下交给 KIMI 统一处理。规格见 `fix-plan-integrated-2026-07-17.md` P0a。

#### P0a-1：B5 helmet 测试同步（ZCode 的债）

- **位置**：`backend/src/index.ts:46-58` + `backend/src/middleware/security-headers.test.ts:19`
- **规格**：line 35-68
- **做法**：抽 `backend/src/config/securityHeaders.ts` 作为单一来源，index.ts 和测试都引用
- **为什么是 ZCode 的债**：2026-07-13 收紧 styleSrc 时漏同步测试（review-supplement 补充 2）

#### P0a-2：B7 端口口径统一

- **规格**：line 70-80
- **改动**：
  - `backend/.env.example:2` PORT=8000 → 8001
  - `backend/src/config.ts:15` CORS 补 `http://localhost:3000`（保留 3001/3002/3003）
  - `start.sh/bat/ps1` 前端地址 3001 → 3000
  - `D:\Coder\AGENTS.md` mimo-radio 前端 3001 → 3000

#### P0a-3：F4 全屏进度条 seek（P0 提级）

- **位置**：`frontend/src/components/FullscreenPlayer.tsx:16-32` + `frontend/src/app/page.tsx:171`
- **规格**：line 82-114
- **做法**：照搬 `KimiCard.tsx:43-86` 的 ProgressBar 模式（setCurrentTime + onSeek 双调用）
- **关键**：FullscreenPlayer 加 `onSeek` prop，page.tsx 传 `handleSeek`
- **验收**：E2E 全屏拖进度条不弹跳（铁律 5）

#### P0a-4：B1 aiLimiter 拆挂载

- **位置**：`backend/src/index.ts:148-149`（P0b-1 后行号可能漂移，Read 确认）
- **规格**：line 116-143
- **做法**：抽 `middleware/aiLimiter.ts` 共享模块，只在 POST 路由挂（create/next/chat + dj 的 tts/intro/asr/analyze-image/transition）
- **注意**：GET 不挂，feedback 保留自己的 30/min limiter
- **验收**：连续 15 次 GET `/api/v1/radio/:id/queue` 不 429 + feedback 30 次/分钟内不 429

#### P0a-5：死代码清理

- **规格**：line 145-155
- **删除**：
  - `frontend/src/components/TtsEngineSwitcher.tsx`（grep 确认无引用）
  - `frontend/src/components/MarkdownText.tsx`（grep 确认无引用）
- **铁律 6**：删之前 `grep -rn "TtsEngineSwitcher\|MarkdownText" . --include="*.ts" --include="*.tsx" --include="*.md"`

**批 3 验证**：
```bash
cd backend && npm test && npx tsc --noEmit
cd frontend && npm test && npx tsc --noEmit
```

---

### 批 4：P2 仓库卫生（3 项）

#### P2-1：构建配置 + gitignore

- **规格**：line 526-556
- **改动**：
  - `backend/tsconfig.json` exclude 加 `src/**/*.test.ts`，验证 `dist/` 不再含 `*.test.js`
  - `.gitignore` 补：`*.tar.gz` / `*.pid` / `backend/static/audio/` / `frontend/public/sw.js` / `frontend/public/workbox-*.js` / `backend/nul` / `frontend/nul`
  - `git rm --cached`：HANDOVER.tar.gz / backup_src_*.tar.gz / frontend.pid / static/audio/*.mp3 / sw.js / workbox-*.js / nul 文件

#### P2-2：死代码 + 配置清理 + app 工厂函数

- **规格**：line 558-566
- **改动**：
  - 删 `config.ts:37` 的 `neteaseCookie`（死配置）
  - 删 `db/index.ts` 的 `getSongs/setSongs`（死代码，同步删对应测试）
  - `qqSource.ts:20` 的 `WEBBRIDGE_URL` 收进 config.ts
  - `.env.example` 补齐 CORS_ORIGINS / API_BASE_URL / WEBBRIDGE_URL / LOG_*
  - 删 `@types/ws` 残留依赖
  - 根 `package.json` 补 test/lint 聚合脚本
  - **app 工厂函数抽取**（P0b-1 复核 §三.1 提的 B5 根治方案）：把 `index.ts` 的 app 构建抽成可导入的 `createApp()`，测试直接 supertest 真实 app，消除"镜像挂载顺序"的漂移风险

#### P2-3：文档更新

- **规格**：line 567-580
- **改动**：
  - README.md：测试数 / 删"5 个既有 tsc 错误" / 端口 8001+3000
  - HANDOVER.md：同步上述 + 标注本轮修复完成
  - ARCHITECTURE.md：加"本文档已过时"头注（或重写——MiMo 非 Claude、端口、路由、无 WebSocket）

**批 4 验收**：
```bash
# dist 无 *.test.js
rm -rf backend/dist && cd backend && npm run build && find dist -name "*.test.js" | wc -l
# 应为 0
```

---

## 三、批量流风险与对策

### 3.1 风险：规格理解偏差放大

批量流最大风险——一项误解规格，13 项都按错误理解做。

**对策**：每项动手前，**写一句"我的理解是 X"**到你的工作笔记（`docs/KIMI/daily-logs/2026-07-18-KIMI.md`），自我对齐后再做。遇到不确定的**停下来问**（纪律 3）。

### 3.2 风险：行号漂移

13 项改动会反复修改同一批文件（index.ts 被改 4 次：P0b-1/P0b-2/P1-1/P0a-4）。

**对策**：每次改之前 Read 确认当前行号。**绝不凭规格里的行号改**（规格是写时的快照）。

### 3.3 风险：批量提交后回滚难

**对策**：纪律 1 的分批 commit。即使批量做，也是 5 个 commit（批 0~4），不是 1 个。出问题 revert 单批。

### 3.4 风险：ZCode 一次复核 13 项负担重

**对策**：KIMI 的自审必须充分。每项报告里写明：
- 改动文件:行（实际行号，不是规格行号）
- 验证命令 + 实际输出
- 与规格的偏差
- 自评风险

ZCode 复核时按报告逐项核实，不是从零开始审查。

---

## 四、批量流的"停下问"触发条件

**遇到以下任一情况，立即停下问 ZCode**（通过用户中转）：

1. 规格描述跟代码现状对不上（行号、文件结构、函数签名）
2. 规格里两处描述矛盾
3. 不确定某个边界场景的预期行为
4. 想偏离规格（哪怕你觉得是改进）
5. 某项做完后测试失败，30 分钟内定位不出原因
6. 某项需要 E2E 但环境不具备（如没 QQ 音乐源、没真机）

**不要**：自己拍脑袋决定、自己改规格、自己裁决、带病继续下一项。

---

## 五、批量流的报告规范

**4 批 = 4 份报告**，放在 `docs/KIMI/reports/`：

| 报告 | 文件名 | 内容 |
|------|--------|------|
| 批 1 | `exec-p0b-batch-2026-07-18-KIMI.md` | P0b-2/3/4 三项，每项一节 |
| 批 2 | `exec-p1-batch-2026-07-18-KIMI.md` | P1-1/2a/2b/2c/3 五项，每项一节 |
| 批 3 | `exec-p0a-batch-2026-07-18-KIMI.md` | P0a-1~5 五项，每项一节 |
| 批 4 | `exec-p2-batch-2026-07-18-KIMI.md` | P2-1/2/3 三项，每项一节 |

每份报告 6 节（沿用 COLLABORATION §四 规范）：
1. 执行摘要（表格：项 / 状态）
2. 改动明细（每项的文件:行）
3. 验证结果（每项的命令 + 输出）
4. 与规格的偏差（每项独立说明）
5. 自评（每项的风险/隐患）
6. 铁律回顾（6 条逐条勾，每项如何遵守）

**最后一份报告（批 4）追加**：
- 整体总结（13 项的完成情况）
- 测试基线变化（起止数字）
- 给 ZCode 的复核建议（哪些项重点看）

---

## 六、批量流的"逃生通道"

如果做到一半发现：
- 测试一直失败定位不出
- 规格理解跟 ZCode 有分歧
- 某项需要的环境不具备

**立即停下，提交已做完且验证通过的批次**，写一份"阶段性报告"说明做到哪里、卡在哪里。**不要硬撑做完所有**——半成品比全烂强。

ZCode 会复核已提交的部分，给出下一步建议（可能是"修完剩下的"或"调整规格后再做"）。

---

## 七、ZCode 复核策略（KIMI 知悉即可）

KIMI 做完后，ZCode 会按以下策略复核：

1. **每批独立复核**（不等全部做完）——批 1 提交就开始复核批 1
2. **逐项源码核实**——不盲信报告，每项 Read 代码 + 跑测试
3. **高风险项重点看**——P0b-2 鉴权 / P1-2a/b hooks / P0a-3 seek 必跑 E2E
4. **打分到项**——13 项每项独立打分（A/B/C/D），不是整体一个分
5. **前科提醒**——发现的问题记入 COLLABORATION §10.6

**KIMI 配合**：ZCode 复核时若问问题，必须如实回答，不隐瞒偏差。

---

*本手册由 ZCode 规划者出具，专为批量流设计。KIMI 按本手册执行，遇阻按 §六 逃生通道处理。*
