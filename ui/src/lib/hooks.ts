import { useState, useEffect, useRef } from 'react'
import { supabase, type McEvent, type McSession, type McRun, type McBridgeHeartbeat } from './supabase.js'

const FEED_PAGE_SIZE = 200

// ─── Activity feed: live + historical ────────────────────────────────────────

export function useActivityFeed() {
  const [events, setEvents] = useState<McEvent[]>([])
  const [loading, setLoading] = useState(true)
  const seenIds = useRef(new Set<number>())

  useEffect(() => {
    let mounted = true

    // 1. Load recent history
    supabase
      .from('mc_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(FEED_PAGE_SIZE)
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) { console.error('[feed] initial load:', error.message); return }
        const rows = (data ?? []) as McEvent[]
        rows.forEach((r) => seenIds.current.add(r.id))
        setEvents(rows.reverse())  // chronological order
        setLoading(false)
      })

    // 2. Subscribe to new rows via Realtime
    const channel = supabase
      .channel('mc_events_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mc_events' }, (payload) => {
        const row = payload.new as McEvent
        if (seenIds.current.has(row.id)) return
        seenIds.current.add(row.id)
        setEvents((prev) => {
          const next = [...prev, row]
          return next.length > FEED_PAGE_SIZE ? next.slice(-FEED_PAGE_SIZE) : next
        })
      })
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [])

  return { events, loading }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function useSessions() {
  const [sessions, setSessions] = useState<McSession[]>([])

  useEffect(() => {
    let mounted = true

    supabase
      .from('mc_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (mounted) setSessions((data ?? []) as McSession[])
      })

    const channel = supabase
      .channel('mc_sessions_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mc_sessions' }, (payload) => {
        setSessions((prev) => {
          if (payload.eventType === 'DELETE') {
            return prev.filter((s) => s.session_key !== (payload.old as McSession).session_key)
          }
          const updated = payload.new as McSession
          const exists = prev.find((s) => s.session_key === updated.session_key)
          if (exists) return prev.map((s) => s.session_key === updated.session_key ? updated : s)
          return [updated, ...prev]
        })
      })
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [])

  return sessions
}

// ─── Active runs ──────────────────────────────────────────────────────────────

export function useActiveRuns() {
  const [runs, setRuns] = useState<McRun[]>([])

  useEffect(() => {
    let mounted = true

    supabase
      .from('mc_runs')
      .select('*')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        if (mounted) setRuns((data ?? []) as McRun[])
      })

    const channel = supabase
      .channel('mc_runs_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mc_runs' }, (payload) => {
        setRuns((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.run_id !== (payload.old as McRun).run_id)
          const updated = payload.new as McRun
          if (payload.eventType === 'INSERT') return updated.status === 'running' ? [updated, ...prev] : prev
          if (updated.status !== 'running') return prev.filter((r) => r.run_id !== updated.run_id)
          return prev.map((r) => r.run_id === updated.run_id ? updated : r)
        })
      })
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [])

  return runs
}

// ─── Bridge health ────────────────────────────────────────────────────────────

export function useBridgeHealth() {
  const [heartbeat, setHeartbeat] = useState<McBridgeHeartbeat | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase
      .from('mc_bridge_heartbeat')
      .select('*')
      .order('ts', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (mounted && data) setHeartbeat(data as McBridgeHeartbeat)
      })

    const channel = supabase
      .channel('mc_heartbeat_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mc_bridge_heartbeat' }, (payload) => {
        setHeartbeat(payload.new as McBridgeHeartbeat)
        setStale(false)
      })
      .subscribe()

    // Mark stale if no heartbeat for 3× interval (assume 60s interval)
    const staleTimer = setInterval(() => {
      if (!heartbeat) return
      const age = Date.now() - new Date(heartbeat.ts).getTime()
      setStale(age > 180_000)
    }, 10_000)

    return () => {
      mounted = false
      clearInterval(staleTimer)
      void supabase.removeChannel(channel)
    }
  }, [heartbeat])

  return { heartbeat, stale }
}
