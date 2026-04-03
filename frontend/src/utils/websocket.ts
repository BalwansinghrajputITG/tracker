/**
 * WebSocket manager for React components.
 * Handles reconnection with exponential backoff.
 */
export class WSManager {
  private ws: WebSocket | null = null
  private url: string
  private token: string
  private onMessage: (data: any) => void
  private onConnect?: () => void
  private onDisconnect?: () => void
  private reconnectDelay = 1000
  private maxDelay = 30000
  private shouldReconnect = true

  constructor(url: string, token: string, onMessage: (data: any) => void, onConnect?: () => void, onDisconnect?: () => void) {
    this.url = url
    this.token = token
    this.onMessage = onMessage
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
  }

  connect() {
    const fullUrl = `${this.url}?token=${this.token}`
    this.ws = new WebSocket(fullUrl)

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
      this.onConnect?.()
    }

    this.ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data))
      } catch {}
    }

    this.ws.onclose = () => {
      this.onDisconnect?.()
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay)
      }
    }
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  disconnect() {
    this.shouldReconnect = false
    this.ws?.close()
  }
}
