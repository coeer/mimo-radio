# mimo-radio 全方位自测方案（给新执行者的实战手册）

> **目标读者**：刚接手自测的 AI 执行者。读完这份文档，你应该能独立对 mimo-radio 做一次覆盖主链路、边界、降级三层用户视角的端到端验证，并对照日志/DB 找出真实 bug。
> **这不是测试用例清单，是方法论 + 工具集 + 陷阱库 + 判定标准的综合体。** 每条都来自本项目真实踩坑。
> **项目根**：`D:\Coder\mimo-radio`（Windows，Git Bash，非 git 仓库）
> **配套阅读**：先读 `COLLABORATION.md`（协同契约 + 历史决策 + 协作经验沉淀），再读本文档。**不读 COLLABORATION 直接自测必踩坑。**
> **生成时间**：2026-06-27

---

## 〇、心智模型：自测的本质是"证伪"（先读这 200 字）

跑通测试套件（`vitest run` 全绿）**只证明代码没语法错、单元逻辑自洽**，不证明功能可用。真正的自测要回答：**"用户真的能用吗？数据真的对吗？失败时会崩溃吗？"**

单元测试是必要不充分条件。下面这套 E2E 自测才是充分条件。

**一条铁律贯穿全文**：每一步操作都要有可观测的反馈。点按钮 → 查日志看请求有没有到 → 查 DB/Store 看状态有没有变 → 查 DOM 看渲染对不对。**任何一环"没反应"都是 bug 信号，不要忽略，不要用"可能是环境问题"搪塞。**

---

## 一、自测三层模型（缺一不可）

```
┌──────────────────────────────────────────────────────┐
│ Layer 1: 静态层   tsc --noEmit + vitest run            │ ← 5 分钟，挡住低级错误
├──────────────────────────────────────────────────────┤
│ Layer 2: API 层    curl 打端点，看响应结构/契约         │ ← 挡住前后端字段不一致
├──────────────────────────────────────────────────────┤
│ Layer 3: E2E 层    webbridge 驱动浏览器模拟真实用户     │ ← 挡住"代码对但体验坏"
└──────────────────────────────────────────────────────┘
```

**只做 Layer 1 = 自欺欺人。** 真实 bug 往往藏在 Layer 2（前后端字段不匹配，如历史 F1 ASR `format:'webm'` 被后端 `enum(['wav','mp3'])` 拒绝）和 Layer 3（状态机时序、降级路径、无限轮询）。

---

## 二、环境与服务（自测前必查）

### 2.1 三服务检查
```bash
curl -s http://127.0.0.1:10086/health 2>/dev/null && echo " webbridge OK"   # 或返回 404 也算在跑
curl -s http://127.0.0.1:8001/api/v1/tts-engines 2>/dev/null | head -c 60 && echo " backend OK"
curl -s http://127.0.0.1:3000 2>/dev/null | head -c 30 && echo " frontend OK"
```
**端口约定**：后端 `:8001`、前端 `:3000`、webbridge daemon `:10086`（独立常驻，不在本项目代码里）。

### 2.2 启停（改后端代码后必做）
```bash
# 找 PID
netstat -ano | grep ":8001" | grep LISTENING
taskkill //PID <PID> //F
cd D:/Coder/mimo-radio/backend && npx tsx src/index.ts    # 前台看日志
# 前端
cd D:/Coder/mimo-radio/frontend && npm run dev
```

⚠️ **后台启动后端时 `tsx watch` 热重载不可靠**（stdout 重定向到文件失效）。改后端代码后**必须手动杀进程重启**，否则 API 行为不变会让你误判。

### 2.3 QQ 音源依赖（影响测试覆盖面）
QQ 音源需要 webbridge 的 session 打开了 y.qq.com 播放器页（带登录态）。没开的话所有 QQ 搜索失败，自动回落网易云。
- **自测前决定**：要测 QQ 音源场景，就先 navigate 到 y.qq.com 登录；否则全程是网易云行为，要在报告里注明"QQ 音源未覆盖"。

### 2.4 webbridge 自测工具（`logs/wb.py`，核心武器）

封装了单一入口 `call(action, args)`，自动处理 Windows 中文 JSON body 问题：
```bash
cd D:/Coder/mimo-radio/logs
python wb.py navigate '{"url":"http://localhost:3000"}'   # 导航（全页刷新，会丢 session！）
python wb.py snapshot                                      # 页面无障碍树（比截图信息量大）
python wb.py screenshot                                    # 截图（视觉验证用）
python wb.py evaluate '<json>'                             # 执行 JS（最强大——直接读 DOM 状态）
python wb.py click '<json>'                                # 点击
```

