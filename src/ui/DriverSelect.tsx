import { motion } from 'framer-motion'
import type { KeyboardEvent } from 'react'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import { HelmetAvatar, type HelmetPattern } from './HelmetAvatar'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'
import { ScreenFrame, ScreenHeader, StatTile, KitButton, snapIn, useReducedMotion } from '@ui/kit'

type DriverFacets = { pace: number; racecraft: number; tyreManagement: number; consistency: number; wetWeather: number; experience: number }
type DriverEntry = { id: string; name: string; code: string; teamId: string; flag?: string; facets: DriverFacets }
type TeamEntry   = { id: string; name: string; colorPrimary: string; colorSecondary?: string }

const allDrivers = driversData.drivers as DriverEntry[]
const allTeams   = (carsData as unknown as { teams: TeamEntry[] }).teams

function teamEntry(teamId: string): TeamEntry {
  return allTeams.find(t => t.id === teamId) ?? { id: teamId, name: teamId, colorPrimary: 'var(--lilac-dim)' }
}

function avgFacets(f: DriverFacets): number {
  const vals = Object.values(f).filter(v => typeof v === 'number') as number[]
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}

function driverTier(overall: number): string {
  return overall >= 90 ? 'ELITE' : overall >= 80 ? 'PRO' : 'ROOKIE'
}

function driverPattern(driverId: string, teamId: string): HelmetPattern {
  const teamDriverIds = allDrivers.filter(d => d.teamId === teamId).map(d => d.id)
  return teamDriverIds.indexOf(driverId) === 0 ? 'stripe' : 'chevron'
}

function gridNumber(driverId: string): number {
  return allDrivers.findIndex(d => d.id === driverId) + 1
}

const FACET_LABELS: [keyof DriverFacets, string][] = [
  ['pace',           'PACE'],
  ['racecraft',      'RACECRAFT'],
  ['tyreManagement', 'TYRE MGMT'],
  ['consistency',    'CONSISTENCY'],
]

export function DriverSelect() {
  const selectedTeamId = useSeasonStore(s => s.selectedTeamId)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const selectDriver   = useSeasonStore(s => s.selectDriver)
  const confirmDriver  = useSeasonStore(s => s.confirmDriver)
  const backToTeamSelect = useSeasonStore(s => s.backToTeamSelect)
  const uiTap = useUiTap()
  const reduced = useReducedMotion()

  const team    = selectedTeamId ? teamEntry(selectedTeamId) : null
  const drivers = allDrivers.filter(d => d.teamId === selectedTeamId)
  const chosen  = allDrivers.find(d => d.id === playerDriverId)

  // WAI-ARIA radio group: one tab stop, arrows move and select (wrapping).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || drivers.length === 0) return
    e.preventDefault()
    const i = drivers.findIndex(d => d.id === playerDriverId)
    const next = drivers[(i + step + drivers.length) % drivers.length]
    if (!next) return
    uiTap(); selectDriver(next.id)
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[drivers.indexOf(next)]?.focus()
  }

  return (
    <ScreenFrame label="Driver select">
      <ScreenHeader eyebrow="NEW CAREER · STEP 2 OF 2" title="Pick your driver" onBack={backToTeamSelect} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div role="radiogroup" aria-label="Drivers" onKeyDown={onKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {drivers.map((driver, i) => {
            const selected  = playerDriverId === driver.id
            const overall   = avgFacets(driver.facets)
            const teamColor = team?.colorPrimary ?? 'var(--lilac-dim)'
            return (
              <motion.div key={driver.id} role="radio" aria-checked={selected} aria-label={`${driver.name}, ${overall} overall`}
                tabIndex={selected || (!playerDriverId && i === 0) ? 0 : -1} className="slant-md kit-focus"
                {...snapIn(reduced, i)}
                whileTap={reduced ? undefined : { scale: 0.98 }}
                onClick={() => { uiTap(); selectDriver(driver.id) }}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); uiTap(); selectDriver(driver.id) } }}
                style={{ position: 'relative', background: 'var(--grape)', cursor: 'pointer', overflow: 'hidden',
                  boxShadow: selected ? 'inset 0 0 0 3px var(--volt)' : 'none', padding: '18px 16px 14px' }}>
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: teamColor }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                  <HelmetAvatar
                    teamPrimary={teamColor}
                    teamSecondary={team?.colorSecondary}
                    pattern={driverPattern(driver.id, driver.teamId)}
                    number={gridNumber(driver.id)}
                    size={72}
                    selected={selected}
                    selectionColor="var(--volt)"
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 26, lineHeight: 1, textTransform: 'uppercase', color: 'var(--white)', overflowWrap: 'anywhere' }}>{driver.name}</div>
                    <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, letterSpacing: 1, color: 'var(--lilac-dim)' }}>
                      {driver.flag} {driver.code} · {driverTier(overall)} {overall} OVR
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
                  {FACET_LABELS.map(([key, label]) => (
                    <StatTile key={key} value={driver.facets[key]} label={label} />
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        {drivers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', fontFamily: 'var(--font-body)', color: 'var(--lilac-dim)' }}>
            No drivers found. Go back and select a team.
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
        <KitButton variant="primary" size="lg" disabled={!playerDriverId} onClick={confirmDriver} style={{ width: '100%' }}>
          {playerDriverId ? `RACE WITH ${chosen?.code ?? '...'} →` : 'SELECT A DRIVER'}
        </KitButton>
      </div>
    </ScreenFrame>
  )
}
