# 自测进阶:从两个 Bug 提炼缺陷模式(教执行者发散测试)

> **目的**:你(执行者)不要只修这两个 bug。这两个 bug 是**两类缺陷模式**的典型样本,产品里还藏着至少 10 个同源问题。本文教你**拿着模式去扫描整个产品**,而不是"测一个修一个"。
> **生成时间**:2026-06-27(规划者)
> **触发**:用户实测发现 ① 全屏切换主题混乱 ② 聊天点歌 DJ 说的和实际播的不一致
> **配套**:先读 `COLLABORATION.md` + `docs/selftest-real-user-journey.md`

---

## 〇、核心认知转变(先读这段)

大多数自测是"侦探式"的——遇到一个 bug,修一个。但高级自测是"流行病学家式"的——发现一个病例,追问"这是什么病毒?还有谁感染了?传染路径是什么?"。

用户报的两个 bug 不是孤立事件:

| 用户报的 bug | 它其实是什么"模式" | 这个模式还会出现在哪 |
|------------|-----------------|-------------------|
| 全屏切换主题混乱 | **"同一状态被多处独立管理,导致不同步"** | 主题有 6 个操作点(layout SSR / ThemeToggle / FullscreenPlayer / AudioWaveform 监听)→ 还有哪些状态也是多处管理? |
| 点歌 DJ 说 A 播 B | **"AI 生成的文本与系统实际行为解耦"** | DJ 串词 / 推荐数量 / 天气感知 → 还有哪些地方 AI 说一套、系统做一套? |

**你的任务**:拿着这两个模式,把整个产品扫一遍,找出所有同类感染。下面是规划者已经发现的线索 + 教你怎么继续找。

---

## 一、模式 A:"同一状态多处管理"扫描法

### 1.1 这个模式长什么样
某个状态(主题、音量、播放状态、session)在**多个地方被独立读写**,没有一个统一的"真相源",导致改一处另一处不知道,产生不一致。

### 1.2 已知感染点(规划者已查证)

#### A1. 主题状态(6 个操作点)
| 位置 | 做什么 | 问题 |
|------|--------|------|
| `layout.tsx:54` SSR 内联脚本 | 读 localStorage `mimo-theme`,设 `data-theme` | 防闪烁,但只启动时跑 |
| `ThemeToggle.tsx:13/15` | 点切换时改 `data-theme` + 写 localStorage | **唯一正常的入口** |
| `FullscreenPlayer.tsx:39-43` | 进出全屏强制改 `data-theme`(Bug 1) | **闭包陈旧,退出恢复成 dark** |
| `AudioWaveform.tsx:235` | MutationObserver 监听 `data-theme` 变化重绘 | 依赖别人改 data-theme,自己不改 |

**同源风险**:如果用户在 /settings 切了主题,全屏的 `prevTheme` 闭包不会更新(因为是 `[]` 依赖)→ 退出全屏恢复成旧主题。

**你要继续找**:
- [ ] **音量**是不是也多处管理?(store.volume vs audio.volume vs KimiCard 滑块)快速切音量,有没有不同步?
- [ ] **isPlaying** 状态?(store vs audio 实际播放 vs MediaSession)MediaSession 改播放,store 同步吗?
- [ ] **currentSong**?(store vs MediaSession metadata vs 全屏歌名)换歌瞬间三者一致吗?
- [ ] **djEnabled**?(store vs /settings 开关 vs 后端 session.djEnabled)前端关了 DJ,后端 nextSong 还生成 transition 吗?

#### A2. session 状态的"半持久化"
- `djEnabled/currentModel/ttsVoice` 持久化(localStorage)
- `sessionId/sessionToken/queue/currentSong/messages` 不持久化(内存)
- **问题**:刷新后偏好还在,但会话没了 → /settings 显示"DJ 开启",但实际没 session,DJ 不说话。**用户看到开关是开的,但功能不工作**。

