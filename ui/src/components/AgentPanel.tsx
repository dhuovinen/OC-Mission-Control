import { useSessions, useActiveRuns } from '../lib/hooks.js'
import type { McSession } from '../lib/supabase.js'

const css: Record<string, React.CSSProperties> = {
  panel: {
    width: 220,
    flexShrink: 0,
    background: '#0d0d14',
    borderRight: '1px solid #1e1e2e',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  header: {
    padding: '10px 14px',
    fontSize: '10px',
    letterSpacing: '0.1em',
    color: '#475569',
    borderBottom: '1px solid #1e1e2e',
    textTransform: 'uppercase',
  },
  agentGroup: {
    padding: '8px 0',
    borderBottom: '1px solid #1e1e2e',
  },
  agentLabel: {
    padding: '4px 14px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#a78bfa',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sessionRow: {
    padding: '3px 14px 3px 24px',
    fontSize: '11px',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'default',
  },
  runningDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#34d399',
    boxShadow: '0 0 4px #34d399',
    flexShrink: 0,
  },
  idleDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#334155',
    flexShrink: 0,
  },
  roleBadge: (role: string): React.CSSProperties => ({
    fontSize: '9px',
    padding: '1px 4px',
    borderRadius: 3,
    background: role === 'orchestrator' ? '#312e81' : role === 'leaf' ? '#1e3a5f' : '#1e293b',
    color: role === 'orchestrator' ? '#a78bfa' : role === 'leaf' ? '#38bdf8' : '#64748b',
    letterSpacing: '0.05em',
  }),
}

function groupByAgent(sessions: McSession[]): Map<string, McSession[]> {
  const map = new Map<string, McSession[]>()
  for (const s of sessions) {
    const key = s.agent_id ?? 'unknown'
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  return map
}

export function AgentPanel() {
  const sessions = useSessions()
  const activeRuns = useActiveRuns()
  const runningSessionKeys = new Set(activeRuns.map((r) => r.session_key))
  const grouped = groupByAgent(sessions)

  return (
    <div style={css.panel}>
      <div style={css.header}>Agents ({grouped.size})</div>
      {[...grouped.entries()].map(([agentId, agentSessions]) => {
        const activeCount = agentSessions.filter((s) => runningSessionKeys.has(s.session_key)).length
        return (
          <div key={agentId} style={css.agentGroup}>
            <div style={css.agentLabel}>
              <span>{activeCount > 0 ? '▶' : '◼'}</span>
              <span>{agentId === 'unknown' ? 'Agent' : agentId.slice(0, 12)}</span>
              {activeCount > 0 && (
                <span style={{ ...css.roleBadge('leaf'), marginLeft: 'auto' }}>
                  {activeCount} running
                </span>
              )}
            </div>
            {agentSessions.map((s) => {
              const isRunning = runningSessionKeys.has(s.session_key)
              return (
                <div key={s.session_key} style={css.sessionRow}>
                  <span style={isRunning ? css.runningDot : css.idleDot} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.label ?? s.session_key.slice(0, 10)}
                  </span>
                  {s.subagent_role && s.subagent_role !== 'standalone' && (
                    <span style={css.roleBadge(s.subagent_role)}>{s.subagent_role}</span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
