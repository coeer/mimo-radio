import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SourceSwitcher from './SourceSwitcher'

// mock fetch
const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

describe('SourceSwitcher', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    // 默认返回网易云当前
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        current: 'netease',
        sources: [
          { id: 'netease', label: '网易云', isCurrent: true },
          { id: 'qq', label: 'QQ音乐', isCurrent: false },
        ],
      }),
    })
  })

  it('应显示两个音源选项', async () => {
    render(<SourceSwitcher />)
    await waitFor(() => {
      expect(screen.getByText('网易云')).toBeInTheDocument()
      expect(screen.getByText('QQ音乐')).toBeInTheDocument()
    })
  })

  it('应显示 SOURCE 标签', async () => {
    render(<SourceSwitcher />)
    await waitFor(() => {
      expect(screen.getByText('SOURCE')).toBeInTheDocument()
    })
  })

  it('点击 QQ 音乐应触发切换请求', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ current: 'netease', sources: [
        { id: 'netease', label: '网易云', isCurrent: true },
        { id: 'qq', label: 'QQ音乐', isCurrent: false },
      ]}),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ switched: 'qq' }),
    })
    // mock reload 避免测试崩溃
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true })

    render(<SourceSwitcher />)
    await waitFor(() => screen.getByText('QQ音乐'))
    fireEvent.click(screen.getByText('QQ音乐'))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/music-source/switch'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('切换失败应显示错误', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ current: 'netease', sources: [
        { id: 'netease', label: '网易云', isCurrent: true },
        { id: 'qq', label: 'QQ音乐', isCurrent: false },
      ]}),
    }).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'QQ 音源未就绪' }),
    })
    render(<SourceSwitcher />)
    await waitFor(() => screen.getByText('QQ音乐'))
    fireEvent.click(screen.getByText('QQ音乐'))
    await waitFor(() => {
      expect(screen.getByText(/未就绪|QQ/)).toBeInTheDocument()
    })
  })
})
