'use client'

import React, { memo, useRef, useState, useCallback } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'

interface InputAreaProps {
  inputText: string
  setInputText: (text: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

const InputArea = memo(function InputArea({ inputText, setInputText, onSend, onKeyDown }: InputAreaProps) {
  const isCreating = useRadioStore((state) => state.isCreating)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const handleMicClick = useCallback(async () => {
    // 正在录音 → 停止并识别
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }

    // 清除上次错误
    setMicError(null)

    // Feature check
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError('当前环境不支持语音输入')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setMicError('浏览器不支持录音')
      return
    }

    // 开始录音
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setRecording(false)
        if (blob.size === 0) return

        // 上传 ASR 识别
        setTranscribing(true)
        try {
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1]
            try {
              // 从 MediaRecorder 的 mimeType 提取真实容器格式
              const rawType = mr.mimeType || 'audio/webm'
              const container = rawType.split(';')[0].split('/')[1] || 'webm'
              const format = container === 'mp4' ? 'm4a' : container
              const res = await fetch(`${API_BASE}/api/v1/dj/asr`, {
                method: 'POST',
                headers: { ...getApiHeaders(false), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  audio: base64,
                  format,
                  language: 'auto',
                }),
              })
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const data = await res.json()
              if (data.text) {
                setInputText(data.text)
                // 不自动发送，让用户确认/编辑
              }
            } catch (err) {
              logger.warn('[ASR] transcribe failed', {
                error: err instanceof Error ? err.message : String(err),
              })
            } finally {
              setTranscribing(false)
            }
          }
          reader.readAsDataURL(blob)
        } catch (err) {
          logger.warn('[ASR] read blob failed', {
            error: err instanceof Error ? err.message : String(err),
          })
          setTranscribing(false)
        }
      }

      mr.start()
      setRecording(true)
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? '麦克风权限被拒绝'
        : '麦克风不可用'
      setMicError(msg)
      logger.warn('[Mic] getUserMedia failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [recording, setInputText])

  return (
    <div>
      <div className="chat-input flex items-center gap-2 px-4 py-2.5">
        <button
          aria-label={recording ? '停止录音' : '语音输入'}
          onClick={handleMicClick}
          disabled={transcribing}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-warm)] disabled:opacity-50 ${
            recording ? 'bg-[var(--color-error-bg)] text-[var(--color-error)]' : 'text-[var(--fg-muted)]'
          }`}
        >
          {transcribing ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className={`w-4 h-4 ${recording ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={transcribing ? '识别中...' : recording ? '正在录音，再点一次结束' : isCreating ? '正在准备电台...' : 'Say something to the DJ...'}
          aria-label="Chat with DJ"
          disabled={isCreating}
          maxLength={500}
          className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 rounded-md px-2 py-1 text-[var(--fg-primary)] font-[var(--font-body)] focus-visible:ring-[var(--accent-warm)]"
        />
        <button
          aria-label="Send message"
          onClick={onSend}
          disabled={!inputText.trim() || isCreating}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-105 active:scale-95 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-warm)] bg-[var(--surface-bg-subtle)]"
        >
          {isCreating ? (
            <svg className="w-4 h-4 animate-spin text-[var(--fg-primary)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[var(--fg-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
      {micError && (
        <div className="text-center text-[10px] text-[var(--color-error)] mt-1 font-[var(--font-mono)]">
          {micError}
        </div>
      )}
      <div className="flex items-center justify-center gap-4 mt-2">
        <span className="text-[10px] text-[var(--fg-dim)] font-[var(--font-mono)]">Space 播放/暂停</span>
        <span className="text-[10px] text-[var(--fg-dim)] font-[var(--font-mono)]">&larr;&rarr; 快进/快退</span>
      </div>
    </div>
  )
})

export default InputArea
