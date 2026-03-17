import type { FilterConfig, GatewayAgentEvent } from './types.js'

// ─── Filtered event ready for Supabase ────────────────────────────────────────

export interface FilteredEvent {
  run_id: string
  session_key: string | null
  seq: number
  stream: string
  phase: string | null
  tool_name: string | null
  tool_call_id: string | null
  duration_ms: number | null
  model: string | null
  provider: string | null
  assistant_text: string | null
  tool_args_json: Record<string, unknown> | null
  tool_result_json: Record<string, unknown> | null
  event_ts: number
}

export interface FilteredToolCall {
  run_id: string
  session_key: string | null
  tool_call_id: string | null
  tool_name: string
  status: 'running' | 'success' | 'error'
  args_json: Record<string, unknown> | null
  result_json: Record<string, unknown> | null
}

export interface RunUpdate {
  run_id: string
  session_key: string | null
  status: 'completed' | 'aborted' | 'error'
  model: string | null
  provider: string | null
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  total_cost: number | null
}

export type FilterResult =
  | { type: 'event'; event: FilteredEvent; toolCall?: FilteredToolCall }
  | { type: 'run_update'; update: RunUpdate }
  | { type: 'drop' }

export function applyFilter(raw: GatewayAgentEvent, cfg: FilterConfig): FilterResult {
  const { stream, data } = raw
  const sessionKey = raw.sessionKey ?? null

  // ── Tool events ─────────────────────────────────────────────────────────────
  if (stream === 'tool') {
    if (!cfg.streams.tool.enabled) return { type: 'drop' }

    const toolName = (data.name as string | undefined) ?? null
    const toolCallId = (data.toolCallId as string | undefined) ?? null
    const phase = (data.phase as string | undefined) ?? null

    // Denylist check
    if (toolName && cfg.toolDenylist.includes(toolName)) return { type: 'drop' }

    // Allowlist check (null = allow all)
    if (cfg.toolAllowlist !== null && toolName && !cfg.toolAllowlist.includes(toolName)) {
      return { type: 'drop' }
    }

    const durationMs =
      cfg.streams.tool.includeDurationMs && typeof data.durationMs === 'number'
        ? data.durationMs
        : null

    const event: FilteredEvent = {
      run_id: raw.runId,
      session_key: sessionKey,
      seq: raw.seq,
      stream: 'tool',
      phase,
      tool_name: cfg.streams.tool.includeToolName ? toolName : null,
      tool_call_id: toolCallId,
      duration_ms: durationMs,
      model: null,
      provider: null,
      assistant_text: null,
      tool_args_json: cfg.streams.tool.includeArgs && data.args
        ? (data.args as Record<string, unknown>)
        : null,
      tool_result_json: cfg.streams.tool.includeResult && data.result
        ? (data.result as Record<string, unknown>)
        : null,
      event_ts: raw.ts,
    }

    let toolCall: FilteredToolCall | undefined
    if (phase === 'start' && toolName) {
      toolCall = {
        run_id: raw.runId,
        session_key: sessionKey,
        tool_call_id: toolCallId,
        tool_name: toolName,
        status: 'running',
        args_json: cfg.streams.tool.includeArgs && data.args
          ? (data.args as Record<string, unknown>)
          : null,
        result_json: null,
      }
    } else if (phase === 'result' && toolName) {
      toolCall = {
        run_id: raw.runId,
        session_key: sessionKey,
        tool_call_id: toolCallId,
        tool_name: toolName,
        status: 'success',
        args_json: null,
        result_json: cfg.streams.tool.includeResult && data.result
          ? (data.result as Record<string, unknown>)
          : null,
      }
    }

    return { type: 'event', event, toolCall }
  }

  // ── Assistant events ─────────────────────────────────────────────────────────
  if (stream === 'assistant') {
    if (!cfg.streams.assistant.enabled) return { type: 'drop' }

    const phase = (data.phase as string | undefined) ?? (data.type as string | undefined) ?? null
    const isDelta = phase === 'delta'
    const isFinal = phase === 'final'

    if (isDelta && !cfg.streams.assistant.includeDeltas) return { type: 'drop' }

    const text = cfg.streams.assistant.includeFinalText && isFinal && typeof data.text === 'string'
      ? data.text
      : null

    const event: FilteredEvent = {
      run_id: raw.runId,
      session_key: sessionKey,
      seq: raw.seq,
      stream: 'assistant',
      phase,
      tool_name: null,
      tool_call_id: null,
      duration_ms: null,
      model: null,
      provider: null,
      assistant_text: text,
      tool_args_json: null,
      tool_result_json: null,
      event_ts: raw.ts,
    }

    return { type: 'event', event }
  }

  // ── Lifecycle events ─────────────────────────────────────────────────────────
  if (stream === 'lifecycle') {
    if (!cfg.streams.lifecycle.enabled) return { type: 'drop' }

    const phase = (data.phase as string | undefined) ?? null

    if (phase === 'end') {
      const usage = data.usage as Record<string, unknown> | undefined
      return {
        type: 'run_update',
        update: {
          run_id: raw.runId,
          session_key: sessionKey,
          status: 'completed',
          model: cfg.streams.lifecycle.includeModel
            ? (data.model as string | null) ?? null
            : null,
          provider: cfg.streams.lifecycle.includeProvider
            ? (data.provider as string | null) ?? null
            : null,
          input_tokens: cfg.streams.lifecycle.includeUsage && usage
            ? (usage.input as number | null) ?? null
            : null,
          output_tokens: cfg.streams.lifecycle.includeUsage && usage
            ? (usage.output as number | null) ?? null
            : null,
          cache_read_tokens: cfg.streams.lifecycle.includeUsage && usage
            ? (usage.cacheRead as number | null) ?? null
            : null,
          cache_write_tokens: cfg.streams.lifecycle.includeUsage && usage
            ? (usage.cacheWrite as number | null) ?? null
            : null,
          total_cost: cfg.streams.lifecycle.includeUsage && usage
            ? (usage.totalCost as number | null) ?? null
            : null,
        },
      }
    }

    const event: FilteredEvent = {
      run_id: raw.runId,
      session_key: sessionKey,
      seq: raw.seq,
      stream: 'lifecycle',
      phase,
      tool_name: null,
      tool_call_id: null,
      duration_ms: null,
      model: cfg.streams.lifecycle.includeModel
        ? (data.model as string | null) ?? null
        : null,
      provider: cfg.streams.lifecycle.includeProvider
        ? (data.provider as string | null) ?? null
        : null,
      assistant_text: null,
      tool_args_json: null,
      tool_result_json: null,
      event_ts: raw.ts,
    }

    return { type: 'event', event }
  }

  return { type: 'drop' }
}
