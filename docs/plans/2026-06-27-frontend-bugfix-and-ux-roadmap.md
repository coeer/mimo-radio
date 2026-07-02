# mimo-radio 体验修复计划 + 下一步优化方案

> **触发**：用户实测发现两类严重体验缺陷——① 全屏切换导致主题混乱(点全屏返回变黑夜,点设置变浅色)② 聊天点歌时 DJ 说的是 A 歌但实际播的是 B 歌
> **生成时间**:2026-06-27(规划者)
> **方法**:规划者重新对照视频规格 + 代码根因核实,盘点全局体验缺陷
> **配套**:先读 `COLLABORATION.md` + `docs/claudio-rebuild-plan-v2.2.md`(视频规格)
> **交付**:本文档分两部分——**Part A 前端 Bug 修复计划**(具体问题,可立即执行)+ **Part B 全局体验优化方案**(下一步方向)

---

## Part A:前端 Bug 修复计划(立即可执行)

### 🔴 Bug 1:全屏切换导致主题混乱(用户实测)

#### 现象(用户原话)
> 我点了全屏,然后返回就变成黑夜模式,再点设置又变回浅色模式

#### 根因(代码确认)
`frontend/src/components/FullscreenPlayer.tsx:36-46` 的经典闭包陈旧 bug:
```ts
const [prevTheme, setPrevTheme] = useState<string>('dark')  // ← 默认值 'dark'
useEffect(() => {
  const cur = root.getAttribute('data-theme') || 'dark'
  setPrevTheme(cur)            // ← 异步 setState,触发 re-render
  root.setAttribute('data-theme', 'light')
  return () => {
    root.setAttribute('data-theme', prevTheme)  // ← 闭包捕获的是初始值 'dark'!
  }
}, [])  // ← [] 依赖,只 mount 时跑一次,setState 后 cleanup 不会更新
```

**机制**:
1. 用户原本浅色主题 → 进全屏 → `setPrevTheme('light')` 正确记录
2. 但 `[]` 依赖的 effect 不会因 setState 重跑 → cleanup 闭包里的 `prevTheme` 仍是 mount 时的 `'dark'`
3. 退出全屏 → cleanup 执行 `setAttribute('data-theme', 'dark')` → **无论用户原主题是什么,都强制变成 dark**
4. "点设置变浅色"是 /settings 页从 localStorage 读 `mimo-theme`(可能存的是 light),和 FullscreenPlayer 强制设的 dark 冲突

**这是之前代码审查方案 Task 13 指出过的 bug,但当时被归入"另一个方案"未修**。现在用户实测命中,必须修。

#### 修复(用 ref 存,避免闭包陈旧)
```tsx
import React, { memo, useEffect, useRef, useState } from 'react'

function FullscreenPlayer() {
  // ...其他 hooks
  const prevThemeRef = useRef<string>('dark')

  useEffect(() => {
    const root = document.documentElement
    prevThemeRef.current = root.getAttribute('data-theme') || 'dark'  // ref 跨渲染保持
    root.setAttribute('data-theme', 'light')
    return () => {
      root.setAttribute('data-theme', prevThemeRef.current)  // 读 ref.current,拿 mount 时真实值
    }
  }, [])
  // 删除 useState prevTheme
}
```

**验证**:
- 用户浅色主题 → 进全屏 → 退出 → 仍是浅色(不再变 dark)
- 用户深色主题 → 进全屏 → 退出 → 仍是深色
- 进全屏期间切主题(虽然 UI 藏起来了),退出恢复进全屏那一刻的主题

---

### 🔴 Bug 2:聊天点歌时 DJ 解说与实际播放不一致(用户实测)

#### 现象(用户原话)
> 我预想的是在聊天框输入的东西,比如我想听某个歌手的作品,dj 也反馈给我了对应的歌手和歌曲,但是实际播放的是另外的歌曲

#### 根因(代码确认)
**DJ 解说文本(AI 自由生成)与实际播放(搜索算法 find)没有绑定**。

后端 `routes/radio.ts:343-365` 的 `[QQ音乐:xxx]` 处理:
1. AI 在 reply 里说"为你找到了周杰伦的《晴天》..."(AI 自由发挥,可能编造)
2. 后端用 `match[1]`(如"周杰伦")搜索 → `songs.find(s => s.playUrl)` 取**第一个可播的**作为 `newSong`
3. **第一个可播的可能不是《晴天》**,而是搜索结果里的别的歌(网易云搜索"周杰伦"返回的第一首可播歌)
4. 前端播放 `newSong`,但 DJ 说的是《晴天》→ 不一致

