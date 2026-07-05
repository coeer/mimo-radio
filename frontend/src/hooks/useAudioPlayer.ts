'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { useAudioAnalyser } from './useAudioAnalyser'
import { logger } from '@/lib/logger'
import { API_BASE, getApiHeaders } from '@/lib/config'

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const { connect: connectAnalyser, getFrequencyData, resume: resumeAnalyser } = useAudioAnalyser()

  const currentSong = useRadioStore((state) => state.currentSong)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const isSpeaking = useRadioStore((state) => state.isSpeaking)
  const nextSong = useRadioStore((state) => state.nextSong)
  const volume = useRadioStore((state) => state.volume)

  // Effect 1: Audio element setup + 连 analyser
  useEffect(() => {
    if (!currentSong) return
    let cancelled = false
    const setCurrentTime = useRadioStore.getState().setCurrentTime
    const setDuration = useRadioStore.getState().setDuration

    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const audio = audioRef.current
    audio.volume = volume

    const setupAudio = (playUrl: string) => {
      const onEnded = () => { nextSong().catch((e) => logger.error('nextSong failed', { source: 'useAudioPlayer.onEnded', error: e instanceof Error ? e.message : String(e) })) }
      const onTimeUpdate = () => setCurrentTime(audio.currentTime)
      const onLoadedMetadata = () => setDuration(audio.duration)
      audio.addEventListener('ended', onEnded)
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('loadedmetadata', onLoadedMetadata)
      if (audio.src !== playUrl) {
        audio.src = playUrl
        audio.load()
      }
      connectAnalyser(audio)
      return () => {
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      }
    }

    // 有 playUrl 直接用；无则（QQ 延迟获取）调接口拿
    if (currentSong.playUrl) {
      return setupAudio(currentSong.playUrl)
    } else {
      // QQ 音源：点播时通过 webbridge 桥接获取真实 URL
      ;(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/v1/music-source/play-url`, {
            method: 'POST',
            headers: { ...getApiHeaders(false), 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId: currentSong.id }),
          })
          if (!res.ok) {
            logger.warn('[Audio] 获取QQ播放URL失败', { songId: currentSong.id })
            // 提示并自动跳过，避免 UI 卡在 playing 但无声的状态
            const s = useRadioStore.getState()
            s.addMessage({
              sender: 'kimi',
              text: '该曲目暂无法播放，已自动跳过',
              timestamp: 0,
            })
            nextSong().catch((e) => logger.error('Auto-skip nextSong failed', { error: e instanceof Error ? e.message : String(e) }))
            return
          }
          const data = await res.json()
          if (!cancelled && data.url) {
            // 更新 store 的 playUrl
            useRadioStore.getState().setCurrentSong({ ...currentSong, playUrl: data.url })
            setupAudio(data.url)
          }
        } catch (err) {
          logger.error('[Audio] play-url 接口失败', { error: err instanceof Error ? err.message : String(err) })
        }
      })()
      return () => { cancelled = true }
    }
  }, [currentSong, nextSong, connectAnalyser])

  // Effect 2: Play/pause control
  // 关键：DJ 解说期间（isSpeaking）暂停歌曲，解说结束后自动恢复播放
  // P8 修复：暂停逻辑与 playUrl 解耦——DJ 说话时无论 playUrl 是否就绪都暂停 audio
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // DJ 正在说话 → 暂停歌曲（无论 playUrl 是否已就绪，避免双音频冲突）
    if (isSpeaking) {
      audio.pause()
      return
    }

    // playUrl 未就绪时不播放（QQ 延迟获取场景），但已暂停的 audio 不受影响
    if (!currentSong?.playUrl) return

    if (isPlaying) {
      // 播放时恢复 AudioContext（autoplay 策略）
      resumeAnalyser()
      audio.play().catch((err) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          const s = useRadioStore.getState()
          s.addMessage({
            sender: 'kimi',
            text: '请点击页面以启用音频播放',
            timestamp: 0,
          })
          s.setIsPlaying(false)
        }
      })
    } else {
      audio.pause()
    }
  }, [isPlaying, isSpeaking, currentSong, resumeAnalyser])

  // Effect 3: 音量变化时同步到 audio 元素（跨组件控制，KimiCard 音量条驱动）
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Cleanup on unmount
  useEffect(() => {
    const timers = timerRefs.current
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
  }, [])

  const addTimer = useCallback((callback: () => void, delay: number) => {
    const t: ReturnType<typeof setTimeout> = setTimeout(() => {
      callback()
      timerRefs.current.delete(t)
    }, delay)
    timerRefs.current.add(t)
    return t
  }, [])

  return { audioRef, handleSeek, addTimer, getFrequencyData }
}
