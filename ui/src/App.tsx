import { StatusBar } from './components/StatusBar.js'
import { AgentPanel } from './components/AgentPanel.js'
import { ActivityFeed } from './components/ActivityFeed.js'

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <StatusBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <AgentPanel />
        <ActivityFeed />
      </div>
    </div>
  )
}
