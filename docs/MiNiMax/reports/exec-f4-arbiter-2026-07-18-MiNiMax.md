# exec-f4-arbiter — F4 isPlaying 仲裁层落地

> 执行者：MiNiMax
> 日期：2026-07-18
> 计划来源：`docs/KIMI/plans/plan-f4-isplaying-arbiter-2026-07-18-KIMI.md`（ZCode 修订版）
> Commit：`1fcf694 fix: F4 isPlaying 仲裁层——单点 playRequest 取代 12 处直写`
> 推送：`2616b39..1fcf694 master -> master` ✅
> 状态：**DONE**

---

## 一、背景与目标

`isPlaying` 状态原本被 8 个组件/hooks 直写（`page.tsx` / `PlanTimeline` / `QueueList` / `RecommendCardList` / `useAudioPlayer` / `useSession`）+ 4 处 store 内部直写（`togglePlay` / `prevSong` / `nextSong` ×2 路径），共 **12 个写入点**。导致：

1. **规则难收敛**：每处都自己决定 `isPlaying` 该不该翻，谁后写谁赢
2. **场景错乱**：
   - DJ 说话中点推荐卡 → 歌曲抢播，DJ 声音被压
   - DJ 说话中 chat 推荐换歌 → 同上
   - 换歌中 DJ/auto 又触发 play → 状态在两首歌间抖动
   - autoplay 被浏览器拒 → 状态卡在 `isPlaying=true` 但实际无声
3. **R3 续播无出口**：DJ 说完想续播推荐那首，没有受控通道

KIMI 规划者出 F4 计划要求收敛为**单点 `playRequest(action, source)` 仲裁 API**，ZCode 复核后给出 §3.1 修订（nextSong/prevSong 两阶段），MiNiMax 落地。

---

## 二、改动清单

| 文件 | 变更性质 | 关键点 |
|------|---------|--------|
| `frontend/src/store/radioStore.ts` | 改 | 加 `pendingResume` 字段、`PlaySource`/`PlayAction` 类型、`playRequest` action；`setIsPlaying` 标为私有（注释提示组件禁止直写）；`togglePlay` 改为 `playRequest('toggle', 'user')`；`prevSong`/`nextSong` 三条路径全部重构为两阶段 |
| `frontend/src/app/page.tsx` | 改 | L98/L104 直写 → `playRequest('pause', 'dj')` / `playRequest('play', 'user')` |
| `frontend/src/components/PlanTimeline.tsx` | 改 | L62 直写 → `useRadioStore.getState().playRequest('play', 'user')` |
| `frontend/src/components/QueueList.tsx` | 改 | L22 直写 → `state.playRequest('play', 'user')` |
| `frontend/src/components/RecommendCardList.tsx` | 改 | L42 直写 → `useRadioStore.getState().playRequest('play', 'user')` |
| `frontend/src/hooks/useAudioPlayer.ts` | 改 | L131 直写 → `s.playRequest('pause', 'system')` |
| `frontend/src/hooks/useSession.ts` | 改 | L29 `resumePlaybackAfterSpeak` → `s.playRequest('play', 'dj')`（**R3 唯一消费 pendingResume 出口**）；L184 chat 推荐换歌 → `s.playRequest('play', 'auto')` |
| `frontend/src/store/radioStore.playRequest.test.ts` | 新增 | 15 个测试，覆盖 §四 场景 1-8 + 两阶段 + 私有 setter 仍可用 |

---

## 三、根因 + 改法

### 3.1 根因

`isPlaying` 写入点散布各层，各自从局部视角决定播放语义。典型例子：

- `useAudioPlayer` 听到 audio error → `setIsPlaying(false)`（组件自救）
- `useSession` TTS onEnd → `setIsPlaying(true)`（续播）
- `QueueList` 点队列项 → `setIsPlaying(true)`（用户意图）
- `RecommendCardList` 点推荐卡 → 同上

四个调用点互不知情，于是：

- 用户点推荐卡时 DJ 正在说话 → 歌曲抢播 → DJ 声音被压
- 换歌中 auto 又触 play → 与 prev/next 的 isPlaying 写入打架

### 3.2 改法：单点仲裁 `playRequest(action, source)`

在 store 层加唯一入口：

