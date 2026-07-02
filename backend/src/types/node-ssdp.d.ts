declare module 'node-ssdp' {
  export class Client {
    on(event: 'response', listener: (headers: Record<string, string>, statusCode: number, rinfo: { address: string }) => void): void
    search(serviceType: string): void
    stop(): void
  }
}
