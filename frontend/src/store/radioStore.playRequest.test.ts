import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRadioStore } from './radioStore'

/**
 * F4 isPlaying 仲裁层测试（plan-f4-isplaying-arbiter-2026-07-18-KIMI.md §四）
 *
 * 覆盖矩阵 1-8 场景：
 *   1. DJ 说话中点推荐卡（user play）→ 歌曲播放（用户优先），DJ 继续说完
 *   2. DJ 说话中 chat 推荐触发 auto play → pendingResume，歌不响；DJ 说完续播
 *   3. 换歌中（transition）DJ onEnd 续播 → 丢弃，无旧歌复活
 *   4. 换歌中用户点播放 → 生效（用户意图）
 *   5. autoplay 被拒 → system pause 生效，UI 显示暂停态
 *   6. 重复 play 请求 → no-op，无多余 set
 *   7. intro 流程（已验证链路）→ unlockAudio → intro → onEnd → 续播第一首，不回归
 *   8. DJ 说话中真调 mock fetch 的 nextSong → 切歌 + R3 挂起 → 说完消费续播（R-5 重写）
 *   8b. 用户暂停态点下一首 → 普通路径 isPlaying=true（走向 1）
 */

const SONG = {
  id: 'ne_1', title: '夜に駆ける', artist: 'YOASOBI',
  playUrl: 'http://m701.music.126.net/x.mp3',
  emotionTags: [], sceneTags: [], platform: 'netease' as const,
}
const SONG2 = {
  id: 'ne_2', title: 'アイドル', artist: 'YOASOBI',
  playUrl: 'http://m701.music.126.net/y.mp3',
  emotionTags: [], sceneTags: [], platform: 'netease' as const,
}

function resetStore() {
  useRadioStore.setState({
    currentSong: null,
    queue: [],
    isPlaying: false,
    isSpeaking: false,
    isTransitioning: false,
    pendingResume: false,
    currentTime: 0,
    duration: 0,
    aiCurrentTime: 0,
    aiVoiceDuration: 0,
    messages: [],
  })
}

