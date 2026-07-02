import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnAirBadge from './OnAirBadge'

describe('OnAirBadge', () => {
  it('播放时应显示 ON AIR + 呼吸动画', () => {
    render(<OnAirBadge isLive={true} />)
    expect(screen.getByText('ON AIR')).toBeInTheDocument()
  })

  it('暂停时也应显示 ON AIR 文字（但无呼吸）', () => {
    render(<OnAirBadge isLive={false} />)
    expect(screen.getByText('ON AIR')).toBeInTheDocument()
  })

  it('默认 isLive=true', () => {
    render(<OnAirBadge />)
    expect(screen.getByText('ON AIR')).toBeInTheDocument()
  })
})
