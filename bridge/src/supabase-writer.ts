import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FilteredEvent, FilteredToolCall, RunUpdate } from './filter.js'
import type { SessionEntry, UsageEntry } from './types.js'

export class SupabaseWriter {
  private client: SupabaseClient
  private bridgeId: string
  private eventsSentToday = 0

  constructor(url: string, anonKey: string, bridgeId: string) {
    this.client = createClient(url, anonKey)
    this.bridgeId = bridgeId
  }

  // ─── Bridge registration ───────────────────────────────────────────────────

  async registerBridge(gatewayUrl: string, version?: string): Promise<void> {
    const { error } = await this.client.from('mc_bridge').upsert({
      id: this.bridgeId,
      gateway_url: gatewayUrl,
      version,
      started_at: new Date().toISOString(),
      status: 'connected',
      last_heartbeat_at: new Date().toISOString(),
    })
    if (error) console.error('[supabase] bridge register error:', error.message)
  }

  async setBridgeStatus(status: 'connected' | 'disconnected' | 'error'): Promise<void> {
    const { error } = await this.client
      .from('mc_bridge')
      .update({ status, last_heartbeat_at: new Date().toISOString() })
      .eq('id', this.bridgeId)
    if (error) console.error('[supabase] bridge status error:', error.message)
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────────

  async writeHeartbeat(gatewayConnected: boolean, eventsBuffered: number): Promise<void> {
    const { error } = await this.client.from('mc_bridge_heartbeat').insert({
      bridge_id: this.bridgeId,
      ts: new Date().toISOString(),
      gateway_connected: gatewayConnected,
      events_buffered: eventsBuffered,
      events_sent_today: this.eventsSentToday,
    })
    if (error) console.error('[supabase] heartbeat error:', error.message)

    await this.client
      .from('mc_bridge')
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq('id', this.bridgeId)
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  async writeEvent(event: FilteredEvent): Promise<void> {
    const { error } = await this.client.from('mc_events').insert(event)
    if (error) {
      console.error('[supabase] event write error:', error.message)
    } else {
      this.eventsSentToday++
    }
  }

  // ─── Tool calls (upsert — start then result update same row) ──────────────

  async upsertToolCall(tc: FilteredToolCall): Promise<void> {
    if (!tc.tool_call_id) {
      // No id to upsert on — insert fresh
      const { error } = await this.client.from('mc_tool_calls').insert({
        run_id: tc.run_id,
        session_key: tc.session_key,
        tool_name: tc.tool_name,
        status: tc.status,
        args_json: tc.args_json,
        result_json: tc.result_json,
      })
      if (error) console.error('[supabase] tool_call insert error:', error.message)
      return
    }

    if (tc.status === 'running') {
      const { error } = await this.client.from('mc_tool_calls').upsert({
        run_id: tc.run_id,
        session_key: tc.session_key,
        tool_call_id: tc.tool_call_id,
        tool_name: tc.tool_name,
        status: 'running',
        args_json: tc.args_json,
        started_at: new Date().toISOString(),
      })
      if (error) console.error('[supabase] tool_call upsert error:', error.message)
    } else {
      const now = new Date().toISOString()
      const { error } = await this.client
        .from('mc_tool_calls')
        .update({
          status: tc.status,
          ended_at: now,
          result_json: tc.result_json,
        })
        .eq('tool_call_id', tc.tool_call_id)
      if (error) console.error('[supabase] tool_call update error:', error.message)
    }
  }

  // ─── Runs ──────────────────────────────────────────────────────────────────

  async ensureRun(runId: string, sessionKey: string | null, agentId?: string): Promise<void> {
    const { error } = await this.client.from('mc_runs').upsert(
      {
        run_id: runId,
        session_key: sessionKey,
        agent_id: agentId,
        status: 'running',
        started_at: new Date().toISOString(),
      },
      { onConflict: 'run_id', ignoreDuplicates: true },
    )
    if (error) console.error('[supabase] run upsert error:', error.message)
  }

  async updateRun(update: RunUpdate): Promise<void> {
    const { error } = await this.client
      .from('mc_runs')
      .update({
        status: update.status,
        ended_at: new Date().toISOString(),
        model: update.model,
        provider: update.provider,
        input_tokens: update.input_tokens,
        output_tokens: update.output_tokens,
        cache_read_tokens: update.cache_read_tokens,
        cache_write_tokens: update.cache_write_tokens,
        total_cost: update.total_cost,
      })
      .eq('run_id', update.run_id)
    if (error) console.error('[supabase] run update error:', error.message)
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async upsertSession(s: SessionEntry, cfg: { includeLabel: boolean; includeChannel: boolean }): Promise<void> {
    const { error } = await this.client.from('mc_sessions').upsert(
      {
        session_key: s.sessionKey,
        session_id: s.sessionId,
        agent_id: s.agentId,
        label: cfg.includeLabel ? s.label : null,
        spawned_by: s.spawnedBy,
        spawn_depth: s.spawnDepth ?? 0,
        subagent_role: s.subagentRole ?? 'standalone',
        channel: cfg.includeChannel ? s.channel : null,
        account_id: s.accountId,
        updated_at: s.updatedAt ?? new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'session_key' },
    )
    if (error) console.error('[supabase] session upsert error:', error.message)
  }

  // ─── Task completions ──────────────────────────────────────────────────────

  async writeTaskCompletion(params: {
    runId: string
    sessionKey: string | null
    childSessionKey: string
    source: string
    taskLabel: string
    status: string
    statusLabel: string
    statsLine?: string | null
    resultText?: string | null
  }): Promise<void> {
    const { error } = await this.client.from('mc_task_completions').insert({
      run_id: params.runId,
      session_key: params.sessionKey,
      child_session_key: params.childSessionKey,
      source: params.source,
      task_label: params.taskLabel,
      status: params.status,
      status_label: params.statusLabel,
      stats_line: params.statsLine ?? null,
      result_text: params.resultText ?? null,
      completed_at: new Date().toISOString(),
    })
    if (error) console.error('[supabase] task_completion error:', error.message)
  }

  // ─── Usage snapshots ───────────────────────────────────────────────────────

  async writeUsageSnapshot(u: UsageEntry): Promise<void> {
    const { error } = await this.client.from('mc_usage_snapshots').insert({
      session_key: u.sessionKey,
      agent_id: u.agentId,
      snapshot_at: new Date().toISOString(),
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      cache_read_tokens: u.cacheReadTokens,
      cache_write_tokens: u.cacheWriteTokens,
      total_cost: u.totalCost,
      input_cost: u.inputCost,
      output_cost: u.outputCost,
      cache_read_cost: u.cacheReadCost,
      cache_write_cost: u.cacheWriteCost,
      total_messages: u.totalMessages,
      tool_calls: u.toolCalls,
      errors: u.errors,
      model: u.model,
      provider: u.provider,
    })
    if (error) console.error('[supabase] usage_snapshot error:', error.message)
  }

  async upsertDailyUsage(date: string, agentId: string, entry: {
    inputTokens: number
    outputTokens: number
    totalCost: number
    messageCount: number
    toolCallCount: number
    runCount: number
  }): Promise<void> {
    const { error } = await this.client.from('mc_daily_usage').upsert({
      date,
      agent_id: agentId,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      total_cost: entry.totalCost,
      message_count: entry.messageCount,
      tool_call_count: entry.toolCallCount,
      run_count: entry.runCount,
    })
    if (error) console.error('[supabase] daily_usage upsert error:', error.message)
  }
}
