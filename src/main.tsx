import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useSettingsStore } from './state/settingsStore'

const root = document.getElementById('root')
if (!root) throw new Error('No root element found')

function mount() {
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

// Settings load before first paint so the UI never flashes defaults and then
// snaps. But mounting must not DEPEND on it succeeding: this previously read
// `loadSettings().then(mount)` with no rejection handler, so a Capacitor
// Preferences failure meant render never ran and the app stayed permanently
// blank. Falling back to default settings is always better than a white screen.
void useSettingsStore.getState().loadSettings()
  .catch((err: unknown) => {
    console.error('[main] loadSettings failed — continuing with defaults', err)
  })
  .then(mount)
