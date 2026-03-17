import { readFileSync, watchFile } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostname } from 'node:os'
import type { FilterConfig, GatewayAgentEvent, GatewayFrame, SessionEntry } from './types.js'
import { applyFilter } from './filter.js'
import { GatewayClient } from './gateway-client.js'
import { SupabaseWriter } from './supabase-writer.js'

// ─── Config ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv(): { gatewayUrl: string; supabaseUrl: string; supabaseKey: string } {
  return {
    gatewayUrl:  process.env.OPENCLAW_GATEWAY_URL  ?? 'ws://127.0.0.1:18789',
    supabaseUrl: process.env.SUPABASE_URL           ?? '',
    supabaseKey: process.env.SUPABASE_ANON_KEY      ?? '',
  }
}

function loadFilter(path: string): FilterConfig {
  const raw = readFileSync(path, 'utf-8')
  // Strip inline comments before parsing
  const stripped = raw.replace(/\/\/[^\n]*/g, '')
  return JSON.parse(stripped) as FilterConfig
}

// ─── Buffer (events received while Supabase writes are in-flight) ─────────────

class EventBuffer {
  private queue: GatewayAgentEvent[] = []

  push(event: GatewayAgentEvent): void {
    this.queue.push(event)
  }

  drain(): GatewayAgentEvent[] {
    const items = this.queue.splice(0)
    return items
  }

  get size(): number {
    return this.queue.length
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const env = loadEnv()

  if (!env.supabaseUrl || !env.supabaseKey) {
    console.error('[bridge] SUPABASE_URL and SUPABASE_ANON_KEY must be set')
    process.exit(1)
  }

  const filterPath = resolve(__dirname, '..', 'bridge-filter.json')
  let filter = loadFilter(filterPath)
  console.log('[bridge] filter config loaded (version:', filter.version, ')')

  // Hot-reload filter config on file change
  watchFile(filterPath, { interval: 2000 }, () => {
    try {
      filter = loadFilter(filterPath)
      console.log('[bridge] filter config reloaded')
    } catch (err) {
      console.error('[bridge] filter reload failed:', (err as Error).message)
    }
  })

  const bridgeId = `${hostname()}-${process.pid}`
  const writer = new SupabaseWriter(env.supabaseUrl, env.supabaseKey, bridgeId)
  const buffer = new EventBuffer()

  await writer.registerBridge(env.gatewayUrl)

  // ── Process a single agent event ──────────────────────────────────────────
  async function handleEvent(event: GatewayAgentEvent): Promise<void> {
    const result = applyFilter(event, filter)

    if (result.type === 'drop') return

    // Ensure run row exists
    await writer.ensureRun(event.runId, event.sessionKey ?? null)

    if (result.type === 'event') {
      await writer.writeEvent(result.event)
      if (result.toolCall) {
        await writer.upsertToolCall(result.toolCall)
      }
    }

    if (result.type === 'run_update') {
      await writer.updateRun(result.update)
    }
  }

  // ── Handle task completion internal events ────────────────────────────────
  async function handleFrame(frame: GatewayFrame): Promise<void> {
    if (frame.event !== 'agent') return

    const payload = frame.payload as GatewayAgentEvent
    const data = payload?.data

    if (!data || typeof data !== 'object') return

    const innerEvents = (data as Record<string, unknown>).internalEvents
    if (!Array.isArray(innerEvents)) return

    for (const ie of innerEvents) {
      if ((ie as Record<string, unknown>).type !== 'task_completion') continue
      if (!filter.taskCompletions.enabled) continue

      await writer.writeTaskCompletion({
        runId: payload.runId,
        sessionKey: payload.sessionKey ?? null,
        childSessionKey: (ie as Record<string, unknown>).childSessionKey as string,
        source: (ie as Record<string, unknown>).source as string,
        taskLabel: (ie as Record<string, unknown>).taskLabel as string,
        status: (ie as Record<string, unknown>).status as string,
        statusLabel: (ie as Record<string, unknown>).statusLabel as string,
        statsLine: filter.taskCompletions.includeStatsLine
          ? ((ie as Record<string, unknown>).statsLine as string | null) ?? null
          : null,
        resultText: filter.taskCompletions.includeResult
          ? ((ie as Record<string, unknown>).result as string | null) ?? null
          : null,
      })
    }
  }

  // ── Drain buffer loop ─────────────────────────────────────────────────────
  async function drainBuffer(): Promise<void> {
    const events = buffer.drain()
    for (const event of events) {
      await handleEvent(event)
    }
  }
  setInterval(() => { void drainBuffer() }, 500)

  // ── Session sync loop ─────────────────────────────────────────────────────
  let sessionSyncTimer: ReturnType<typeof setInterval> | null = null

  function startSessionSync(): void {
    if (!filter.sessions.enabled) return
    if (sessionSyncTimer) clearInterval(sessionSyncTimer)
    sessionSyncTimer = setInterval(async () => {
      // sessions_list is called via the gateway; for now we log intent
      // Full implementation requires RPC call on the gateway WebSocket
      console.log('[bridge] session sync tick (implement sessions_list RPC)')
    }, filter.sessions.syncIntervalSeconds * 1000)
  }

  // ── Heartbeat loop ────────────────────────────────────────────────────────
  setInterval(async () => {
    await writer.writeHeartbeat(gateway.isConnected, buffer.size)
    console.log(`[bridge] heartbeat | connected=${gateway.isConnected} buffered=${buffer.size}`)
  }, filter.heartbeat.intervalSeconds * 1000)

  // ── Gateway connection ─────────────────────────────────────────────────────
  const gateway = new GatewayClient({
    url: env.gatewayUrl,
    token: process.env.OPENCLAW_TOKEN,
    password: process.env.OPENCLAW_PASSWORD,

    onConnect: () => {
      void writer.setBridgeStatus('connected')
      startSessionSync()
    },

    onDisconnect: () => {
      void writer.setBridgeStatus('disconnected')
    },

    onEvent: (event) => {
      buffer.push(event)
    },

    onFrame: (frame) => {
      void handleFrame(frame)
    },
  })

  gateway.connect()

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(): Promise<void> {
    console.log('[bridge] shutting down...')
    gateway.stop()
    await writer.setBridgeStatus('disconnected')
    process.exit(0)
  }

  process.on('SIGINT', () => { void shutdown() })
  process.on('SIGTERM', () => { void shutdown() })

  console.log(`[bridge] started | id=${bridgeId} | gateway=${env.gatewayUrl}`)
}

main().catch((err) => {
  console.error('[bridge] fatal:', err)
  process.exit(1)
})
