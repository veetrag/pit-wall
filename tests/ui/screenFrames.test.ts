import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8')
// Every screen App switches between, and the file that holds its root.
const SCREENS: [string, string][] = [
  ['MainMenu', 'ui/MainMenu.tsx'], ['GridStats', 'ui/GridStats.tsx'], ['TeamSelect', 'ui/TeamSelect.tsx'],
  ['DriverSelect', 'ui/DriverSelect.tsx'], ['Development', 'ui/Development.tsx'], ['RaceSetup', 'ui/RaceSetup.tsx'],
  ['Qualifying', 'ui/Qualifying.tsx'], ['HowToPlay', 'ui/HowToPlay.tsx'], ['SettingsScreen', 'ui/SettingsPanel.tsx'],
  ['RaceHUD', 'ui/RaceHUD.tsx'], ['RaceResult', 'ui/RaceResult.tsx'], ['Championship', 'ui/Championship.tsx'],
  ['CareerRecord', 'ui/CareerRecord.tsx'], ['ScenarioSelect', 'ui/ScenarioSelect.tsx'], ['ScenarioResult', 'ui/ScenarioResult.tsx'],
  ['SprintSetup', 'ui/SprintSetup.tsx'], ['SprintResult', 'ui/SprintResult.tsx'],
]

describe('screen transitions never show a blank frame', () => {
  it('App does not wait for the old screen to leave before drawing the next', () => {
    expect(src('App.tsx')).not.toMatch(/mode=["']wait["']/)
  })
  it('the race screen does not either', () => {
    expect(src('ui/RaceHUD.tsx')).not.toMatch(/mode=["']wait["']/)
  })
  it.each(SCREENS)('%s renders its root as a ScreenFrame', (_name, file) => {
    expect(src(file)).toMatch(/<ScreenFrame\b/)
  })
})