**两个解耦的来源**:
- DJ 解说文本:AI 凭"想象"写,可能歌名/歌手都对不上真实曲库
- 实际播放:`getMusicSource().searchPlayable(keyword).find(playUrl)`,纯算法

**根本矛盾**:AI 不知道曲库里**实际有什么可播的歌**,它在"虚构推荐"。

#### 修复方向(三选一,推荐 B)

**方案 A(简单但治标)**:让 AI 解说只说"风格/氛围",不说具体歌名
- 改 prompt:禁止 AI 在解说里提具体歌名,只描述氛围("为你找了几首**深夜爵士**,慢慢听")
- 缺点:失去视频规格里"DJ 介绍具体歌的背景"的体验

**方案 B(推荐,治本)**:搜索前置,让 AI 基于真实搜索结果写解说
- 改流程:先 `searchPlayable(keyword)` 拿到真实歌曲列表 → 把列表喂给 AI → AI 基于真实歌曲写解说
- 这样 DJ 说的歌就是实际要播的歌,天然一致
- prompt 示例:"用户想听周杰伦。我从曲库找到了这些可播的歌:[晴天-周杰伦, 七里香-周杰伦, ...]。请选一首作为主推,基于它的真实信息写解说。"

**方案 C(折中)**:用 newSong 的真实信息覆盖 AI 解说里的歌名
- 后端拿到 newSong 后,正则替换 reply 里的歌名/歌手为 newSong 的真实值
- 缺点:AI 解说的"创作背景"仍可能是编的(因为 newSong 的背景 AI 不知道)

#### 推荐实现(方案 B,改后端 chat 路由)

`backend/src/routes/radio.ts` 的 chat handler,把"AI 先说→后搜索"改成"先搜索→AI 基于结果说":

```ts
// 【改前】AI 先自由回复 → 解析标签 → 搜索
let reply = await ai.chat(messages)  // AI 可能编造歌名
// 然后解析 [QQ音乐:xxx] 去搜索

// 【改后】先搜索真实歌曲 → 喂给 AI → AI 基于真实结果回复
// 1. 识别用户意图(简单关键词匹配,不依赖 AI 标签)
const isPointSong = /想听|来首|播放|听.*的|歌手|乐队/.test(text)
let searchResults: Song[] = []
if (isPointSong) {
  searchResults = await getMusicSource().searchPlayable(extractKeyword(text), 5)
}
// 2. 把真实搜索结果作为上下文喂给 AI
const contextWithResults = searchResults.length > 0
  ? `\n\n【曲库真实可播的歌曲】\n${searchResults.map((s,i)=>`${i+1}. ${s.title} - ${s.artist}`).join('\n')}\n请只基于以上真实歌曲推荐,不要编造歌名。`
  : ''
// 3. AI 基于真实结果回复
reply = await ai.chat([...messages, { role: 'system', content: contextWithResults }])
// 4. newSong 取 searchResults[0](就是 AI 解说里那首)
newSong = searchResults.find(s => s.playUrl)
recommendations = searchResults.slice(0,5).map(...)
```

**关键改进**:AI 不再"虚构推荐",而是"基于真实曲库解说"。DJ 说的歌 = 实际播放的歌。

#### 验证
- 输入"我想听周杰伦" → DJ 解说提到具体歌名 → 实际播放的就是那首
- DJ 解说的"创作背景"应基于真实歌曲信息(可能仍需 prompt 约束别编造年份等细节)

---

### 🟡 Bug 3:全屏期间主题被强制 light,与用户主题冲突

#### 现象
全屏强制浅色是视频规格(§3.1.2),但如果用户深色主题下进全屏,体验割裂。

#### 根因
`FullscreenPlayer.tsx:41` 无条件 `setAttribute('data-theme', 'light')`。

#### 修复
保留视频规格的"全屏浅色",但 Bug 1 修复后退出能正确恢复即可。**不强制改**,因为这是设计决策。若用户反馈强烈,可改为"全屏跟随用户主题"。

---

## Part B:全局体验优化方案(下一步方向)

基于重新对照视频规格 + 用户实测反馈,以下是**视频规格 vs 当前实现的体验差距盘点**。按"用户感知优先级"排序。

### 🎯 核心体验差距(影响"这是不是 Claudio"的判断)

