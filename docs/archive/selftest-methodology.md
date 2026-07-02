# mimo-radio 自测方法论（给执行者 AI 的实战手册）

> **目标读者**：负责自测的 AI 智能体。读完这份文档，你应该能独立对一个改动做端到端验证，并对照日志找出真实 bug。
> **这不是流水账，是可复用的方法论。** 每一条都来自真实踩坑，不是理论。
> **项目根**：`D:\Coder\mimo-radio`（Windows，Git Bash，非 git 仓库）
> **配套阅读**：先读 `COLLABORATION.md`（协同契约 + 项目约束），再读本文档

---

## 一、自测的核心心智模型

### 1.1 自测不是"跑通"，是"证伪"
跑通测试套件（`vitest run` 全绿）**只证明代码没语法错、单元逻辑自洽**，不证明功能可用。真正的自测要回答：**"用户真的能用吗？数据真的对吗？"**

单元测试是必要不充分条件。下面这套 E2E 自测才是充分条件。

### 1.2 三层验证模型（缺一不可）
```
┌─────────────────────────────────────────────┐
│ Layer 1: 静态层  tsc --noEmit + vitest run   │ ← 5 分钟，挡住低级错误
├─────────────────────────────────────────────┤
│ Layer 2: API 层  curl 打端点，看响应结构      │ ← 挡住前后端契约不一致
├─────────────────────────────────────────────┤
│ Layer 3: E2E 层  webbridge 驱动浏览器模拟用户 │ ← 挡住"代码对但体验坏"
└─────────────────────────────────────────────┘
```

**只做 Layer 1 = 自欺欺人。** 真实 bug 往往藏在 Layer 2（前后端字段不匹配）和 Layer 3（状态机时序、降级路径）。

### 1.3 自测的黄金法则
> **每一步操作都要有可观测的反馈。** 点了按钮 → 查日志看请求有没有到 → 查 DB/Store 看状态有没有变 → 查 DOM 看渲染对不对。任何一环"没反应"都是 bug 信号，不要忽略。

---

## 二、自测工具链（必须掌握）

### 2.1 Layer 1：静态验证
```bash
# 后端
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run
# 前端
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run
# 单文件（聚焦验证某改动）
cd D:/Coder/mimo-radio/backend && npx vitest run src/routes/radio.test.ts
```
**判定标准**：
- tsc 零错误（前端忽略 `useAudioPlayer.sideffects.test.ts` 的 5 个既有错误）
- 测试数 ≥ 基线（后端 234 / 前端 127）。**测试数下降 = 回归，必须查原因**

### 2.2 Layer 2：API 验证
```bash
# 直接 curl 后端（无需浏览器）
curl -s "http://127.0.0.1:8001/api/v1/<endpoint>" | python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False, indent=2)[:500])"
```
**用途**：验证新端点返回结构、字段名、字段类型。比浏览器快 10 倍。

**注意**：Git Bash 终端对中文显示乱码，但 JSON 数据本身正常。用 Python 解析后看结构，别被终端乱码误导。

### 2.3 Layer 3：webbridge 浏览器自测（核心武器）

封装脚本：`logs/wb.py`（自动处理 Windows 中文 JSON body 问题）

```bash
cd D:/Coder/mimo-radio/logs

# 导航
python wb.py navigate '{"url":"http://localhost:3000"}'

# 看页面结构（无障碍树，比截图信息量大）
python wb.py snapshot

# 截图（视觉验证用）
python wb.py screenshot

# 执行 JS（最强大——直接读 DOM 状态）
python wb.py evaluate '<json>'
```

#### ⚠️ evaluate 的转义陷阱（最高频踩坑）
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

#### 触发 React onChange 的正确姿势
直接 `el.value = "xxx"` **不会**触发 React 的受控组件更新（React 用自己的 setter 追踪）。必须用 native setter：
```js
var el = document.querySelector("input");
var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
s.call(el, "来点轻音乐");
el.dispatchEvent(new Event("input", {bubbles:true}));
// 然后模拟回车
el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true}));
```

#### 点击按钮（比 evaluate 更真实）
```bash
# 用 snapshot 找到按钮的 ref（如 @e5），然后
python wb.py click '{"selector":"button[aria-label=\"收藏\"]"}'
# 或直接 evaluate 里 .click()
python wb.py evaluate '{"code":"(function(){var b=document.querySelector(\"[aria-label=收藏]\"); if(b){b.click();return \"ok\"} return \"not found\"})()"}'
```

---

## 三、标准自测流程（6 步法）

### Step 0：前置检查
```bash
# 确认三个服务在跑
curl -s http://127.0.0.1:10086/health && echo " webbridge OK"    # 或返回 404 也算在跑
curl -s http://127.0.0.1:8001/api/v1/tts-engines | head -c 60 && echo " backend OK"
curl -s http://127.0.0.1:3000 | head -c 30 && echo " frontend OK"
```
**如果有服务没跑**：先启动（见 `COLLABORATION.md` 第 5.2 节）。**改过后端代码必须重启后端**（tsx watch 热重载不可靠）。