```ts
playRequest: (action, source) => {
  const s = get()
  let nextPlaying: boolean
  if (action === 'play') nextPlaying = true
  else if (action === 'pause') nextPlaying = false
  else nextPlaying = !s.isPlaying

  if (nextPlaying === s.isPlaying) return     // R5 幂等

  if (source === 'user') {                    // R1 用户优先
    _set({ isPlaying: nextPlaying, pendingResume: false }, false, 'player/playRequest/user')
    return
  }

  if (s.isTransitioning) {                    // R2 transition 锁
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[playRequest] dropped during transition', { action, source })
    }
    return
  }

  if (s.isSpeaking && nextPlaying) {          // R3 speaking 锁 → pendingResume
    _set({ pendingResume: true }, false, 'player/playRequest/pendingResume')
    return
  }

  _set({ isPlaying: nextPlaying }, false, 'player/playRequest')
}
```

**5 条规则**：

| 规则 | 含义 |
|------|------|
| R1 用户优先 | `source === 'user'` 一律生效，并清空 pendingResume（用户主动覆盖 DJ 续播意图） |
| R2 transition 锁 | 换歌中（`isTransitioning`）非用户请求一律丢弃 |
| R3 speaking 锁 | DJ 说话中非用户的 `play` 请求不直接生效，置 `pendingResume = true`，等 DJ 说完由 `resumePlaybackAfterSpeak` 唯一消费 |
| R4 autoplay fallback | 由 R3 覆盖：autoplay 被浏览器拒时，DJ 说完仍会续播 |
| R5 幂等 | `nextPlaying === isPlaying` 时直接返回，避免无谓 setState |

---

## 四、nextSong / prevSong 两阶段重构（ZCode 修订）

### 4.1 原版（一阶段）的问题

```ts
nextSong() {
  // ...
  _set({ currentSong: next, currentTime: 0, isPlaying: true })  // ← 同时写 currentSong + isPlaying
}
```

- `isPlaying: true` 是绕开 `playRequest` 的直写，破坏单点仲裁
- 若新歌 playUrl 缺失 / audio 出错，`isPlaying: true` 已写入 → 与实际播放状态脱钩

### 4.2 修订版（两阶段）

```ts
nextSong() {
  // 阶段 1：换歌（不写 isPlaying）
  _set({ currentSong: next, currentTime: 0 })

  // 阶段 2：通过 playRequest 仲裁（auto）
  get().playRequest('play', 'auto')   // ← 受 R1/R2/R3/R5 约束
}
```

`prevSong` 同理，阶段 2 source = `'user'`（用户主动点上一首，R1 直接生效）。

### 4.3 三条路径全覆盖

| 路径 | 阶段 1 | 阶段 2 source |
|------|--------|---------------|
| 成功 fetch 下一首 | `_set({ currentSong, currentTime: 0 })` | `'auto'` |
| 失败回退 queue[i+1] | `_set({ currentSong, currentTime: 0 })` | `'auto'` |
| 完全本地 mock | `_set({ currentSong, currentTime: 0 })` | `'auto'` |
| prevSong | `_set({ currentSong, currentTime: 0 })` | `'user'` |

---

## 五、§四 场景 1-8 覆盖矩阵

| 场景 | 期望 | 测试用例 | 结果 |
|------|------|---------|------|
| 1. DJ 说话中点推荐卡（user play） | 立即生效，清 pendingResume | `场景1: user 优先级 (R1)` | ✅ |
| 2. DJ 说话中 chat 推荐（auto play） | pendingResume=true；DJ 说完续播 | `场景2: auto speaking 锁 (R3)` + 续播断言 | ✅ |
| 3. 换歌中 DJ/auto 触 play | 丢弃，warning | `场景3: transition 锁 (R2)` | ✅ |
| 4. 换歌中用户点播放 | 立即生效（R1 用户优先） | `场景4: user 突破 transition 锁 (R1>R2)` | ✅ |
| 5. autoplay 被拒 → DJ 说完续播 | pendingResume 持续保留到说完 | `场景5: autoplay 失败 fallback (R4)` | ✅ |
| 6. 重复 play/pause 请求 | no-op | `场景6: 幂等 (R5)` × 2 | ✅ |
| 7. togglePlay toggle 语义 | 翻转当前态 | `场景7: togglePlay` | ✅ |
| 8. nextSong 阶段 2 auto + isSpeaking | pendingResume=true | `场景8: nextSong 两阶段 (auto+speaking)` | ✅ |

**额外覆盖**：
- `pause` 在 `isSpeaking=true` 时立即生效（不像 play 受 R3 锁）— 1 用例
- `nextSong`/`prevSong` 两阶段验证 — 3 用例
- `setIsPlaying` 私有 setter 仍可被 store 内部使用（不破坏兼容）— 2 用例