**你要继续找**:
- [ ] 刷新页面后,/settings 的 DJ 开关状态 vs 实际 DJ 是否说话,一致吗?
- [ ] 切音源(clearSession)后,djEnabled 保留但 session 没了,DJ 还能说话吗?

### 1.3 扫描方法(教你怎么找)

**问自己三个问题**(针对每个全局状态):
1. **这个状态在哪里被读?**(grep 它的读取点)
2. **这个状态在哪里被写?**(grep 它的赋值点)
3. **读写点超过 2 个吗?** 超过就有不同步风险。

**实操命令**:
```bash
# 扫描某个状态的所有操作点
grep -rnE "data-theme|setVolume|isPlaying|djEnabled" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v test
```
**判断标准**:同一个状态有 ≥3 个写点,且没有统一 hook/函数管理 → 必有不同步 bug。

---

## 二、模式 B:"AI 文本与系统行为解耦"扫描法

### 2.1 这个模式长什么样
系统让 AI 自由生成一段文本(DJ 解说、推荐理由、回复),然后系统根据**自己的逻辑**执行动作(播放、搜索、推荐)。AI 文本和系统行为是**两条独立的链路**,没绑定 → AI 说的和系统做的不一致。

### 2.2 已知感染点(规划者已查证)

#### B1. 聊天点歌(用户报的 Bug 2)
- AI 在 reply 里说"为你找到了周杰伦的《晴天》"(AI 凭想象)
- 后端用 `[QQ音乐:周杰伦]` 标签搜索 → `find(playUrl)` 取第一个可播的(可能不是晴天)
- **DJ 说的歌 ≠ 实际播放的歌**

#### B2. DJ 换歌串词
- `generateDJTransition` 的 prompt 给 AI 喂了 `nextSong.title/artist`,AI 基于这个写串词
- `nextSong` 路由 `session.currentIndex += 1` 取队列下一首
- **如果队列下一首和 AI 串词说的不一致呢?** 实际上这里是对齐的(都基于 next),但**如果用户在聊天里点了别的歌插队**,队列变了,下次 nextSong 取的是插队的歌,而 DJ 串词是基于插队歌生成的 → 这条目前 OK
- **真正风险**:transition 的 prompt 让 AI 讲"创作年份、歌手巧思",但 **AI 可能编造**(它不知道真实信息)→ DJ 说"1971 年 David Gates..."但实际是另一首歌的背景

#### B3. 推荐数量
- AI 可能说"为你找了 5 首"(reply 文本)
- 后端 `slice(0, 5)` 固定返回 5 首
- **但如果搜索只返回 3 首**,AI 说 5 首,实际显示 3 首 → 数量不符

#### B4. 天气/时间感知
- DJ 串词 prompt 里有 `session.context.time` 和 `weather`(感知)
- 但 **loadNeteaseSongs 搜索不用天气/时间**(只按用户关键词)
- **DJ 说"下雨天适合听这个" → 但推荐的歌曲和下雨无关**(搜索时没考虑天气)

### 2.3 你要继续找的解耦点

- [ ] **DJ 开场白 vs 实际首播**:intro prompt 说"为你选了 X 风格的歌",但首播歌是 `queue[0]`(loadNeteaseSongs 结果),风格匹配吗?
- [ ] **REPLAY 重播的歌名**:点 REPLAY 重新朗读 DJ 消息,但当前歌可能已经换了 → DJ 说的还是旧歌名
- [ ] **profile 人格描述**:personalityDesc 是 AI 基于当前 songPool 生成的,但 songPool 是上次会话的搜索结果 → 刷新后 songPool 可能变了,人格描述对不上
- [ ] **/plan 时段歌曲**:planner AI 生成的 candidates,resolveTracks 解析成真实歌曲,但**解析可能失败/解析到别的版本**(同名不同歌手)→ AI 说"A Walk - Tycho",实际解析到另一个 Tycho 的混音版

### 2.4 扫描方法

