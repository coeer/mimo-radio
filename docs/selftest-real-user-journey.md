# mimo-radio 真实用户视角深度自测方案

> **设计哲学**：产品不在用户手里跑通,等于没做完。这份方案不测"功能是否存在",而测"真实用户用一天会不会遇到崩、卡、空、错"。
> **生成时间**：2026-06-27(规划者)
> **项目根**：`D:\Coder\mimo-radio`(Windows, Git Bash, 非 git 仓库)
> **适用场景**:任何改动后的全方位 E2E 验证;新执行者第一次接手做完整自测
> **配套阅读**:开工前**强制**读完 `COLLABORATION.md` + `docs/selftest-comprehensive.md` + `docs/selftest-spec.md`。**不读这三份直接开测必踩坑**(上一份自测报告就是这样漏报 SSRF、误判 autoplay)

---

## 〇、设计思想(为什么是"用户一天"而不是"功能清单")

大多数自测是"功能清单式"的——逐个验证按钮在不在、接口返不返数据。这种测法能跑通单元测试,但抓不到真实用户的崩溃点。为什么?**因为真实用户不是按清单操作的,他们是带着情绪和意图连续操作的**。

一个真实用户的轨迹是这样的:早晨心情不错想听轻音乐 → 输入文字 → 等了 8 秒有点不耐烦 → DJ 说话了觉得惊喜 → 听了 3 分钟想换首 → 点了下一首发现没声 → 又点一次 → 歌换了但还是没声 → 困惑 → 关掉。

"功能清单式"自测会记:换歌功能 ✅(歌曲切换成功)。但它漏掉了:用户点了两下、第二次没声、用户困惑关掉了。**这就是真实使用和清单验证的鸿沟**。

本方案的每个场景都模拟一段真实用户连续操作,验证的是**这段操作的体感是否流畅、是否有任何一环让用户想关掉应用**。

**三条铁律**(贯穿全文,违反则自测作废):
1. **每一步操作都要有可观测的反馈**——点按钮后必须查日志/DB/DOM 至少一处。"没反应"是 bug 信号,不是"可能正常"。
2. **用户每多等 3 秒,信任就掉一档**——超过 3 秒的等待必须有视觉反馈(loading 动画/骨架屏/进度提示),否则判定为体验问题。
3. **降级也是要通过的**——无歌词、无封面、TTS 失败时,必须有合理兜底而非白屏/报错/静默。

---

## 一、强制前置(Step 0,不做则自测作废)

这三步来自本项目血泪踩坑。**上一份自测报告就是跳过 Step 0.1,导致 TTS 全程失效,连锁误判了换歌 transition**。

### Step 0.1:解锁音频(否则 TTS/歌曲音频全部失效)
```bash
cd D:/Coder/mimo-radio/logs
python wb.py navigate '{"url":"http://localhost:3000"}'
# 等 2 秒页面加载
python wb.py evaluate '{"code":"document.body.click(); document.querySelector(\"input\")?.focus(); \"audio-unlock-attempted\""}'
# 确认 store.audioUnlocked
python wb.py evaluate '{"code":"JSON.stringify({unlocked: window.__NEXT_DATA__ ? \"check via DOM\" : \"n/a\"})"}'
# 更可靠:点页面任意可点击元素(如 ON AIR 徽章)触发用户手势
```
**为什么必须做**:webbridge 新标签无用户手势,浏览器拦截所有 audio。不解锁的后果:① TTS 合成成功但不播放 → `onended` 不触发 → `isSpeaking` 卡死 ② 换歌 transition TTS 同样被拦 ③ 看起来像"DJ 不说话了"。**上一份自测报告的问题 1/2 都是这个原因**。