#### 差距 1:DJ 人格的连贯性(最高优先级)

**视频规格**(§3.2.1, §9.2):Claudio 是一个**有人格的 DJ**,每首歌都有**100-200 字的深度解说**(创作背景+此刻适合听的原因),风格温暖、有品味、讨厌算法推荐。

**当前实现**:
- DJ 串词 80-150 字(基本达标)
- 但**解说内容可能与实际播放的歌不符**(Bug 2)
- DJ 没有连续记忆——每次换歌的串词互相独立,不像"同一个 DJ 在主持一整天的节目"
- 开场白和换歌串词风格可能不一致(两个不同 prompt)

**优化方向**:
1. **修 Bug 2**(方案 B)——让 DJ 基于真实歌曲解说
2. **DJ 记忆**:把当天已播歌曲列表 + DJ 已说过的话作为上下文,让 DJ "记得自己刚才介绍了什么",避免重复
3. **统一 DJ 声音**:开场白/换歌串词/聊天回复用同一套 persona prompt(已有 `personaPromptBlock()`,确认所有入口都用)

#### 差距 2:点歌的"精准命中"体验

**视频规格**(§3.2.2):用户说"想听 XXX",DJ 回复后**直接播用户想听的那首**。

**当前实现**:
- AI 标注 `[QQ音乐:xxx]` → 后端搜索 → 取 `find(playUrl)` 第一个可播的
- **问题**:第一个可播的不一定是用户想听的(搜索结果排序问题、VIP 歌无 playUrl 被跳过)
- 加上 Bug 2,DJ 说的和播的更对不上

**优化方向**:
1. **搜索排序优化**:用户说"周杰伦的晴天" → 优先精确匹配 `title=晴天 && artist=周杰伦`,而非模糊搜索"周杰伦"取第一首
2. **关键词提取**:从用户输入提取"歌手+歌名"精确搜索,而非整句搜索
3. **无版权时的诚实反馈**:如果搜到的歌没有 playUrl(VIP),DJ 应说"这首没有版权,我给你找首类似的",而不是静默跳到别的歌

#### 差距 3:全屏歌词的沉浸感

**视频规格**(§3.1.2, §6.B4):全屏有**逐句高亮的歌词**,当前句绿色高亮,像 KTV。

**当前实现**:
- 双轨:LRC 优先,无则 DJ 解说
- **问题**:网易云很多歌无 LRC → 降级 DJ 解说 → 但 DJ 解说是"换歌时说的话",不是歌词,沉浸感断裂
- LRC 加载期间闪现上一首的 DJ 解说(F9 已修但可能仍有残留)

**优化方向**:
1. **LRC 覆盖率提升**:网易云 `getLyric` 已接入,但 QQ 音源要确认 `getLyric` 也工作
2. **无 LRC 时不显示 DJ 解说当歌词**——这是体验断层。应显示"这首歌暂无歌词"+大封面+波形,让用户专注听音乐,而不是把 DJ 解说塞进歌词区
3. **LRC 逐句高亮的精确度**:当前按字符比例分配时长(F9),真实 LRC 有时间戳应按时间戳精确高亮

---

### 🎨 视觉与交互差距(影响"质感"的判断)

#### 差距 4:主题一致性(Bug 1 的延伸)

**问题**:全屏强制 light + /settings 读 localStorage + ThemeToggle 改 data-theme,**三个主题来源不同步**。

**优化方向**:
- 统一主题管理:所有主题读写都走一个 hook(如 `useTheme`),不再 FullscreenPlayer 直接操作 DOM
- 全屏不强制改主题(或改为可配置),避免割裂

#### 差距 5:封面与歌曲信息的视觉层级

**视频规格**:封面是视觉主角,大尺寸,有质感。

**当前实现**:KimiCard 封面 56px,全屏 88px——**偏小**。视频里封面更大,是卡片视觉中心。

**优化方向**:放大封面尺寸,KimiCard 至少 72px,全屏 120px+。

#### 差距 6:波形动画的"活感"

**视频规格**(§3.1.1):白色细竖条波形,高度随机起伏,模拟音频。

**当前实现**:AudioWaveform 真实频率驱动(CORS 失败降级 sin)。但 **CORS 经常失败**(网易云音频跨域),降级为 sin 模拟,看起来不像真实波形。

**优化方向**:确认 AnalyserNode 是否因 CORS 失败,若失败考虑用音频音量(RMS)驱动伪波形,比纯 sin 更真实。

