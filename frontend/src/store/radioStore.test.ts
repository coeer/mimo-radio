import { describe, it, expect, beforeEach } from 'vitest'
import { useRadioStore } from './radioStore'

describe('radioStore', () => {
  beforeEach(() => {
    useRadioStore.setState({
      currentSong: null,
      queue: [],
      isPlaying: false,
      sessionId: null,
      sessionToken: null,
      djEnabled: true,
      currentModel: 'mimo-v2.5',
      messages: [],
      isSpeaking: false,
      currentTime: 0,
      duration: 0,
      isCreating: false,
    })
  })

  it('should set current song', () => {
    const store = useRadioStore.getState()
    store.setCurrentSong({ id: '1', title: 'Test Song', artist: 'Artist', emotionTags: [], sceneTags: [] })
    expect(useRadioStore.getState().currentSong?.title).toBe('Test Song')
  })

  it('should set queue', () => {
    const store = useRadioStore.getState()
    const songs = [
      { id: '1', title: 'Song 1', artist: 'A', emotionTags: [], sceneTags: [] },
      { id: '2', title: 'Song 2', artist: 'B', emotionTags: [], sceneTags: [] },
    ]
    store.setQueue(songs)
    expect(useRadioStore.getState().queue).toHaveLength(2)
  })

  it('should toggle play state', () => {
    const store = useRadioStore.getState()
    expect(store.isPlaying).toBe(false)
    store.togglePlay()
    expect(useRadioStore.getState().isPlaying).toBe(true)
    store.togglePlay()
    expect(useRadioStore.getState().isPlaying).toBe(false)
  })

  it('should add messages', () => {
    const store = useRadioStore.getState()
    store.addMessage({ sender: 'user', text: 'hello', timestamp: 0 })
    store.addMessage({ sender: 'kimi', text: 'hi there', timestamp: 0 })
    expect(useRadioStore.getState().messages).toHaveLength(2)
    expect(useRadioStore.getState().messages[0].sender).toBe('user')
    expect(useRadioStore.getState().messages[1].sender).toBe('kimi')
  })

  it('should clear messages', () => {
    const store = useRadioStore.getState()
    store.addMessage({ sender: 'user', text: 'hello', timestamp: 0 })
    store.clearMessages()
    expect(useRadioStore.getState().messages).toHaveLength(0)
  })

  it('should update currentTime with number', () => {
    const store = useRadioStore.getState()
    store.setCurrentTime(120)
    expect(useRadioStore.getState().currentTime).toBe(120)
  })

  it('should update currentTime with function', () => {
    const store = useRadioStore.getState()
    store.setCurrentTime(100)
    store.setCurrentTime((prev) => prev + 50)
    expect(useRadioStore.getState().currentTime).toBe(150)
  })

  it('should set session token and id', () => {
    const store = useRadioStore.getState()
    store.setSessionId('sess-123')
    store.setSessionToken('sess-123.sig')
    expect(useRadioStore.getState().sessionId).toBe('sess-123')
    expect(useRadioStore.getState().sessionToken).toBe('sess-123.sig')
  })

  it('should set creating state', () => {
    const store = useRadioStore.getState()
    store.setIsCreating(true)
    expect(useRadioStore.getState().isCreating).toBe(true)
  })

  // ── 新增功能测试（全屏播放器 / 收藏 / 上一首 / 推荐字段）──

  it('应切换全屏播放器开关', () => {
    const store = useRadioStore.getState()
    expect(store.isFullscreenPlayer).toBe(false)
    store.setFullscreenPlayer(true)
    expect(useRadioStore.getState().isFullscreenPlayer).toBe(true)
    store.setFullscreenPlayer(false)
    expect(useRadioStore.getState().isFullscreenPlayer).toBe(false)
  })

  it('应收藏/取消收藏歌曲', () => {
    const store = useRadioStore.getState()
    expect(store.likedSongIds).toHaveLength(0)
    store.toggleLike('song-1')
    expect(useRadioStore.getState().likedSongIds).toEqual(['song-1'])
    expect(useRadioStore.getState().isLiked('song-1')).toBe(true)
    // 再次 toggle 取消
    store.toggleLike('song-1')
    expect(useRadioStore.getState().likedSongIds).toHaveLength(0)
    expect(useRadioStore.getState().isLiked('song-1')).toBe(false)
  })

  it('isLiked 对未收藏的歌应返回 false', () => {
    const store = useRadioStore.getState()
    expect(store.isLiked('not-exist')).toBe(false)
  })

  it('prevSong 应切到队列上一首并重置时间', () => {
    const store = useRadioStore.getState()
    const songs = [
      { id: '1', title: 'A', artist: 'X', emotionTags: [], sceneTags: [] },
      { id: '2', title: 'B', artist: 'Y', emotionTags: [], sceneTags: [] },
      { id: '3', title: 'C', artist: 'Z', emotionTags: [], sceneTags: [] },
    ]
    store.setQueue(songs)
    store.setCurrentSong(songs[2]) // 当前第3首
    store.setCurrentTime(50)
    store.prevSong()
    const s = useRadioStore.getState()
    expect(s.currentSong?.id).toBe('2')
    expect(s.currentTime).toBe(0)
    expect(s.isPlaying).toBe(true)
  })

  it('prevSong 在第一首时应保持不变（不越界）', () => {
    const store = useRadioStore.getState()
    const songs = [
      { id: '1', title: 'A', artist: 'X', emotionTags: [], sceneTags: [] },
      { id: '2', title: 'B', artist: 'Y', emotionTags: [], sceneTags: [] },
    ]
    store.setQueue(songs)
    store.setCurrentSong(songs[0])
    store.prevSong()
    expect(useRadioStore.getState().currentSong?.id).toBe('1')
  })

  it('ChatMessage 应支持 recommendations 字段', () => {
    const store = useRadioStore.getState()
    store.addMessage({
      sender: 'kimi',
      text: '给你找了五首',
      timestamp: 0,
      recommendations: [
        { title: 'If', artist: 'Bread', selected: true },
        { title: 'Nude', artist: 'Radiohead' },
      ],
    })
    const msg = useRadioStore.getState().messages[0]
    expect(msg.recommendations).toHaveLength(2)
    expect(msg.recommendations?.[0].title).toBe('If')
    expect(msg.recommendations?.[0].selected).toBe(true)
  })

  // ── TTS 状态字段测试 ──

  it('应设置 AI 语音当前时长', () => {
    const store = useRadioStore.getState()
    store.setAiCurrentTime(3.5)
    expect(useRadioStore.getState().aiCurrentTime).toBe(3.5)
  })

  it('应设置 AI 语音总时长', () => {
    const store = useRadioStore.getState()
    store.setAiVoiceDuration(12.8)
    expect(useRadioStore.getState().aiVoiceDuration).toBe(12.8)
  })

  it('Speaking 状态应可切换（供 TTS onEnd 驱动）', () => {
    const store = useRadioStore.getState()
    store.setSpeaking(true)
    expect(useRadioStore.getState().isSpeaking).toBe(true)
    store.setSpeaking(false)
    expect(useRadioStore.getState().isSpeaking).toBe(false)
  })
})