### Step 1：Layer 1 静态验证
跑 tsc + vitest。**不通过就停在这里，不要往下走**——静态层都过不了，E2E 必然失败。

### Step 2：Layer 2 API 验证（针对改动的端点）
用 curl 验证改动的端点。重点看：
- 返回的字段名对不对（前后端契约）
- 字段类型对不对（`coverUrl` 是 string 还是 undefined）
- 边界情况（空数据、错误数据）

### Step 3：Layer 3 浏览器主链路验证
用 webbridge 走一遍**完整的用户主链路**。对这个项目，主链路是：
```
导航首页 → 输入文字 → 创建会话 → 验证(歌曲+封面+DJ说话+队列)
        → 切下一首 → 验证(换歌+transition TTS+新封面)
        → 展开全屏 → 验证(封面+歌词区)
        → 进 /plan → 验证(时段+天气+NOW高亮)
        → 进 /profile → 验证(统计+雷达图)
        → 点收藏 → 查 feedback 表
```

### Step 4：日志对照（找隐藏 bug）
每一步操作后，**立即查后端日志**，确认预期的事件发生了：
```bash
# TTS 是否触发
grep -c "POST /tts" logs/dev-backend*.log
# 换歌 transition
grep "POST.*/next" logs/dev-backend*.log | tail -3
# feedback 是否落库
grep "feedback" logs/dev-backend*.log | tail -3
# 错误（4xx/5xx）
grep -E "statusCode.:[45]" logs/dev-backend*.log | tail -5
```

**关键技巧：操作前后对比日志计数**。比如验证"换歌触发 TTS"：
```
换歌前: grep -c "POST /tts" → 4
点下一首，等 15s
换歌后: grep -c "POST /tts" → 5
新增 1 → ✅ transition TTS 触发了
```

### Step 5：查持久化层（DB / Store）
对于"落库"类功能，**直接查 DB 验证**，别信前端 UI：
```bash
cd D:/Coder/mimo-radio/backend && node -e "
const db = require('better-sqlite3')('./data/mimo.db', {readonly:true});
console.log(db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 5').all());
"
```

### Step 6：盲区确认（诚实记录）
明确列出**这次自测没覆盖到什么**。这不是缺点，是负责任。例如：
- "ASR 没测——webbridge 无法模拟麦克风"
- "QQ 音源没测——qq-radio session 没开 tab"
- "跨午夜时段没测——现在是白天"

盲区要在报告里写明，留给下一轮或真实用户验证。

---

## 四、判定标准（什么算"通过"）

| 验证项 | 通过标准 |
|--------|---------|
| tsc | 零错误（忽略既有的 5 个） |
| vitest | 全过 + 数量 ≥ 基线 |
| API 端点 | 返回结构符合预期，字段名/类型正确 |
| 主链路 | 每一步 DOM 状态符合预期（hasSong/hasCover/speaking 等） |
| 日志事件 | 预期事件发生（TTS 请求、DB 写入、无 4xx/5xx） |
| 持久化 | DB 里有记录，字段正确 |
| 降级路径 | 异常输入/空数据时优雅降级，不崩溃不白屏 |

**任何一个"没反应"或"不符合预期"都是 bug 信号，必须深挖，不要放过。**

---

## 五、诊断陷阱库（血泪总结，别重蹈）

### 🪤 陷阱 1：用 localStorage 读 zustand store
```js
// ❌ 错！partialize 不存的字段永远读不到
JSON.parse(localStorage.getItem('mimo-radio-store')).state.queue  // 永远 []
```
**正解**：用 DOM（`document.querySelector('h2')?.textContent`）或 `useRadioStore.getState()`。
**记忆点**：这个项目的 queue/currentSong/sessionId/messages 都是内存态，只有 djEnabled/currentModel/ttsVoice 持久化。

### 🪤 陷阱 2：后台启动后端 + 改代码不重启
tsx watch 在 stdout 重定向到文件时热重载失效。改后端代码后**必须手动杀进程重启**：
```bash
netstat -ano | grep ":8001" | grep LISTENING   # 找 PID
taskkill //PID <PID> //F
cd backend && npx tsx src/index.ts
```
**症状**：改了后端代码，但 API 行为没变 → 99% 是没重启。

### 🪤 陷阱 3：navigate 不是 SPA 路由
`python wb.py navigate '{"url":"..."}'` 是**完整页面导航**（相当于刷新），不是 Next.js 的客户端路由。会导致 session 状态丢失（sessionId 不持久化）。
**影响**：在 /plan 测完 navigate 回首页，会话会重置。
**应对**：测多个页面时，每个页面独立创建会话；或用 evaluate 触发 `window.history.pushState` 做客户端导航（但会丢状态）。

### 🪤 陷阱 4：终端中文乱码 ≠ 数据损坏
Git Bash 显示网易云返回的中文是乱码（`\u` 转义或方块），**但 JSON 数据本身是正确的 UTF-8**。
**应对**：用 Python `json.loads` 解析后看结构，别用肉眼看终端输出判断数据对错。