### Step 0.2:grep 日志查历史错误(否则漏报真 bug)
```bash
# 自测开始前,清点当前错误基线
echo "=== 当前 ERROR/WARN 基线 ==="
grep -cE "ERROR|WARN" /d/Coder/mimo-radio/logs/dev-backend*.log 2>/dev/null
# 重点查 SSRF(上一份自测漏报的)
grep -c "Blocked by SSRF guard" /d/Coder/mimo-radio/logs/dev-backend*.log 2>/dev/null
echo "=== 最近 20 条错误 ==="
grep -E "ERROR|WARN|statusCode.:[45]" /d/Coder/mimo-radio/logs/dev-backend*.log 2>/dev/null | tail -20
```
**为什么必须做**:HTTP 200 不代表没问题。SSRF 拦截 webbridge、QQ 搜索失败、TTS 超时——这些错误藏在日志里,但响应仍是 200(因为回落了网易云)。**上一份自测报告全程没 grep 日志,漏报了满屏的 SSRF 错误**。

### Step 0.3:确认音源 + webbridge session 状态
明确记录:"本次测的是网易云还是 QQ","QQ webbridge tab 是否开"。
```bash
# 查 webbridge session
curl -s http://127.0.0.1:10086/sessions 2>/dev/null | head -c 300
```
**为什么必须做**:QQ 失败时自动回落网易云,表面"功能正常",实际 QQ 集成已失效。不记录音源 = 无法判断测试覆盖了哪条代码路径。

---

## 二、真实用户的一天(8 个连续场景)

### 场景 1:早晨开机 — 首次进入(关注引导态与首屏印象)

**真实用户**:打开应用,不知道这是干嘛的,想看看是什么。

**操作序列**:
1. `python wb.py navigate '{"url":"http://localhost:3000"}'`
2. 等 2 秒,`snapshot` 看页面结构
3. `evaluate` 检查首屏关键元素

**判定标准(全部满足才算通过)**:
- TerminalLog 引导态显示(开机打字机动画)
- 输入框可见,占位符 "Say something to the DJ..." 或中文版
- DotMatrixClock 显示当前时间
- ON AIR 徽章绿色呼吸
- 输入框**不自动聚焦**(避免移动端弹键盘)
- **不自动创建 session**(等用户首次输入)

**证据采集脚本**:
```bash
python -c "
import json
code = '''(function(){
  var t = document.body.innerText;
  return JSON.stringify({
    hasTerminal: t.indexOf(\"CONNECTED\") >= 0 || t.indexOf(\"开机\") >= 0,
    hasInput: !!document.querySelector(\"input\"),
    inputPlaceholder: (document.querySelector(\"input\")||{}).placeholder,
    inputAutoFocused: document.activeElement === document.querySelector(\"input\"),
    hasClock: !!document.querySelector(\"[class*=clock]\") || /\\d{2}:\\d{2}/.test(t),
    hasOnAir: t.indexOf(\"ON AIR\") >= 0 || t.indexOf(\"AIR\") >= 0,
  });
})()'''
json.dump({'code': code}, open('/tmp/s1.json','w',encoding='utf-8'), ensure_ascii=False)
"
python wb.py evaluate /tmp/s1.json
```

**体感判断(乔布斯视角)**:用户打开应用 0.5 秒内能知道"这是个电台"。TerminalLog 的开机动画给科技感,但不应该超过 3 秒(否则用户觉得卡)。如果首屏白屏 > 1 秒 → 🔴 体验失败。

---

### 场景 2:说出心情 — 创建会话(关注等待体感与 AI 响应)

**真实用户**:想听点适合写代码的轻音乐,输入需求。

**操作序列**:
1. **先解锁音频**(Step 0.1,必须!)
2. 用 native setter 输入 "来点适合写代码的轻音乐":
```bash
python -c "
import json
code = '''(function(){
  var el = document.querySelector(\"input\");
  if(!el) return \"no input\";
  var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,\"value\").set;
  s.call(el, \"来点适合写代码的轻音乐\");
  el.dispatchEvent(new Event(\"input\", {bubbles:true}));
  el.dispatchEvent(new KeyboardEvent(\"keydown\", {key:\"Enter\", bubbles:true}));
  return \"sent\";
})()'''
json.dump({'code': code}, open('/tmp/s2.json','w',encoding='utf-8'), ensure_ascii=False)
"
python wb.py evaluate /tmp/s2.json
```
3. **计时**:记录从发送到歌曲开始播放的耗时
4. 等待期间 `snapshot` 看是否有 loading 反馈

