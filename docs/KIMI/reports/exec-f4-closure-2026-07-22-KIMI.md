---
author: KIMI
task: 批次 2：F4 仲裁层闭环（N-1 方案 A / N-2 选项 a / R-3 / N-3 / R-5 场景 8）
created: 2026-07-22
spec: docs/ZCode/plans/master-plan-remaining-2026-07-22.md §一 + docs/KIMI/plans/plan-f4-closure-2026-07-22-KIMI.md
status: DONE
---

# 执行报告：F4 仲裁层闭环（批次 2）

## 一、执行摘要

按总规格 §一的 ZCode 裁决完成 5 项打包修复：N-1 方案 A（nextSong 阶段 2 移 finally 后 + switched 守卫，死路径变真实仲裁）、N-2 选项 a（pendingResume 在普通路径 play 时真实消费）、R-3（prevSong source 改 'auto'）、N-3（prevSong 加 isTransitioning 防重入）、R-5（场景 8 重写为真 mock fetch 全链路测试）。改动 2 个文件（radioStore.ts + playRequest 测试），新增 3 个测试用例（场景 8b/9/10），11 场景矩阵全部测试背书。验证：frontend tsc 零错误、vitest **207 passed**（204 → 207，+3 新用例）、djIntroToSong 两文件全绿。前置小规格已补落盘并 ls 确认。

## 二、改动明细

| 文件 | 改动 | 行号 |
|------|------|------|
| `docs/KIMI/plans/plan-f4-closure-2026-07-22-KIMI.md` | 补落盘上轮漏写的小规格（引用总规格），ls 确认在盘 | 新文件 |
| `frontend/src/store/radioStore.ts` | N-2：普通路径改条件 `_set`——`nextPlaying=true` 时清 `pendingResume: false`（真实消费），pause 不清 + 注释"仅内部状态 UI 不订阅" | :311-320 |
| `frontend/src/store/radioStore.ts` | N-3：prevSong 入口加 `if (get().isTransitioning) return`（对齐 nextSong T1.1） | :318-319 |
| `frontend/src/store/radioStore.ts` | R-3：prevSong `playRequest('play','user')` → `'auto'` + 注释 | :334 |
| `frontend/src/store/radioStore.ts` | N-1 方案 A：nextSong 加 `switched` 标志，三条路径（fetch 成功/fallback/local）只切歌置标志；阶段 2 统一移到 finally 复位后单次 `playRequest('play','auto')` | :336-410 |
| `frontend/src/store/radioStore.playRequest.test.ts` | R-5：场景 8 重写（mock fetch 真调 nextSong，断言切歌+R3 挂起+说完消费闭环）；新增场景 8b（走向 1：暂停态点下一首 isPlaying=true）；新增场景 9（fetch 在途点 prev 拒绝）、场景 10（DJ 说话中点 prev 挂起）；import 加 `vi`；头部场景清单注释更新 | :15-16, :175-260, :285-330 |

**前置规格落盘确认**：`ls docs/KIMI/plans/` 确认 `plan-f4-closure-2026-07-22-KIMI.md`（2076 bytes）在磁盘上（吸取上轮"以为写了"教训）。

## 三、验证结果

- **frontend tsc --noEmit**：0 错误
- **frontend vitest 全量**：**Test Files 24 passed (24) / Tests 207 passed (207)**（基线 204 + 3 新用例，无回退）
- **关键三文件单跑**（playRequest + djIntroToSong 两文件）：**3 files / 31 tests 全 passed**——djIntroToSong.test.ts / djIntroToSong.e2e.test.ts 全绿（边界守住）
- **backend**：本批未改后端文件；后端基线复核：tsc 0 错误 + **Test Files 32 passed / Tests 305 passed**（无回退）

### 11 场景推演矩阵（逐个走查，全部测试背书）

