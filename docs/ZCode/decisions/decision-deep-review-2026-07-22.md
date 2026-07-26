---
author: 规划者（ZCode）
task: 双规划者深度 review 联合评审最终裁决
created: 2026-07-22
basis: docs/ZCode/audits/deep-review-2026-07-22.md + docs/KIMI/audits/cross-review-2026-07-22-KIMI.md
method: alignment-2026-07-18.md §3.4（联合评审）+ §二（裁决规则：事实以源码核实为准）
verifiers: 4 项分歧全部由 ZCode 独立源码核实/实验验证
audience: 用户、KIMI
status: 联合结论成立
---

# 双规划者深度 review 联合裁决

> **协作模式**：alignment-2026-07-18.md §3.4 联合评审。ZCode 出 deep-review（7🔴/14🟡/12🔵/16✅），KIMI 做 cross-review（路径 A 交叉验证），分歧按 §二裁决规则。
> **裁决依据**：§二.1"事实层面以源码核实为准，谁对听谁"。所有分歧都是事实层，全部由 ZCode 独立源码核实/一次性实验验证后裁决（不盲信 KIMI）。

---

## 一、基线共识（双方独立实跑一致）

| 项目 | ZCode | KIMI | 一致 |
|------|-------|------|------|
| 后端 vitest | 305 / 32 文件 | 305 / 32 文件 | ✅ |
| 前端 vitest | 204 / 24 文件 | 204 / 24 文件 | ✅ |
| tsc 双端 | 0 错误 | 0 错误 | ✅ |
| 后端 lint | 34 errors / 19 warnings | 53 problems（34e/19w）| ✅ |

**基线零分歧**。305/204 双零可复现。

---

## 二、7🔴 核实裁决（ZCode 独立验证 KIMI 的核实结果）

| # | ZCode 原结论 | KIMI 核实 | ZCode 复核 KIMI | 最终裁决 |
|---|-------------|----------|----------------|---------|
| **R-1** startPeriodicCleanup dispose | 🔴 timer 泄漏 | ✅ 确认 | ✅ 采纳 KIMI | **🔴 成立**（fileCleanup.ts:99 return dispose / index.ts:61 没接 / gracefulShutdown 漏调）|
| **R-2** planner withTimeout | 🔴 timer 泄漏 | ✅ 确认 + 校准（无 unhandledRejection）| ✅ 采纳 | **🔴 成立**（修法对齐 fetchWithTimeout try/finally）|
| **R-3** prevSong source='user' | 🔴 双音轨+不续播 | 🟡 事实✅影响过头 | ✅ **KIMI 对，我错** | **降 🟡**（详见 §三.1）|
| **R-4** nextSong 不清 pendingResume | 🔴 僵尸 pending 有危害 | 🟡→🔵 write-only 死状态 | ✅ **KIMI 对，我错** | **降 🔵**（详见 §三.2）|
| **R-5** 场景3/8 弱断言 | 🔴 删 R2 照绿 | 🟡 场景8✅/场景3❌ | ✅ **KIMI 对，我错**（手动推演确认）| **降 🟡**（详见 §三.3）|
| **R-6** lint 34 errors | 🔴 门失效 | ✅ 确认 | ✅ 采纳 | **🔴 成立** |
| **R-7** git PAT | 🔴 安全 | ✅ 确认 | ✅ 采纳 | **🔴 成立**（用户操作）|

**核实后 🔴 数量：7 → 4**（R-1/R-2/R-6/R-7）。R-3/R-4/R-5 因影响推演或前提错误降级。

---

## 三、4 项分歧的独立验证（ZCode 不盲信 KIMI）

### 3.1 R-3 严重度：🔴 → 🟡（KIMI 对）

