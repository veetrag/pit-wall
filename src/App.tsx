import { useEffect } from 'react'
import './styles/tokens.css'
import { AnimatePresence } from 'framer-motion'
import { useSeasonStore } from './state/seasonStore'
import { startSeasonAutosave } from './state/seasonPersistence'
import { useSettingsStore, startReducedMotionWatch } from './state/settingsStore'
import { MainMenu } from './ui/MainMenu'
import { GridStats } from './ui/GridStats'
import { TeamSelect } from './ui/TeamSelect'
import { DriverSelect } from './ui/DriverSelect'
import { RaceSetup } from './ui/RaceSetup'
import { Qualifying } from './ui/Qualifying'
import { Development } from './ui/Development'
import { HowToPlay } from './ui/HowToPlay'
import { RaceHUD } from './ui/RaceHUD'
import { RaceResult } from './ui/RaceResult'
import { Championship } from './ui/Championship'
import { RaceWatcher } from './ui/RaceWatcher'
import { SettingsScreen } from './ui/SettingsPanel'
import { ScenarioSelect } from './ui/ScenarioSelect'
import { ScenarioResult } from './ui/ScenarioResult'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { AppErrorBoundary } from './ui/AppErrorBoundary'

export default function App() {
  const phase = useSeasonStore(s => s.phase)
  const loadSettings = useSettingsStore(s => s.loadSettings)

  // Android hardware back button — without this it finishes the activity and
  // silently destroys an in-progress race.
  useAndroidBackButton()

  useEffect(() => {
    void loadSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the season save in step with the store for the life of the app. It
  // subscribes rather than being called from each action, so no future action
  // can advance a season while forgetting to persist it -- which is precisely
  // how the previous attempt at saving ended up dead. See seasonPersistence.ts.
  useEffect(() => startSeasonAutosave(), [])

  // Follows the OS accessibility preference while the app is open. It only
  // applies while the player has made no explicit choice of their own -- see
  // startReducedMotionWatch.
  useEffect(() => startReducedMotionWatch(), [])

  return (
    <AppErrorBoundary>
      <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
        <RaceWatcher />
        <AnimatePresence mode="wait">
          {phase === 'menu' && <MainMenu key="menu" />}
          {phase === 'grid' && <GridStats key="grid" />}
          {phase === 'team_select' && <TeamSelect key="team_select" />}
          {phase === 'driver_select' && <DriverSelect key="driver_select" />}
          {phase === 'development' && <Development key="development" />}
          {phase === 'race_setup' && <RaceSetup key="race_setup" />}
          {phase === 'qualifying' && <Qualifying key="qualifying" />}
          {phase === 'how_to_play' && <HowToPlay key="how_to_play" />}
          {phase === 'settings' && <SettingsScreen key="settings" />}
          {phase === 'racing' && <RaceHUD key="race" />}
          {phase === 'result' && <RaceResult key="result" />}
          {phase === 'championship' && <Championship key="championship" />}
          {phase === 'scenario_select' && <ScenarioSelect key="scenario_select" />}
          {phase === 'scenario_racing' && <RaceHUD key="scenario_race" />}
          {phase === 'scenario_result' && <ScenarioResult key="scenario_result" />}
        </AnimatePresence>
      </div>
    </AppErrorBoundary>
  )
}