### 🪤 陷阱 5：QQ 音源依赖 webbridge tab
QQ 音源需要 webbridge 的 `qq-radio` session 打开了 y.qq.com 播放器页。没开的话，所有 QQ 搜索失败（日志 `webbridge error: session "qq-radio" has no tab`），自动回落网易云。
**应对**：自测前确认要测哪个音源。测 QQ 前先 navigate 到 y.qq.com 登录。否则全程是网易云行为。

### 🪤 陷阱 6：planner 的 tracks 首请求为空
`/schedule/today` 当天**首次请求**的 `tracks` 字段可能是空的（resolveTracks 是 fire-and-forget 异步填充）。第二次请求就正常。
**这不是 bug**，是有意设计（避免阻塞首请求触发 30s 超时）。别误判。

### 🪤 陷阱 7：DJ 正在说话时换歌，transition 会被吞
page.tsx 的 pendingTtsText 消费 effect 有 `if (isSpeaking) return` 守卫。如果换歌时 DJ 还在说开场白，transition 串词会被丢弃（不排队）。
**这是已知行为**（不打断当前播报）。自测换歌 TTS 时，要**等开场白说完**再点下一首。

---

## 六、经典案例：自测如何抓到真实 bug

### 案例 1：feedback 链路（两层 bug 叠加）

**背景**：验证 T11"点收藏落库"。

**第一层发现**：
```bash
# 点了收藏，查表
node -e "...SELECT * FROM feedback..."
# 结果：[]  空表！
```
查日志：
```bash
grep feedback logs/dev-backend*.log
# 无任何 /feedback 请求
```
查前端代码：
```bash
grep -rn "feedback" frontend/src
# 零匹配
```
**结论**：前端 toggleLike 只改本地 store，从未调后端。→ 修：KimiCard 加 handleLike 上报。

**第二层发现**（修完第一层后）：
```bash
grep feedback logs/dev-backend*.log
# POST /xxx/feedback {"statusCode":400}
```
查 schema：
```bash
grep -A3 "feedbackSchema" backend/src/routes/radio.ts
# action: z.enum(['skip', 'like', 'complete'])  ← 没有 unlike!
```
**结论**：前端发 `unlike`，schema 不收。→ 修：schema 加 `'unlike'`。

**精髓**：一个功能坏掉可能是**多层 bug 叠加**。修了一层别急着庆祝，**完整复验一遍**才能确认链路通。

### 案例 2：换歌 TTS 的时序验证

**背景**：验证 T1"换歌触发 DJ TTS"。

**难点**：TTS 是异步的，怎么证明"换歌真的触发了 TTS"，而不是碰巧？

**方法**：日志计数法。
```bash
before=$(grep -c "POST /tts" logs/dev-backend*.log)
# 点下一首
sleep 15
after=$(grep -c "POST /tss" logs/dev-backend*.log)
echo "新增: $((after - before))"
```
新增 > 0 → 确认触发。

**精髓**：异步行为的验证，用**操作前后的可观测计数差**，比"看一眼"可靠得多。

### 案例 3：雷达图降级不是 bug

**背景**：profile 页雷达图没渲染。

**第一反应**：bug？查代码。
**实际**：`PersonalityChart` 有 `if (validData.length < 3) 显示兜底文案`。songPool 的 emotionTags/sceneTags 是空（网易云返回空数组），数据不足 3 维，**优雅降级**。

**精髓**：降级路径也要验证。确认它"没崩溃 + 显示了合理的兜底文案"，而不是"白屏/报错"。降级正确 = 通过。

---

## 七、自测报告模板（每次自测后产出）

```markdown
# 自测记录：<改动名称>

## 环境
- webbridge: <端口/状态>
- 后端: <端口/状态，是否重启>
- 前端: <端口/状态>

## Layer 1: 静态
- tsc: <零错误 / 列出错误>
- vitest: 后端 N passed / 前端 N passed

## Layer 2: API
- <端点>: <返回结构摘要 / 是否符合预期>

## Layer 3: E2E（按主链路）
- 首屏: <结果>
- 创建会话: <结果，含 hasSong/hasCover/speaking>
- 换歌: <TTS 计数差>
- 全屏: <结果>
- /plan: <结果>
- /profile: <结果>
- 收藏: <DB 记录>

## 发现的问题
- <bug 描述 + 根因 + 是否已修>

## 盲区（未覆盖）
- <列出>

## 结论
<通过 / 部分通过 / 不通过 + 理由>
```

---

## 八、一句话总结

> **自测的本质是"用尽一切手段证伪"。能观测的都要观测，能对比的都要对比，能查 DB 的别信 UI。发现"没反应"就是发现 bug——深挖它，别放过。**

单元测试证明"代码没写错"，E2E 自测证明"用户能用"。两者都过，才算真完成。

---

*本文档基于 2026-06-26 多轮自测实践提炼。方法论适用于任何需要 webbridge + 浏览器 E2E 验证的改动。*
