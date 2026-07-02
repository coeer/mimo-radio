import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerTtsEngine,
  getTtsEngine,
  setCurrentTtsEngine,
  getCurrentTtsEngineId,
  listTtsEngines,
  listTtsEnginesWithReady,
} from './ttsEngine'
import type { TtsEngine } from '../types'

function makeEngine(id: string, ready = true): TtsEngine {
  return {
    id,
    label: `Engine-${id}`,
    kind: 'preset',
    isReady: async () => ready,
    synthesize: async () => Buffer.from('audio'),
  }
}

describe('TTS 引擎切换工厂', () => {
  beforeEach(() => {
    // 重置到默认状态：通过切换回 mimo-tts
    setCurrentTtsEngine('mimo-tts')
  })

  it('注册并获取引擎', () => {
    const e = makeEngine('test-register-1')
    registerTtsEngine(e)
    setCurrentTtsEngine('test-register-1')
    expect(getTtsEngine().id).toBe('test-register-1')
  })

  it('切换引擎后 getCurrentTtsEngineId 同步更新', () => {
    registerTtsEngine(makeEngine('test-switch-a'))
    registerTtsEngine(makeEngine('test-switch-b'))
    expect(setCurrentTtsEngine('test-switch-a')).toBe(true)
    expect(getCurrentTtsEngineId()).toBe('test-switch-a')
    expect(setCurrentTtsEngine('test-switch-b')).toBe(true)
    expect(getCurrentTtsEngineId()).toBe('test-switch-b')
  })

  it('切换到不存在的引擎返回 false', () => {
    expect(setCurrentTtsEngine('non-existent-engine')).toBe(false)
  })

  it('listTtsEngines 返回所有引擎且标记当前', () => {
    registerTtsEngine(makeEngine('test-list-x'))
    setCurrentTtsEngine('test-list-x')
    const list = listTtsEngines()
    const found = list.find((e) => e.id === 'test-list-x')
    expect(found).toBeDefined()
    expect(found?.isCurrent).toBe(true)
  })

  it('listTtsEnginesWithReady 返回就绪状态', async () => {
    registerTtsEngine(makeEngine('test-ready-true', true))
    registerTtsEngine(makeEngine('test-ready-false', false))
    const result = await listTtsEnginesWithReady()
    const readyEngine = result.engines.find((e) => e.id === 'test-ready-true')
    const notReadyEngine = result.engines.find((e) => e.id === 'test-ready-false')
    expect(readyEngine?.isReady).toBe(true)
    expect(notReadyEngine?.isReady).toBe(false)
    expect(result.current).toBeDefined()
  })
})
