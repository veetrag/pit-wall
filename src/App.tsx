import { useEffect } from 'react'
import './styles/tokens.css'
import './styles/kit.css'
import { AnimatePresence } from 'framer-motion'
import { useSeasonStore } from './state/seasonStore'
import { startSeasonAutosave } from './state/seasonPersistence'
import { startCareerAutosave } from './state/careerPersistence'
import { setCloudClient, startCloudSync, startAchievementSync } from './sync/storeBridge'
import { playGamesClient } from './sync/playGamesClient'
import { setPlatformClients, startCrashReporting, checkForUpdate } from './sync/platformBridge'
import { crashReporter, reviewPrompter, updateChecker, integrityChecker } from './sync/platform'
import { useSettingsStore, startReducedMotionWatch } from './state/settingsStore'
import { startDisplaySettingsSync } from './state/displaySettings'
import { MainMenu } from './ui/MainMenu'
import { GridStats } from './ui/GridStats'
import { TeamSelect } from './ui/TeamSelect'
import { DriverSelect } from './ui/DriverSelect'
import { RaceSetup } from './ui/RaceSetup'
import { Qualifying } from './ui/Qualifying'
import { SprintSetup } from './ui/SprintSetup'
import { SprintResult } from './ui/SprintResult'
import { Development } from './ui/Development'
import { HowToPlay } from './ui/HowToPlay'
import { RaceHUD } from './ui/RaceHUD'
import { RaceResult } from './ui/RaceResult'
import { Championship } from './ui/Championship'
import { CareerRecord } from './ui/CareerRecord'
import { RaceWatcher } from './ui/RaceWatcher'
import { SettingsScreen } from './ui/SettingsPanel'
import { ScenarioSelect } from './ui/ScenarioSelect'
import { ScenarioResult } from './ui/ScenarioResult'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { useAppVisibility } from './hooks/useAppVisibility'
import { AppErrorBoundary } from './ui/AppErrorBoundary'
import { setDebriefRunner } from './state/debriefStore'
import { workerRunner } from './state/debriefWorkerRunner'
setDebriefRunner(workerRunner)

export default function App() {
  const phase = useSeasonStore(s => s.phase)
  const loadSettings = useSettingsStore(s => s.loadSettings)

  // Android hardware back button — without this it finishes the activity and
  // silently destroys an in-progress race.
  useAndroidBackButton()
  // Pause the race when the app leaves the screen -- the sim's timer keeps
  // running in the background otherwise.
  useAppVisibility()

  useEffect(() => {
    void loadSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the season save in step with the store for the life of the app. It
  // subscribes rather than being called from each action, so no future action
  // can advance a season while forgetting to persist it -- which is precisely
  // how the previous attempt at saving ended up dead. See seasonPersistence.ts.
  useEffect(() => startSeasonAutosave(), [])
  useEffect(() => startCareerAutosave(), [])

  // Cloud save. This is the only module that imports the Play Games plugin
  // into the app graph -- see the note on setCloudClient. It hydrates from
  // local storage first and only then reconciles, and every failure path
  // inside it degrades to "the game works offline", so nothing here is
  // awaited or surfaced.
  useEffect(() => {
    setCloudClient(playGamesClient)
    void startCloudSync()
  }, [])

  // Mirrors newly-earned badges to Play Games. Subscribes rather than firing
  // from a screen, so an unlock cannot be missed because the toast happened
  // to appear somewhere this effect does not run.
  useEffect(() => startAchievementSync(), [])

  // Crash reporting and the update check. Same shape as cloud save: this
  // module is the only one that imports the plugins, everything downstream
  // takes an interface, and every failure inside degrades to doing nothing.
  useEffect(() => {
    setPlatformClients({ crash: crashReporter, review: reviewPrompter, updates: updateChecker, integrity: integrityChecker })
    void startCrashReporting()
    void checkForUpdate()
  }, [])

  // Follows the OS accessibility preference while the app is open. It only
  // applies while the player has made no explicit choice of their own -- see
  // startReducedMotionWatch.
  useEffect(() => startReducedMotionWatch(), [])
  // Tyre palette (and, from Task 2, text size) as root data attributes. main.tsx
  // loads settings before mount, so the first paint already has them.
  useEffect(() => startDisplaySettingsSync(), [])

  return (
    <AppErrorBoundary>
      <div style={{ height: '100%', overflow: 'hidden', position: 'relative', background: 'var(--ink)' }}>
        <RaceWatcher />
        <AnimatePresence initial={false}>
          {phase === 'menu' && <MainMenu key="menu" />}
          {phase === 'grid' && <GridStats key="grid" />}
          {phase === 'team_select' && <TeamSelect key="team_select" />}
          {phase === 'driver_select' && <DriverSelect key="driver_select" />}
          {phase === 'development' && <Development key="development" />}
          {phase === 'race_setup' && <RaceSetup key="race_setup" />}
          {phase === 'qualifying' && <Qualifying key="qualifying" />}
          {phase === 'sprint_setup' && <SprintSetup key="sprint_setup" />}
          {phase === 'sprint_racing' && <RaceHUD key="sprint_race" />}
          {phase === 'sprint_result' && <SprintResult key="sprint_result" />}
          {phase === 'how_to_play' && <HowToPlay key="how_to_play" />}
          {phase === 'settings' && <SettingsScreen key="settings" />}
          {phase === 'racing' && <RaceHUD key="race" />}
          {phase === 'result' && <RaceResult key="result" />}
          {phase === 'championship' && <Championship key="championship" />}
          {phase === 'career' && <CareerRecord key="career" />}
          {phase === 'scenario_select' && <ScenarioSelect key="scenario_select" />}
          {phase === 'scenario_racing' && <RaceHUD key="scenario_race" />}
          {phase === 'scenario_result' && <ScenarioResult key="scenario_result" />}
        </AnimatePresence>
      </div>
    </AppErrorBoundary>
  )
}