// ── P2 防重入：updateLastKimiMessage 精确替换 + addMessage 外部 id ──

describe('updateLastKimiMessage (P2 精确替换)', () => {
  beforeEach(() => {
    useRadioStore.setState({ messages: [] })
  })

  it('传 id 时按 id 精确匹配，只改目标消息', () => {
    const store = useRadioStore.getState()
    store.addMessage({ id: 'm1', sender: 'kimi', text: 'msg1', timestamp: 0 })
    store.addMessage({ id: 'm2', sender: 'kimi', text: 'msg2', timestamp: 0 })
    store.addMessage({ id: 'm3', sender: 'user', text: 'hi', timestamp: 0 })

    store.updateLastKimiMessage('updated', { id: 'm1' })
    const msgs = useRadioStore.getState().messages
    expect(msgs[0].text).toBe('updated')  // m1 changed
    expect(msgs[1].text).toBe('msg2')      // m2 unchanged
  })

  it('不传 id 时走兜底：更新最后一条 kimi', () => {
    const store = useRadioStore.getState()
    store.addMessage({ sender: 'kimi', text: 'first', timestamp: 0 })
    store.addMessage({ sender: 'user', text: 'hi', timestamp: 0 })
    store.addMessage({ sender: 'kimi', text: 'last', timestamp: 0 })

    store.updateLastKimiMessage('replaced')
    const msgs = useRadioStore.getState().messages
    expect(msgs[0].text).toBe('first')     // unchanged
    expect(msgs[2].text).toBe('replaced')   // last kimi updated
  })

  it('id 不存在时静默跳过（不抛错，不改任何消息）', () => {
    const store = useRadioStore.getState()
    store.addMessage({ sender: 'kimi', text: 'only', timestamp: 0 })

    store.updateLastKimiMessage('should not appear', { id: 'nonexistent' })
    const msgs = useRadioStore.getState().messages
    expect(msgs[0].text).toBe('only')
    expect(msgs.length).toBe(1)
  })
})

describe('addMessage (P2 外部 id)', () => {
  beforeEach(() => {
    useRadioStore.setState({ messages: [] })
  })

  it('传 id 时使用外部 id', () => {
    useRadioStore.getState().addMessage({ id: 'ext-1', sender: 'kimi', text: 'hello', timestamp: 0 })
    expect(useRadioStore.getState().messages[0].id).toBe('ext-1')
  })

  it('不传 id 时自动生成 uuid', () => {
    useRadioStore.getState().addMessage({ sender: 'kimi', text: 'hello', timestamp: 0 })
    const id = useRadioStore.getState().messages[0].id
    expect(id).toBeTruthy()
    expect(id.length).toBeGreaterThan(10)
  })
})