---

### 🧠 智能化差距(影响"懂不懂我"的判断)

#### 差距 7:上下文感知推荐

**视频规格**(§3.1.5, §6.C4):结合天气、日程、时间调整音乐氛围。早晨舒缓、工作专注、夜晚冥想。

**当前实现**:
- /plan 页有真实天气 + AI 时段规划
- 但**主播放器的推荐不感知上下文**——创建会话时 `loadNeteaseSongs` 只按用户输入关键词搜索,不结合天气/时间
- DJ 串词的 prompt 里有 `session.context.time` 和 `weather`,但**搜索算法本身不用**

**优化方向**:
1. 创建会话时,把天气/时间作为搜索关键词的一部分(如用户输入"轻音乐"+ 早晨 → 搜索"早晨 轻音乐")
2. DJ 串词已感知上下文(prompt 里有),保持

#### 差距 8:用户品味的长期记忆

**视频规格**(§3.2.3):Claudio 有 taste.md,记得用户品味。

**当前实现**:
- feedback 落库了(like/skip/complete)
- 但**推荐算法不读 feedback**——loadNeteaseSongs 纯按关键词,不考虑用户历史收藏
- planner 用 persona.tasteProfile(写死),不用真实 feedback

**优化方向**:
1. 推荐时把用户收藏的歌手/风格作为加权(如"用户收藏了 3 首周杰伦 → 搜索时偏向周杰伦")
2. persona.tasteProfile 从 feedback 表动态生成,而非写死

---

## 优先级矩阵(给规划者决策)

| 优化项 | 用户感知 | 实现成本 | 推荐优先级 |
|--------|---------|---------|-----------|
| **Bug 1 全屏主题** | 🔴 高(每次全屏都触发) | 🟢 低(ref 改一处) | **立即修** |
| **Bug 2 点歌不一致** | 🔴 高(核心功能失效) | 🟡 中(改 chat 流程) | **立即修** |
| 差距 1 DJ 人格连贯 | 🔴 高(决定产品调性) | 🟡 中(DJ 记忆+统一 prompt) | 下一步 |
| 差距 2 精准命中 | 🔴 高(点歌核心体验) | 🟡 中(搜索排序+关键词提取) | 下一步 |
| 差距 3 全屏歌词沉浸 | 🟡 中(纯音乐歌多) | 🟢 低(改降级逻辑) | 顺手 |
| 差距 4 主题统一 | 🟡 中(偶发割裂) | 🟡 中(抽 useTheme hook) | 中期 |
| 差距 5 封面放大 | 🟢 低(视觉细节) | 🟢 低(改尺寸) | 顺手 |
| 差距 7 上下文推荐 | 🟡 中(锦上添花) | 🟡 中(搜索关键词改造) | 中期 |
| 差距 8 品味记忆 | 🟢 低(需长期使用才感知) | 🔴 高(推荐算法重构) | 远期 |

---

## 执行建议

### 第一波(立即,Part A)
1. Bug 1 全屏主题(ref 修复)
2. Bug 2 点歌不一致(方案 B:搜索前置)
这两个是用户实测命中的,必须先修。

### 第二波(下一步,Part B 核心)
3. 差距 1 DJ 人格连贯(记忆+统一声音)
4. 差距 2 精准命中(搜索排序)
5. 差距 3 全屏歌词(无 LRC 不塞 DJ 解说)

### 第三波(中期,质感)
6. 差距 4 主题统一(useTheme)
7. 差距 5/6 视觉细节
8. 差距 7 上下文推荐

### 第四波(远期,智能化)
9. 差距 8 品味记忆(推荐算法重构)

---

## 验收标准(每个优化完成后)

- Bug 1:浅色用户进全屏退出仍是浅色(测 dark↔light 两种)
- Bug 2:输入"周杰伦"→ DJ 说《晴天》→ 实际播《晴天》(歌名一致)
- 差距 1:连续听 5 首,DJ 串词不重复、有承接感
- 差距 2:输入"周杰伦的晴天"→ 播《晴天》而非其他周杰伦的歌
- 差距 3:无 LRC 的歌全屏显示"暂无歌词"+大封面,不显示 DJ 解说

---

*本方案基于 2026-06-27 用户实测反馈 + 视频规格 v2.2 重新对照。Part A 可立即交付执行者,Part B 作为下一步产品演进路线图。*