#### ⚠️ evaluate 的转义陷阱（最高频踩坑，必看）
**不要在 shell 里直接写含 `\s` `\d` 正则或复杂 JS 的 JSON**，会被 shell 吃掉转义。
**正解：用 Python 生成 JSON 文件**：
```bash
python -c "
import json
code = '(function(){var t=document.body.innerText; return JSON.stringify({len:t.length, head:t.slice(0,200)})})()'
json.dump({'code': code}, open('/tmp/e.json','w',encoding='utf-8'), ensure_ascii=False)
"
python wb.py evaluate /tmp/e.json
```

#### 触发 React onChange 的正确姿势（直接设 value 不生效）
React 受控组件用自己的 setter 追踪，必须用 native setter：
```js
var el = document.querySelector("input");
var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
s.call(el, "来点轻音乐");
el.dispatchEvent(new Event("input", {bubbles:true}));
el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true}));  // 回车发送
```

---

## 三、陷阱库（血泪总结，自测前必读，违反必踩坑）

### 🪤 陷阱 1：用 localStorage 读 zustand store（永远读不到关键字段）
```js
// ❌ 错！partialize 只持久化 djEnabled/currentModel/ttsVoice 三个字段
JSON.parse(localStorage.getItem('mimo-radio-store')).state.queue   // 永远 []
JSON.parse(localStorage.getItem('mimo-radio-store')).state.currentSong  // 永远 null
```
**正解**：用 DOM（`document.querySelector('h2')?.textContent`）或 `useRadioStore.getState()`（但后者在 webbridge evaluate 里拿不到，用 DOM）。

### 🪤 陷阱 2：后台启动后端 + 改代码不重启
症状：改了后端代码但 API 行为没变。**99% 是没重启**（见 2.2）。

### 🪤 陷阱 3：navigate 是全页刷新，不是 SPA 路由
`python wb.py navigate` 相当于浏览器刷新，**会导致 sessionId 丢失**（sessionId 不持久化是历史决策）。测多页面时每个页面独立创建会话；或用 evaluate 触发 `window.location.href` 做 SPA 跳转（但仍可能丢状态）。
**影响**：从首页 navigate 到 /plan 再回来，会话会重置。

### 🪤 陷阱 4：终端中文乱码 ≠ 数据损坏
Git Bash 显示网易云返回的中文是乱码，**但 JSON 数据本身是正确的 UTF-8**。用 Python `json.loads` 解析后看结构，别用肉眼看终端输出判断数据对错。

### 🪤 陷阱 5：planner 的 tracks 首请求为空（不是 bug）
`/schedule/today` 当天**首次请求**的 `tracks` 字段可能为空（resolveTracks 是 fire-and-forget 异步填充）。这是有意设计（避免阻塞首请求触发 30s 超时）。前端会 2s 后自动重试补全（最多 3 次）。

### 🪤 陷阱 6：DJ 正在说话时换歌，旧 transition 被打断（不是 bug）
换歌会先 stop 当前 TTS 再播新 transition（P2 修复）。自测换歌 TTS 时**等开场白说完**再点下一首，否则会看到"开场白被打断"——这是预期行为。

### 🪤 陷阱 7：浏览器自动播放拦截（测试环境限制，非 bug）
webbridge 新标签无用户手势，audio 被浏览器阻止。代码里有 `unlockAudio` 逻辑，真实用户点击页面后音频正常解锁。**自测时音频不响不一定是 bug**，要看后端日志确认 TTS 请求是否成功。

---

## 四、标准自测流程（7 步法）

### Step 0：环境检查（见第二节）
确认三服务在跑、决定是否测 QQ 音源。

### Step 1：Layer 1 静态验证
```bash
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run   # 当前基线 234
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run  # 当前基线 127
```
**判定**：
- tsc 零错误（前端忽略 `useAudioPlayer.sideffects.test.ts` 的 5 个既有错误，与本轮无关）
- 测试数 ≥ 234 / 127。**测试数下降 = 回归，必须查原因**
- 不通过就停在这里，不要往下走

### Step 2：Layer 2 API 验证（针对改动的端点）
用 curl 验证端点返回结构。重点看：字段名、字段类型、边界（空数据/错误数据）。
```bash
curl -s "http://127.0.0.1:8001/api/v1/<endpoint>" | python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False, indent=2)[:500])"
```
比浏览器快 10 倍。

### Step 3：Layer 3 浏览器主链路验证（本项目主链路见第五节）
用 webbridge 走完整用户主链路。**主链路是核心，必须走通。**

### Step 4：日志对照（找隐藏 bug）
每步操作后**立即查后端日志**，确认预期事件发生：
```bash
grep -c "POST /tts" logs/dev-backend*.log                    # TTS 触发数
grep "POST.*/next" logs/dev-backend*.log | tail -3           # 换歌
grep "feedback" logs/dev-backend*.log | tail -3              # feedback
grep -E "statusCode.:[45]" logs/dev-backend*.log | tail -5   # 错误（4xx/5xx）
```
**关键技巧：操作前后对比日志计数**（验证异步行为是否触发，见案例 §六.2）。