describe('F4 playRequest 仲裁层（场景 1-8）', () => {
  beforeEach(() => resetStore())

  // ─── 场景 1：DJ 说话中点推荐卡（user play）───
  it('场景1：DJ 说话中点推荐卡（user play）→ isPlaying=true，pendingResume=false', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setSpeaking(true)
    s.setIsPlaying(false)

    s.playRequest('play', 'user')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(true)
    expect(after.pendingResume).toBe(false)
    // DJ 继续说（isSpeaking 仍 true）—— 后续 DJ onEnd 走 resumePlaybackAfterSpeak
    expect(after.isSpeaking).toBe(true)
  })

  // ─── 场景 2：DJ 说话中 chat 推荐触发 auto play ───
  it('场景2：DJ 说话中 chat 推荐（auto play）→ pendingResume=true，isPlaying 不变', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setSpeaking(true)
    s.setIsPlaying(false)

    s.playRequest('play', 'auto')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(false)  // 没响
    expect(after.pendingResume).toBe(true)  // 挂起
    expect(after.isSpeaking).toBe(true)
  })

  it('场景2 续：DJ 说完（resumePlaybackAfterSpeak 消费 pendingResume）→ isPlaying=true', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setSpeaking(true)
    s.setIsPlaying(false)
    s.playRequest('play', 'auto')  // 挂起

    // 模拟 DJ onEnd：先 setSpeaking(false)，再 playRequest('play','dj')
    s.setSpeaking(false)
    s.playRequest('play', 'dj')

    const after = useRadioStore.getState()
    expect(after.isSpeaking).toBe(false)
    expect(after.isPlaying).toBe(true)
  })

  // ─── 场景 3：换歌中 DJ onEnd 续播 → 丢弃 ───
  it('场景3：换歌中（isTransitioning=true）DJ auto play → 丢弃，无旧歌复活', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsTransitioning(true)
    s.setIsPlaying(false)

    s.playRequest('play', 'auto')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(false)
    expect(after.pendingResume).toBe(false)
    // transition 锁生效
  })

  // ─── 场景 4：换歌中用户点播放 → 生效 ───
  it('场景4：换歌中用户点播放（user play）→ 生效', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsTransitioning(true)
    s.setIsPlaying(false)

    s.playRequest('play', 'user')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(true)
  })

  // ─── N-5（深度 review 批次 4）：R2/R3 规则顺序锁定 ───
  // isTransitioning 与 isSpeaking 同置时，R2（transition 丢弃）必须先于 R3（speaking 挂起）——
  // 若顺序反了，auto play 会被挂起成 pendingResume 而不是丢弃，DJ 说完后在"换歌完成的新歌窗口"
  // 之外消费一个 transition 期间的旧意图。本用例锁死该顺序：终态必须是丢弃（pendingResume=false）。
  it('场景3b：transition+speaking 同置时 auto play → R2 丢弃（非 R3 挂起）', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsTransitioning(true)
    s.setSpeaking(true)
    s.setIsPlaying(false)

    s.playRequest('play', 'auto')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(false)
    expect(after.pendingResume).toBe(false)  // R2 先于 R3：丢弃而非挂起
  })

  // ─── 场景 5：autoplay 被拒（system pause）───
  it('场景5：autoplay 被拒 → system pause 生效', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsPlaying(true)

    s.playRequest('pause', 'system')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(false)
  })

  // ─── 场景 6：重复 play 请求 → no-op ───
  it('场景6：重复 play 请求（结果与当前 isPlaying 相同）→ no-op', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsPlaying(true)

    s.playRequest('play', 'user')  // 已是 true

    // 验证：isPlaying 仍 true，无变化即 no-op
    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(true)
    expect(after.pendingResume).toBe(false)
  })

  it('场景6b：重复 pause 请求 → no-op', () => {
    const s = useRadioStore.getState()
    s.setIsPlaying(false)
    s.playRequest('pause', 'user')
    expect(useRadioStore.getState().isPlaying).toBe(false)
  })

  // ─── 场景 7：intro 流程不回归（toggle / dj play 已验证链路）───
  it('场景7：togglePlay 等价于 toggle 语义（DJ 关闭下放歌）', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsPlaying(false)

    s.togglePlay()  // 应切到 true

    expect(useRadioStore.getState().isPlaying).toBe(true)
  })

  it('场景7b：togglePlay 二次切回 false', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.togglePlay()  // false → true
    s.togglePlay()  // true → false
    expect(useRadioStore.getState().isPlaying).toBe(false)
  })

  // ─── 场景 8（R-5 重写，F4 闭环）：真调 mock fetch 的 nextSong，断言终态 ──
  // 原实现只手摆 playRequest，断言的中间态在生产不可达（N-1：阶段 2 恒被 R2 吞）。
  // N-1 修复后阶段 2 在 finally 复位后真实仲裁，本场景验证完整闭环：
  //   DJ 说话中 nextSong → 阶段 1 切歌 → 阶段 2 R3 挂起 → DJ 说完消费续播（矩阵场景 11）
  it('场景8：DJ 说话中 nextSong（真 mock fetch）→ 切歌 + R3 挂起 → 说完消费续播', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ song: SONG2 }),
    })))
    try {
      const s = useRadioStore.getState()
      useRadioStore.setState({ sessionId: 'sess_test', sessionToken: 'tok_test' })
      s.setQueue([SONG, SONG2])
      s.setCurrentSong(SONG)
      s.setSpeaking(true)  // DJ（旧 transition）还在播
      s.setIsPlaying(false)

      await s.nextSong()

      const mid = useRadioStore.getState()
      // 阶段 1 切歌完成
      expect(mid.currentSong?.id).toBe('ne_2')
      expect(mid.isTransitioning).toBe(false)
      // 阶段 2（finally 后真实仲裁）：isSpeaking=true → R3 挂起，不直接置位
      expect(mid.isPlaying).toBe(false)
      expect(mid.pendingResume).toBe(true)

      // 模拟 DJ 说完：resumePlaybackAfterSpeak 链路（setSpeaking(false) + playRequest('play','dj')）
      mid.setSpeaking(false)
      mid.playRequest('play', 'dj')

      const after = useRadioStore.getState()
      // N-2 消费闭环：普通路径恢复播放并清 pendingResume
      expect(after.isPlaying).toBe(true)
      expect(after.pendingResume).toBe(false)
      expect(after.currentSong?.id).toBe('ne_2')
    } finally {
      vi.unstubAllGlobals()
      useRadioStore.setState({ sessionId: null, sessionToken: null })
    }
  })

  // ─── 场景 8b（走向 1，§1.2 矩阵场景 8）：用户暂停态点下一首 → 新歌播放 ──
  // ZCode 裁决：R5 在 play + isPlaying=false 时不短路，请求穿透普通路径 → isPlaying=true
  it('场景8b：暂停态（无 DJ）nextSong → 普通路径 isPlaying=true（走向 1）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ song: SONG2 }),
    })))
    try {
      const s = useRadioStore.getState()
      useRadioStore.setState({ sessionId: 'sess_test', sessionToken: 'tok_test' })
      s.setQueue([SONG, SONG2])
      s.setCurrentSong(SONG)
      s.setIsPlaying(false)  // 用户暂停态

      await s.nextSong()

      const after = useRadioStore.getState()
      expect(after.currentSong?.id).toBe('ne_2')
      expect(after.isPlaying).toBe(true)   // 普通路径直接置位（非 R5 幂等）
      expect(after.pendingResume).toBe(false)
    } finally {
      vi.unstubAllGlobals()
      useRadioStore.setState({ sessionId: null, sessionToken: null })
    }
  })
})

