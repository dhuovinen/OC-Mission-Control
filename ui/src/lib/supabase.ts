import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Row types ────────────────────────────────────────────────────────────────

export interface McEvent {
  id: number
  run_id: string | null
  session_key: string | null
  agent_id: string | null
  seq: number | null
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
  event_ts: number | null
  created_at: string
}

export interface McSession {
  session_key: string
  session_id: string | null
  agent_id: string | null
  label: string | null
  spawned_by: string | null
  spawn_depth: number
  subagent_role: 'orchestrator' | 'leaf' | 'standalone' | null
  channel: string | null
  status: 'active' | 'idle' | 'ended'
  created_at: string
  updated_at: string
  last_seen_at: string | null
}

export interface McRun {
  run_id: string
  session_key: string | null
  agent_id: string | null
  started_at: string
  ended_at: string | null
  status: 'running' | 'completed' | 'aborted' | 'error'
  model: string | null
  provider: string | null
  input_tokens: number | null
  output_tokens: number | null
  total_cost: number | null
  tool_call_count: number
}

export interface McBridgeHeartbeat {
  id: number
  bridge_id: string
  ts: string
  gateway_connected: boolean
  events_buffered: number
  events_sent_today: number
}
