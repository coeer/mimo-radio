---
author: KIMI
task: F4 仲裁层闭环实施小规格（批次 2，引用 ZCode 总规格）
created: 2026-07-22
status: 已按总规格实施（本文件为补落盘的规格痕迹）
---

# F4 仲裁层闭环实施小规格

> **执行依据**：`docs/ZCode/plans/master-plan-remaining-2026-07-22.md` §一（ZCode 裁决已 baked-in，本文件不再论证，只做实施映射）。
> 上轮阶段 A 漏写本文件（"以为写了"教训），本次端到端授权下补落盘。

## 裁决 → 实施映射

| 项 | ZCode 裁决 | 实施位置 |
|----|-----------|---------|
| N-1 | 方案 A：nextSong 阶段 2 移 finally 复位后 + switched 守卫 | radioStore.ts nextSong（:323-387） |
| N-2 | 选项 a：普通路径消费 pendingResume（清 false），注释"仅内部状态 UI 不订阅" | radioStore.ts:311-312 |
| R-3 | prevSong source 'user'→'auto' | radioStore.ts:321 |
| N-3 | prevSong 入口 isTransitioning 防重入 | radioStore.ts:314 |
| R-5 | 场景 8 改真 mock fetch nextSong，断言终态（走向 1：isPlaying=true） | radioStore.playRequest.test.ts:181-197 |

## 关键实施决定（KIMI 自由度内）

1. **N-1 收口方式**：三条路径（fetch 成功 / fallback / local）不再各自调 playRequest，统一在 try 块记录 `switched=true`，finally 复位后单次 `playRequest('play','auto')`——避免三处重复，且保证只在真切歌时发请求。
2. **场景 8 测试**：mock `global.fetch`，sessionId 置位走 fetch 路径；断言链：切歌终态 → DJ 说话中 R3 挂起（pendingResume=true, isPlaying=false）→ 模拟说完（setSpeaking(false) + playRequest('play','dj')）→ 消费闭环（isPlaying=true, pendingResume=false）。
3. **不动**：R1-R5 规则、setIsPlaying 私有化、djIntroToSong 两测试文件、partialize、不引入 R6。

## 验证

- frontend tsc 零错误；vitest ≥ 204 passed（含改后场景 8）
- djIntroToSong.test.ts / djIntroToSong.e2e.test.ts 全绿
- §1.2 的 11 场景推演矩阵逐个走查，写进执行报告

---

*方案由 KIMI 生成。*
