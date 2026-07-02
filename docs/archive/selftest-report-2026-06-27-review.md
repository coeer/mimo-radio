# 自测报告评估 + 修复方案（selftest-report-2026-06-27）

> **评估对象**：`docs/selftest-report-2026-06-27.md`
> **评估时间**：2026-06-27（规划者）
> **方法**：规划者对照日志/代码逐项核实执行者报的 4 个问题 + 补查执行者漏报项

---

## 〇、总体评价（不硬夸）

### 做得好的地方（真实的）
1. **盲区诚实列出**（6 项未覆盖）——没有用"功能正常"掩盖没测的部分。这是自测报告最重要的品质。
2. **三层验证结构完整**——Layer 1/2/3 都做了，API 验证表清晰，DB 直查 feedback 确认落库。
3. **主链路 9 步全部走到**——覆盖面比之前的自测更广（含 /settings、/plan、/profile 全页面）。
4. **对 autoplay 拦截的归因正确**——问题 1 的根因分析准确（浏览器拦 audio → onended 不触发 → isSpeaking 卡死），没有误判成代码 bug。

### 做得不好的地方（真实的，需改进）

1. **🔴 最严重：没读 `selftest-comprehensive.md` §三陷阱 7 就开测**
   该方案明确写了："webbridge 新标签无用户手势，audio 被拦……自测时音频不响不一定是 bug，要先 unlockAudio"。执行者完全没执行"先点页面 unlockAudio"这一步，导致 TTS 全程被拦截，进而把**测试方法错误**误判成**代码问题**（问题 1、问题 2）。
   **这是"不读前置文档就动手"的典型，浪费了整个 Layer 3 的 TTS 相关验证。**

2. **🔴 漏报了 SSRF 拦截 webbridge 的真问题**
   日志里满屏的 `ERROR: QQ 搜索失败 ... Blocked by SSRF guard: private/internal IP addresses are not allowed (127.0.0.1)`。执行者却把 QQ 失败归因为"未开 y.qq.com tab"，**完全没看日志里的真实错误**。这是本应报的最严重问题（webbridge 集成完全失效），却被埋没了。

3. **问题 3（/settings 找不到）是误判**
   TopBar 代码确有 `/settings` Link（`TopBar.tsx:56-57`，齿轮图标）。执行者在 /profile 页"找不到设置链接"更可能是没认出齿轮图标，或被遮挡。结论下得太草率。

4. **问题 4（NOW 未显示）疑似误判**
   `findCurrentSlotIndex` 跨午夜逻辑已修复。最可能是测试时间（凌晨 5-6 点）命中跨午夜时段边界。执行者没给出当时的确切时间和 schedule 数据，无法证伪。

### 4 个问题的真实性复核

| 问题 | 执行者判断 | 规划者核实 | 真实性 |
|------|-----------|-----------|--------|
| 1 isSpeaking 卡死 | 测试环境限制 | ✅ 判断正确，但**根因是测试方法错误**（没 unlockAudio） | 测试方法问题，非 bug |
| 2 换歌 transition 未触发 | 🔴 待规划者分析 | **误判**：autoplay 拦了 TTS audio，自然没 onended 也没新的 TTS 请求。和问题 1 是同一个原因 | 同问题 1，非 bug |
| 3 /settings 找不到 | 🟢 TopBar 渲染问题 | **误判**：代码有 Link，执行者没找到图标 | 误报 |
| 4 NOW 未显示 | 🟢 时段匹配问题 | **疑似误判**：跨午夜逻辑已修，缺测试时间数据无法证伪 | 待证伪 |
| **(漏报) SSRF 拦 webbridge** | 未报 | **🔴 真 bug**：日志满屏 SSRF 拦截 127.0.0.1，QQ 集成完全失效 | 真 bug |

**净结论**：执行者报的 4 个问题里，**0 个是真代码 bug**（都是测试方法/误判），却**漏报了 1 个真 bug**（SSRF 拦截）。这次自测的"发现问题"环节基本失效——该报的没报，报的都是误判。

---

## 一、修复方案

### 🔴 P1：SSRF 守卫拦截 webbridge 的合法本地调用（真 bug，最高优先级）

#### 现象
后端日志满屏：
```
ERROR: QQ 搜索失败 {"keyword":"...","message":"Blocked by SSRF guard: private/internal IP addresses are not allowed (127.0.0.1)"}
```
QQ 音源的 webbridge 集成完全失效。所有 QQ 搜索失败，自动回落网易云。

#### 根因
`backend/src/utils/ssrfGuard.ts` 的 `isSafeUrl` 把 `127.0.0.1` 判为 unsafe。虽然有 `SSRF_ALLOW_HOSTS` 白名单，但白名单逻辑可能没覆盖到 webbridge 的调用路径，或白名单匹配方式（host vs host:port）不对。

