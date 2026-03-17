import { useEffect, useRef } from 'react'
import { useActivityFeed } from '../lib/hooks.js'
import type { McEvent } from '../lib/supabase.js'

// ─── Event rendering ──────────────────────────────────────────────────────────

const STREAM_COLORS: Record<string, string> = {
  tool:       '#38bdf8',
  assistant:  '#a78bfa',
  lifecycle:  '#34d399',
}

const PHASE_ICONS: Record<string, string> = {
  start:    '→',
  result:   '✓',
  error:    '✗',
  end:      '■',
  fallback: '⟳',
  delta:    '…',
  final:    '◆',
}

function statusColor(phase: string | null, stream: string): string {
  if (phase === 'error') return '#f87171'
  if (phase === 'result' || phase === 'end') return '#34d399'
  return STREAM_COLORS[stream] ?? '#64748b'
}

function formatCost(cost: number | null): string {
  if (cost == null) return ''
  if (cost < 0.001) return `$${(cost * 1000).toFixed(3)}m`
  return `$${cost.toFixed(4)}`
}

function EventRow({ event }: { event: McEvent }) {
  const time = new Date(event.created_at).toLocaleTimeString('en-US', { hour12: false })
  const phase = event.phase ?? ''
  const icon = PHASE_ICONS[phase] ?? '·'
  const color = statusColor(event.phase, event.stream)
  const agentShort = event.agent_id?.slice(0, 8) ?? event.session_key?.slice(0, 8) ?? '?'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '68px 80px 52px 180px 1fr',
      alignItems: 'baseline',
      padding: '2px 16px',
      fontSize: '11.5px',
      lineHeight: '20px',
      borderBottom: '1px solid #0f0f17',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {/* Time */}
      <span style={{ color: '#475569' }}>{time}</span>

      {/* Agent */}
      <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agentShort}
      </span>

      {/* Stream + icon */}
      <span style={{ color }}>
        {icon} {event.stream}
      </span>

      {/* Tool name or phase label */}
      <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.tool_name
          ? event.tool_name
          : event.phase
            ? event.phase
            : ''}
      </span>

      {/* Metadata: duration, model, run */}
      <span style={{ color: '#334155', fontSize: '10.5px', display: 'flex', gap: 12 }}>
        {event.duration_ms != null && (
          <span style={{ color: event.duration_ms > 5000 ? '#f59e0b' : '#475569' }}>
            {event.duration_ms}ms
          </span>
        )}
        {event.model && <span>{event.model.split('-').slice(-2).join('-')}</span>}
        {event.run_id && <span style={{ color: '#1e293b' }}>{event.run_id.slice(0, 8)}</span>}
      </span>
    </div>
  )
}

// ─── Feed header ──────────────────────────────────────────────────────────────

function FeedHeader() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '68px 80px 52px 180px 1fr',
      padding: '6px 16px',
      fontSize: '10px',
      letterSpacing: '0.08em',
      color: '#334155',
      textTransform: 'uppercase',
      borderBottom: '1px solid #1e1e2e',
      background: '#0a0a0f',
      position: 'sticky',
      top: 0,
    }}>
      <span>Time</span>
      <span>Agent</span>
      <span>Stream</span>
      <span>Event</span>
      <span>Details</span>
    </div>
  )
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const { events, loading } = useActivityFeed()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new events, unless user has scrolled up
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FeedHeader />
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '20px 16px', color: '#475569', fontSize: '12px' }}>
            Loading activity…
          </div>
        )}
        {!loading && events.length === 0 && (
          <div style={{ padding: '20px 16px', color: '#334155', fontSize: '12px' }}>
            No activity yet. Waiting for agents…
          </div>
        )}
        {events.map((e) => <EventRow key={e.id} event={e} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
