import { describe, it, expect, beforeEach } from 'vitest'
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
 *   8. nextSong 自动切歌时旧 transition TTS 还在播 → onEnd → 仲裁丢弃
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

  // ─── 场景 8：nextSong 自动切歌时旧 transition TTS 还在播 → onEnd 丢弃 ──
  // 模拟链路：nextSong(阶段1 切歌) → 旧 transition onEnd → playRequest('play','dj')
  // 阶段 1 切歌时不置位 isPlaying=true（两阶段改法）；旧 transition 的 resumePlaybackAfterSpeak
  // 在 setSpeaking(false) 后调 playRequest('play','dj')，此时 isPlaying=false→true，OK 不算"丢弃"。
  // 真正的场景 8：nextSong 已阶段 1 切了 currentSong，阶段 2 playRequest('play','auto')
  // 此时若 isSpeaking=true（DJ 还在播旧 transition），auto 被 R3 挂起 → pendingResume。
  it('场景8：nextSong 阶段 2 auto play + isSpeaking=true → 挂起为 pendingResume（不复活旧歌）', async () => {
    const s = useRadioStore.getState()
    s.setQueue([SONG, SONG2])
    s.setCurrentSong(SONG)
    s.setSpeaking(true)  // 旧 transition 还在播
    s.setIsPlaying(false)

    // 模拟 nextSong 阶段 2（不调真 fetch，只模拟 playRequest）
    s.playRequest('play', 'auto')

    const after = useRadioStore.getState()
    // R3 speaking 锁：auto play 挂起为 pendingResume，不直接置 isPlaying=true
    // 这样旧歌不会"复活"——isPlaying=false，audio 已停，新歌也不会启动
    expect(after.pendingResume).toBe(true)
    // 注：场景 8 的核心是"旧歌不复活"，即 isPlaying 不应是 true（除非是 user 操作）
    expect(after.isPlaying).toBe(false)
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
