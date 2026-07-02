import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopBar from './TopBar'

describe('TopBar', () => {
  it('应显示头像和 Claudio 名称', () => {
    render(<TopBar />)
    expect(screen.getByText('Claudio')).toBeInTheDocument()
  })

  it('头像应是跳转 profile 的链接', () => {
    render(<TopBar />)
    const profileLink = screen.getByText('Claudio').closest('a')
    expect(profileLink?.getAttribute('href')).toBe('/profile')
  })

  it('应包含跳转设置的齿轮入口', () => {
    render(<TopBar />)
    const settingsLink = screen.getByLabelText('设置')
    expect(settingsLink.getAttribute('href')).toBe('/settings')
  })

  it('不应再显示主题切换胶囊（已移入设置页）', () => {
    render(<TopBar />)
    expect(screen.queryByText('DARK')).not.toBeInTheDocument()
    expect(screen.queryByText('LIGHT')).not.toBeInTheDocument()
  })
})