### Step 5：查持久化层（DB / Store）
对于"落库"类功能，**直接查 DB 验证**，别信前端 UI：
```bash
cd D:/Coder/mimo-radio/backend && node -e "
const db = require('better-sqlite3')('./data/mimo.db', {readonly:true});
console.log(db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 5').all());
"
```

### Step 6：边界与降级验证（最易漏，但最有价值）
刻意制造异常场景：
- 网络瞬断（断网）→ 恢复 → 看降级是否优雅
- 空数据（无歌词的歌）→ 看兜底文案
- 快速连点（收藏/换歌/全屏）→ 看是否有 debounce、是否无限请求
- 后端故意失败（停后端）→ 看前端错误提示

### Step 7：盲区确认（诚实记录）
明确列出**这次自测没覆盖到什么**。这是负责任，不是缺点。例如："ASR 没测——webbridge 无法模拟麦克风"。

---

## 五、本项目主链路（Layer 3 必须走通）

### 5.1 主链路全景图
```
① 首页引导态 → ② 输入创建会话 → ③ 播放（封面+DJ说话+队列）
   → ④ 换歌（transition TTS + 新封面）→ ⑤ 全屏（封面+歌词区）
   → ⑥ 收藏（feedback 落库）→ ⑦ /plan（时段+天气+NOW高亮+可点歌）
   → ⑧ /profile（统计+雷达图降级）→ ⑨ /settings（音源/音色切换）
```

### 5.2 每步的可观测判定标准（执行者照着检查）

| 步骤 | 操作 | DOM/日志判定标准 |
|------|------|----------------|
| ① 引导态 | navigate 到 `/` | TerminalLog 显示（开机动画），输入框可见 |
| ② 创建会话 | native setter 输入文字 + 回车，等 10-15s | `h2` 有歌名、`img` 有 coverUrl、后端日志 `POST /create` 200、`POST /tts` 200 |
| ③ 播放态 | 等开场白 | `body.innerText` 含 "Speaking"、QueueList 渲染（多首歌）|
| ④ 换歌 | 等开场白说完，点"下一首" | TTS 请求数 +1、新 `h2` 歌名、新 `img` 封面 |
| ⑤ 全屏 | 点"展开全屏播放器" | 全屏显示、大封面、歌词区有内容（LRC 或 DJ 解说兜底）|
| ⑥ 收藏 | 点"收藏" | 后端日志 `POST /feedback` 200、DB feedback 表新增 1 条 |
| ⑦ /plan | 点 TopBar 时钟图标 | 时段列表显示、`NOW` 高亮当前时段、真实天气、歌曲候选可点 |
| ⑧ /profile | 点 TopBar 头像 | 统计三栏（TRACKS/LISTENED/ARTISTS）、雷达图或"品味数据积累中"兜底 |
| ⑨ /settings | 点 TopBar 设置图标 | 音源切换器、音色列表可加载 |

### 5.3 每步的标准 evaluate 脚本（复制即用）

```js
// 通用状态检查（存为 /tmp/state.json，用 Python 生成避免转义）
// 输出当前页面的关键状态，用于每步验证
(function(){
  var h2 = document.querySelector('h2');
  var img = document.querySelector('img');
  var t = document.body.innerText;
  return JSON.stringify({
    songTitle: h2 && h2.textContent,
    hasCover: !!img,
    coverSrc: img && img.src.slice(0, 50),
    speaking: /Speaking/.test(t),
    isFullscreen: /On Air|Speaking|Paused/.test(t) && document.querySelector('h1'),
    hasQueue: /TRACKS/.test(t),
    hasNowBadge: t.indexOf('NOW') >= 0,
    hasTimeline: t.indexOf('SLOTS') >= 0,
    hasStats: t.indexOf('TRACKS') >= 0 && t.indexOf('LISTENED') >= 0,
    textLen: t.length,
    head: t.slice(0, 200)
  });
})()
```

---

## 六、经典案例：自测如何抓到真实 bug（方法论示范）

### 6.1 案例 1：feedback 链路（两层 bug 叠加）
**背景**：验证"点收藏落库"。
**第一层**：点收藏 → 查 DB feedback 表为空。查日志无 `/feedback` 请求。查前端代码 `grep -rn "feedback" frontend/src` 零匹配 → **前端 toggleLike 从不调后端**。
**第二层**：修完前端再测 → 后端日志 `POST /feedback 400`。查 schema `feedbackSchema` 只有 `['skip','like','complete']`，前端发 `'unlike'` 被拒。
**精髓**：一个功能坏掉可能是多层 bug 叠加。**修了一层别急着庆祝，完整复验一遍**。

