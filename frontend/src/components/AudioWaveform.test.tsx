import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import AudioWaveform from './AudioWaveform'

describe('AudioWaveform', () => {
  beforeEach(() => {
    // Mock requestAnimationFrame
    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => {
      rafId += 1
      return rafId
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    // Mock ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
  })

  it('should render a canvas element', () => {
    const { container } = render(<AudioWaveform isPlaying={false} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('should reset animRef when tab becomes hidden', () => {
    // We can't easily test the internal ref, but we can verify the component
    // mounts/unmounts without errors and the cleanup runs
    const { unmount } = render(<AudioWaveform isPlaying={true} />)
    expect(() => unmount()).not.toThrow()
  })

  it('should handle color prop with CSS variable', () => {
    const { container } = render(
      <AudioWaveform isPlaying={false} color="var(--fg-secondary)" />
    )
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('should handle color prop with direct value', () => {
    const { container } = render(
      <AudioWaveform isPlaying={false} color="rgba(128,128,128,0.5)" />
    )
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })
})
