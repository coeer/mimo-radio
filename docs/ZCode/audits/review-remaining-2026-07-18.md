---
author: 规划者（ZCode）
task: 剩余事项 4 commit 复核（MiNiMax 执行：SSRF + backlog + InputArea + F4）
created: 2026-07-18
audience: 用户、MiNiMax
method: 读 4 份报告 + git 核实 + 逐项源码抽验 + 独立跑基线
status: 复核通过
---

# ZCode 复核报告：剩余事项 4 commit（MiNiMax）

> **复核对象**：批1 `3e8024c` SSRF + 批2 `2205ae4` backlog + 批3-1 `2616b39` InputArea + 批3-2 `1fcf694` F4
> **方法**：读 4 份报告 + git log + 逐项源码抽验（含最高风险的 F4 store 代码 + SSRF async 传导）+ 独立跑 tsc+vitest

## 一、结论：**A-**（4 批均通过，质量高，1 处规格边界遗漏）

| 批 | commit | 项数 | 评级 | 独立核实 |
|----|--------|------|------|---------|
| 1 SSRF | `3e8024c` | 3 | **A** | async 传导完整 + IPv6/DNS 校验 + 白名单优先级重排（合理）|
| 2 backlog | `2205ae4` | 6 | **A** | 6 项全核实 + feedback TTL 反模式已修正 + gracefulShutdown |
| 3-1 InputArea | `2616b39` | 1 | **A** | streamRef + mountedRef + unmount cleanup + 回调守卫 |
| 3-2 F4 | `1fcf694` | 1 | **A** | 12 写点清零 + 两阶段 + R1-R5 规则 + 15 测试 |

**基线**（独立实跑）：后端 **305 passed / 32 文件**，前端 **204 passed / 24 文件**（+15 F4 测试），tsc 双零。较上轮 288/189 净增 +17/+15（SSRF/backlog/F4 新增测试）。0 回归。

## 二、最高风险项抽验（F4 仲裁层 + SSRF）

### 2.1 F4 仲裁层 ✅（最高风险，重点核）

**组件层 setIsPlaying 直写清零**（grep 排除 store/test 后**空**）：
- 8 处组件/hook 直写全部迁移到 `playRequest`：page.tsx(2) / useAudioPlayer(1) / useSession(2) / PlanTimeline(1) / QueueList(1) / RecommendCardList(1) ✅

**playRequest 实现**（`radioStore.ts:280-313`）5 条规则全部到位：
- R5 幂等（nextPlaying===isPlaying 直接 return）✅
- R1 用户优先（source='user' 立即生效 + 清 pendingResume）✅
- R2 transition 锁（isTransitioning 时 dj/auto 丢弃 + dev warning）✅
- R3 speaking 锁（isSpeaking 时非 user play 挂 pendingResume）✅
- R4 system pause（走普通路径）✅

**nextSong/prevSong 两阶段**（§3.1 ZCode 修订，最高危设计点）：
- nextSong **3 条路径全覆盖**：fetch 成功(:348-354) / fetch 失败 fallback(:367-371) / 本地 mock(:379-381)
- 每条路径：阶段1 `_set({ currentSong, currentTime: 0 })` 不写 isPlaying → 阶段2 `playRequest('play', 'auto')` ✅
- prevSong:321 `playRequest('play', 'user')` ✅
- 两阶段原子性说明（currentSong 已变但 isPlaying 经仲裁 = 不会旧歌复活）落实 ✅

**测试覆盖**：新增 `radioStore.playRequest.test.ts` 15 用例，覆盖场景 1-8（含 ZCode 新增的场景 8：nextSong → 旧 transition onEnd）+ 边界。djIntroToSong E2E 场景 A-H 全绿。

**结论**：F4 落地质量高，规格修订点（两阶段/场景1裁决/场景8）全部采纳。

### 2.2 SSRF async + DNS 校验 ✅（P0-2 修复）

**isSafeUrl async 化**（`ssrfGuard.ts:98-145`）：
- IPv6 字面量 `stripIpv6Brackets` 去方括号 + 补 `::ffff:`/`2002:`/`fc00::/7`（ULA）模式 ✅
- DNS 解析：域名形态 `await lookup(hostname, { all: true })`，任一解析私网即拒 ✅
- fail-closed：DNS 失败 → unsafe ✅
- IP 字面量跳过 DNS（已由正则覆盖）✅

**async 传导**（`fetchWithTimeout.ts:80`）：
- 唯一非测试调用点，已改 `await isSafeUrl(url)` ✅
- 前科提醒（同步→异步传导）守住——无漏调用点

