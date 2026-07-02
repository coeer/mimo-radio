import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node-ssdp', () => {
  class MockClient {
    on = vi.fn()
    search = vi.fn()
    stop = vi.fn()
  }
  return { Client: MockClient }
})

import { upnpService } from './upnp'

describe('upnpService', () => {
  beforeEach(() => {
    // Reset internal device list
    ;(upnpService as any).devices = []
  })

  describe('getDevices', () => {
    it('should return empty array initially', () => {
      expect(upnpService.getDevices()).toEqual([])
    })
  })

  describe('play', () => {
    it('should return success: false (not implemented)', async () => {
      const result = await upnpService.play('http://192.168.1.1/desc.xml', 'http://example.com/song.mp3')
      expect(result).toEqual({ success: false })
    })
  })

  describe('discover', () => {
    it('should resolve with devices after timeout', async () => {
      const devices = await upnpService.discover(100)
      expect(devices).toBeInstanceOf(Array)
    })
  })
})
