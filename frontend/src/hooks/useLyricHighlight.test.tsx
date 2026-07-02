import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLyricHighlight } from './useLyricHighlight'

describe('useLyricHighlight', () => {
  it('应把脚本按换行拆成多行', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: '第一句。\n第二句。\n第三句。',
        currentTime: 0,
        duration: 30,
        isPlaying: true,
      })
    )
    expect(result.current.lines).toHaveLength(3)
    expect(result.current.lines[0].cleanText).toBe('第一句。')
  })

  it('应从 **标记** 中提取关键词', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: 'imaging a **mother** who had **given birth**',
        currentTime: 0,
        duration: 10,
        isPlaying: true,
      })
    )
    expect(result.current.lines[0].keywords).toEqual(['mother', 'given birth'])
    expect(result.current.lines[0].cleanText).toBe('imaging a mother who had given birth')
  })

  it('应按 currentTime 落点计算当前高亮句索引', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: '句1\n句2\n句3\n句4',
        currentTime: 0,
        duration: 40,
        isPlaying: true,
      })
    )
    // 4 句 / 40 秒 → 每句 10 秒
    expect(result.current.lines).toHaveLength(4)
    expect(result.current.lines[0].startTime).toBe(0)
    expect(result.current.lines[1].startTime).toBe(10)
    expect(result.current.lines[2].startTime).toBe(20)
    expect(result.current.currentIndex).toBe(0)
  })

  it('currentTime 落在中间句时应高亮对应句', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: '句1\n句2\n句3\n句4',
        currentTime: 25,
        duration: 40,
        isPlaying: true,
      })
    )
    // 25 秒落第 3 句（20-30s）
    expect(result.current.currentIndex).toBe(2)
  })

  it('currentTime 超过总时长应高亮最后一句', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: '句1\n句2',
        currentTime: 999,
        duration: 20,
        isPlaying: true,
      })
    )
    expect(result.current.currentIndex).toBe(1)
  })

  it('renderLine 应把关键词包成 isKeyword segment', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: 'a **b** c **d**',
        currentTime: 0,
        duration: 10,
        isPlaying: true,
      })
    )
    const segs = result.current.renderLine(result.current.lines[0])
    expect(segs).toEqual([
      { text: 'a ', isKeyword: false },
      { text: 'b', isKeyword: true },
      { text: ' c ', isKeyword: false },
      { text: 'd', isKeyword: true },
    ])
  })

  it('空脚本应返回空行数组不崩溃', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: '',
        currentTime: 0,
        duration: 10,
        isPlaying: true,
      })
    )
    expect(result.current.lines).toHaveLength(0)
  })

  it('无关键词的行 renderLine 应返回单个普通段', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        script: 'plain text no keywords',
        currentTime: 0,
        duration: 10,
        isPlaying: true,
      })
    )
    const segs = result.current.renderLine(result.current.lines[0])
    expect(segs).toHaveLength(1)
    expect(segs[0].isKeyword).toBe(false)
  })

  it('长短句混合时应按字符数分配时长（长句占更多时间，非平均分配）', () => {
    const { result } = renderHook(() =>
      useLyricHighlight({
        // 短句 "aa"（2字符）+ 长句 10 个 "c"（10字符）= 12 字符；比例 1:5
        script: 'aa\ncccccccccc',
        currentTime: 0,
        duration: 60,
        isPlaying: true,
      })
    )
    expect(result.current.lines).toHaveLength(2)
    // 第一句：60 * (2/12) = 10 秒；从 0 开始
    expect(result.current.lines[0].startTime).toBe(0)
    // 第二句：第一句占 10 秒，故从 10 秒开始
    expect(result.current.lines[1].startTime).toBe(10)
    // 若是旧的平均分配（两句各 30 秒），第二句会从 30 秒开始 —— 字符估算是 10，证明不是平均分配
    expect(result.current.lines[1].startTime).not.toBe(30)
  })
})