**白名单优先级重排**（语义改动，ZCode 认可）：
- 原序：isSafeUrl → 白名单。新序：端口白名单 → host 白名单 → isSafeUrl
- **判断：合理**。白名单 = "我信这个域名，不做 DNS rebinding 校验"。可信域名（mimo/qqmusic）DNS 抖动不应触发 fail-closed 误拦。注释写明了设计依据。

## 三、批 2/3 抽验要点

### 批 2
- **B2-5 feedback TTL**：`stopFeedbackCleanup`（db:312）+ `gracefulShutdown`（index.ts:115）+ SIGINT/SIGTERM 钩子（:131-132）✅。**反模式已修正**——不照抄 startSessionCleanup，且顺手给 session cleanup 也补了 stop。铁律 1 守住。
- **B2-6 API envelope**：musicSource(4 处) + qqmusic(3 处) 全部统一为 `{success:false, error:{message, code}}` ✅。前端 SourceSwitcher 做了 string/object 兼容。
- **B2-3 timestamp**：后端 radio.ts 6 处已全改（`grep -c "timestamp: 0"` = 0）✅

### 批 3-1
- InputArea `streamRef`(:22) + `mountedRef`(:25) + unmount cleanup effect(:37-48) + onstop/getUserMedia 回调 mounted 守卫（多处 `if (!mountedRef.current) return`）✅。铁律 1（资源成对）守住。

## 四、🟡 发现的规格边界遗漏（B+，非 bug）

**前端 timestamp: 0 残留 7 处**：
```
frontend/src/app/page.tsx:147
frontend/src/hooks/useAudioPlayer.ts:80,129
frontend/src/hooks/useSession.ts:119,136,162
frontend/src/store/radioStore.ts:357
```
- 批 2 B2-3 只改了**后端** radio.ts 6 处，前端这 7 处构造消息时仍写 `timestamp: 0`
- MiNiMax 报告 §四说"前端 addMessage 调用点未发现"——**这个核实不够**
- **实际影响：无**。前端 timestamp 字段当前无消费方（不用于排序/渲染），且后端已改 Date.now()。前端本地构造的消息 timestamp 是死字段
- **判断**：规格 B2-3 原文是"前端同步评估"，MiNiMax 评估为不用改——这是边界判断，不是执行错误。但若未来前端要显示消息时间，这 7 处要补 Date.now()。记 backlog。

## 五、对 MiNiMax 的评价：**A**

本轮是 mimo-radio 至今最复杂的一轮（4 commit 含 F4 架构改动 + SSRF async 改造），MiNiMax 表现优秀：
1. **F4 两阶段严格落地**——规格修订点（nextSong/prevSong 两阶段 + 场景 8）全部采纳，3 条路径全覆盖
2. **SSRF async 传导完整**——前科提醒守住了，无漏调用点
3. **feedback TTL 反模式修正**——不照抄 startSessionCleanup，还顺手补了 session 的 stop + gracefulShutdown
4. **边界声明诚实**——报告里主动声明白名单优先级重排、前端 timestamp 评估等判断

**扣分**（B+ → A- 的原因）：B2-3 前端 timestamp 评估不够深入（说"未发现"但实际有 7 处）。虽无功能影响，但"前端同步评估"这步做得不到位。

## 六、master 现状认定

经本轮 + 前几轮复核，master（`1fcf694`）状态：

| 维度 | 状态 |
|------|------|
| 测试 | 后端 305 / 前端 204，tsc 双零 ✅ |
| P0a~P2 | 全部执行 + 复核通过 ✅ |
| SSRF P0-2 | **已修复**（IPv6 + DNS 校验）✅ |
| F4 仲裁层 | **已完成**（12 写点收敛）✅ |
| InputArea 泄漏 | **已修复** ✅ |
| 全面审核发现 | 全部处理 ✅ |

**唯一未处理**：🔴 **git PAT 泄漏**（你的操作，第 5 次提醒）。这不是代码任务，但拖了多轮，每多拖一刻多一份风险。

## 七、mimo-radio 阶段性结论

**mimo-radio 的技术债清理基本完成**。剩余只有：
1. 🔴 git PAT 撤销（你做）
2. 🟡 前端 timestamp 7 处（backlog，无功能影响）
3. 🟢 F4 真机 E2E（autoplay policy 各浏览器行为，需真浏览器手测）
4. 🟢 ARCHITECTURE.md 正文重写（已知过时，单独任务）

项目可以进入"日常使用"阶段了。

---

*本报告由规划者（ZCode）出具。4 commit 复核通过（A-），MiNiMax 执行质量优秀。mimo-radio 技术债清理基本完成。*
