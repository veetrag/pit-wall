import { useRaceStore } from '@state/raceStore'
import type { PaceMode, TuningConstants } from '@engine/types'
import { Segmented } from '@ui/kit'

const LABEL: Record<PaceMode, string> = { conserve: 'SAVE', neutral: 'HOLD', push: 'PUSH' }
const ORDER: PaceMode[] = ['conserve', 'neutral', 'push']
// Used only when no race config is loaded (CLAUDE.md 6.2 consequence preview).
const FALLBACK_SUB: Record<PaceMode, string> = {
  conserve: '+0.20s · −25% wear', neutral: 'base', push: '−0.15s · +30% wear',
}

const signed = (n: number, digits: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`

/** "−0.15s · +30% wear" from the tuning's paceDelta and degMultiplier; "base" for a no-op mode. */
export function paceSub(mode: { paceDelta: number; degMultiplier: number }): string {
  const wearPct = Math.round((mode.degMultiplier - 1) * 100)
  if (mode.paceDelta === 0 && wearPct === 0) return 'base'
  return `${signed(mode.paceDelta, 2)}s · ${signed(wearPct, 0)}% wear`
}

function optionsFor(paceModes: TuningConstants['paceModes'] | undefined) {
  return ORDER.map(value => ({
    value, label: LABEL[value], sub: paceModes ? paceSub(paceModes[value]) : FALLBACK_SUB[value],
  }))
}

export function PaceModeToggle() {
  const current = useRaceStore(s => s.raceState?.cars.find(c => c.isPlayer)?.paceMode ?? 'neutral')
  const paceModes = useRaceStore(s => s.config?.tuning.paceModes)
  const setPaceMode = useRaceStore(s => s.setPaceMode)
  // Segmented fires uiTap itself (Light haptic + nav tone), so no extra haptic
  // here -- a second impact on the same tap would double-buzz.
  return <Segmented options={optionsFor(paceModes)} value={current} onChange={setPaceMode} ariaLabel="Pace mode" />
}
