---
author: MiNiMax（mimo-radio 执行者）
task: 批 1 SSRF IPv6 + DNS 解析校验
status: DONE
commit: 3e8024c
date: 2026-07-22
---

# 批 1 SSRF 修复执行报告

> 任务来源：`docs/MiNiMax/plans/plan-remaining-2026-07-18-MiNiMax.md` 批 1
> 全面审核 P0-2：原 `isSafeUrl` 只做字符串正则，IPv6 全形态绕过 + 无 DNS rebinding 防护

---

## 一、改动清单

| 文件 | 改动 |
|------|------|
| `backend/src/utils/ssrfGuard.ts` | IPv6 剥方括号 + PRIVATE_IP_PATTERNS 补 `::ffff:` / `2002:` / ULA `fc00::/7`；isSafeUrl 改 async + DNS 解析校验 |
| `backend/src/utils/fetchWithTimeout.ts` | SSRF 校验块重排为白名单优先（端口白名单 → host 白名单 → isSafeUrl）；`isSafeUrl` 改 await |
| `backend/src/utils/ssrfGuard.test.ts` | 全用例改 async；新增 IPv6 literal 8 例 + DNS rebinding 7 例 + 边界例 |
| `backend/src/utils/fetchWithTimeout.test.ts` | 加 dns/promises mock（避免 `*.example` 假域名触发 fail-closed） |

---

## 二、B1-1 IPv6 字面量匹配

**根因**：`new URL('http://[::1]/').hostname` 返回 `[::1]`（带方括号），正则 `/^::1$/` 永匹配不上。

**改法**：
1. 新增 `stripIpv6Brackets(hostname)`：剥首尾 `[]`
2. PRIVATE_IP_PATTERNS 补：
   - `/^::ffff:/i` —— IPv4-mapped IPv6（`::ffff:127.0.0.1` 绕过 v4 规则的关键路径）
   - `/^2002:/i` —— IPv6 6to4（可能映射私网，保守拦截）
   - `/^[fF][cCdD][0-9a-fA-F]{2}:/` —— ULA `fc00::/7`（**修正**：原 `/^fc00:/i` 漏掉 `fd00:` 段，规范要求 fc00-fdff 都拦）

**测试覆盖**（8 例 IPv6）：
- `[::1]` `[fc00::1]` `[FD12:3456:789A::1]`（大小写）`[fe80::1]` → blocked
- `[::ffff:127.0.0.1]` `[::ffff:10.0.0.1]` → blocked（IPv4-mapped）
- `[2002::1]` → blocked（6to4）
- `[2606:4700:4700::1111]` Cloudflare DNS → safe（公网 IPv6 放行）

---

## 三、B1-2 async + DNS 解析校验

**根因**：无 `dns.lookup`，公网域名解析到内网 IP 即可绕过（DNS rebinding）。

**改法**：
- `import { lookup } from 'dns/promises'` + `import { isIP } from 'net'`
- `isSafeUrl` 签名改 `Promise<{ safe: true } | { safe: false; reason: string }>`
- 域名形态（`!isIP(hostname)`）→ `await lookup(hostname, { all: true })`
- 任一解析结果命中私网 → unsafe（reason 含 IP）
- DNS 异常 → fail-closed（unsafe）

**测试覆盖**（7 例 DNS）：
- mock 解析 `127.0.0.1` → blocked（reason `resolves to private IP`）
- mock 解析 `::1` → blocked
- mock 返回 `[93.184.216.34, 10.0.0.1]`（多记录含私网）→ blocked（**保守：任一私网即拦**）
- mock 抛错 → blocked（fail-closed）
- IP 字面量（`8.8.8.8` / `10.0.0.1`）→ **不调 dns.lookup**（直接走正则拦截）
- 域名形态（`example.com`）→ 调 dns.lookup（验证 `lookup(hostname, { all: true })`）

---

## 四、B1-3 调用点传导（async 传导完整性）

**grep 调用点**：
```
backend/src/utils/fetchWithTimeout.ts:2:  import { isSafeUrl, SSRF_ALLOW_HOSTS, SSRF_ALLOW_HOST_PORTS } from './ssrfGuard'
backend/src/utils/fetchWithTimeout.ts:80: const ssrfCheck = isSafeUrl(url)
```

**唯一非测试调用点**：`fetchWithTimeout.ts:80`。改前调用方式在 async 函数里（L72 `async function fetchWithTimeout`），改 await 安全。

**白名单优先级重排**（原代码 "isSafeUrl → 不 safe 才查白名单"，新代码 "白名单优先 → 不命中才 isSafeUrl"）：

| 顺序 | 原代码 | 新代码 |
|------|--------|--------|
| 1 | isSafeUrl → unsafe | 端口白名单命中 → 放行 |
| 2 | 端口白名单 → 端口不对抛 | host 白名单命中 → 放行 |
| 3 | host 白名单 → 放行 | isSafeUrl（DNS 校验） |

**设计依据**：白名单 = "我信这个域名，不做 DNS rebinding 校验"。原代码先 isSafeUrl 让所有 URL 都走 DNS 解析，浪费且可能误拦（白名单域名解析失败也会 fail-closed）。新代码白名单命中跳过 DNS 解析。

**测试影响**：fetchWithTimeout.test.ts 必须 mock `dns/promises.lookup`，否则 `*.example` 假域名真实解析失败触发 fail-closed。

---

## 五、验证

| 项 | 结果 |
|----|------|
| 后端 `npx tsc --noEmit` | **零错误** |
| 后端 `npx vitest run` | **305 passed / 32 文件**（基线 277 → +28：新增 11 IPv6/DNS 用例 + 其他测试原样通过） |
| 前端 `npx tsc --noEmit` | **零错误**（未动） |
| 前端 `npx vitest run` | **189 passed / 23 文件**（基线不变） |
| 回归测试 | `djIntroToSong.test.ts` 5/5（批 3 契约守住） |

---

## 六、commit 与 push

- commit: `3e8024c fix: SSRF IPv6 绕过修复 + DNS 解析校验`
- push: `cf227e5..3e8024c master -> master`（远端已同步）
- 改动体量：4 文件 / +292 / -64

---

## 七、未做的（明确边界）

- 未改 `SSRF_ALLOW_HOSTS` / `SSRF_ALLOW_HOST_PORTS` 白名单内容（规格禁止）
- 未改 `fetchWithTimeout` 熔断逻辑（铁律 4：已验证方案替换前需理解，原熔断不动）
- 未改 SSRF 相关路由（dj.ts / mimo.ts 等无直接 URL 输入，无调用点）

---

## 八、风险与回滚

- **风险**：DNS 解析在某些受限网络下超时 → fail-closed 会拦下所有公网域名调用。当前 fetchWithTimeout 的 15s timeout 已经覆盖，但 isSafeUrl 内 lookup 自身超时未独立设置（依赖 OS 默认 ~5s）。
- **回滚**：单 commit（3e8024c），`git revert 3e8024c` 即恢复。

---

*报告由 MiNiMax 自动落盘，可供 ZCode 复核。*
