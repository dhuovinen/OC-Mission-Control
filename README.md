# Mission Control for OpenClaw

Web-based monitoring dashboard for OpenClaw multi-agent activity.

## Architecture

```
OpenClaw Gateway (local)
        │
        ▼
  bridge/          ← local process, connects to Gateway WS, filters + writes to Supabase
        │
        ▼
  Supabase         ← PostgreSQL + Realtime
        │
        ▼
  ui/              ← Vite + React, hosted on Vercel or Supabase hosting
```

## Quick Start

### 1. Supabase

Create a project at supabase.com, then run the migration:

```bash
psql $DATABASE_URL < supabase/migrations/001_initial_schema.sql
```

Enable Realtime for `mc_events`, `mc_runs`, `mc_sessions`, `mc_bridge_heartbeat`
in the Supabase dashboard → Database → Replication.

### 2. Bridge agent

```bash
cd bridge
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, and optionally OPENCLAW_TOKEN/PASSWORD
npm install
npm run dev        # development (hot-reload)
npm run build && npm start   # production
```

Edit `bridge-filter.json` to control what data leaves your machine.
The bridge hot-reloads the filter — no restart needed.

### 3. UI

```bash
cd ui
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev        # local dev server at http://localhost:5173
npm run build      # production build → dist/
```

Deploy `ui/dist/` to Vercel, Netlify, or Supabase hosting.

## Filter config

`bridge/bridge-filter.json` controls what is sent to Supabase:

| Field | Default | Notes |
|---|---|---|
| `streams.tool.includeToolName` | `true` | Safe — just the function name |
| `streams.tool.includeArgs` | `false` | May contain file paths, queries |
| `streams.tool.includeResult` | `false` | May contain file contents |
| `streams.assistant.includeFinalText` | `false` | Full message text |
| `streams.lifecycle.includeUsage` | `true` | Token counts + cost — safe metadata |
| `taskCompletions.includeStatsLine` | `true` | e.g. "4 tools, 2.1s, $0.007" |

The filter is hot-reloaded on change — no restart required.

## Troubleshooting

### Bridge exits immediately with "SUPABASE_URL and SUPABASE_ANON_KEY must be set"

`tsx` (and plain `node`) do not automatically load `.env` files — they only see
variables that are exported in the current shell session. The bridge scripts
pass `--env-file=.env` to handle this, but the flag requires **Node 20 or
later**.

Check your Node version:

```bash
node --version   # must be v20.0.0 or higher
```

If you are on Node 18 or earlier, upgrade Node or export the variables manually
before running:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-key
npm run dev
```

Also confirm that `bridge/.env` exists (not just `.env.example`):

```bash
ls -la bridge/.env
```

---

## Project structure

```
.
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   ← full schema, run once
├── bridge/
│   ├── src/
│   │   ├── index.ts                 ← entry point, main loop
│   │   ├── gateway-client.ts        ← WebSocket connection + reconnect
│   │   ├── filter.ts                ← filter engine (reads bridge-filter.json)
│   │   ├── supabase-writer.ts       ← all Supabase writes
│   │   └── types.ts                 ← shared types
│   ├── bridge-filter.json           ← edit this to control data flow
│   └── .env.example
└── ui/
    ├── src/
    │   ├── components/
    │   │   ├── StatusBar.tsx         ← bridge health indicator
    │   │   ├── AgentPanel.tsx        ← left panel: agents + sessions
    │   │   └── ActivityFeed.tsx      ← main live event feed
    │   ├── lib/
    │   │   ├── supabase.ts           ← client + row types
    │   │   └── hooks.ts              ← useActivityFeed, useSessions, etc.
    │   ├── App.tsx
    │   └── main.tsx
    └── .env.example
```
