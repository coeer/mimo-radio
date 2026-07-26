---
author: KIMI
task: 批次 3：F-4 settings previewVoice（AbortController + 试听失败不改设置）
created: 2026-07-22
spec: docs/ZCode/plans/master-plan-remaining-2026-07-22.md §二
status: DONE
---

# 执行报告：settings previewVoice 竞态修复（批次 3）

## 一、执行摘要

按总规格 §二 完成：previewVoice 加 AbortController（复用 useTTS ttsAbortRef 模式，连点 A→B 时 A 的在途 fetch 被 abort，不再双音轨）；"试听即 setTtsVoice"改为**试听成功后才 setTtsVoice**（方案选择及理由见 §四）。新增 `page.test.tsx` 3 个用例（连点 abort / 无 audio_url 失败 / fetch reject 失败）。验证：frontend tsc 零错误、vitest **210 passed**（207 → 210，+3）。改动 1 个源文件 + 1 个新测试文件。

## 二、改动明细

| 文件 | 改动 | 行号 |
|------|------|------|
| `frontend/src/app/settings/page.tsx` | 新增 `previewAbortRef`；previewVoice 入口 abort 上一个 + 新建 controller + fetch 带 `signal`；catch AbortError 静默 return；非 abort 失败仅在 controller 仍是当前时清 previewing | :47-49, :62-110 |
| `frontend/src/app/settings/page.tsx` | `setTtsVoice` 从试听入口（原 :62）移到 `await audio.play()` 成功之后 | :94-98 |
| `frontend/src/app/settings/page.tsx` | `audio.onended/onerror` 加 `previewAudioRef.current === audio` 守卫（防旧音频清新一轮状态） | :88-93 |
| `frontend/src/app/settings/page.tsx` | unmount cleanup 补 `previewAbortRef.current?.abort()`（铁律 1 成对） | :113-114 |
| `frontend/src/app/settings/page.test.tsx` | 新文件：3 用例（连点 abort / 无 audio_url / fetch reject），mock fetch + mock Audio | 新文件 |

## 三、验证结果

- **frontend tsc --noEmit**：0 错误
- **settings 单测**：3 passed（连点 A→B 验证 `pendingTts[0].init.signal.aborted === true` + B 成功播放 + `ttsVoice='voice_b'`；两种失败路径 `ttsVoice` 保持 `'orig_voice'` 不变）
- **frontend vitest 全量**：**Test Files 25 passed (25) / Tests 210 passed (210)**（207 → 210，无回退）

## 四、与规格的偏差

**一处方案选择（规格明确授权"KIMI 自行选择，需说明理由"）**：

规格给两个选项：a) 失败时回滚 setTtsVoice 到上一个值；b) 试听成功后才 setTtsVoice。**我选 b**。理由：
- 回滚方案在连点竞态下有坑：A 开始试听（回滚需先存 prev=A 前的值 V0）→ B 开始（存 V0）→ B 成功 set(B) → A 的 fetch 失败返回 → 回滚到 V0，**把 B 的成功选择覆盖了**。要正确处理需要代际判断，复杂度高。
- "成功才 set"天然无此问题：失败路径根本不触碰 store，连点时只有最后一个成功者写入。语义也更直白——"没听到声音就不算选中"。
- 用户可感知差异：旧行为点一下卡片立即显示"当前音色"（即使合成失败）；新行为要等试听从扬声器出来才显示选中。这正是规格要修的"试听失败也已改设置"。

commit message 仍按规格用"回滚"字样以外的描述（见下方实际 message：用了"成功后才设音色"）。

## 五、自评

1. mock Audio 是必要手段（jsdom 未实现 HTMLMediaElement.play），测试因此能断言"只有 B 发声"（audioPlayMock 调用次数 = 1）。
2. `previewAbortRef.current === controller` 守卫处理了一个 spec 没提的边角：A 的 `audio.play()` 已被 B 的 entry pause 掉而 reject 时，A 的 catch 不能清掉 B 的 previewing 状态。
3. onended/onerror 的 `=== audio` 守卫同理：旧音频的结束事件不清新一轮的状态。

## 六、前科复盘

- **铁律 1**：abort（分配）与 unmount cleanup 的 abort（清理）成对；每个 previewVoice 调用先 abort 上一个再新建——不存在悬挂 fetch。
- **铁律 4**：复用的是 useTTS ttsAbortRef 的"abort + AbortError 静默"模式，该模式的关键属性（被 abort 不走兜底）在 catch 里保留——没有因为"settings 页没有 speechSynth 兜底"就删掉 AbortError 分支。
- **铁律 3（异步三问）**：fetch 有 signal 可取消；失败路径 ttsVoice 不被污染；最坏情况（连点 10 次）只有最后一个 controller 存活，其余全部 abort。

## 七、状态

**DONE**——规格两项改法完成，方案选择（成功才 set）已论证，3 个新测试全绿，全量无回退。

---

*报告由 KIMI 生成。*
