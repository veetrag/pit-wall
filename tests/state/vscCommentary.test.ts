import { describe, it, expect } from 'vitest'
import { processCommentaryTick, makeCommentaryState } from '@state/commentaryMapper'
import commentary from '@data/commentary.json'
import type { RaceConfig, RaceState, IncidentEvent } from '@engine/types'

const config = { drivers: [] } as unknown as RaceConfig

function stateWith(incidents: IncidentEvent[]): RaceState {
  return {
    lap: 6, sector: 1, totalLaps: 30, cars: [], sectorResults: [], overtakeEvents: [],
    safetyCar: null, incidents, trackEvolutionLaps: 6, rngState: 1,
    weatherTimeline: [], weatherState: 'DRY',
  }
}

describe('VSC commentary', () => {
  it('announces a VSC deployment and its end from the incident log', () => {
    const deployedEv: IncidentEvent = { lap: 5, sector: 1, kind: 'vsc_deployed', driverId: null, timeLoss: null }
    const endedEv: IncidentEvent = { lap: 7, sector: 2, kind: 'vsc_ended', driverId: null, timeLoss: null }
    const first = processCommentaryTick(stateWith([deployedEv]), config, { ...makeCommentaryState(), started: true })
    expect(first.lines).toContain(commentary.vsc_deployed[0]!.replace('{lap}', '6'))
    const second = processCommentaryTick(stateWith([deployedEv, endedEv]), config, first.next)
    expect(second.lines).toContain(commentary.vsc_ended[0]!.replace('{lap}', '8'))
  })
})
