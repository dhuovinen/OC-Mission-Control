import { useBridgeHealth } from '../lib/hooks.js'

const css: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '8px 20px',
    background: '#0d0d14',
    borderBottom: '1px solid #1e1e2e',
    fontSize: '11px',
    letterSpacing: '0.04em',
    userSelect: 'none',
  },
  title: {
    fontWeight: 700,
    fontSize: '13px',
    color: '#a78bfa',
    letterSpacing: '0.08em',
  },
  dot: (connected: boolean, stale: boolean): React.CSSProperties => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: stale ? '#f59e0b' : connected ? '#34d399' : '#f87171',
    boxShadow: stale ? '0 0 6px #f59e0b' : connected ? '0 0 6px #34d399' : 'none',
    display: 'inline-block',
    marginRight: 5,
  }),
  label: { color: '#64748b' },
  value: { color: '#cbd5e1' },
}

export function StatusBar() {
  const { heartbeat, stale } = useBridgeHealth()

  const connected = heartbeat?.gateway_connected ?? false
  const lastSeen = heartbeat?.ts
    ? new Date(heartbeat.ts).toLocaleTimeString()
    : '—'

  return (
    <div style={css.bar}>
      <span style={css.title}>MISSION CONTROL</span>

      <span>
        <span style={css.dot(connected, stale)} />
        <span style={css.label}>Bridge </span>
        <span style={css.value}>
          {stale ? 'stale' : connected ? 'connected' : 'disconnected'}
        </span>
      </span>

      <span>
        <span style={css.label}>Last heartbeat </span>
        <span style={css.value}>{lastSeen}</span>
      </span>

      {heartbeat && (
        <span>
          <span style={css.label}>Events today </span>
          <span style={css.value}>{heartbeat.events_sent_today.toLocaleString()}</span>
        </span>
      )}
    </div>
  )
}
