// Device bug (2.1): the SC chance line rendered between the ghost row and the
// car-behind row. The rejoin rows are one block; the 2.0 lines follow it in
// order DRS -> SC chance -> BOX BUSY -> penalty.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { PitPanel } from '@ui/PitPanel'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState } from '@engine/types'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))
// Force every 2.0 line on; their own logic is tested elsewhere.
vi.mock('@state/towerV2', async orig => ({ ...(await orig<object>()), rejoinTrainSize: () => 3 }))
vi.mock('@ui/ScOutlook', async orig => ({ ...(await orig<object>()), useScChanceLine: () => 'SC CHANCE NEXT 3 LAPS · 20%' }))
vi.mock('@engine/pitStop', async orig => ({ ...(await orig<object>()), boxQueueEstimate: () => 2.5 }))

const DATA = loadGameData()
const tuning = makeTuning({})
const drivers = DATA.drivers.drivers
const player = drivers[0]!

describe('pit panel order', () => {
  it('rejoin rows come first, then DRS, SC chance, BOX BUSY, penalty', () => {
    useSettingsStore.setState({ reducedMotion: true })
    const config = {
      circuit: DATA.circuits['veloce']!, tuning: { ...tuning, penalties: { ...tuning.penalties, enabled: true } },
      compounds: DATA.compounds, drivers, teams: DATA.cars.teams,
      strategies: DATA.strategies.defaults, playerDriverId: player.id, seed: 1,
    } as RaceConfig
    const raceState = {
      safetyCar: null, incidents: [], lap: 10, totalLaps: 20, weatherTimeline: [], weatherState: 'DRY', boxFree: {},
      cars: [{ driverId: player.id, teamId: player.teamId, isPlayer: true, compound: 'M',
        tyreAllocation: { S: 2, M: 1, H: 0, I: 4, W: 3 }, penalty: { pendingSec: 5 } }],
    } as unknown as RaceState
    render(<PitPanel />)
    act(() => {
      useRaceStore.setState({
        pitPanelOpen: true, config, raceState, updateProjection: () => {},
        projectionResult: {
          rejoinPosition: 19, rejoinGap: 1.1, rejoinGapBehind: 0.8,
          driverAheadId: drivers[1]!.id, driverBehindId: drivers[2]!.id,
          lapsProjected: 4, netEstimatePosition: 19, netEstimateLap: 14,
        },
      })
    })
    const behindRow = screen.getByText(drivers[2]!.code).closest('.slant-row')!
    const ids = ['ghost-row', 'rejoin-train-note', 'sc-chance-line', 'box-busy-line', 'penalty-serve-line']
    const els = [screen.getByText(drivers[1]!.code).closest('.slant-row')!, screen.getByTestId('ghost-row'), behindRow,
      ...ids.slice(1).map(id => screen.getByTestId(id))]
    for (let i = 1; i < els.length; i++) {
      expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
