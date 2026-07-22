# 上下文交接：plan-remaining 3 批 4 commit 全交付

> 交接给下一个会话 / ZCode 复核
> 日期：2026-07-18
> 项目：`D:\Coder\mimo-radio`（branch: master）

---

## 一、本次会话干了什么

执行 `docs/MiNiMax/plans/plan-remaining-2026-07-18-MiNiMax.md`（3 批 4 commit 4 报告），全部完成并推送。

| 批 | commit | 摘要 | 推送 |
|----|--------|------|------|
| 1 | `3e8024c` | fix: SSRF IPv6 绕过修复 + DNS 解析校验 | ✅ |
| 2 | `2205ae4` | fix: backlog 6 项（limiter skip / logger sanitize / timestamp / sanitize 合并 / feedback TTL / API envelope）| ✅ |
| 3-1 | `2616b39` | fix: InputArea MediaRecorder unmount cleanup + setState 守卫 | ✅ |
| 3-2 | `1fcf694` | fix: F4 isPlaying 仲裁层——单点 playRequest 取代 12 处直写 | ✅ |

`git log master` 顶端 4 条即本次交付，前 4 条（`cf227e5`/`0cd8c64`/`87915cd`/`fe0f166`）是上轮 shortterm + P0a，本会话未动。

---

## 二、报告落盘位置

均在 `docs/MiNiMax/reports/`：

- `exec-ssrf-2026-07-18-MiNiMax.md`（批 1）
- `exec-backlog-rest-2026-07-18-MiNiMax.md`（批 2）
- `exec-inputarea-cleanup-2026-07-18-MiNiMax.md`（批 3-1）
- `exec-f4-arbiter-2026-07-18-MiNiMax.md`（批 3-2，含 §四 8 场景覆盖矩阵 + E2E 证据 + 回滚步骤）

每份均按"改动清单 / 根因 / 验证 / 风险回滚"四段结构，含 tsc+vitest 数字。

---

## 三、关键文件改动位置（便于复核）

### 批 1（SSRF）
- `backend/src/utils/ssrfGuard.ts` — 加 `stripIpv6Brackets()` / `isPrivateAddress()`，扩 PRIVATE_IP_PATTERNS（`::ffff:` / `2002:` / `fc00::/7` 全段），`isSafeUrl` 改 async + DNS lookup
- `backend/src/utils/fetchWithTimeout.ts` — 改为白名单优先（端口 → 主机 → isSafeUrl）
- `backend/src/utils/ssrfGuard.test.ts` — 既有测试转 async + 8 IPv6 literal + 7 DNS rebinding
- `backend/src/utils/fetchWithTimeout.test.ts` — 加 `vi.mock('dns/promises')`

### 批 2（backlog 6 项）
- `backend/src/app.ts` — generalLimiter 加 skip `/health` `/static`
- `backend/src/utils/logger.ts` — `formatLog` 内 `\r\n` → 空格
- `backend/src/routes/radio.ts` — 6 处 `timestamp: 0` → `Date.now()`；`wrappedInput = sanitizedText` 复用
- `backend/src/db/index.ts` — 加 FEEDBACK_TTL_MS / `cleanupOldFeedback` / `startFeedbackCleanup` / `stopSessionCleanup`（反模式修正）
- `backend/src/index.ts` — `startFeedbackCleanup` + `gracefulShutdown(SIGINT/SIGTERM)`
- `backend/src/routes/musicSource.ts` — 3 处 error envelope（PLAYBACK_UNAVAILABLE / UNKNOWN_SOURCE / SOURCE_NOT_READY）
- `backend/src/routes/qqmusic.ts` — 3 处 error envelope（PLAYBACK_UNAVAILABLE / NOT_FOUND × 2）
- `frontend/src/components/SourceSwitcher.tsx` — 适配新 envelope（type guard）

### 批 3-1（InputArea）
- `frontend/src/components/InputArea.tsx` — streamRef + mountedRef + 双 useEffect（mounted 守卫 + 卸载清理）

### 批 3-2（F4 仲裁层）
- `frontend/src/store/radioStore.ts` — `pendingResume` 字段、`PlaySource`/`PlayAction` 类型、`playRequest` action；`togglePlay` / `prevSong` / `nextSong` 三条路径全部走两阶段（ZCode §3.1 修订）
- `frontend/src/app/page.tsx` — L98/L104 改 `playRequest`
- `frontend/src/components/PlanTimeline.tsx` — L62 改 `playRequest('play', 'user')`
- `frontend/src/components/QueueList.tsx` — L22 同上
- `frontend/src/components/RecommendCardList.tsx` — L42 同上
- `frontend/src/hooks/useAudioPlayer.ts` — L131 `setIsPlaying(false)` → `playRequest('pause', 'system')`
- `frontend/src/hooks/useSession.ts` — L29 / L184 改 `playRequest`
- `frontend/src/store/radioStore.playRequest.test.ts` — **新增**，15 用例覆盖 §四 场景 1-8 + 两阶段 + 边界

