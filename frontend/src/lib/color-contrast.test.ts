import { describe, it, expect } from 'vitest'
import {
  getContrastRatio,
  hexToRgb,
  relativeLuminance,
  alphaOver,
  parseRgba,
  ratioForPair,
  resolveBgOrFg,
  COLOR_PAIRS,
  WCAG_THRESHOLDS,
} from './color-contrast'

describe('WCAG color contrast — utility correctness', () => {
  it('hexToRgb: parses 3-digit shorthand', () => {
    expect(hexToRgb('#abc')).toEqual([170, 187, 204])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#000')).toEqual([0, 0, 0])
  })

  it('hexToRgb: parses 6-digit form', () => {
    expect(hexToRgb('#0a0a0f')).toEqual([10, 10, 15])
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255])
  })

  it('hexToRgb: drops alpha when 8-digit', () => {
    expect(hexToRgb('#ffffffff')).toEqual([255, 255, 255])
  })

  it('relativeLuminance: known reference values', () => {
    // WCAG reference: black=0, white=1
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 6)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6)
    // mid gray should be ~0.21
    expect(relativeLuminance([128, 128, 128])).toBeGreaterThan(0.18)
    expect(relativeLuminance([128, 128, 128])).toBeLessThan(0.24)
  })

  it('getContrastRatio: black on white is 21:1', () => {
    expect(getContrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1)
  })

  it('getContrastRatio: same color is 1:1', () => {
    expect(getContrastRatio([123, 45, 67], [123, 45, 67])).toBeCloseTo(1, 6)
  })

  it('parseRgba: parses rgb()', () => {
    expect(parseRgba('rgb(255, 0, 0)')).toEqual([255, 0, 0, 1])
  })

  it('parseRgba: parses rgba()', () => {
    expect(parseRgba('rgba(0, 230, 118, 0.1)')).toEqual([0, 230, 118, 0.1])
  })

  it('alphaOver: opaque fg is identical', () => {
    expect(alphaOver([200, 200, 200], 1, [10, 10, 10])).toEqual([200, 200, 200])
  })

  it('alphaOver: α=0 returns bg', () => {
    expect(alphaOver([200, 200, 200], 0, [10, 20, 30])).toEqual([10, 20, 30])
  })

  it('resolveBgOrFg: handles "over #..."', () => {
    // white at 50% over black → mid gray (~128)
    const out = resolveBgOrFg('rgba(255,255,255,0.5) over #000000')
    expect(out[0]).toBeGreaterThan(120)
    expect(out[0]).toBeLessThan(135)
  })
})

describe('WCAG color contrast — project color pairs', () => {
  it.each(
    COLOR_PAIRS.map((p) => ({
      name: p.name,
      fg: p.fg,
      bg: p.bg,
      size: p.size,
      pair: p,
    }))
  )(
    '$name ≥ $size threshold (WCAG)',
    ({ pair }) => {
      const r = ratioForPair(pair)
      expect(r).toBeGreaterThanOrEqual(WCAG_THRESHOLDS[pair.size])
    }
  )

  it('every pair yields a valid contrast ratio', () => {
    for (const pair of COLOR_PAIRS) {
      const r = ratioForPair(pair)
      expect(r, pair.name).toBeGreaterThan(1)
      expect(Number.isFinite(r), pair.name).toBe(true)
    }
  })

  it('all normal-size pairs clear AA 4.5:1', () => {
    const body = COLOR_PAIRS.filter((p) => p.size === 'normal')
    for (const pair of body) {
      expect(ratioForPair(pair), pair.name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('all large/ui pairs clear AA 3:1', () => {
    const large = COLOR_PAIRS.filter((p) => p.size !== 'normal')
    for (const pair of large) {
      expect(ratioForPair(pair), pair.name).toBeGreaterThanOrEqual(3)
    }
  })
})