**我的原错误**：说"DJ 说完不续播"。
**KIMI 反驳**：Effect 2（useAudioPlayer.ts:107-138）依赖数组含 `isSpeaking`（:138），DJ 说完 isSpeaking:true→false 触发 Effect 2 重跑，`isPlaying=true` + playUrl 就绪 → `audio.play()` 恢复。
**ZCode 独立验证**：读 useAudioPlayer.ts:138 确认依赖数组是 `[isPlaying, isSpeaking, currentSong, resumeAnalyser]`，isSpeaking 翻转必触发 Effect 2。**KIMI 对**——我没走完 Effect 2 的依赖列表就下结论。
**真实影响**：DJ 说话窗口内 UI 显示 On Air 但 audio 被 Effect 2 pause（UI/声音不一致），说完自愈。+ prev/next source 语义不对称（同样是用户点按钮，prev 立即置位、next 挂起）。
**裁决**：🟡。修法不变（prev/next source 对齐）。

### 3.2 R-4 严重度：🔴 → 🔵（KIMI 对，且 KIMI 发现了更深的 N-2）

**我的原错误**：说"pendingResume 僵尸残留有功能危害"。
**KIMI 反驳**：grep 全 frontend/src，pendingResume **零读取方**——只有写入（radioStore 初始化/R1清/R3置/clearSession清）和测试断言。是 write-only 死状态。
**ZCode 独立验证**：`grep -rn "pendingResume" frontend/src/` 排除 store + 注释后**空**。组件/hook 层无人订阅。**KIMI 对**——我没查读取方就评严重度。
**真实根因**：注释（useSession.ts:28-31 + radioStore.ts:23）承诺"resumePlaybackAfterSpeak 消费 pendingResume"，但代码里 playRequest 普通路径（:312）不清它。注释误导（这就是我被引导出"僵尸错位"推演的原因）。
**裁决**：🔵 语义卫生。真正要修的是 N-2（注释与实现不符 + 让 pendingResume 有真实消费者，或承认它只是观测标记）。

### 3.3 R-5 场景3：KIMI 对（手动变异推演确认）

**我的原错误**：说"场景3 初始 false + 断言 false，删 R2 照绿"。
**KIMI 反驳**：删 R2 后走 :312 普通路径 isPlaying→true，断言 false 必红。R5 幂等（:288 `if (nextPlaying === s.isPlaying) return`）在 R2 **之前**，初始必须 false 才能让请求穿透到 R2。ZCode 建议的"初始 true"修法反被 R5 短路成真假绿。
**ZCode 独立验证（手动推演）**：
- 初始 `isPlaying=false, isTransitioning=true`，调 `playRequest('play','auto')`
- R5：`nextPlaying(true) === isPlaying(false)`？**不等**，不短路
- R1：source='auto' 跳过
- R2：isTransitioning=true → 丢弃 return
- **删 R2 变异**：R5 不短路 → R1 跳过 → R2 删了 → R3（isSpeaking=false）不挂起 → 走 :312 `_set({ isPlaying: true })` → 断言 `toBe(false)` **红**
- **KIMI 对**。我漏了"R5 在 nextPlaying(true) vs isPlaying(false) 时不短路"。

**KIMI 还指出场景 3 的真实弱点**（我没点到）：测不出 R2/R3 顺序交换的变异。N-5 给出了补丁用例（isTransitioning=true + isSpeaking=true 同置）。

**场景 8**：KIMI 确认弱断言（只手摆 playRequest 不调真 nextSong），并升级为 N-1（场景8 断言的中间态在生产不可达——见 §四）。
**裁决**：场景 3 撤销（断言方向正确）；场景 8 降 🟡 + 关联 N-1。

### 3.4 F-3 cleanup 逆序：KIMI 对（一次性实验确认）

**我的原错误**：说"React cleanup 按注册逆序，mountedRef 守卫失效"。
**KIMI 反驳**：实验实测 React 18 unmount cleanup 按**声明正序**（输出 `[cleanup1, cleanup2]`）。
**ZCode 独立验证**：写一次性 vitest 实验（`__cleanup_order_experiment__.test.tsx`），实测输出 `["cleanup1","cleanup2"]`——**声明正序，KIMI 对**。实验文件跑完即删（git 无残留）。
**含义**：mountedRef=false（effect1 cleanup）先于 MediaRecorder.stop（effect2 cleanup）→ onstop 回调读 mountedRef 已是 false → 守卫**生效**。我的"守卫失效"论证崩溃。
**裁决**：F-3 撤销（至多 🔵"合并 effect 可读性"，非正确性问题）。

---

## 四、KIMI 新增发现的采纳（ZCode 独立核实）

