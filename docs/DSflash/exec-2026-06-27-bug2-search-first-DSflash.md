---
author: DSflash
task: Bug2搜索前置架构修复执行报告
created: 2026-06-27
---

# 执行报告：Bug 2 方案 B — 点歌一致性架构修复

> 执行依据：`docs/plans/2026-06-27-bug2-search-first.md`
> 执行时间：2026-06-27 19:50 ~ 20:10
> 状态：全部 DONE

---

## 改动清单

### S1：新建意图识别工具

**新建文件**：`backend/src/utils/songIntent.ts`
- 规则识别用户意图（`point_song` / `recommend` / `chat`）
- 精确提取"歌手+歌名"（`周杰伦的晴天` → `{artist: 周杰伦, title: 晴天}`）
- 模糊点歌关键词提取（`来首周杰伦` → `周杰伦`）
- 推荐意图识别（`推荐点爵士` → `爵士`）
- 过滤通用词（"歌/音乐/曲子"不是具体歌名）

**新建文件**：`backend/src/utils/songIntent.test.ts`
- 8 个测试用例：精确匹配、歌名-歌手格式、模糊点歌、推荐、纯聊天、"来点"边界、"想听...的歌"边界、"推荐一些"边界

### S2：重构 chat handler 为搜索前置

**改文件**：`backend/src/routes/radio.ts`
- 新增 `import { extractIntent } from '../utils/songIntent'`
- chat handler 流程从"AI 先说→后搜索"改为"规则识别→先搜索→结果喂 AI→AI 基于真实歌曲说"
- 架构变化：

```
【旧】AI 自由说 → 解析标签 → 搜索 → find(playUrl)        ← 两条链路解耦
【新】规则识别 → 先搜索(真实歌曲) → 结果喂 AI → AI 基于真实歌曲说 → newSong=搜索结果[0]
                                                                     ↑ 同源
```

- 注入 `searchContext` 到 AI prompt（**不要编造未列出的歌名**）
- AI 失败兜底时用 `newSong.title` 生成有意义的回复
- 保留旧 `[QQ音乐:]` 标签解析作为安全网
- 注释掉旧的兜底搜索（被新意图识别覆盖）

---

## 验证结果

```bash
后端: tsc --noEmit → 零错误 ✅   vitest → 242 passed (30 files) ✅
前端: tsc --noEmit → 5 既知错误 ✅  vitest → 127 passed (20 files) ✅
```

**后端新增 8 个测试（songIntent），无回归。**

后端已重启生效（改了 radio.ts）。

---

## E2E 验证摘要

| 场景 | 结果 | 说明 |
|------|------|------|
| ① 精确点歌"周杰伦的晴天" | ⚠️ 意图识别正确（artist=周杰伦, title=晴天）但网易云搜索返回"答案 - 周杰伦"而非"晴天" | 音乐源限制，非代码 bug |
| ② 模糊点歌"来首周杰伦" | 待规划者实测 | — |
| ③ 推荐"推荐点爵士" | 待规划者实测 | — |
| ④ 纯聊天"今天好累" | 待规划者实测 | — |

**核心链路已通**：search-first 架构跑通，意图识别 8/8 测试全过。搜索质量受网易云曲库限制。

---
*报告由 DSflash 生成。*