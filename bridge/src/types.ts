// ─── Filter config (bridge-filter.json) ───────────────────────────────────────

export interface FilterConfig {
  version: number
  streams: {
    tool: {
      enabled: boolean
      includeToolName: boolean
      includeDurationMs: boolean
      includeArgs: boolean
      includeResult: boolean
      includePartialResult: boolean
    }
    assistant: {
      enabled: boolean
      includeDeltas: boolean
      includeFinalText: boolean
    }
    lifecycle: {
      enabled: boolean
      includeModel: boolean
      includeProvider: boolean
      includeUsage: boolean
    }
  }
  sessions: {
    enabled: boolean
    includeLabel: boolean
    includeChannel: boolean
    syncIntervalSeconds: number
  }
  usage: {
    enabled: boolean
    syncIntervalSeconds: number
    includeByModel: boolean
    includeByProvider: boolean
    includeDailyBreakdown: boolean
    includeToolBreakdown: boolean
  }
  taskCompletions: {
    enabled: boolean
    includeStatsLine: boolean
    includeResult: boolean
  }
  heartbeat: {
    intervalSeconds: number
  }
  toolAllowlist: string[] | null
  toolDenylist: string[]
}

// ─── Gateway event shapes (from OpenClaw protocol) ────────────────────────────

export interface GatewayAgentEvent {
  runId: string
  seq: number
  stream: 'assistant' | 'tool' | 'lifecycle'
  ts: number
  data: Record<string, unknown>
  sessionKey?: string
}

export interface GatewayFrame {
  event: string
  payload: unknown
}

export interface GatewayHelloPayload {
  sessionKey?: string
  snapshot?: Record<string, unknown>
}

export interface SessionEntry {
  sessionKey: string
  sessionId?: string
  agentId?: string
  label?: string
  spawnedBy?: string
  spawnDepth?: number
  subagentRole?: 'orchestrator' | 'leaf' | 'standalone'
  channel?: string
  accountId?: string
  updatedAt?: string
}

export interface UsageEntry {
  sessionKey: string
  agentId?: string
  updatedAt?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalCost?: number
  inputCost?: number
  outputCost?: number
  cacheReadCost?: number
  cacheWriteCost?: number
  totalMessages?: number
  toolCalls?: number
  errors?: number
  model?: string
  provider?: string
  dailyBreakdown?: DailyBreakdownEntry[]
}

export interface DailyBreakdownEntry {
  date: string
  inputTokens: number
  outputTokens: number
  totalCost: number
  messageCount: number
  toolCallCount: number
  runCount: number
}
