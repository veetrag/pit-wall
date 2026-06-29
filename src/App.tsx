import { useEffect } from 'react'
import './styles/tokens.css'
import { AnimatePresence } from 'framer-motion'
import { useSeasonStore } from './state/seasonStore'
import { useSettingsStore } from './state/settingsStore'
import { MainMenu } from './ui/MainMenu'
import { GridStats } from './ui/GridStats'
import { DriverSelect } from './ui/DriverSelect'
import { RaceSetup } from './ui/RaceSetup'
import { HowToPlay } from './ui/HowToPlay'
import { RaceHUD } from './ui/RaceHUD'
import { RaceResult } from './ui/RaceResult'
import { Championship } from './ui/Championship'
import { RaceWatcher } from './ui/RaceWatcher'
import { SettingsScreen } from './ui/SettingsPanel'

export default function App() {
  const phase = useSeasonStore(s => s.phase)
  const loadSettings = useSettingsStore(s => s.loadSettings)
  const loadSeason = useSeasonStore(s => s.loadSeason)

  useEffect(() => {
    void loadSettings()
    void loadSeason()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
      <RaceWatcher />
      <AnimatePresence mode="wait">
        {phase === 'menu' && <MainMenu key="menu" />}
        {phase === 'grid' && <GridStats key="grid" />}
        {phase === 'driver_select' && <DriverSelect key="driver_select" />}
        {phase === 'race_setup' && <RaceSetup key="race_setup" />}
        {phase === 'how_to_play' && <HowToPlay key="how_to_play" />}
        {phase === 'settings' && <SettingsScreen key="settings" />}
        {phase === 'racing' && <RaceHUD key="race" />}
        {phase === 'result' && <RaceResult key="result" />}
        {phase === 'championship' && <Championship key="championship" />}
      </AnimatePresence>
    </div>
  )
}
