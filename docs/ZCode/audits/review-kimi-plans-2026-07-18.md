---
author: 规划者（ZCode）
task: 审查 KIMI 两份方案（F4 仲裁层 + backlog 15 项）并源码核实修订
created: 2026-07-18
audience: KIMI（双身份）、用户
status: 已完成修订，方案待执行
---

# ZCode 审查记录：KIMI 两份方案修订

> 本记录留痕 ZCode 对 KIMI 2026-07-18 两份方案的审查与源码核实修订过程。
> 修订后的方案以原文件（带 `[ZCode 修订]` 标记）为准，本文件是修订依据的索引。

---

## 一、审查对象

| 方案 | 文件 | KIMI 自评 | ZCode 评级 |
|------|------|----------|-----------|
| F4 isPlaying 仲裁层 | `docs/KIMI/plans/plan-f4-isplaying-arbiter-2026-07-18-KIMI.md` | 待审 | 🟡 方向认可，规格有硬伤，已修订 |
| backlog 15 项 | `docs/KIMI/plans/plan-backlog-15-2026-07-18-KIMI.md` | 待审 | 🟢 基本可用，3 处需修正，已修订 |

---

## 二、源码核实动作（不盲信，逐条查）

审查前跑了以下 grep/read 核实 KIMI 的论断：

1. `grep -rn "setIsPlaying"` 排除 .test 和 store 定义 → 确认 8 处组件/hook 直写
2. `grep setIsPlaying radioStore.ts` → 确认 store 内 4 处写（togglePlay/nextSong/prevSong/stop）
3. 跑 backend + frontend 全量 vitest → 确认基线 **277/179**（不是 KIMI 写的 288/189）
4. `ls backend/src/app.ts` → 确认 app.ts 存在（B1-2 generalLimiter 位置正确）
5. `sed -n log.ts:36` → 发现 :36 是 schema 定义行，msg 在 POST handler 里经 logger 输出（非"入库"）
6. `grep timestamp radio.ts` → 发现 6 处 `timestamp: 0`（不是单数）
7. `grep created_at db/index.ts` → 确认 feedback 表有时间字段（B2-5 无需降级）
8. `sed -n startSessionCleanup` → 发现它只有 setInterval 无 clearInterval（反模式）
9. `Read settings/page.tsx` 全文 → 发现试听已有 pause 旧 audio，真问题是 fetch 无 AbortController

---

## 三、F4 方案修订明细

| 修订项 | 原文问题 | 修订内容 |
|--------|---------|---------|
| 基线数字 | 288/189 | → 277/179（实跑核实），新增 §〇 基线节 |
| 写点计数 | "9 处直写" 口径含糊 | → "8 处件/hook 直写 + 4 处 store 内部 = 12 写点"，分两张表 |
| §三 nextSong/prevSong | 方案说"改走 playRequest"但没说两阶段原子性 | 补 §3.1 两阶段改法 + 原子性说明（currentSong 先切、isPlaying 经仲裁）|
| §四 场景 1 | "⚠️ 需 ZCode 裁决" | 补裁决：用户优先放歌，DJ 继续说完（附理由 + 技术实现）|
| §四 场景 8 | 遗漏 | 新增：nextSong 自动切歌时旧 transition onEnd → 仲裁丢弃（§一第三条竞态的单测对应）|
| §五 验证 | 覆盖矩阵 1-6 | → 1-8（补场景 7、8）|

**设计认可点**（不改）：playRequest 单点仲裁方向正确；R1-R5 规则合理；setIsPlaying 保留私有不删；pendingResume 机制合理。

---

## 四、backlog 方案修订明细

| 项 | 原文问题 | 修订内容 |
|----|---------|---------|
| 基线 | 288/189 | → 277/179（头部 + 验收节）|
| B1-2 | 未说 skip 计数器行为 | 补：express-rate-limit v8 skip 返回 true 不计数，执行者验证 |
| B1-3 | `log.ts:36` 行号错 + "入库"描述错 | 修正：:36 是 schema 定义行；msg 经 logger 输出非入库；位置改为 POST handler 内 msg 拼接前 |
| B2-3 | "恒 0"单数 | 修正：6 处 `timestamp: 0`（line 158/165/240/247/288/421）全改 |
| B2-5 | 说"复用 startSessionCleanup 模式" + 担心无时间字段 | 确认有时间字段（不降级）；**修正反模式**——startSessionCleanup 只有 setInterval 无 clearInterval，新代码必须更规范（带 stop + 进程退出钩子清理）|
| B3-2 | "位置：grep 定位"太模糊 + 描述不准 | 精确定位 `settings/page.tsx:55-86`；核实现状已有 pause 旧 audio，真问题是 fetch 无 AbortController；给出完整改法代码 |

**认可点**（不改）：分 3 commit 思路；每项五要素齐全；边界明确（不做 SSE/F4/songs 表/git filter-repo）；B3-5 trust proxy 跳过判断得当。

---

## 五、优先级裁决（ZCode 决定）

两份方案都不插队到 P0a/P0b 前面。执行顺序：

```
P0a（ZCode 自做，5 项机械清理）← 当前
  ↓
P0b（KIMI，4 项：R1/R2/F1收藏/B6）
  ↓
P1（KIMI，含 F4 仲裁层 + fetchWithTimeout + F2/F3/F5）
  ↓  ← F4 仲裁层规格已修订，插这里
P2（仓库卫生）+ backlog 15 项（并行或之后）
```

理由：P0a/P0b 是"防回归 + 安全 + 数据正确性"，优先级高于"架构优化（F4）+ 打磨（backlog）"。F4 是架构改动（12 写点 + 竞态推演），归 P1；backlog 是"顺带提醒"，归 P2 之后。

---

## 六、前科提醒（KIMI 专属，记入案例）

### 教训 1：基线数字必须实跑核实，不能照抄

两份方案头部都写 288/189，实跑 277/179——差 11/10。若照 288/189 验收，做完发现"277→285 < 288"会误判回退。

**规则**：写方案头部基线前，`cd` 进去跑一次 `vitest run`，把实际数字抄进去。方案里的数字是验收依据，不是装饰。

### 教训 2：行号要 grep/Read 核实，"在那行附近找"不合格

B1-3 写 `log.ts:36`，实际 :36 是 schema 定义，真正改的位置在 POST handler。方案里的行号要让执行者"跳到那行就能改"。

**规则**：方案里每个行号，写之前 `sed -n '<行号>p'` 看一眼那行到底是什么。

### 教训 3：描述现状前先 Read，别靠记忆/推测

B3-2 写"settings 页试听无竞态防护"，实际已有 `previewAudioRef.pause()` 停旧 audio。真问题（fetch 无 AbortController）被错误描述掩盖了。

**规则**：方案里说"现状是 X"之前，Read 一遍那个文件/函数，确认 X 属实。

---

## 七、对 COLLABORATION §10.6 的案例追加建议

本审查产生的 2 条新教训，建议后续追加到 COLLABORATION §10.6（由 ZCode 执行，KIMI 写提案亦可）：

1. **"基线数字照抄"**：双规划者方案互引时，数字未实跑核实导致 2 份方案同步出错。教训：方案间互引数字也要核实。
2. **"复用模式前先查模式本身是否合规"**：B2-5 要"复用 startSessionCleanup 模式"，但该模式本身违反铁律 1（无 clearInterval）。教训：复用既有代码模式前，先核实该模式是否合规，别把反模式当范式复制。

---

*本审查记录由规划者（ZCode）出具。两份方案已修订完成，待 P1/P2 阶段执行。*