---

## 四、验证基线（下一会话的参照数字）

- 后端 vitest：**305 tests pass**（baseline，本次未动）
- 前端 vitest：**204 tests pass**（baseline 189 + 本轮 15 新增）
- `tsc --noEmit`：双零（backend + frontend）
- djIntroToSong E2E：8/8 全绿（场景 A-H）

---

## 五、未做 / 留给下一会话的事

| 项 | 来源 | 备注 |
|----|------|------|
| 撤销 GitHub PAT | plan-remaining §附 | **MiNiMax 做不了**，等 owner 操作 |
| `setIsPlaying` 升级为 TS 私有（`__setIsPlaying` + JSDoc） | F4 报告 §八.2 | 当前靠注释 + code review |
| `playRequest` 路径外是否还有遗漏直写点 | F4 报告 §八.2 | 建议下轮加 grep CI 检查 |
| R4 autoplay fallback 真机验证 | F4 报告 §八.1 | 需真浏览器 / 真机 |
| transition 锁被丢弃的 UI 反馈 | F4 报告 §八.1 | 当前 dev 打 warning，生产静默；如要 toast 需产品定 |

---

## 六、仓库纪律（下一会话仍要遵守）

来自 COLLABORATION.md / plan-remaining §〇：

1. **不要 commit `docs/DSflash/`**（DSflash 自己管）
2. **不要 commit 其他 agent 计划/报告**（`docs/KIMI/`、`docs/ZCode/`、`docs/plans/` 含 `author: 规划者` 标签）
3. **不要破坏 SQLite schema**（YAGNI 删除视为 schema 变更）
4. **不要擅自改 COLLABORATION.md / HANDOVER.md**
5. **GitHub PAT 泄露**（`ghp_****************************`）— 不打印/不复用/不当凭证，已轮换才视为失效。**切勿在文档/日志/commit 中原样记录 token**（GitHub Push Protection 会拦截）
6. **每批 tsc+vitest 全绿才 commit**
7. **Trunk-based + Conventional Commits**，每批独立 commit

---

## 七、当前工作树状态

下次会话开始时 `git status --short` 应当干净（或仅有本次未跟踪的 KIMI/ZCode 计划目录）。如不干净，先 `git fetch && git status` 核对。

```
master
1fcf694 (HEAD -> master, origin/master) fix: F4 isPlaying 仲裁层...
2616b39 fix: InputArea MediaRecorder unmount cleanup + setState 守卫
2205ae4 fix: backlog 剩余 6 项...
3e8024c fix: SSRF IPv6 绕过修复 + DNS 解析校验
cf227e5 fix: sessionAuth query token 移除 + mood 兜底改中性值 + plan setTimeout 清理  ← 上轮
0cd8c64 chore: 死代码+死依赖+文档漂移清理  ← 上轮
87915cd chore: P2 tsconfig 排除测试编译+gitignore+死代码清理+app 工厂+文档  ← 上轮
fe0f166 chore: P0a helmet 单一来源+端口口径+全屏 seek+aiLimiter 拆挂载+死代码  ← 上轮
```

---

## 八、ZCode 复核建议入口

复核请按顺序读这 4 份报告：

1. `exec-ssrf-2026-07-18-MiNiMax.md` — IPv6 绕过 / DNS rebinding 修复 + 8+7 新增测试
2. `exec-backlog-rest-2026-07-18-MiNiMax.md` — 6 项 backlog 全闭环（限流 / 日志 / 时间戳 / 复用 / TTL / envelope）
3. `exec-inputarea-cleanup-2026-07-18-MiNiMax.md` — MediaRecorder unmount 内存泄漏
4. `exec-f4-arbiter-2026-07-18-MiNiMax.md` — 12 → 1 写入点收敛 + 两阶段 + 8 场景覆盖

重点复核项：
- F4 是否真覆盖了 §四 全部 8 场景（不是只看 commit message）
- SSRF IPv6 / DNS rebinding 测试是否在不打 mock 时也能 pass（fail-closed 默认行为）
- feedback TTL 的 `stopSessionCleanup` 反模式修正是否到位（是否有 `clearInterval`）
- InputArea 的 streamRef 在 React 18 strict mode 双 mount 下不泄漏

---

## 九、一句话总结

`plan-remaining-2026-07-18-MiNiMax.md` 3 批 4 commit 全部完成 + 推送 + 4 份报告落盘 + 验证基线已锁（后端 305 / 前端 204 / tsc 双零）。等 ZCode 复核。下一会话从干净 master 继续。