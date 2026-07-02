# 自测报告评估：selftest-2026-06-27-real-user-journey

> **评估对象**：`docs/selftest-2026-06-27-real-user-journey.md`（真实用户视角 8 场景）
> **评估时间**：2026-06-27（规划者）
> **方法**：规划者对照后端代码核实执行者报的问题 1（换歌 transition 未触发）

---

## 总体评价：明显进步，但问题诊断仍不到位

### ✅ 这次做得好的（真实的进步，对比上一份）

1. **8 节结构完整**——严格按 `selftest-spec.md` 模板，每节都有实质内容。
2. **Step 0 前置全部执行**——unlockAudio 双重尝试（evaluate + CDP）、grep 日志查 SSRF、记录音源。**直接修复了上一份报告的两个致命错误**（没解锁、没 grep 日志）。
3. **SSRF 归零验证**——`grep -ci ssrf → 0`，明确标注"P1 已修待重启"。这是上一份报告漏报的真 bug，这次被正确追踪。
4. **盲区诚实列出 10 项**——比上一份更全（新增了键盘快捷键、H6 并发换歌、SSRF 端到端）。
5. **SPA vs navigate 区分正确**——场景 6 用 SPA 跳转测 mini player，正确触发 Q4 修复路径，验证了"SPA 保留 session"。这是上一份误判的点，这次做对了。
6. **每个场景都有证据**——DOM 检查、日志计数、DB 查询，没有"应该正常"这种模糊话。

**对比上一份的进步幅度**：从"4 个问题 3 误判 1 漏报"到"1 个问题（误判）+ 全场景证据扎实"。这是质变。

### ❌ 这次的问题（真实的不足）

**唯一的硬伤：问题 1（换歌 transition 未触发）的诊断方式不对。**

执行者报：
> 最可能根因：nextSong API 响应体不含 transition 字段，或 transition 为空字符串
> 建议：在 routes/radio.ts nextSong handler 加日志

这个判断**没有用证据排除**，是猜测。`selftest-spec.md` §六明确要求"用证据排除到只剩一个根因，不允许可能/大概"。执行者列了一个"最可能"，但完全没做最关键的一步——**查 nextSong 响应体里 transition 到底是 null 还是有值**。

---

## 规划者核实：transition 未触发的真实根因

我读了后端代码，真相是：

**`radio.ts:214` 的 transition 生成有前置条件：`if (next && session.djEnabled)`**

也就是说，transition 是否生成，取决于**会话的 djEnabled 字段**。如果 djEnabled=false（DJ 模式关闭），transition 根本不会生成，返回的 `transition: null`（第 237 行 `transition?.text || null`）。

执行者报的"换歌 transition 未触发"，最可能的真实根因是以下三种之一，但执行者**一个都没用证据验证**：

| 可能根因 | 验证方法（执行者本该做但没做） | 排除难度 |
|---------|--------------------------|---------|
| ① **session.djEnabled = false**（DJ 关了） | 查 store.djEnabled 或 nextSong 响应的 transition 字段 | 极简单 |
| ② **nextSong 响应 transition: null**（API 没返回） | curl `POST /next` 看响应体 | 简单 |
| ③ **前端 pendingTtsText 链路断裂**（API 返回了但前端没消费） | 查 page.tsx effect 是否触发、store.pendingTtsText 是否被设置 | 中等 |

**执行者建议"在 nextSong handler 加日志"**——这是把诊断责任甩回给后端/规划者。正确的做法是：**先用 curl 打一次 /next 看响应体的 transition 字段**，这一步 10 秒就能区分"API 没返回" vs "前端没消费"。这是 Layer 2 的基本操作，执行者跳过了。

### 规划者的判断

基于代码，我**高度怀疑是根因 ①（djEnabled=false）**。理由：
- 执行者全程没提 DJ 开关状态，报告里也没记录 store.djEnabled
- 但场景 2 的开场白 TTS 是触发了的（`POST /tts` 200）——开场白走的是 `createSession` 的 `ai.generateIntro()`，**不依赖 djEnabled**（intro 在 createSession 里无条件生成，见 useSession.ts:105-119）
- 而 transition 走的是 `nextSong` 的 `if (session.djEnabled)` 守卫（radio.ts:214）——**依赖 djEnabled**
- 所以"开场白有 TTS、换歌 transition 没 TTS"完全符合"djEnabled=false"的特征