**判定标准**:
- 发送后 ≤ 1 秒输入框清空,显示"正在思考"三点动画
- 等待期间有视觉反馈(骨架屏/loading),**不能让用户盯着空白**
- 后端 `POST /create` 200,响应包含 queue/sessionId/introScript
- ≤ 15 秒歌曲开始播放(MiMo 生成 + 网易云搜索)
- DJ 开场白 TTS 播报(日志有 `POST /tts` 200,**且能听到声音**——已解锁)
- 首歌封面正常加载(`img.src` 来自 `p2.music.163.net` 或 QQ 域名)
- 队列 ≥ 10 首

**日志计数法(验证 TTS 触发)**:
```bash
before=$(grep -c "POST /tts" logs/dev-backend*.log 2>/dev/null | awk -F: '{s+=$NF} END {print s}')
# 发送后等 12 秒
sleep 12
after=$(grep -c "POST /tts" logs/dev-backend*.log 2>/dev/null | awk -F: '{s+=$NF} END {print s}')
echo "TTS 新增: $((after - before))"  # 应 = 1
```

**体感判断**:8-12 秒的等待,如果有 loading 动画是可接受的(用户知道在动)。**如果用户盯着空白等 8 秒,会觉得应用卡死了**。DJ 开场白出现的瞬间是"惊喜时刻"——必须有声音(已解锁),否则惊喜变成困惑。

---

### 场景 3:工作中 — 持续播放与切歌(关注状态机时序)

**真实用户**:听着歌写代码,这首发腻了想换,或者点错了想换回来。

**操作序列**:
1. **等 DJ 开场白真正播完**(不是 isSpeaking 卡死的假播完)——听感上声音结束,或日志 TTS 完成后等 2 秒
2. 点"下一首"(`aria-label="下一首"`):
```bash
python wb.py evaluate '{"code":"(function(){var b=document.querySelector(\"[aria-label=下一首]\"); if(b){b.click();return \"next\"} return \"no-btn\"})()"}'
```
3. 等换歌完成(日志 `POST /next` 200,约 5-8 秒)
4. 验证 transition TTS:
```bash
before=$(grep -c "POST /tts" logs/dev-backend*.log 2>/dev/null | awk -F: '{s+=$NF} END {print s}')
# 点下一首后等 8 秒
sleep 8
after=$(grep -c "POST /tts" logs/dev-backend*.log 2>/dev/null | awk -F: '{s+=$NF} END {print s}')
echo "换歌 transition TTS 新增: $((after - before))"  # 应 = 1
```
5. 点"上一首"(`aria-label="上一首"`),验证本地队列回退
6. 在队列里点第 3 首歌,验证队列跳转

**判定标准**:
- 换歌时旧歌曲暂停,**新 transition TTS 先播**(声音),再放新歌
- 新歌曲封面加载(不是上一首的残留)
- `currentTime` 从 0:00 开始
- transition TTS 期间歌曲暂停(无背景音冲突,P8 修复)
- 上一首能回退到刚才听的歌
- 队列点歌能跳到指定位置

**体感判断**:换歌的体感应该是"DJ 介绍新歌 → 新歌响起",连贯流畅。**如果换歌后静默 > 3 秒,用户会以为坏了**。transition TTS 是核心体验,必须听到。

---

### 场景 4:午休探索 — 全屏播放器(关注沉浸态)

**真实用户**:想认真看歌词,点开全屏沉浸听。

**操作序列**:
1. 点"全屏"按钮或歌名区(`aria-label="展开全屏播放器"`):
```bash
python wb.py evaluate '{"code":"(function(){var b=document.querySelector(\"[aria-label=展开全屏播放器]\"); if(b){b.click();return \"fs\"} return \"no-btn\"})()"}'
```
2. 等 2 秒,`snapshot` 看全屏结构
3. `evaluate` 检查全屏内容

**判定标准**:
- 全屏强制浅色主题(进入时 `data-theme=light`)
- 大歌名(32px)、大封面、大波形
- 歌词区有内容:**有 LRC 时显示真实歌词逐句高亮**;无 LRC 时降级 DJ 解说高亮;两者都无时显示兜底文案"这首歌还没有 DJ 解说"
- **LRC 加载期间不闪现上一首的 DJ 解说**(Q4/F9 修复——加 loading 态)
- ESC 能退出,恢复原主题