| # | KIMI 发现 | ZCode 独立验证 | 采纳 |
|---|----------|---------------|------|
| **N-1** nextSong 阶段2 死路径 | 🟡 R2/R5 吞掉，恒不生效 | ✅ 核实：阶段2 在 try 块内 finally 之前（radioStore.ts:354/371/381），R2 必吞 | **🟡 采纳**（**最高价值新发现**——比我的 R-4 更深）|
| **N-2** pendingResume write-only | 🟡 注释承诺消费，实现没有 | ✅ 核实：grep 零读取方（见 §三.2）| **🟡 采纳** |
| **N-3** prevSong 无防重入竞态 | 🟡 nextSong fetch 在途覆盖用户 prev | ✅ 核实：prevSong 无 isTransitioning 检查（radioStore.ts:314-322）| **🟡 采纳** |
| **N-4** emotionTags 未 sanitize | 🔵 mimo.ts:213 | ✅ 核实：title/artist 过了，tags 没过 | **🔵 采纳** |
| **N-5** 缺 R2/R3 顺序组合用例 | 🔵 规则顺序变异无测试 | ✅ 核实：现有用例只单压一条锁 | **🔵 采纳** |
| **N-6** 预热 setTimeout 无 unref | 🔵 index.ts:70 | ✅ 核实 | **🔵 采纳** |

**N-1 是本轮 review 最深的发现**：F4 规格"阶段2 经 playRequest 仲裁"的设计意图**实际不生效**——是误导性死代码。R-5 场景8 的"前提假"也由此而来（断言了一个生产不可达的中间态）。这是"测试绿也照样错"的新形态：不是断言弱，是**前提假**。

---

## 五、抽样 🟡 核实

| ZCode 🟡 | KIMI 结论 | ZCode 复核 | 最终 |
|----------|----------|-----------|------|
| B-2 req.setTimeout 误用 | ✅ | ✅ 采纳 | 🟡 成立 |
| B-3 analyzePersonality 漏 extractJsonObject | ✅ + 补 N-4 | ✅ 采纳 | 🟡 成立 |
| F-1 无歌不清 pendingResume | ✅（影响降🔵）| ✅ 随 R-4 联动降级 | 🔵 |
| **F-3 cleanup 逆序** | ❌ 实验推翻 | ✅ **KIMI 对**（实验确认）| **撤销** |
| F-4 previewVoice 无 AbortController | ✅ + 补"试听即 setTtsVoice 至今未改" | ✅ 采纳 | 🟡 成立 |
| T-2 HALF_OPEN 零覆盖 | ✅ | ✅ 采纳 | 🟡 成立 |

---

## 六、联合最终发现清单（去重 + 严重度校准）

### 🔴 严重（4 项，较 ZCode 原 7 项减 3）

| # | 内容 | 来源 |
|---|------|------|
| R-1 | startPeriodicCleanup dispose 丢弃 + gracefulShutdown 漏清 | ZCode（KIMI 确认 + 补 N-6 同族）|
| R-2 | planner withTimeout 不 clearTimeout | ZCode（KIMI 确认 + 校准危害）|
| R-6 | 后端 lint 34 errors 门失效 | 双方一致 |
| R-7 | git remote 明文 PAT | 双方一致（用户操作）|

### 🟡 中等（合并去重后 13 项）

后端：B-1 musicSource 冷启动 / B-2 req.setTimeout / B-3 analyzePersonality / B-4 API envelope / B-5 aiLimiter skip 策略 / B-6 端口推断
前端：F-2 Effect 2 依赖整个 currentSong / **F-4 previewVoice 无 AbortController**（含"试听即 setTtsVoice"遗留）/ F-5 likeDebounceRef 卸载不清 / F-6 PlayerBar duration / **N-3 prevSong 无防重入**（KIMI 新）
F4 仲裁层：**N-1 nextSong 阶段2 死路径**（KIMI 新，最高价值）/ **N-2 pendingResume write-only + 注释误导**（KIMI 新）/ R-3 prevSong source 不对称（降级自 ZCode 原 R-3）
测试：T-1 planner 零测试 / T-2 HALF_OPEN 零覆盖 / T-3 无 coverage 阈值 / T-4 e2e 命名误导 / R-5 场景8 弱断言（降级）

