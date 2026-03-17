import WebSocket from 'ws'
import type { GatewayAgentEvent, GatewayFrame } from './types.js'

export interface GatewayClientOptions {
  url: string
  token?: string
  password?: string
  onEvent: (event: GatewayAgentEvent) => void
  onFrame: (frame: GatewayFrame) => void
  onConnect: () => void
  onDisconnect: () => void
}

const RECONNECT_DELAYS = [2_000, 4_000, 8_000, 16_000, 30_000]

export class GatewayClient {
  private opts: GatewayClientOptions
  private ws: WebSocket | null = null
  private stopped = false
  private reconnectAttempt = 0
  private connected = false

  constructor(opts: GatewayClientOptions) {
    this.opts = opts
  }

  get isConnected(): boolean {
    return this.connected
  }

  connect(): void {
    if (this.stopped) return
    this._open()
  }

  stop(): void {
    this.stopped = true
    this.ws?.close()
  }

  private _open(): void {
    const url = new URL(this.opts.url)
    if (this.opts.token) url.searchParams.set('token', this.opts.token)

    console.log(`[gateway] connecting to ${this.opts.url}`)
    const ws = new WebSocket(url.toString(), {
      headers: this.opts.password
        ? { Authorization: `Basic ${Buffer.from(`:${this.opts.password}`).toString('base64')}` }
        : undefined,
    })
    this.ws = ws

    ws.on('open', () => {
      console.log('[gateway] connected')
      this.connected = true
      this.reconnectAttempt = 0

      // Identify as Mission Control observer
      ws.send(JSON.stringify({
        event: 'hello',
        payload: { clientName: 'mission-control-bridge', mode: 'observe' },
      }))

      this.opts.onConnect()
    })

    ws.on('message', (raw) => {
      let frame: GatewayFrame
      try {
        frame = JSON.parse(raw.toString()) as GatewayFrame
      } catch {
        return
      }

      this.opts.onFrame(frame)

      // Agent events are the primary stream
      if (frame.event === 'agent' && frame.payload) {
        const payload = frame.payload as GatewayAgentEvent
        this.opts.onEvent(payload)
      }
    })

    ws.on('close', (code) => {
      this.connected = false
      console.log(`[gateway] disconnected (code ${code})`)
      this.opts.onDisconnect()
      if (!this.stopped) this._scheduleReconnect()
    })

    ws.on('error', (err) => {
      console.error('[gateway] websocket error:', err.message)
    })
  }

  private _scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt++
    console.log(`[gateway] reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)
    setTimeout(() => this._open(), delay)
  }
}
