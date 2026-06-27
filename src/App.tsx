import './styles/tokens.css'
import { TrackCanvas } from './canvas/TrackCanvas'

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24 }}>
      <h1 style={{ color: 'var(--accent)', fontFamily: 'monospace', marginBottom: 16 }}>F1 Strategist</h1>
      <TrackCanvas />
    </div>
  )
}
