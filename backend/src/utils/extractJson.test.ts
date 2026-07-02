import { describe, it, expect } from 'vitest'
import { extractJsonObject } from './extractJson'

describe('extractJsonObject', () => {
  it('提取纯净 JSON 对象', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}')
  })

  it('提取被文字包裹的 JSON', () => {
    expect(extractJsonObject('好的，结果如下：{"summary":"今日"} 完成')).toBe('{"summary":"今日"}')
  })

  it('去除 ```json 代码块围栏', () => {
    const raw = '```json\n{"x":2}\n```'
    expect(extractJsonObject(raw)).toBe('{"x":2}')
  })

  it('去除裸 ``` 围栏', () => {
    const raw = '```\n{"x":3}\n```'
    expect(extractJsonObject(raw)).toBe('{"x":3}')
  })

  it('取首个 { 到最后一个 }（处理嵌套）', () => {
    const raw = '前缀 {"outer":{"inner":1}} 后缀'
    expect(extractJsonObject(raw)).toBe('{"outer":{"inner":1}}')
  })

  it('无 { 时返回 null', () => {
    expect(extractJsonObject('纯文本无 JSON')).toBeNull()
  })

  it('有 { 但无 } 时返回 null', () => {
    expect(extractJsonObject('只有 { 开头没有结尾')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(extractJsonObject('')).toBeNull()
  })

  it('非字符串返回 null', () => {
    expect(extractJsonObject(null as unknown as string)).toBeNull()
  })

  it('超长输入被截断，不引发慢匹配（ReDoS 防护）', () => {
    // 10 万个字符 + 末尾才出现 }，验证截断后能快速返回（且有结果边界正确）
    const huge = 'x'.repeat(200_000) + ' {"ok":true} 尾巴'
    const result = extractJsonObject(huge)
    // 截断发生在 100_000 处，该位置之前无 { }，故返回 null（证明截断生效，未扫描全部 20 万字符）
    expect(result).toBeNull()
  })

  it('超长输入但在截断区内有 JSON 时正常提取', () => {
    const huge = 'x'.repeat(100) + '{"ok":true}' + 'y'.repeat(200_000)
    expect(extractJsonObject(huge)).toBe('{"ok":true}')
  })
})
