'use client'

import { useCallback, useRef } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'
import { useTTS } from './useTTS'

export function useSession() {
  const djEnabled = useRadioStore((state) => state.djEnabled)
  const { speak, setHandlers, stop: stopTTS } = useTTS()
  // 防止重复注册 handlers
  const handlersRegistered = useRef(false)
  // P2 防重入：用户连发消息时，abort 上一个 chat fetch
  const chatAbortRef = useRef<AbortController | null>(null)
  if (!handlersRegistered.current) {
    /**
     * DJ 解说结束（无论正常结束还是出错）后，自动续播当前歌曲。
     *
     * 不依赖 currentSong.playUrl 是否存在：QQ 等音源的 playUrl 是
     * 由 useAudioPlayer 在 isPlaying=true 后异步获取的，所以这里只要
     * 有 currentSong 就该触发播放，否则会卡在"说完不续播"。
     */
    const resumePlaybackAfterSpeak = () => {
      const s = useRadioStore.getState()
      s.setSpeaking(false)
      s.setAiCurrentTime(0)
      // F4（2026-07-22）：唯一消费 pendingResume 的出口——setSpeaking(false) 后
      // playRequest('play','dj') 自动消化 pendingResume 标记（isSpeaking 已 false，
      // 但若之前有 pendingResume=true，应恢复播放）。
      // 注意：playRequest 在 isSpeaking=true 时挂起 play 请求为 pendingResume，
      // 但此函数已经在 setSpeaking(false) 之后调用，isSpeaking=false → 走普通路径。
      // 若用户已在 speaking 中点了推荐卡（R1 用户优先，isPlaying=true），
      // playRequest('play','dj') R5 幂等 → no-op，不会覆盖用户意图。
      if (s.currentSong) {
        s.playRequest('play', 'dj')
      }
    }
    setHandlers({
      onStart: () => {
        const s = useRadioStore.getState()
        s.setSpeaking(true)
        s.setAiCurrentTime(0)
      },
      onTimeUpdate: (cur, dur) => {
        const s = useRadioStore.getState()
        s.setAiCurrentTime(cur)
        if (dur > 0) s.setAiVoiceDuration(dur)
      },
      onEnd: () => {
        // 关键：DJ 说完后自动开始播放当前歌曲（intro→歌曲的衔接）
        resumePlaybackAfterSpeak()
      },
      onError: () => {
        // TTS 合成/播放失败也要续播，否则开场白说完（或出错）后永远卡住不续播
        resumePlaybackAfterSpeak()
      },
    })
    handlersRegistered.current = true
  }

  /**
   * 真实合成并播放 AI 语音解说。
   * TTS 的 onEnd 会把 isSpeaking 置 false（替代旧的假 setTimeout）。
   */
  const speakAIMessage = useCallback(
    async (text: string) => {
      if (!text?.trim()) return
      const s = useRadioStore.getState()
      s.setSpeaking(true)
      s.setAiCurrentTime(0)
      try {
        await speak(text)
      } catch (err) {
        logger.error('[TTS] speak failed', { error: err instanceof Error ? err.message : String(err) })
        s.setSpeaking(false)
      }
    },
    [speak]
  )

  const createSession = useCallback(
    async (text: string) => {
      const s = useRadioStore.getState()
      s.setIsCreating(true)
      s.clearMessages()
      try {
        const res = await fetch(`${API_BASE}/api/v1/radio/create`, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({
            mood: text,
            dj_enabled: djEnabled,
            user_input: text,
          }),
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`HTTP ${res.status}: ${errText}`)
        }
        const data = await res.json()
        s.setSessionToken(data.session_token || null)
        s.setSessionId(data.session_id || null)
        s.setQueue(data.queue || [])
        if (data.queue?.length > 0) {
          s.setCurrentSong(data.queue[0])
          s.setDuration(data.queue[0].duration || 180)
          // 关键：不立即 setIsPlaying(true)。
          // 浏览器自动播放策略会拦截无用户手势的 audio.play()，强行播放会失败。
          // 改为：第一首歌的播放由 page.tsx 的 unlockAudio（首次用户交互）触发。
          //   - 有开场白：unlock 先播 intro，intro 的 onEnd 自动放第一首歌
          //   - 无开场白：unlock 直接放第一首歌
        }
        if (data.intro_script) {
          // 开场白文字立即显示（即使语音被拦截，用户也能看到）
          s.addMessage({
            sender: 'kimi',
            text: data.intro_script,
            timestamp: 0,
          })
          if (djEnabled) {
            // 不立即播 TTS（会被自动播放策略拦截）。
            // 把开场白文本存到 store，由 page.tsx 的 unlockAudio 在首次用户交互时触发播报。
            s.setIntroScript(data.intro_script)
            s.setIntroPlayed(false)
          } else {
            // DJ 关闭：unlockAudio 会直接放第一首歌
          }
        }
        return true
      } catch (err) {
        logger.error('[Session] createSession failed', { error: err instanceof Error ? err.message : String(err) })
        s.addMessage({
          sender: 'kimi',
          text: '抱歉，电台启动失败了，请检查后端服务。',
          timestamp: 0,
        })
        return false
      } finally {
        s.setIsCreating(false)
      }
    },
    [djEnabled]
  )

  const sendChatMessage = useCallback(
    async (text: string) => {
      const s = useRadioStore.getState()
      const sid = s.sessionId
      if (!sid) return false

      // P2：abort 上一个 chat 请求（用户连发时旧请求直接取消，省 token + 避免回复错位）
      if (chatAbortRef.current) {
        chatAbortRef.current.abort()
      }
      const controller = new AbortController()
      chatAbortRef.current = controller

      s.setIsCreating(true)
      // P2：生成 pending id，传给 addMessage，后续按 id 精确替换（不再用"最后一条 kimi"模糊匹配）
      const pendingId = crypto.randomUUID()
      s.addMessage({ id: pendingId, sender: 'kimi', text: '', timestamp: 0, isPending: true })
      try {
        const res = await fetch(`${API_BASE}/api/v1/radio/${sid}/chat`, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ text, model: s.currentModel, session_token: s.sessionToken }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`HTTP ${res.status}: ${errText}`)
        }
        const data = await res.json()
        if (data.reply) {
          s.updateLastKimiMessage(data.reply, {
            id: pendingId,
            recommendations: data.recommendations || undefined,
            isPending: false,
          })
          if (djEnabled) {
            speakAIMessage(data.reply)
          }
        }
        if (data.new_song) {
          const song = data.new_song
          s.setQueue([...s.queue, song])
          s.setCurrentSong(song)
          s.setDuration(song.duration || 180)
          if (!djEnabled || !data.reply) {
            // F4（2026-07-22）：chat 推歌无 DJ 回复 → auto 来源
            s.playRequest('play', 'auto')
          }
        }
        return true
      } catch (err) {
        // P2：abort 不是错误，静默忽略（用户发了新消息，旧请求被取消是预期行为）
        if (err instanceof DOMException && err.name === 'AbortError') {
          return false
        }
        logger.error('[Chat] sendChatMessage failed', { error: err instanceof Error ? err.message : String(err) })
        s.updateLastKimiMessage('网络有点卡，稍后再聊。', { id: pendingId, isPending: false })
        return false
      } finally {
        s.setIsCreating(false)
      }
    },
    [speakAIMessage, djEnabled]
  )

  return { createSession, sendChatMessage, speakAIMessage, stopTTS }
}