**15 用例全绿**。

---

## 六、E2E 证据（无回归）

### 6.1 既有 E2E 用例（djIntroToSong）

`frontend/src/hooks/djIntroToSong.e2e.test.ts` 8 个场景（场景 A-H）**全绿**：

- 场景 A：有开场白 + TTS 正常播放完毕 → 自动放歌 ✅
- 场景 B：有开场白 + TTS 播放出错 → 仍应自动放歌 ✅
- 场景 C：有开场白 + /dj/tts 失败 → 应自动放歌 ✅
- 场景 D：DJ 关闭 → 即使有开场白也直接放歌 ✅
- 场景 E：歌曲无 playUrl（QQ）→ 应放歌 ✅
- 场景 F：无开场白 → unlock 后直接放歌 ✅
- 场景 G：开场白说完但歌曲已在播 → 保持播放状态 ✅
- 场景 H：create 接口失败 → 状态安全、有错误提示 ✅

### 6.2 单元测试

- `radioStore.test.ts`：23 用例（prevSong/togglePlay/setIsPlaying 全部走通）✅
- `djIntroToSong.test.ts`：5 用例（状态机语义）✅
- `radioStore.playRequest.test.ts`：**15 新增**（场景 1-8 + 边界）✅

### 6.3 tsc / vitest

- 后端：`305 tests pass`（与批 1/2 基线一致，无变动）
- 前端：`204 tests pass`（基线 189/23 + 新增 15/1）
- `tsc --noEmit`：双零

---

## 七、commit 与 push

```
1fcf694 fix: F4 isPlaying 仲裁层——单点 playRequest 取代 12 处直写
        8 files changed, 360 insertions(+), 27 deletions(-)
        create mode 100644 frontend/src/store/radioStore.playRequest.test.ts

push: 2616b39..1fcf694 master -> master  ✅
```

**全部 4 批 commit + push 状态**：

| 批 | commit | 状态 |
|----|--------|------|
| 批 1 SSRF | `3e8024c` | ✅ pushed |
| 批 2 backlog | `2205ae4` | ✅ pushed |
| 批 3-1 InputArea | `2616b39` | ✅ pushed |
| 批 3-2 F4 | `1fcf694` | ✅ pushed |

---

## 八、未做的 / 风险与回滚

### 8.1 未做

- **store 外仍有 `setIsPlaying` 直写可能**：组件层 `setIsPlaying` 已被替换 6 处（grep 复查无遗漏）；store 内部仍可使用（私有 setter），用于初始化、`clearSession` 等场景，符合"私有"语义
- **R4 autoplay fallback 的真机验证**：当前由 R3 的 pendingResume 间接覆盖，但浏览器 autoplay policy 行为各异（Safari/Chrome/Firefox），需 ZCode 在真机/真浏览器复核
- **R2 transition 锁的 UI 反馈**：当前 transition 中被丢弃的请求只在 dev 下打 warning，生产静默。若产品要求提示，需补 toast（不在本次范围）

### 8.2 风险

- **playRequest 路径以外的边界**：若未来新增组件继续直写 `setIsPlaying`，会绕过 R1-R5。建议在 store 入口加 `Object.defineProperty` 或 Proxy 拦截（本次未做，避免过大改动）
- **setIsPlaying 标记私有仅靠注释**：未做 TS 级别私有（如 `__setIsPlaying` 命名 + JSDoc），靠 code review 把关

### 8.3 回滚

`git revert 1fcf694` 即可，命令：

```bash
git revert 1fcf694 --no-edit
git push origin master
```

回滚后：6 处组件直写恢复原状，`setIsPlaying` 公开使用，**`prevSong`/`nextSong` 内嵌直写恢复**（这是主要风险点）。若回滚后线上出现 §四 场景错乱，需立即 hotfix 重新合入。

---

## 九、交付清单

- [x] 8 文件改动（store + 6 调用点 + 1 新测试）
- [x] commit `1fcf694` + push 到 `origin master`
- [x] 15 新增 + 23 既有 + 5 既有 + 8 E2E 全绿
- [x] tsc 双零
- [x] 报告落盘 `docs/MiNiMax/reports/exec-f4-arbiter-2026-07-18-MiNiMax.md`

**全部 3 批 4 commit 4 报告 完成。等 ZCode 复核。**