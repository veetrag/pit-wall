import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useSettingsStore } from './state/settingsStore'

const root = document.getElementById('root')
if (!root) throw new Error('No root element found')

useSettingsStore.getState().loadSettings().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
