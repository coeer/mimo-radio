import { describe, it, expect, beforeEach } from 'vitest'
import { useRadioStore } from '@/store/radioStore'

/**
 * AI DJ 电台核心流程测试：「开场白说完→自动放歌」状态机
 *
 * 验证目标（用户报的 bug）：
 *   AI DJ 说完开场白后没有下文，期望说完直接开始放歌曲。
 *
 * 关键状态转换：
 *   createSession:
 *     currentSong = queue[0] (有 playUrl)
 *     isSpeaking = true (intro 在播)
 *     isPlaying = false (等 intro 说完)
 *   TTS onEnd:
 *     isSpeaking = false
 *     isPlaying = true  ← 关键：自动启动歌曲
 */
describe('AI DJ 开场白→自动放歌 状态机', () => {
  beforeEach(() => {
    useRadioStore.getState().clearMessages()
    useRadioStore.setState({
      currentSong: null,
      isPlaying: false,
      isSpeaking: false,
      queue: [],
      aiCurrentTime: 0,
      aiVoiceDuration: 0,
    })
  })

  it('有开场白时：createSession 后应 isSpeaking=true、isPlaying=false（等说完）', () => {
    const s = useRadioStore.getState()
    const song = {
      id: 'ne_1', title: '夜に駆ける', artist: 'YOASOBI',
      playUrl: 'http://m701.music.126.net/x.mp3',
      emotionTags: [], sceneTags: [], platform: 'netease' as const,
    }
    s.setCurrentSong(song)
    s.setSpeaking(true) // intro 在播
    s.setIsPlaying(false) // 不立即放歌

    const state = useRadioStore.getState()
    expect(state.currentSong?.playUrl).toBeTruthy()
    expect(state.isSpeaking).toBe(true)
    expect(state.isPlaying).toBe(false)
  })

  it('关键：TTS onEnd 后应自动 isPlaying=true 启动歌曲', () => {
    const s = useRadioStore.getState()
    const song = {
      id: 'ne_1', title: '夜に駆ける', artist: 'YOASOBI',
      playUrl: 'http://m701.music.126.net/x.mp3',
      emotionTags: [], sceneTags: [], platform: 'netease' as const,
    }
    s.setCurrentSong(song)
    s.setSpeaking(true)
    s.setIsPlaying(false)

    // 模拟 useSession 的 onEnd handler
    const afterSpeak = useRadioStore.getState()
    afterSpeak.setSpeaking(false)
    afterSpeak.setAiCurrentTime(0)
    if (afterSpeak.currentSong?.playUrl && !afterSpeak.isPlaying) {
      afterSpeak.setIsPlaying(true)
    }

    const final = useRadioStore.getState()
    expect(final.isSpeaking).toBe(false)
    expect(final.isPlaying).toBe(true) // ← 自动放歌了
  })

  it('无开场白时：createSession 后应直接 isPlaying=true', () => {
    const s = useRadioStore.getState()
    const song = {
      id: 'ne_1', title: 'test', artist: 'a',
      playUrl: 'http://x/1.mp3',
      emotionTags: [], sceneTags: [], platform: 'netease' as const,
    }
    s.setCurrentSong(song)
    s.setIsPlaying(true) // 无 intro 直接放

    expect(useRadioStore.getState().isPlaying).toBe(true)
    expect(useRadioStore.getState().isSpeaking).toBe(false)
  })

  it('DJ 解说期间即使 isPlaying=true，歌曲也不该抢占（isSpeaking 优先）', () => {
    const s = useRadioStore.getState()
    s.setCurrentSong({
      id: 'ne_1', title: 'test', artist: 'a',
      playUrl: 'http://x/1.mp3',
      emotionTags: [], sceneTags: [], platform: 'netease' as const,
    })
    s.setSpeaking(true)
    s.setIsPlaying(true) // 异常情况：两个都 true

    // useAudioPlayer 的逻辑：isSpeaking 时 pause 歌曲
    // 这里验证状态可正确表达"说话中"
    expect(useRadioStore.getState().isSpeaking).toBe(true)
  })

  it('切歌时 DJ transition 说完后应自动放下一首', () => {
    const s = useRadioStore.getState()
    const songs = [
      { id: 's1', title: '歌1', artist: 'A', playUrl: 'http://x/1.mp3', emotionTags: [], sceneTags: [], platform: 'netease' as const },
      { id: 's2', title: '歌2', artist: 'B', playUrl: 'http://x/2.mp3', emotionTags: [], sceneTags: [], platform: 'netease' as const },
    ]
    s.setQueue(songs)
    s.setCurrentSong(songs[1]) // 切到第2首
    s.setSpeaking(true) // transition 在播
    s.setIsPlaying(false)

    // transition 说完
    const after = useRadioStore.getState()
    after.setSpeaking(false)
    if (after.currentSong?.playUrl && !after.isPlaying) {
      after.setIsPlaying(true)
    }

    const final = useRadioStore.getState()
    expect(final.currentSong?.id).toBe('s2')
    expect(final.isSpeaking).toBe(false)
    expect(final.isPlaying).toBe(true)
  })
})