### 🔵 建议（合并后 14 项）

ZCode 原 12 项 + KIMI 新增 N-4（emotionTags sanitize）/ N-5（R2/R3 顺序用例）/ N-6（预热 setTimeout）+ F-1（降级）/ F-3（撤销改"合并 effect 可读性"）

### ✅ 做得好（双方共识，18 项）

ZCode 原 16 项全部经 KIMI 抽查确认 + KIMI 追加 2 项（F4 R5 幂等前置的规则排序 / useAudioPlayer Effect 2 isSpeaking 设计作为隐形防线）。

---

## 七、对 KIMI 的评价：**A+**

KIMI 这份 cross-review 是**项目至今最高质量的审查产出**，超越它自己 2026-07-17 的招牌 review：

1. **不止核实，还做了变异推演**（R-5 场景3：手动模拟"删 R2 后测试是否红"）+ **一次性实验**（F-3：跑 React cleanup 顺序实测）+ **grep 全项目**（N-2：查 pendingResume 读取方）
2. **挖出了我完全漏掉的最深发现**（N-1 nextSong 阶段2 死路径）——这把我的 R-4 从"表面现象"推进到"根本原因"
3. **推翻了我 4 个判断，每个都给了源码证据或实验**——而且 4 个**全部正确**（我独立验证后）
4. **守铁律 4**：R-5 核实没停在"false 初始断言 false 像弱断言"的直觉，挖到 R5 幂等前置才理解初始 false 是必要条件——反而拦下了我"建议改成初始 true"会制造的真假绿

**双规划者协议的价值在这次充分体现**：我做主审时漏了 pendingResume 无读取方、漏了 nextSong 阶段2 在 finally 之前、Effect 2 依赖数组没走完、React cleanup 顺序记错。KIMI 以独立视角全部补上。**这是单规划者无论多仔细都达不到的覆盖度**。

---

## 八、案例追加建议（写入 COLLABORATION §10.6）

本轮联合评审产生 3 条值得沉淀的案例：

1. **"review 严重度评估必须查读取方"**：ZCode R-4 把 pendingResume 定 🔴（僵尸有危害），实际 grep 发现零读取方=write-only 死状态。教训：评状态泄漏的严重度前，先 grep 它的所有读取方。
2. **"测试断言方向的变异推演"**：ZCode R-5 说"删 R2 照绿"，实际手动推演发现删 R2 测试必红（R5 不短路→走普通路径→isPlaying=true→断言 false 红）。教训：判"弱断言"前必须做变异推演（删/改被测代码，看测试是否真能红）。
3. **"双规划者交叉验证拦下了主审 4 个误判"**：ZCode 主审 7🔴 中 3 个严重度被 KIMI 校准 + 1 个 🟡 被实验推翻。教训：高复杂度模块（如 F4 仲裁层）的 review 即使是经验丰富的规划者也建议双盲交叉验证。

---

## 九、下一步动作建议（按优先级）

### 🔴 必修
1. **R-7 git PAT 撤销**（用户做）
2. **R-6 lint 修复**（eslint config 加 ignores）
3. **R-1 + N-6 timer 清理**（startPeriodicCleanup + planner 预热）
4. **R-2 withTimeout clearTimeout**

### 🟡 应修（F4 仲裁层闭环优先）
5. **N-1 nextSong 阶段2 死路径**（移到 finally 之后，或重新设计仲裁层的 transition 内通道）+ **N-2 pendingResume 给真实消费者或删除断言**——这两个一起修，F4 才真正闭环
6. **R-3 + N-3 prevSong 对齐**（source 改 auto + 加 isTransitioning 防重入）
7. **F-4 settings previewVoice AbortController**（含"试听即 setTtsVoice"遗留）
8. **R-5 场景8 改真 nextSong mock fetch**

### 🟢 排期
9. T-1/T-2/T-3 测试缺口 / N-4/N-5 / 其余 🟡/🔵

---

## 九-二、KIMI 反馈后的分批优化（2026-07-22 KIMI 确认无异议后更新）

