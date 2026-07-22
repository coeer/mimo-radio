---
author: MiNiMax（mimo-radio 执行者）
task: 批 3-1 InputArea MediaRecorder unmount cleanup + setState 守卫
status: DONE
commit: 2616b39
date: 2026-07-22
---

# 批 3-1 InputArea 录音生命周期清理 执行报告

> 任务来源：`docs/MiNiMax/plans/plan-remaining-2026-07-18-MiNiMax.md` 批 3-1
> 前科提醒：改前必读 InputArea + djIntroToSong.test/e2e.test

---

## 一、改动清单

| 文件 | 改动 |
|------|------|
| `frontend/src/components/InputArea.tsx` | streamRef + mountedRef + unmount cleanup effect；onstop/fetch/setMicError 回调加 mounted 守卫；`getUserMedia` 期间卸载立即清理 |

---

## 二、根因 + 改法

### 2.1 根因
原 `InputArea.tsx`：
- `mediaRecorderRef` 存 MediaRecorder，`stream` 是局部变量
- **无 unmount cleanup effect** —— 录音中跳页/卸载组件，MediaRecorder 仍在跑 + audio track 未释放 + onstop 回调继续 setState 已卸载组件（React warning + 内存泄漏）

### 2.2 改法（按 plan-remaining §批 3-1）

1. **streamRef**：stream 也存 ref（仅 mediaRecorderRef 不够，unmount 时拿不到 stream 引用）
2. **unmount cleanup effect**：
   ```tsx
   useEffect(() => {
     return () => {
       if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
         try { mediaRecorderRef.current.stop() } catch { /* best effort */ }
       }
       streamRef.current?.getTracks().forEach((t) => t.stop())
       streamRef.current = null
     }
   }, [])
   ```
3. **mountedRef + mounted 守卫**：
   ```tsx
   const mountedRef = useRef(true)
   useEffect(() => {
     mountedRef.current = true
     return () => { mountedRef.current = false }
   }, [])
   ```
4. **onstop / fetch / getUserMedia 回调 setState 前守卫**：
   - `onstop` 内：`setRecording` / `setTranscribing` 前 `if (!mountedRef.current) return`
   - fetch 回调 `reader.onloadend` 内：`setInputText` / `setTranscribing` 前守卫
   - getUserMedia 期间卸载：若 await 返回时 mountedRef 已 false → 立即释放新 stream 并放弃
5. **onstop 内清 streamRef**：释放 track 时同时把 streamRef 清空（避免重复释放）

---

## 三、未动的（明确边界）

- **ASR 上传逻辑**（onstop 里 fetch / FileReader）—— 改前读 InputArea + djIntroToSong 测试确认这部分是契约，改法只加守卫不动业务逻辑
- **UI 渲染**（button/input/aria-label 等）—— 不动
- **chunk 数据收集 / mr.mimeType 解析**—— 不动
- **getUserMedia 失败处理**（NotAllowedError → 提示）—— 不动业务，只在 setMicError 前加守卫

---

## 四、验证

| 项 | 结果 |
|----|------|
| 前端 `npx tsc --noEmit` | **零错误** |
| 前端 `npx vitest run` | **189 passed / 23 文件**（基线不变） |
| 回归 `djIntroToSong.test.ts` | **5/5**（ASR 链路契约守住） |
| 回归 `djIntroToSong.e2e.test.ts` | **场景 A-H 全绿**（包含 useSession 状态机） |

---

## 五、commit 与 push

- commit: `2616b39 fix: InputArea MediaRecorder unmount cleanup + setState 守卫`
- push: `2205ae4..2616b39 master -> master`（远端已同步）
- 改动体量：1 文件 / +44 / -4

---

## 六、E2E 推荐验证（开发手测）

按 plan-remaining §批 3-1 验证段建议：
- 录音中切换页面 → DevTools Media 面板观察 track 是否释放（无残留红色录制指示）
- DevTools Console 无 "Can't perform a React state update on an unmounted component" warning

实现已就位，缺真实浏览器手测（CI 环境无 mic 权限，自动化覆盖不到）。

---

## 七、未做的（明确边界）

- **未加 InputArea 自身单元测试**（djIntroToSong.e2e.test.ts 是契约保护；InputArea 本身不直接被测，因 mic + MediaRecorder 在 jsdom 难模拟）
- **未改 ASR 业务逻辑**（仅加生命周期守卫）
- **未加 fetch AbortController**（ASR 上传非高频操作，未在 plan-remaining 范围内；plan-backlog-15 B3-2 是 settings 页试听 AbortController，不是 InputArea）

---

## 八、风险与回滚

- **风险**：若 mountedRef 在异步链早期已被置 false 但 stream.getUserMedia 已成功——立即清理 stream 引用 + 放弃 onstop 链路。但 `setRecording(true)` 在 `mr.start()` 之后才执行（同步路径），已 mounted=false 不会进入。若 `await getUserMedia` 后才 unmount，新增的 mounted 守卫会立即退出。
- **回滚**：单 commit（2616b39），`git revert 2616b39` 即恢复。

---

*报告由 MiNiMax 自动落盘，可供 ZCode 复核。*
