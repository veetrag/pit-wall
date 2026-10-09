import { useRaceStore } from '@state/raceStore'
import type { PaceMode } from '@engine/types'
import { Segmented } from '@ui/kit'

// Segmented fires uiTap itself (Light haptic + nav tone), so no extra haptic
// here -- a second impact on the same tap would double-buzz.
const OPTIONS: { value: PaceMode; label: string; sub: string }[] = [
  { value: 'conserve', label: 'SAVE', sub: '+0.20s' },
  { value: 'neutral',  label: 'HOLD', sub: 'base' },
  { value: 'push',     label: 'PUSH', sub: '−0.15s' },
]

export function PaceModeToggle() {
  const current = useRaceStore(s => s.raceState?.cars.find(c => c.isPlayer)?.paceMode ?? 'neutral')
  const setPaceMode = useRaceStore(s => s.setPaceMode)
  return <Segmented options={OPTIONS} value={current} onChange={setPaceMode} ariaLabel="Pace mode" />
}
