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
      if (s.currentSong && !s.isPlaying) {
        s.setIsPlaying(true)
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
      s.setIsCreating(true)
      // 立即推一条 pending 占位消息，给用户"AI 正在思考"的实时反馈
      s.addMessage({ sender: 'kimi', text: '', timestamp: 0, isPending: true })
      try {
        const res = await fetch(`${API_BASE}/api/v1/radio/${sid}/chat`, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ text, model: s.currentModel, session_token: s.sessionToken }),
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`HTTP ${res.status}: ${errText}`)
        }
        const data = await res.json()
        if (data.reply) {
          // 原地替换 pending 消息为真实回复（保持消息 id，避免重复/跳动）
          s.updateLastKimiMessage(data.reply, {
            recommendations: data.recommendations || undefined,
            isPending: false,
          })
          // 合成播放 AI 回复语音；DJ 解说期间不放新歌（见下方 new_song 处理）
          if (djEnabled) {
            speakAIMessage(data.reply)
          }
        }
        if (data.new_song) {
          const song = data.new_song
          s.setQueue([...s.queue, song])
          s.setCurrentSong(song)
          s.setDuration(song.duration || 180)
          // 关键：DJ 解说优先。不立即播放新歌，避免与正在播的 TTS 语音音轨冲突。
          // - 有 DJ 解说：speakAIMessage 的 onEnd（resumePlaybackAfterSpeak）会自动放新歌
          // - 无 DJ 解说（djEnabled=false 或无 reply）：直接播放
          if (!djEnabled || !data.reply) {
            s.setIsPlaying(true)
          }
        }
        return true
      } catch (err) {
        logger.error('[Chat] sendChatMessage failed', { error: err instanceof Error ? err.message : String(err) })
        // pending 占位消息替换为错误提示
        s.updateLastKimiMessage('网络有点卡，稍后再聊。', { isPending: false })
        return false
      } finally {
        s.setIsCreating(false)
      }
    },
    [speakAIMessage, djEnabled]
  )

  return { createSession, sendChatMessage, speakAIMessage, stopTTS }
}