**LRC 加载判定(关键)**:
```bash
python -c "
import json
code = '''(function(){
  var t = document.body.innerText;
  return JSON.stringify({
    hasLyricText: t.length > 150,
    showsLoading: t.indexOf(\"歌词加载中\") >= 0,
    showsFallback: t.indexOf(\"还没有 DJ 解说\") >= 0,
    hasRealLyric: /\\[/.test(t) === false && t.length > 200,  // 非 LRC 元数据
    theme: document.documentElement.getAttribute(\"data-theme\"),
  });
})()'''
json.dump({'code': code}, open('/tmp/s4.json','w',encoding='utf-8'), ensure_ascii=False)
"
python wb.py evaluate /tmp/s4.json
```

**体感判断**:全屏是"沉浸时刻"。歌词应该跟随音乐流动,像 KTV 那样。**如果歌词区空白或卡在加载,沉浸感瞬间破裂**。

---

### 场景 5:发现喜欢的歌 — 收藏与 REPLAY(关注数据闭环)

**真实用户**:这首发绝了,想收藏;还想再听一遍 DJ 的介绍。

**操作序列**:
1. 退出全屏(ESC)
2. 点"收藏"(`aria-label="收藏"`),验证:
```bash
# 收藏前 DB 计数
before=$(node -e "const db=require('better-sqlite3')('./data/mimo.db',{readonly:true}); console.log(db.prepare('SELECT COUNT(*) as n FROM feedback').get().n)" 2>/dev/null)
# 点收藏
python wb.py evaluate '{"code":"(function(){var b=document.querySelector(\"[aria-label=收藏]\"); if(b){b.click();return \"liked\"} return \"no-btn\"})()"}'
# 等 1 秒(debounce)
sleep 1
# 收藏后 DB 计数
after=$(node -e "const db=require('better-sqlite3')('./data/mimo.db',{readonly:true}); console.log(db.prepare('SELECT COUNT(*) as n FROM feedback').get().n)" 2>/dev/null)
echo "feedback 新增: $((after - before))"  # 应 = 1
# 查最新记录的 action
node -e "const db=require('better-sqlite3')('./data/mimo.db',{readonly:true}); console.log(JSON.stringify(db.prepare('SELECT action, song_title FROM feedback ORDER BY id DESC LIMIT 1').get()))" 2>/dev/null
```
3. 快速连点收藏 10 次,验证 debounce:
```bash
# 连点 10 次
for i in $(seq 1 10); do
  python wb.py evaluate '{"code":"(function(){var b=document.querySelector(\"[aria-label=收藏]\"); if(b)b.click(); return 1})()"}' >/dev/null
done
sleep 1
echo "连点后 feedback 总数: $(node -e "..." 2>/dev/null)"
# 应只新增 ≤2 条(debounce 500ms 生效),且无 429
grep -c "429" logs/dev-backend*.log 2>/dev/null
```
4. 点某条 DJ 消息的 REPLAY,验证重新朗读

**判定标准**:
- 单次收藏 → DB 新增 1 条,action 正确(收藏=like,取消=unlike,**不是反的**——F2 已修)
- 连点 10 次 → 新增 ≤2 条(debounce),无 429
- REPLAY 点击后 → 重新听到该 DJ 消息(TTS 计数 +1)

**体感判断**:收藏要**即时响应**(爱心立即变红),上报可以 debounce(用户感知不到)。**如果连点导致 429 报错,信任崩塌**。

---

### 场景 6:规划一天 — /plan 时间轴(关注 AI 生成体感)

**真实用户**:想知道今天全天该听什么,看看 AI 怎么规划。

**操作序列**:
1. 点 TopBar 时钟图标(`aria-label="今日电台时间轴"`),**用 SPA 跳转**(不是 navigate):
```bash
python wb.py evaluate '{"code":"(function(){var l=document.querySelector(\"a[href*=plan]\"); if(l){l.click();return \"spa\"} return \"no-link\"})()"}'
```
2. 等 3 秒,检查页面

