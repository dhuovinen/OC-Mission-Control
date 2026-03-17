-- Mission Control for OpenClaw
-- Schema: comprehensive model, all sensitive fields nullable
-- Populated selectively by bridge-filter.json

-- ─────────────────────────────────────────
-- 1. Bridge instances
-- ─────────────────────────────────────────
create table if not exists mc_bridge (
  id                 text primary key,          -- e.g. hostname + pid
  gateway_url        text not null,
  version            text,
  started_at         timestamptz not null default now(),
  last_heartbeat_at  timestamptz,
  status             text not null default 'connected'
                       check (status in ('connected','disconnected','error'))
);

-- ─────────────────────────────────────────
-- 2. Sessions
-- ─────────────────────────────────────────
create table if not exists mc_sessions (
  session_key    text primary key,
  session_id     text,
  agent_id       text,
  label          text,                          -- filtered
  spawned_by     text,                          -- parent session_key
  spawn_depth    integer default 0,
  subagent_role  text check (subagent_role in ('orchestrator','leaf','standalone')),
  channel        text,
  account_id     text,
  status         text not null default 'active'
                   check (status in ('active','idle','ended')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);

create index if not exists mc_sessions_agent_id on mc_sessions(agent_id);
create index if not exists mc_sessions_spawned_by on mc_sessions(spawned_by);

-- ─────────────────────────────────────────
-- 3. Runs  (one row per agent invocation / runId)
-- ─────────────────────────────────────────
create table if not exists mc_runs (
  run_id          text primary key,
  session_key     text references mc_sessions(session_key) on delete cascade,
  agent_id        text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  status          text not null default 'running'
                    check (status in ('running','completed','aborted','error')),
  model           text,
  provider        text,
  input_tokens    integer,
  output_tokens   integer,
  cache_read_tokens  integer,
  cache_write_tokens integer,
  total_cost      numeric(12,8),
  tool_call_count integer default 0
);

create index if not exists mc_runs_session_key on mc_runs(session_key);
create index if not exists mc_runs_started_at  on mc_runs(started_at desc);

-- ─────────────────────────────────────────
-- 4. Event stream  (activity feed source of truth)
-- ─────────────────────────────────────────
create table if not exists mc_events (
  id              bigserial primary key,
  run_id          text,
  session_key     text,
  agent_id        text,
  seq             integer,
  stream          text not null,    -- 'assistant' | 'tool' | 'lifecycle'
  phase           text,             -- 'start' | 'result' | 'end' | 'error' | 'fallback' | 'delta' | 'final'
  tool_name       text,             -- filtered: name only, no args
  tool_call_id    text,
  duration_ms     integer,          -- populated on tool result/end
  model           text,
  provider        text,
  -- optional content fields (off by default in filter config)
  assistant_text  text,
  tool_args_json  jsonb,
  tool_result_json jsonb,
  -- timestamps
  event_ts        bigint,           -- original Gateway timestamp (ms epoch)
  created_at      timestamptz not null default now()
);

create index if not exists mc_events_run_id      on mc_events(run_id);
create index if not exists mc_events_session_key on mc_events(session_key);
create index if not exists mc_events_created_at  on mc_events(created_at desc);
create index if not exists mc_events_stream      on mc_events(stream, phase);

-- ─────────────────────────────────────────
-- 5. Tool calls  (denormalised, one row per tool invocation)
-- ─────────────────────────────────────────
create table if not exists mc_tool_calls (
  id            bigserial primary key,
  run_id        text,
  session_key   text,
  tool_call_id  text unique,
  tool_name     text not null,
  status        text check (status in ('running','success','error')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_ms   integer,
  -- optional content (off by default)
  args_json     jsonb,
  result_json   jsonb
);

create index if not exists mc_tool_calls_run_id     on mc_tool_calls(run_id);
create index if not exists mc_tool_calls_tool_name  on mc_tool_calls(tool_name);
create index if not exists mc_tool_calls_started_at on mc_tool_calls(started_at desc);

-- ─────────────────────────────────────────
-- 6. Task completions  (subagent / cron outcomes)
-- ─────────────────────────────────────────
create table if not exists mc_task_completions (
  id                bigserial primary key,
  run_id            text,
  session_key       text,
  child_session_key text,
  source            text check (source in ('subagent','cron')),
  task_label        text,
  status            text check (status in ('ok','timeout','error','unknown')),
  status_label      text,
  stats_line        text,            -- e.g. "4 tools, 2.1s, $0.007" — safe metadata
  result_text       text,            -- filtered by default
  completed_at      timestamptz not null default now()
);

create index if not exists mc_task_completions_session_key on mc_task_completions(session_key);
create index if not exists mc_task_completions_completed_at on mc_task_completions(completed_at desc);

-- ─────────────────────────────────────────
-- 7. Usage snapshots  (polled from Gateway usage endpoint)
-- ─────────────────────────────────────────
create table if not exists mc_usage_snapshots (
  id               bigserial primary key,
  session_key      text,
  agent_id         text,
  snapshot_at      timestamptz not null default now(),
  input_tokens     integer,
  output_tokens    integer,
  cache_read_tokens  integer,
  cache_write_tokens integer,
  total_cost       numeric(12,8),
  input_cost       numeric(12,8),
  output_cost      numeric(12,8),
  cache_read_cost  numeric(12,8),
  cache_write_cost numeric(12,8),
  total_messages   integer,
  tool_calls       integer,
  errors           integer,
  model            text,
  provider         text
);

create index if not exists mc_usage_snapshots_session_key on mc_usage_snapshots(session_key);
create index if not exists mc_usage_snapshots_snapshot_at on mc_usage_snapshots(snapshot_at desc);

-- ─────────────────────────────────────────
-- 8. Daily rollups  (pre-aggregated, upserted by bridge)
-- ─────────────────────────────────────────
create table if not exists mc_daily_usage (
  date            date not null,
  agent_id        text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  total_cost      numeric(12,8) not null default 0,
  message_count   integer not null default 0,
  tool_call_count integer not null default 0,
  run_count       integer not null default 0,
  primary key (date, agent_id)
);

-- ─────────────────────────────────────────
-- 9. Bridge heartbeat log
-- ─────────────────────────────────────────
create table if not exists mc_bridge_heartbeat (
  id                  bigserial primary key,
  bridge_id           text not null,
  ts                  timestamptz not null default now(),
  gateway_connected   boolean not null default true,
  events_buffered     integer default 0,
  events_sent_today   integer default 0
);

create index if not exists mc_bridge_heartbeat_bridge_id on mc_bridge_heartbeat(bridge_id);
create index if not exists mc_bridge_heartbeat_ts        on mc_bridge_heartbeat(ts desc);

-- ─────────────────────────────────────────
-- Realtime: enable for live activity feed
-- ─────────────────────────────────────────
alter publication supabase_realtime add table mc_events;
alter publication supabase_realtime add table mc_runs;
alter publication supabase_realtime add table mc_sessions;
alter publication supabase_realtime add table mc_bridge_heartbeat;