// ─── 额外：playRequest action=pause + isSpeaking=true 应立即生效（非挂起）───

describe('F4 playRequest pause 在 isSpeaking=true 时立即生效', () => {
  beforeEach(() => resetStore())

  it('DJ 说话中 pause（user source）→ 立即生效', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong(SONG)
    s.setIsPlaying(true)
    s.setSpeaking(true)

    s.playRequest('pause', 'user')

    const after = useRadioStore.getState()
    expect(after.isPlaying).toBe(false)
    expect(after.pendingResume).toBe(false)
  })
})

// ─── 额外：nextSong/prevSong 两阶段改法验证 ───

describe('F4 nextSong/prevSong 两阶段（ZCode §3.1）', () => {
  beforeEach(() => resetStore())

  it('prevSong 先切歌后 playRequest（阶段 1+2）', () => {
    const s = useRadioStore.getState()
    s.setQueue([SONG, SONG2])
    s.setCurrentSong(SONG2)
    s.setCurrentTime(50)
    s.setIsPlaying(false)

    s.prevSong()

    const after = useRadioStore.getState()
    // 阶段 1 切歌 + 阶段 2 经 playRequest('play','user') → R1 生效
    expect(after.currentSong?.id).toBe('ne_1')
    expect(after.currentTime).toBe(0)
    expect(after.isPlaying).toBe(true)
  })

  it('prevSong 在第一首时保持不变（不越界）', () => {
    const s = useRadioStore.getState()
    s.setQueue([SONG, SONG2])
    s.setCurrentSong(SONG)
    s.prevSong()
    expect(useRadioStore.getState().currentSong?.id).toBe('ne_1')
  })

  // 矩阵场景 9（N-3）：nextSong fetch 在途时点 prev → 防重入拒绝，用户选择不被慢返回覆盖
  it('场景9：isTransitioning=true 时点 prevSong → 拒绝，状态不变', () => {
    const s = useRadioStore.getState()
    s.setQueue([SONG, SONG2])
    s.setCurrentSong(SONG2)
    s.setIsTransitioning(true)
    s.setIsPlaying(false)

    s.prevSong()

    const after = useRadioStore.getState()
    expect(after.currentSong?.id).toBe('ne_2')  // 未切歌
    expect(after.isPlaying).toBe(false)
    expect(after.pendingResume).toBe(false)
  })

  // 矩阵场景 10（R-3）：DJ 说话中点上一首 → source='auto' 走 R3 挂起（对齐 nextSong）
  it('场景10：DJ 说话中点 prevSong → 切歌 + R3 挂起 pendingResume', () => {
    const s = useRadioStore.getState()
    s.setQueue([SONG, SONG2])
    s.setCurrentSong(SONG2)
    s.setSpeaking(true)
    s.setIsPlaying(false)

    s.prevSong()

    const after = useRadioStore.getState()
    expect(after.currentSong?.id).toBe('ne_1')  // 阶段 1 切歌生效
    expect(after.isPlaying).toBe(false)          // R3 挂起，不在说话窗口置位
    expect(after.pendingResume).toBe(true)
  })
})

// ─── 边界：setIsPlaying 仍可调用（私有但保留供旧测试 / 紧急修复）───

describe('F4 setIsPlaying 私有 setter（仍可用，但仅限 store 内部 + 旧测试）', () => {
  beforeEach(() => resetStore())

  it('直接调 setIsPlaying(false) 应仍生效', () => {
    const s = useRadioStore.getState()
    s.setIsPlaying(true)
    s.setIsPlaying(false)
    expect(useRadioStore.getState().isPlaying).toBe(false)
  })
})