**判定标准**:
- 时段列表 6 SLOTS 显示(不显示"生成失败")
- 真实天气(非"未知"——S2 修复)
- 当前时段有 NOW 高亮 + 呼吸圆点
- 歌曲候选可点击,点歌后不跳转(P7),显示 mini player
- **tracks 首次可能为空**(设计如此),2 秒后自动刷新补全(S1 修复——最多 3 次不无限)

**SPA vs navigate 关键差异**:
- SPA 跳转(`<Link>` 点击)→ session 不丢 → mini player 显示 currentSong ✅
- 全页 navigate → session 丢 → mini player 不显示,显示"返回电台"兜底 ✅
- **测 mini player 必须用 SPA,不要用 navigate**

**判定 tracksLoaded 轮询上限(S1 修复验证)**:
```bash
# DevTools Network 看 /schedule/today 请求次数
# 正常:1-3 次(tracksLoaded 跟随)
# 异常(无限轮询未修):无限增长
```

**体感判断**:进 /plan 应该 1-3 秒出时段骨架,而不是"生成失败"。**用户第一次看到 AI 规划全天电台,是核心惊喜时刻**,不能让 30s 超时毁掉它。

---

### 场景 7:了解自己 — /profile 人格(关注数据真实性)

**真实用户**:好奇 AI 怎么看自己的音乐品味。

**操作序列**:
1. SPA 跳转 /profile(点 TopBar 头像)
2. 检查页面

**判定标准**:
- 统计三栏有真实数据(TRACKS/LISTENED/ARTISTS,非全 0 或全"...")
- 雷达图:数据 ≥3 维时显示 SVG 多边形;数据不足时降级显示"品味数据积累中"
- 标签云:favoriteArtists 优先,不足时兜底标签
- 人格类型/描述非纯占位

**体感判断**:这是"被理解"的时刻。如果统计全 0 或雷达图白屏,用户觉得"这 AI 啥也没记住"。**降级文案要温暖,不是"Error"**。

---

### 场景 8:个性定制 — /settings(关注切换不破坏状态)

**真实用户**:想换个 DJ 声音,或切到 QQ 音乐试试。

**操作序列**:
1. SPA 跳转 /settings(点 TopBar 齿轮)
2. 切换 DJ 音色:点试听,验证 `/dj/tts` 返回新音色
3. 切换音源:切到 QQ,验证不 reload(P4 修复),会话重置但偏好保留
4. 切换主题:深色↔浅色,验证立即生效

**判定标准**:
- 8 个音色列表加载
- 音色试听能听到新声音(TTS 计数 +1)
- 切音源**不整页 reload**(clearSession 重置会话,但保留 djEnabled/ttsVoice 偏好)
- 切主题立即生效,无 FOUC(闪烁)
- 切音源后回到首页显示引导态(sessionId=null)

**体感判断**:设置页是"掌控感"。用户改了设置应该**立即看到效果**,而不是要刷新页面。切音源丢了收藏是**严重的信任破坏**(F12 修复——保留收藏)。

---

## 三、隐藏路径(非首屏但真实用户会触发)

这些是用户深度使用才会遇到的,但往往是 bug 重灾区。

### H1:键盘快捷键
- `Space` → 播放/暂停(全局,需 unlockAudio 后)
- `←/→` → 快退/快进 10 秒
- `Enter`(输入框聚焦时)→ 发送
- `ESC`(全屏时)→ 退出全屏
**判定**:每个快捷键都要验证,不能用"应该支持"搪塞。特别是 Space 全局播放——这是用户最常用的快捷键。

### H2:MediaSession(锁屏/耳机线控)
- 播放时锁屏应显示歌曲信息(标题/歌手/封面)
- 耳机线控播放/暂停/下一首按钮应响应
**限制**:webbridge 无法模拟锁屏,标为盲区,但代码层验证 `navigator.mediaSession.metadata` 已设置。

### H3:REPLAY 按钮重播
- 点击任意 DJ 消息的 REPLAY → 重新朗读
- 朗读期间歌曲暂停(避免双音轨)
**判定**:TTS 计数 +1,且能听到声音。

### H4:全屏快速切换(防抖)
- 快速连点全屏按钮 5 次 → 不出现 close 按钮丢失
**判定**:最终状态稳定(P4 修复的 debounce)。