**问自己**:每一段 AI 生成的文本,系统有没有**基于同源数据**执行对应动作?
- 有 → 安全(intro 和 queue 都来自 createSession 的同一流程)
- 没有 → 解耦 bug(DJ 串词说歌名,但播放走另一套搜索)

**实操命令**:
```bash
# 找所有 AI 文本生成点
grep -rnE "ai\.chat|generateIntro|generateDJTransition|analyzePersonality|generateDailyPlan" backend/src/
# 对每个生成点,追问:这段文本里提到的"事实"(歌名/数量/天气/时间),系统行为是否基于同一来源?
```

---

## 三、模式 C:"静态展示与动态状态脱节"(规划者补充第三类)

前两类之外,还有一类常见模式:**UI 显示的是某时刻的快照,但底层状态在变,UI 没跟着更新**。

### 3.1 已知线索

#### C1. 队列"TRACKS"计数
- `QueueList.tsx:33` 显示 `visibleQueue.length TRACKS`
- visibleQueue 是 `queue.slice(currentIndex)`
- **换歌后 currentIndex 变,队列计数会变**(从 20 → 19)→ 用户看到数字跳动,可能困惑"歌怎么少了"
- 这不是 bug,是设计,但**有没有视觉过渡?** 突然变数字不友好

#### C2. /plan 时段歌曲点不动
- tracksLoaded 首次为空时,显示 candidates(纯文本歌名)
- 用户点击 → `handlePlaySong` 但 `entry.songs` 为空 → **点不动**
- 规划者修了 tracksLoaded 轮询,但**首次 1-2 秒内点击的歌是点不动的**,用户会以为坏了

#### C3. 收藏爱心不即时更新
- `toggleLike` 改 store.likedSongIds,但 KimiCard 用 `useRadioStore(s => s.isLiked)` 选函数引用
- Zustand 默认 `Object.is` 比较,**函数引用不变 → 收藏后爱心不立即变红**,要等下次 re-render(播放时 currentTime 触发)
- 用户点了收藏,爱心没反应 → 以为没点上 → 再点一次 → 触发 unlike

### 3.2 你要继续找

- [ ] **进度条与实际播放进度**:seek 后 currentTime 更新,进度条跟随吗?有延迟吗?
- [ ] **波形与播放状态**:暂停时波形还在动吗?(应静止)
- [ ] **Speaking 状态与 UI**:isSpeaking=true 时,哪些 UI 元素应该变化(歌名区/波形/状态栏),都变了吗?

---

## 四、怎么把这些模式变成自测动作(实操)

### 4.1 发散测试的三个层次

```
Level 1: 复现用户报的 bug(已做)
   ↓
Level 2: 拿 bug 的"模式"找同类(本文档教你)
   ↓
Level 3: 用"用户连续操作序列"触发隐藏 bug(场景压测)
```

### 4.2 场景压测法(最有价值的发散)

不要孤立测一个功能,**连续做一组相关操作**,观察状态是否紊乱。这是发现"模式 A/B/C"的最有效方法。

**压测序列示例 1(主题状态压测)**:
```
1. /settings 切深色 → 确认深色
2. 回首页 → 进全屏 → 退出 → 主题对吗?(Bug 1)
3. 进全屏 → 在全屏里(如果能看到)切主题 → 退出 → 恢复对吗?
4. /settings 切浅色 → 回首页 → 进全屏 → 退出 → 是浅色吗?
5. 快速进出全屏 5 次 → 主题稳定吗?
```
**每个动作后**:DOM 检查 `document.documentElement.getAttribute('data-theme')`,记录值。