KIMI 对裁决无异议，但提出了**更优的分批方案**——把 🟡 应修项里的 F4 同根问题打包成一批"先规格后实施"。ZCode 接受，调整如下：

### 批次 1（🔴 必修代码项，机械低风险，可立即派）
- R-6 lint 修复
- R-1 + N-6 timer 清理（同族）
- R-2 withTimeout clearTimeout
- 派给：KIMI 执行
- 纪律：每个 Task 改前 Read 现状 → 改 → tsc+vitest → 一次性 commit + push

### 批次 2（🟡 F4 仲裁层闭环，最高风险，**先规格后实施**）
**打包理由**：N-1 + N-2 + R-3 + N-3 + R-5 场景8 同根（仲裁层 transition 窗口 + pendingResume 语义），分开修会互相打架。

**两阶段纪律**（避免重蹈"KIMI 未审先 commit"覆辙）：
- **阶段 A（KIMI 规划者身份）**：写规格方案到 `docs/KIMI/plans/plan-f4-closure-2026-07-22-KIMI.md`
  - 必须论证 N-1 的方案分叉：阶段 2 移 finally 后 vs 开 transition 内专用通道
  - 必须给 pendingResume 的二选一：a) 让它有真实消费者 b) 承认是观测标记并删测试断言
  - 必须给 prev/next source 对齐 + prevSong 防重入的改法
  - 必须给 R-5 场景8 改真 nextSong mock fetch 的测试改法
- **阶段 B（ZCode 复核规格）**：审查方案 + 裁决 N-1 方案分叉 + 落 review 到 `docs/ZCode/audits/review-f4-closure-plan-2026-07-22.md`
- **阶段 C（KIMI 执行者身份）**：按复核后规格实施 → 报告 `docs/KIMI/reports/exec-f4-closure-2026-07-22-KIMI.md`
- **阶段 D（ZCode 复核实施）**：逐项核实 + 打分

派给：KIMI 双身份（先规划者后执行者）
**关键**：阶段 A→B 之间，KIMI 必须停下等 ZCode 复核，不能直接进 C（这是 alignment §9.1 的底线）

### 批次 3（🟡 独立小项，可任意插入）
- F-4 settings previewVoice（AbortController + 试听即 setTtsVoice 遗留）
- 派给：KIMI 或 MiNiMax 均可
- 不耦合批次 1/2，可在任何时候做

### 🟢 排期（批次 1-3 完成后）
- T-1 planner 补测试（**与批次 2 协同**：修完 F4 再补 planner/F4 集成测试，把"前提假"类问题钉死）
- T-2/T-3 测试缺口
- N-4/N-5/N-6 已在批次 1（N-6）
- 其余 🟡/🔵

### 协议纪律重申
批次 2 的"先规格后实施"是本轮强约束——任何执行者（含 KIMI 双身份自己）做完规格自审后，必须过 ZCode 复核才能动手。这是 alignment §9.1 + 本轮"KIMI 未审先 commit"教训的直接应用。

---

## 十、协议纪律确认

本轮联合评审**完全遵守 alignment-2026-07-18.md §3.4 + §二**：
- ✅ 双方独立做（KIMI 不参考 ZCode 时也已读过 ZCode 的报告，但每条独立源码核实，不盲信）
- ✅ 分歧按 §二.1（事实以源码核实为准）处理，无需升级 §二.4（用户裁决）
- ✅ 双方都落盘 md（不只在对话给结论）
- ✅ 署名三要素齐全（KIMI 文件 -KIMI 后缀 + author + 落款）
- ✅ 边界守住（KIMI 未改代码/未碰 git/未改 COLLABORATION；scratch 实验即建即删）

**双规划者协议在这次深度 review 中达到了设计目标**：覆盖度 > 单规划者，事实层高置信（双方独立验证一致），分歧有规则可裁。

---

*本裁决由 ZCode 规划者出具。4 项分歧全部由 ZCode 独立源码核实/实验验证后裁决（不盲信 KIMI），结论：KIMI 4 项全部正确，ZCode 原 7🔴 校准为 4🔴 + 3 降级。KIMI 新增 6 项全部采纳（N-1 为最高价值新发现）。联合最终清单：4🔴 / 13🟡 / 14🔵 / 18✅。*
