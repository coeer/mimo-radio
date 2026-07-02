# mimo-radio 自测规范（执行者必读契约）

> **用途**：约束执行者每次自测的产出物——文件命名、存放位置、内容结构、质量标准。
> **适用范围**：任何用 webbridge / curl / DB 直查做的 E2E 自测。
> **生成时间**：2026-06-27（规划者）
> **配套**：自测前必读 `COLLABORATION.md` + `docs/selftest-comprehensive.md`（方法论）。本文件只管"产出物规范"，不管"怎么测"。

---

## 一、文件命名规则

### 格式
```
docs/selftest-<YYYY-MM-DD>-<主题>.md
```

### 要点
- **日期用自测当天的日期**，不是代码改动的日期。
- **主题用简短英文或中文短语**，描述本次自测的对象，不要用"全方位/全面"这种空泛词。
- **一天多份自测加序号**：`-2`、`-3`。

### 正例 ❌ vs ✅
```
❌ docs/selftest-report-2026-06-27.md          （"report" 是冗余词，没主题）
❌ docs/自测报告.md                              （无日期、非英文命名、位置错）
❌ docs/plans/selftest-2026-06-27.md            （放错目录，plans 是修复方案用的）
✅ docs/selftest-2026-27-ux-r2-verify.md       （日期+主题+verify 表明是验证类）
✅ docs/selftest-2026-06-27-ssrf-fix.md         （日期+具体对象 ssrf-fix）
✅ docs/selftest-2026-06-27-full-e2e-2.md       （同日第二份全方位 E2E）
```

---

## 二、文件存放位置

```
docs/selftest-<date>-<topic>.md        ← 自测报告放这里
docs/plans/<date>-<topic>.md           ← 修复方案放这里（不要混）
docs/selftest-comprehensive.md         ← 方法论（常驻，不删）
docs/selftest-spec.md                  ← 本文件（常驻契约，不删）
docs/<date>-<topic>-review.md          ← 规划者评估（规划者写，执行者不写）
```

**铁律**：
- 自测报告**只放 `docs/`**，不要放 `docs/plans/`（那是修复方案的目录）。
- 不要放 `logs/`（那是运行日志目录）。
- 不要在文件名里带 `report`/`记录` 等冗余词，`selftest-` 前缀已经说明类型。

---

## 三、文件内容结构（强制模板）

每份自测报告**必须**包含以下 8 节，缺一不可。缺节的报告会被规划者打回。

```markdown
# 自测：<主题>

> 测试时间：YYYY-MM-DD HH:MM ~ HH:MM（约 N 分钟）
> 测试方式：<webbridge E2E / API curl / DB 直查 / 混合>
> 测试版本：<针对哪个改动/版本>

## 一、环境
（表格：webbridge/后端/前端 端口+状态；音源是网易云还是QQ，webbridge tab 是否开）
（**必须**记录是否执行了 unlockAudio，这是 TTS 验证的前置条件）

## 二、Layer 1：静态
（tsc 输出 + vitest 通过数。基线后端 234 / 前端 127，低于基线要标红）

## 三、Layer 2：API
（端点验证表。**必须附带 grep 日志查 ERROR/WARN**，不能只看 HTTP 200）
（如：`grep -E "ERROR|WARN" logs/dev-backend*.log | tail -10`）

## 四、Layer 3：E2E 主链路
（按 selftest-comprehensive.md §五的 9 步逐项记录）
（每步：操作 + DOM/日志判定结果。**引用具体的判定证据**，如 coverSrc 值、TTS 计数差）

## 五、边界与降级
（刻意制造的异常场景：断网/空数据/快速连点/后端失败）
（**这是最有价值的部分**，不要省略。只测 happy path 的自测不合格）

## 六、发现的问题
（每个问题：现象 + 根因 + 证据（日志/代码行号）+ 严重度）
（**问题必须基于证据**，不能是"可能""大概"。没有证据的猜测标"待证伪"）

## 七、盲区（未覆盖）
（诚实列出。盲区不是缺点，隐瞒盲区才是）

## 八、结论
（通过 / 部分通过 / 不通过 + 理由。**不要用"功能正常"这种模糊话**）
```

---

## 四、质量标准（规划者据此打分）

| 维度 | 合格线 | 不合格的表现 |
|------|--------|------------|
| **结构完整** | 8 节齐全 | 缺节、把多节合并成一坨 |
| **证据导向** | 每个结论有日志/代码/DOM 证据 | "应该没问题""看起来正常" |
| **盲区诚实** | 明确列出未覆盖项 | 用"功能正常"掩盖没测的 |
| **日志意识** | Layer 2 附带 grep ERROR/WARN | 只看 HTTP 200 不查日志（漏报 SSRF） |
| **陷阱规避** | 执行了 unlockAudio 等前置步骤 | 没读陷阱库就开测（autoplay 卡死） |
| **问题分级** | 🔴bug / 🟡隐患 / ⚪误报 明确标注 | 所有问题混在一起不分级 |
| **不复述方案** | 报告写"测了什么、结果如何" | 大段复述 selftest-comprehensive 的方法论 |