**压测序列示例 2(点歌一致性压测)**:
```
1. 输入"周杰伦" → DJ 说什么歌?→ 实际播什么歌?→ 一致吗?(Bug 2)
2. 输入"周杰伦的晴天" → DJ 说什么?→ 播什么?→ 精确点歌命中吗?
3. 输入"来点爵士" → DJ 说几首?→ 实际推荐卡片几张?→ 数量一致吗?(B3)
4. 输入"下雨天听的" → DJ 提到下雨吗?→ 推荐的歌真和下雨有关吗?(B4)
5. 点 REPLAY → DJ 说的歌名 vs 当前播放歌名 → 一致吗?(解耦点)
```
**每个动作后**:记录 DJ 文本(DOM `innerText`)、实际播放歌名(`h2`)、后端日志搜索关键词。**对比三者是否一致**。

**压测序列示例 3(session 状态压测)**:
```
1. 创建会话 → DJ 说话
2. 刷新页面 → DJ 还能说话吗?(session 丢了)
3. /settings DJ 开关状态 → 开着的吗?(偏好保留)
4. 输入新需求创建会话 → DJ 说话吗?(开关开但 session 丢,重建后呢)
5. 切音源 → DJ 开关还开吗?→ 新会话 DJ 说话吗?(A2)
```

### 4.3 判定标准:什么是"一致性 bug"

对任何"AI 文本 vs 系统行为"的对比,用这个表判定:

| AI 文本说 | 系统实际做 | 判定 |
|----------|-----------|------|
| "周杰伦的《晴天》" | 播放《晴天》 | ✅ 一致 |
| "周杰伦的《晴天》" | 播放《七里香》 | 🔴 歌名不一致 |
| "为你找了 5 首" | 显示 5 张卡片 | ✅ 一致 |
| "为你找了 5 首" | 显示 3 张卡片 | 🔴 数量不一致 |
| "下雨天适合听..." | 推荐的歌与下雨无关 | 🟡 弱不一致(可接受但非理想) |
| "1971 年 David Gates..." | 歌确实是 1971 年的 | ✅ 一致 |
| "1971 年 David Gates..." | 歌是 2010 年的 | 🔴 背景编造 |

---

## 五、自测报告要求(这次要升级)

这次自测报告除了常规 8 节,**必须新增一节:"模式扫描发现"**:

```markdown
## 九、模式扫描发现(本次新增)

### 模式 A(状态多处管理)扫描结果
- 扫描的状态:主题 / 音量 / isPlaying / currentSong / djEnabled
- 发现的不同步点:
  - A1 主题:FullscreenPlayer 闭包 bug(已知,待修)
  - A2 djEnabled:前端关了但后端 session.djEnabled 仍 true(新发现)
  - ...

### 模式 B(AI 文本与行为解耦)扫描结果
- 扫描的 AI 文本点:intro / transition / chat reply / recommendations / planner
- 发现的解耦点:
  - B1 聊天点歌(已知)
  - B5 REPLAY 歌名不一致(新发现)
  - ...

### 模式 C(静态与动态脱节)扫描结果
- C3 收藏爱心不即时(已知)
- ...
```

**没有这一节的报告,会被打回**。因为这次的任务不是"测功能",是"找模式"。

---

## 六、给你的最后三句话

1. **这两个 bug 是冰山一角**。主题不同步、AI 解耦——这两个模式会出现在产品的每一个角落。你的任务是把冰山水下部分找出来,不是只修露出水面的两个尖。

2. **用"连续操作序列"压测,不要孤立测**。孤立测功能,大多数 bug 不会暴露(因为它们是状态在不同操作间累积错乱产生的)。连续做 5-10 个相关操作,bug 就会自己浮出来。

3. **每发现一个 bug,问"这是什么模式?还有谁?"**。发现主题 bug → 问"还有哪些状态多处管理?"。发现点歌 bug → 问"还有哪些 AI 文本与行为解耦?"。这是从"修 bug"升级到"消灭 bug 家族"的方法。

---

*本方法文档教执行者从"侦探式自测"升级到"流行病学式自测"。配合 `docs/selftest-real-user-journey.md` 的场景框架,执行者应能发现 5-10 个同源 bug,而非只复现用户报的 2 个。*