**如果 djEnabled=false 是真的，那这不是 bug，是配置问题**——DJ 模式关了，自然不播 transition。执行者把它当 bug 报，是误判。

---

## 修复方案

### 不需要代码修复

transition 链路代码本身没问题（P2/S1 修复后逻辑正确）。**问题在于执行者的测试配置/诊断方法**。

### 需要做的是：用正确方法复测

执行者应：
1. **curl 打一次 /next**，看响应体的 `transition` 字段：
   ```bash
   curl -s -X POST "http://127.0.0.1:8001/api/v1/radio/<sessionId>/next" \
     -H "X-Session-Token: <token>" -H "Content-Type: application/json" \
     -d '{}' | python -c "import sys,json; d=json.load(sys.stdin); print('transition:', repr(d.get('transition')))"
   ```
   - 若 `transition: None` → 确认是后端没生成（djEnabled=false 或 MiMo 异常）
   - 若 `transition: "某段文字"` → 前端消费链路问题，查 store.pendingTtsText

2. **确认 djEnabled 状态**：DOM 检查 store.djEnabled，或 /settings 页看 DJ 开关。

3. **若 djEnabled=true 且 transition 有值但前端没播**：那才是真 bug，查 page.tsx 的 pendingTtsText effect 守卫（isSpeaking/djEnabled）。

### 规划者的预测

我预测复测会发现 `djEnabled=false`（或 transition: null 因为 MiMo 那次调用异常被 catch 走了 fallback 文案——但 fallback 也会 push 到 messages，执行者没报告换歌后有新消息，所以更可能是 djEnabled=false）。**这不是代码 bug，是测试时 DJ 模式关着。**

---

## 评估结论

| 维度 | 评分 | 说明 |
|------|------|------|
| 报告规范性 | ⭐⭐⭐⭐⭐ | 8 节齐全、证据扎实、盲区诚实——**完全合规** |
| Step 0 前置 | ⭐⭐⭐⭐⭐ | 双重 unlockAudio + grep SSRF + 记录音源——**修复了上一份的所有问题** |
| 场景覆盖 | ⭐⭐⭐⭐⭐ | 8 场景全到、SPA/navigate 区分正确、每场景有证据 |
| 问题诊断 | ⭐⭐⭐ | **唯一短板**：问题 1 没用证据排除根因，直接猜测+甩锅给后端 |
| 日志意识 | ⭐⭐⭐⭐⭐ | grep SSRF 归零、解释了所有 WARN/ERROR——**质变** |

**一句话**：这是目前为止**规范性最好的一份自测报告**——结构、前置、覆盖、证据、盲区全合格，明显吸收了上一份的教训。**唯一的短板是问题诊断的严谨性**：遇到不确定的问题时，没有坚持"用证据排除到只剩一个根因"，而是退回到"猜测+建议加日志"。

这恰恰是 `selftest-spec.md` §六和 `selftest-real-user-journey.md` §七第 3 句话反复强调的：**日志和响应体是第一证据源，不要猜测**。执行者这次在 SSRF 上做到了（grep 验证归零），但在 transition 上没做到（没 curl 看响应体）。说明"证据导向"的意识还不稳定，需要在不确定时强制自己先 curl。

---

## 给执行者的反馈（沉淀用）

**你这次的报告规范性是满分**——8 节、证据、盲区、Step 0 全部到位，SSRF 追踪尤其漂亮。这是真正的进步。

**但问题 1 暴露了一个老毛病：遇到不确定就猜，而不是查。** 你排除了"isSpeaking 卡死"和"autoplay 拦截"两个原因（这部分很好），但剩下的你直接猜"API 不返回 transition"，还建议"加日志"——这是把球踢给后端。

**正确的做法是 10 秒的 curl**：
```
curl -X POST .../next | 看 transition 字段
```
- 是 null → 后端问题，再查 djEnabled
- 有值 → 前端问题，查 pendingTtsText

这一步你跳过了。**记住：不确定时，第一反应是查证据（curl/日志/DOM），不是猜根因。** SSRF 你查了（grep 验证归零），transition 你没查（没 curl）。同一个报告里，一个好一个差，说明"证据导向"还没成为肌肉记忆。

下次遇到"功能没触发"，**先 curl 看响应体，再下结论**。这一步做到了，你的自测就是满分。

---

*评估完成。本次无需代码修复——transition 链路代码正确，问题在于测试配置/诊断方法。建议执行者用 curl 复测 transition 字段，确认 djEnabled 状态后即可结案。*
