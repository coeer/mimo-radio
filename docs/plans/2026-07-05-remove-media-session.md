---
author: 规划者
task: 删除 MediaSession 相关代码（锁屏/耳机线控控制）
created: 2026-07-05
---

# 删除 MediaSession 执行规格

> **目标**：用户不需要锁屏/耳机线控控制功能。完整删除 MediaSession 相关代码，不影响其他功能。
> **范围**：只删 MediaSession，不动播放控制（Effect 2）、audio setup（Effect 1）、音量（Effect 6）。
> **配套**：先读 `COLLABORATION.md`（历史决策 + 铁律）

---

## 〇、现状（代码核实）

MediaSession 代码**全部集中在** `frontend/src/hooks/useAudioPlayer.ts`，3 个 effect：

| Effect | 行号 | 功能 | 删除？ |
|--------|------|------|--------|
| Effect 3 | :126-147 | MediaSession metadata（锁屏显示歌名/封面） | ✅ 删 |
| Effect 4 | :149-197 | MediaSession actionHandler（锁屏/耳机 play/pause/next/prev/seek） | ✅ 删 |
| Effect 5 | :199-207 | 同步播放状态到 MediaSession（控制中心显示 playing/paused） | ✅ 删 |

**不受影响的**：
- Effect 1（:21-89 audio setup + analyser）—— 不涉及 MediaSession
- Effect 2（:91-124 播放控制 isPlaying/isSpeaking）—— 不涉及 MediaSession
- Effect 6（:209-212 音量同步）—— 不涉及 MediaSession

**依赖链注意**：`:18 const setIsPlaying = useRadioStore((state) => state.setIsPlaying)` 当前被 Effect 4（:157/162）使用。Effect 2 的 :118 用的是 `useRadioStore.getState().setIsPlaying(false)`（命令式，不是订阅值）。**删除 Effect 4 后 :18 订阅变成死变量**——tsc strict 会报"declared but never read"。需要同步删除 :18。

---

## 任务清单

### T1：删除 Effect 3（MediaSession metadata）

删除 `useAudioPlayer.ts:126-147` 整个 effect 块（含注释 `// Effect 3: MediaSession metadata...`）。

### T2：删除 Effect 4（MediaSession actionHandler）

删除 `useAudioPlayer.ts:149-197` 整个 effect 块（含注释 `// Effect 4: MediaSession actionHandler...`）。

### T3：删除 Effect 5（MediaSession playbackState）

删除 `useAudioPlayer.ts:199-207` 整个 effect 块（含注释 `// Effect 5: 同步播放状态到 MediaSession...`）。

### T4：删除死变量 setIsPlaying 订阅

删除 `:18 const setIsPlaying = useRadioStore((state) => state.setIsPlaying)`。

**注意**：删除前确认 Effect 2 不用这个订阅值。Effect 2 的 :118 走的是 `useRadioStore.getState().setIsPlaying(false)`（命令式读取），不是 :18 的订阅。删除安全。

**删除后**：tsc 应零错误（验证 setIsPlaying 无残留引用）。

### T5：清理 HANDOVER / COLLABORATION 中的 MediaSession 引用

- `HANDOVER.md` 第五节低优先级项"ASR / MediaSession 锁屏控制需真实移动设备验证"——改为"ASR 语音输入需真实设备验证（MediaSession 已删除）"
- `COLLABORATION.md` 如有 MediaSession 引用同理清理

### T6：重新编号 effect 注释（可选但推荐）

删除 3 个 effect 后，Effect 6（音量）变成第 3 个。更新注释编号（Effect 1/2/3），保持连续。

---

## 验证

```bash
cd D:/Coder/mimo-radio/frontend

# 1. tsc 零错误（核心——确认 setIsPlaying 死变量已清理）
npx tsc --noEmit 2>&1 | tail -3

# 2. 测试全过
npx vitest run  # ≥173

# 3. grep 确认 MediaSession 零残留
grep -rn "mediaSession\|MediaSession\|MediaMetadata\|setActionHandler" src/ --include="*.ts" --include="*.tsx"
# 期望：无输出（完全清除）

# 4. grep 确认 setIsPlaying 在 useAudioPlayer 无残留
grep -n "setIsPlaying" src/hooks/useAudioPlayer.ts
# 期望：只有 :118 的 useRadioStore.getState().setIsPlaying(false)（命令式），无订阅
```

---

## 执行检查清单

- [ ] T1: 删 Effect 3（:126-147）
- [ ] T2: 删 Effect 4（:149-197）
- [ ] T3: 删 Effect 5（:199-207）
- [ ] T4: 删 setIsPlaying 订阅（:18）
- [ ] T5: 清理 HANDOVER/COLLABORATION 的 MediaSession 引用
- [ ] T6: 重新编号 effect 注释（可选）
- [ ] tsc 零错误
- [ ] vitest ≥173
- [ ] grep MediaSession 零残留
- [ ] grep setIsPlaying 无死变量
- [ ] git commit + push

---

## 给执行者的提醒

1. **只删 3 个 effect + 1 个订阅**——不要动 Effect 1（audio setup）、Effect 2（播放控制）、Effect 6（音量）。这些是核心播放逻辑，改了就坏。

2. **删除 setIsPlaying 订阅（:18）前确认**——grep `setIsPlaying` 在 useAudioPlayer.ts 的所有使用点。只有 Effect 4（:157/162）用了订阅值；Effect 2（:118）用的是 `useRadioStore.getState().setIsPlaying`（命令式）。删 Effect 4 后 :18 就是死变量，删掉。

3. **不要动 store 的 setIsPlaying action 定义**（radioStore.ts）——其他组件（KimiCard/FullscreenPlayer/PlanTimeline 等）还在用。只删 useAudioPlayer 里的订阅。

4. **删除后 Effect 编号不连续**——Effect 1/2/6 变成 1/2/3。重新编号注释（可选但推荐，保持整洁）。

5. **这是纯删除任务，不引入新代码**。如果发现"需要加新代码补偿"——停下来问规划者，不要自作主张。

---

## 删除后的影响

| 功能 | 删除前 | 删除后 |
|------|--------|--------|
| 锁屏显示歌名/封面 | ✅ 有 | ❌ 删除（锁屏不显示歌曲信息） |
| 耳机线控播放/暂停 | ✅ 有 | ❌ 删除（耳机按钮无响应） |
| 锁屏切歌 | ✅ 有 | ❌ 删除（锁屏无法切歌） |
| 页面内播放/暂停/切歌 | ✅ 有 | ✅ 不受影响 |
| 键盘空格/方向键 | ✅ 有 | ✅ 不受影响 |
| DJ 说话暂停歌曲 | ✅ 有 | ✅ 不受影响 |
| isPlaying 写入点 | 16 处 | **13 处**（减少 3 个 MediaSession handler） |

**isPlaying 写入点从 16→13**：F4 仲裁层的紧迫度降低（但 13 处仍无仲裁，不是完全消除风险）。

---

*本规格是纯删除任务。3 个 effect + 1 个订阅变量，不碰其他逻辑。grep 确认零残留即完成。*