---

## 五、三个强制前置步骤（违反则自测作废）

这三步来自本项目真实踩坑。**执行者每次自测必须在 Step 0 完成，否则后续 TTS/音频相关验证全部失效。**

### Step 0.1：unlockAudio（TTS 验证前置）
```bash
python wb.py evaluate '{"code":"document.body.click(); \"clicked\""}'
```
**原因**：webbridge 新标签无用户手势，浏览器拦截所有 audio。不 unlock 的话：
- TTS 合成成功但不播放 → `onended` 不触发 → `isSpeaking` 永远 true
- 换歌 transition TTS 同样被拦 → 看起来像"换歌不说话"（实则是测试方法 bug）
- 历史上有执行者因此误判成代码 bug，浪费整个 Layer 3

### Step 0.2：grep 日志查历史 ERROR（API 验证前置）
```bash
grep -E "ERROR|WARN|statusCode.:[45]" logs/dev-backend*.log | tail -20
```
**原因**：HTTP 200 不代表没问题。SSRF 拦截、QQ 搜索失败、webbridge 错误都藏在 ERROR 日志里，但响应仍是 200（因为回落了网易云）。**不看日志 = 漏报**。

### Step 0.3：确认音源覆盖范围
明确记录"本次测的是网易云还是 QQ"，以及"QQ tab 是否开"。
**原因**：QQ 失败时自动回落网易云，表面看"功能正常"，实际 QQ 集成已失效。不记录就会漏报。

---

## 六、问题报告的"证据三要素"

报问题时**必须**同时给出：

1. **现象**：可观测的事实（如"点收藏后 DB feedback 表无新记录"）
2. **根因**：基于代码/日志的因果链（如"前端 toggleLike 未调 /feedback 接口，grep 零匹配"）
3. **证据**：日志行 / 代码 file:line / DOM 检查输出

### ❌ 不合格的问题报告
```
问题：换歌 transition TTS 未触发
可能根因：1. MiMo 没返回 transition 2. autoplay 拦截 3. 时序问题
需要规划者分析
```
**为什么不合格**：三个"可能"没有排除任何一个，把分析工作甩给规划者。执行者的职责是**用证据排除**到只剩一个根因。

### ✅ 合格的问题报告
```
🔴 问题：换歌 transition TTS 未触发

现象：点"下一首"后 POST /next 200，歌曲切换成功，但 grep 日志无新 POST /tts。

证据：
1. 日志 `POST /next 200 duration 6659ms`（换歌请求成功）
2. 日志无新 `POST /tts`（TTS 未触发）
3. store.isSpeaking = true（开场白 TTS 卡死，因为没 unlockAudio）
4. 代码 page.tsx:111 守卫 `if (s.isSpeaking) return` 会丢弃 pendingTtsText

根因（已排除其他可能）：
- 排除"MiMo 没返回 transition"：因为 TTS 链路根本没走到（isSpeaking 守卫在前）
- 确认是"autoplay 拦截导致 isSpeaking 卡死 + 守卫丢弃 transition"的连锁

结论：测试方法问题（没 unlockAudio），非代码 bug。需用正确方法复测。
```

---

## 七、规划者评估机制

执行者提交自测报告后，规划者会：

1. **逐项核实**：报的问题对照日志/代码核实真实性（本项目执行者误判率约 40-50%）
2. **补查漏报**：grep 日志找执行者没发现的 ERROR（本次就发现了 SSRF）
3. **写评估文档**：`docs/selftest-<date>-<topic>-review.md`，给出"合格/不合格 + 改进点"
4. **沉淀教训**：重复犯的错写进 `COLLABORATION.md` 第十节

**执行者不要自己写评估**。执行者只写自测报告，评估是规划者的职责。

---

## 八、一句话总结

> **自测报告的价值不在"证明功能正常"，而在"暴露真实问题"。一份全绿但漏报真 bug 的报告，比一份报了 5 个误判的报告更糟糕——因为它给人虚假的信心。**

执行者的目标：用证据找问题，用日志排根因，用诚实标盲区。做到这三点，报告就合格了。

---

*本规范由规划者维护。执行者每次自测前必读本文件 + selftest-comprehensive.md。违反第五节强制前置步骤的自测报告会被打回重做。*
