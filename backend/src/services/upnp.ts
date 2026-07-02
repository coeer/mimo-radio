import { Client } from 'node-ssdp'

interface UPnPDevice {
  name: string
  location: string
  usn: string
}

class UPnPService {
  private devices: UPnPDevice[] = []

  async discover(timeout: number = 5000): Promise<UPnPDevice[]> {
    return new Promise((resolve) => {
      const client = new Client()
      const found = new Map<string, UPnPDevice>()

      client.on('response', (headers: Record<string, string>, _statusCode: number, rinfo: { address: string }) => {
        const location = headers.LOCATION || headers.location
        if (location && !found.has(location)) {
          found.set(location, {
            name: headers['X-ModelName'] || rinfo.address || 'Unknown Device',
            location,
            usn: headers.USN || '',
          })
        }
      })

      client.search('urn:schemas-upnp-org:device:MediaRenderer:1')

      setTimeout(() => {
        client.stop()
        this.devices = Array.from(found.values())
        resolve(this.devices)
      }, timeout)
    })
  }

  getDevices(): UPnPDevice[] {
    return this.devices
  }

  async play(_deviceLocation: string, _mediaUrl: string): Promise<{ success: boolean }> {
    // TODO: implement actual UPNP SetAVTransportURI + Play via upnp-device-client
    return { success: false }
  }
}

export const upnpService = new UPnPService()