| # | 场景 | 预期终态 | 走查结果 | 背书 |
|---|------|---------|---------|------|
| 1 | DJ 说话中点推荐卡（user play） | isPlaying=true / pendingResume=false | R1 立即置位 + 清 | 场景1 ✓ |
| 2 | DJ 说话中 chat 推荐（auto play） | isPlaying 不变 / pendingResume=true | R3 挂起 | 场景2 ✓ |
| 3 | 换歌中 DJ auto play | 不变 / 不变 | R2 丢弃不挂起 | 场景3 ✓ |
| 4 | 换歌中用户点播放（user） | true / false | R1 穿透 transition | 场景4 ✓ |
| 5 | autoplay 被拒（system pause） | false / **不变** | 普通路径 pause 分支，N-2 条件清只在 play | 场景5 ✓ |
| 6 | 重复 play 请求 | 不变 / 不变 | R5 幂等 no-op | 场景6/6b ✓ |
| 7 | togglePlay 翻转 | 翻转 / user 则清 | R1 user toggle | 场景7/7b ✓ |
| 8 | 用户暂停态点下一首 | **true**（走向 1）/ 不变 | 方案 A 阶段 2 在 finally 后走普通路径置位 | 场景8b ✓ |
| 9 | nextSong fetch 在途点 prev | 不变 / 不变 | N-3 防重入直接 return | 场景9 ✓（新增） |
| 10 | DJ 说话中点上一首 | 不变 / true | R-3 改 auto 后 R3 挂起，阶段 1 切歌生效 | 场景10 ✓（新增） |
| 11 | DJ 说话中换歌 + 说完 | true / false | 场景8 全链路：切歌→R3 挂起→说完消费 | 场景8 ✓（重写） |

## 四、与规格的偏差

**两处正面偏差，如实声明**：

1. **N-2 精确化**：总规格 §1.1 字面是"普通路径恢复播放后清 pendingResume"。我实现为**仅 `nextPlaying=true` 时清**（pause 路径不清）——因为 §1.2 矩阵场景 5 要求 system pause 后 pendingResume "不变"，无条件清会与矩阵矛盾。这是对规格意图（消费=恢复播放时）的精确实现，不是换方案。
2. **新增场景 9/10 两个测试**：规格要求"场景 8 重写 + 11 场景逐个走查"。矩阵场景 9/10 是本次 N-3/R-3 改动直接引入的新行为，只走查不测试会留回归缺口（正是本轮"测试绿也照样错"的教训），故补成测试。测试数 204 → 207。

无隐瞒偏差。

## 五、自评

1. **N-1 的收口方式**（switched 标志 + finally 后单次调用）比"三条路径各自在 finally 后调"更干净：避免三处重复、天然处理 `data.song` 为空的误发问题。代价是 nextSong 函数体多了一个闭包变量，可读性 OK。
2. **铁律 4 自查**：R1-R5 规则一行未动（只改了普通路径的 `_set` payload，规则顺序/判定逻辑原样）；R3 挂起语义（说话中 auto play 不立即生效）完整保留——N-1 修复后它第一次真正生效（原来阶段 2 到不了 R3）。
3. **useSession.ts 注释未改**：:28-34 注释声称"playRequest('play','dj') 自动消化 pendingResume"——N-2 修复后该声称**变为事实**，注释无需改。
4. 附注：后端基线复核为预防性（本批零后端改动），实测 305 passed 无异常。

## 六、前科复盘

- **铁律 1（资源成对）**：场景 8/8b 测试的 `vi.stubGlobal` 都在 try/finally 里配 `vi.unstubAllGlobals()` + sessionId/sessionToken 复位，不污染后续用例。
- **铁律 4（理解原方案）**：改 nextSong 前回答了"原阶段 2 为什么在 try 里"——它不是设计意图而是疏漏（cross-review N-1 已论证）；R3 挂起语义是设计意图，保住。没有重写 R1-R5。
- **场景 8 NEEDS_CONTEXT 前科**：走向 1 裁决（矩阵第 8 行 isPlaying=true）已按修正后规格实施，未擅自沿用旧矩阵。
- **"以为写了"前科**：小规格落盘后立即 ls 确认（输出存档于对话）。

## 七、状态

**DONE**——5 项全部按裁决实施，11 场景矩阵测试背书，验证全过，无隐瞒偏差。

---

*报告由 KIMI 生成。*