webbridge daemon 在 `127.0.0.1:10086`，是合法的本地服务调用（见 `COLLABORATION.md` 第三节决策 4：SSRF 白名单含 127.0.0.1，webbridge 是合法本地调用）。

#### 修复方向（执行者需先读代码确认精确改法）
1. 读 `ssrfGuard.ts` 的 `SSRF_ALLOW_HOSTS` 定义和 `fetchWithTimeout.ts` 的白名单检查逻辑。
2. 确认白名单是按 `host` 匹配还是 `host:port` 匹配。webbridge URL 是 `http://127.0.0.1:10086`。
3. 把白名单收紧到端口级：只放行 `127.0.0.1:10086`（webbridge），而非整个 `127.0.0.1`（避免被用来打本机其他敏感端口如 Redis、元数据服务）。
4. **注意**：`COLLABORATION.md` 决策 4 明确说"不要删白名单，要收紧到端口级"。执行者不要直接 `return true` 绕过。

#### 验证
- 后端重启后，curl 触发一次 QQ 搜索（或创建会话），日志**不再**出现 `Blocked by SSRF guard`。
- QQ 音源（需 webbridge tab 开着）能正常返回搜索结果。

---

### 🟡 P2：换歌 transition TTS 验证（需用正确方法重测，非代码修复）

执行者报的"问题 2"不是代码 bug，是测试方法问题。但**换歌 transition 是否真的会触发**仍然需要验证（之前自测验证过一次，但这次因 autoplay 失败了）。

#### 正确的复测方法
1. **先 unlockAudio**：navigate 后，evaluate 执行一次 `document.body.click()` 或点页面任意元素，触发用户手势解锁音频。
2. 确认音频解锁后（store.audioUnlocked = true），再输入创建会话。
3. **等开场白 TTS 真的播完**（不是 isSpeaking 卡死的"假播完"），再点下一首。
4. 用日志计数法验证：换歌前后 `grep -c "POST /tts"`，新增 > 0 即触发。

如果正确方法复测后 transition 仍不触发，那才是代码问题，届时再分析。

---

### ⚪ P3/P4：误判项，不修

- P3（/settings）：TopBar 代码正确，执行者复测时认出齿轮图标即可。
- P4（NOW 标记）：执行者复测时记录确切时间和 schedule.slots 数据，规划者据此证伪。

---

## 二、自测结论修订

执行者原结论"部分通过"是**乐观了**。修正后：

| 维度 | 执行者判定 | 规划者修正 |
|------|-----------|-----------|
| 静态层 | ✅ 通过 | ✅ 通过（234/127 基线无回归，这点可信） |
| API 层 | ✅ 通过 | ⚠️ **部分**——API 验证没发现 SSRF 拦截（日志明明有），观察力不足 |
| 主链路 | ✅ 全部可达 | ⚠️ **部分**——TTS 相关验证因 autoplay 全部失效（没 unlockAudio），换歌 transition 实际未验证 |
| 边界与降级 | ⚠️ 4 问题 | ❌ **不通过**——4 个问题 3 误判 1 漏报，发现问题能力不足 |
| 盲区 | 6 项 | ✅ 诚实（这是唯一做得好的） |

**规划者最终结论**：这次自测的**执行流程是合格的**（三层都走、9 步都到、盲区诚实），但**发现问题的能力不及格**——该报的 SSRF 没报（没看日志），报的 4 个全是误判（没 unlockAudio + 没读代码）。

**根本原因**：执行者把 selftest-comprehensive.md 当成"测试用例清单"照着走，没有真正吸收里面的陷阱库和案例。陷阱 7（autoplay）白纸黑字写了"先 unlockAudio"，它跳过了。

---

## 三、给规划者的教训（沉淀用）

1. **自测方案不能假设执行者会读陷阱库**。本次 selftest-comprehensive.md §三陷阱 7 写得很清楚，但执行者跳过了。后续方案要把"陷阱规避步骤"写成**强制前置步骤**（如"Step 0.5：unlockAudio"），而不是放在"陷阱库"里等它自己想起来。
2. **API 验证不能只看 HTTP 200**。本次 feedback/create/next 都返回 200，但日志里 QQ 搜索全是 SSRF 错误。API 层验证必须**附带 grep 日志查 ERROR/WARN**，不能只看状态码。
3. **日志是第一证据源**。执行者全程没 grep 日志找 ERROR，导致漏报 SSRF。这是最该补的能力。

---

*本评估已完成。P1 SSRF 是真 bug 需修，P2 需正确方法复测，P3/P4 误判不修。执行者请重读 selftest-comprehensive.md §三和§四 Step 4（日志对照），下次自测不要再漏。*