### 6.2 案例 2：换歌 TTS 的时序验证（日志计数法）
**背景**：验证"换歌触发 DJ TTS"。
**难点**：TTS 异步，怎么证明触发了？
**方法**：
```bash
before=$(grep -c "POST /tts" logs/dev-backend*.log)
# 点下一首，等 15s
after=$(grep -c "POST /tts" logs/dev-backend*.log)
echo "新增: $((after - before))"   # > 0 = 触发
```
**精髓**：异步行为用**操作前后的可观测计数差**验证，比"看一眼"可靠。

### 6.3 案例 3：无限轮询（自测抓到的架构性 bug）
**背景**：验证 /plan 页 tracksLoaded 自动重试。
**方法**：DevTools Network 面板看 `/schedule/today` 请求次数。
**发现**：resolveTracks 失败时 tracksLoaded 永远 false，前端每 2s 发一次请求，**无限循环**。
**精髓**：自测要**主动制造失败场景**（QQ tab 不开让 resolveTracks 失败），观察失败时的行为，而不是只测 happy path。这正是 B 批执行者漏掉 S1 的原因——它只测了成功路径。

### 6.4 案例 4：雷达图降级（降级也是通过的）
**背景**：profile 页雷达图没渲染。
**核实**：songPool 的 emotionTags/sceneTags 为空（网易云返回空数组），数据不足 3 维，**优雅降级**显示"品味数据积累中"。
**精髓**：降级路径也要验证——确认"没崩溃 + 显示了合理兜底文案"，不是白屏/报错。**降级正确 = 通过**。

---

## 七、自测报告模板（每次自测后产出）

```markdown
# 自测记录：<改动名称/版本>

## 环境
- webbridge: <端口/状态>
- 后端: <端口/状态，是否重启>
- 前端: <端口/状态>
- 音源: <网易云 / QQ（webbridge tab 是否开）>

## Layer 1: 静态
- tsc: <零错误 / 列出错误>
- vitest: 后端 N passed / 前端 N passed（基线 234/127）

## Layer 2: API
- <端点>: <返回结构摘要 / 是否符合预期>

## Layer 3: E2E（按主链路 9 步）
- ① 引导态: <结果>
- ② 创建会话: <hasSong/hasCover/speaking>
- ③ 播放态: <队列/封面>
- ④ 换歌: <TTS 计数差 / 新封面>
- ⑤ 全屏: <歌词区内容>
- ⑥ 收藏: <DB 记录>
- ⑦ /plan: <时段/天气/NOW高亮>
- ⑧ /profile: <统计/雷达图或降级>
- ⑨ /settings: <音源/音色>

## 边界与降级
- <断网/空数据/快速连点/后端失败的场景与结果>

## 发现的问题
- <bug 描述 + 根因 + 是否已修 / 误报说明>

## 盲区（未覆盖）
- <诚实列出>

## 结论
<通过 / 部分通过 / 不通过 + 理由>
```

---

## 八、判定标准速查（什么算"通过"）

| 验证项 | 通过标准 |
|--------|---------|
| tsc | 零错误（前端忽略既有 5 个） |
| vitest | 全过 + 数量 ≥ 基线（后端 234 / 前端 127） |
| API 端点 | 返回结构符合预期，字段名/类型正确 |
| 主链路 9 步 | 每步 DOM 状态符合 §5.2 判定标准 |
| 日志事件 | 预期事件发生（TTS 请求、DB 写入、无 4xx/5xx） |
| 持久化 | DB 里有记录，字段正确 |
| 降级路径 | 异常输入/空数据时优雅降级，不崩溃不白屏 |
| 资源管理 | 无无限请求、无定时器泄漏、无监听器累积 |

**任何一个"没反应"或"不符合预期"都是 bug 信号，必须深挖，不要放过，不要用"可能是环境问题"搪塞。**

---

## 九、给新执行者的三句话（读完再开工）

1. **先读 COLLABORATION.md 第三节（历史决策）和第十节（协作经验沉淀）**——那里有 10 条不能违反的约束和三批执行者的血泪教训。违反历史决策必出 bug。
2. **每一步操作都要有可观测反馈**——没有反馈的操作等于没测。点按钮后必须查日志/DB/DOM 至少一处。
3. **主动制造失败场景**——只测 happy path 的自测等于没测。本项目历史上有 3 个重要 bug（无限轮询、ASR 格式不一致、复制粘贴泄漏）都是在失败路径上抓到的。

---

*本方案基于本项目 2026-06-26 ~ 2026-06-27 三轮自测实践提炼。方法论适用于任何需要 webbridge + 浏览器 E2E 验证的改动。项目状态变化时（新增组件/路由/端点）由规划者更新第五节主链路。*
