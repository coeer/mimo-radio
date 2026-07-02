/**
 * 从可能包含杂质的 AI 原始输出中安全地提取首个 JSON 对象。
 *
 * 安全性考量（ReDoS 防护）：
 * - 对原始输入做长度上限截断（MAX_INPUT_LEN），避免超长输入触发贪婪正则
 *   的线性扫描耗时，或潜在的回溯放大。
 * - 用 lastIndexOf('}') 从尾部定位结束边界，避免贪婪 `[\s\S]*` 全量扫描。
 *
 * 返回提取到的 JSON 字符串；提取不到返回 null。
 */
const MAX_INPUT_LEN = 100_000

export function extractJsonObject(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null

  // 长度截断：超长输入直接丢弃尾部，防止无界扫描
  const trimmed = raw.length > MAX_INPUT_LEN ? raw.slice(0, MAX_INPUT_LEN) : raw

  // 去除 ```json / ``` 代码块包裹（容错：模型可能带 markdown 围栏）
  const cleaned = trimmed.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  const start = cleaned.indexOf('{')
  if (start === -1) return null
  const end = cleaned.lastIndexOf('}')
  if (end === -1 || end <= start) return null

  return cleaned.slice(start, end + 1)
}