### H5:网络中断降级
- 后端故意停掉 → 前端应显示"网络有点卡"提示,不白屏不崩溃
- 恢复后 → 自动重连,继续播放
**判定**:无未捕获异常,UI 有明确错误提示。

### H6:并发换歌(打断 TTS)
- DJ 正在说话时快速连点下一首 3 次 → 旧 TTS 被打断,只播最后一首的 transition
**判定**:无 TTS 堆积(P2 修复),最终播放的 transition 对应最后一首歌。

---

## 四、边界与降级(最有价值,不可省略)

乔布斯说"看不见的地方也要完美"。这些场景是用户最可能遇到 bug 的地方。

| 场景 | 制造方法 | 判定标准 |
|------|---------|---------|
| **无歌词的歌** | 找一首纯音乐/小众歌 | 全屏显示"还没有 DJ 解说"兜底,不白屏 |
| **无封面的歌** | mock 数据或 QQ 旧歌 | CoverArt 显示渐变占位,不裂图 |
| **TTS 失败** | 临时改坏 MIMO_API_KEY | 降级到浏览器 speechSynthesis,有声音 |
| **音源全失败** | 停 webbridge + 改 netease 域名 | 优雅降级,不卡死 |
| **MiMo 超时** | 改小 timeout | schedule 走 fallback,不 408 |
| **快速操作** | 连点收藏/换歌/全屏 | debounce 生效,无 429/堆积 |
| **跨午夜时段** | 改系统时间到 23:30 | /plan NOW 高亮正确(F4 修复) |
| **空搜索结果** | 搜一个不存在的关键词 | 有"没找到"提示,不崩溃 |

---

## 五、报告产出(严格按 selftest-spec.md 规范)

完成后产出 `docs/selftest-<YYYY-MM-DD>-<主题>.md`,**必须 8 节齐全**:
1. 环境(含 unlockAudio 执行情况)
2. Layer 1 静态
3. Layer 2 API(含 grep 日志)
4. Layer 3 E2E(8 场景逐项)
5. 边界与降级(第四节表)
6. 发现的问题(证据三要素)
7. 盲区(诚实列出)
8. 结论

**问题报告的铁律**(来自 selftest-spec.md §六):
- 现象(可观测事实)
- 根因(基于代码/日志的因果链,已排除其他可能)
- 证据(日志行/代码 file:line/DOM 输出)
- **不允许"可能""大概"**——没有证据的猜测标"待证伪"

---

## 六、质量自检(提交前过一遍)

- [ ] Step 0 三项前置全部执行(unlockAudio / grep 日志 / 记录音源)
- [ ] 8 个场景全部走到(不能跳过)
- [ ] 每个场景都有证据(DOM 检查/日志计数/DB 查询)
- [ ] 边界与降级表至少测了 5 项
- [ ] TTS 相关验证都有声音(不是"被拦截的静默")
- [ ] 报告 8 节齐全,问题有证据三要素
- [ ] 盲区诚实列出
- [ ] 没有用"可能""应该""看起来正常"搪塞
- [ ] **日志里的 ERROR/WARN 都解释了原因**(不能假装没看见——上份报告就是这样漏报 SSRF)

---

## 七、给执行者的最后三句话

1. **你不是在跑清单,你是在扮演一个真实用户**。这个用户早晨心情不错想听音乐,如果你的自测让他中途想关掉应用,那就是失败——即使所有 HTTP 都是 200。

2. **每一步都要问:这一步用户感受到了什么?** 不是"功能存不存在",是"用户用得爽不爽"。换歌后 5 秒没声,功能清单会说"换歌成功",真实用户会说"坏了"然后关掉。

3. **日志是你的第一证据源**。HTTP 200 是谎言的开始。grep ERROR,看 webbridge 调用,查 DB——这些才是真相。**上一份自测报告最大的失败,就是全程没看日志,漏报了满屏的 SSRF 错误**。别重蹈覆辙。

---

*本方案基于 mimo-radio 2026-06-26~27 共 9 轮迭代、3 次自测评估提炼。每个场景都对应真实用户会触发的操作序列。项目状态变化时(新增组件/路由)由规划者更新第二节的场景清单。*
