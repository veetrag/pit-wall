import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import carsData from '@data/cars.json'
import driversData from '@data/drivers.json'
import { ScreenFrame, ScreenHeader, HeroBand, CarArt, liveryOf, StatTile, KitButton, snapIn, useReducedMotion } from '@ui/kit'
import { carRating, teamTierByRank } from '@ui/teamTier'

type TeamFacets = { power: number; aero: number; handling: number; pitCrew: number; reliability: number }
type TeamEntry = {
  id: string; name: string; flag?: string; nationality?: string;
  colorPrimary: string; colorSecondary?: string;
  facets: TeamFacets; archetype?: string
}
type DriverEntry = { id: string; name: string; code: string; teamId: string; flag?: string }

const allTeams = (carsData as unknown as { teams: TeamEntry[] }).teams
const allDrivers = driversData.drivers as DriverEntry[]

function teamDrivers(teamId: string): DriverEntry[] {
  return allDrivers.filter(d => d.teamId === teamId).slice(0, 2)
}

export function TeamSelect() {
  const selectedTeamId = useSeasonStore(s => s.selectedTeamId)
  const selectTeam = useSeasonStore(s => s.selectTeam)
  const confirmTeam = useSeasonStore(s => s.confirmTeam)
  const backToMenu = useSeasonStore(s => s.backToMenu)
  const uiTap = useUiTap()
  const reduced = useReducedMotion()
  const stripRef = useRef<HTMLDivElement>(null)

  const team = allTeams.find(t => t.id === selectedTeamId) ?? null
  const rating = team ? carRating(team.facets) : 0
  const tier = team ? teamTierByRank(team.id, allTeams) : null
  const drivers = team ? teamDrivers(team.id) : []

  useEffect(() => {
    const i = allTeams.findIndex(t => t.id === selectedTeamId)
    const el = stripRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [selectedTeamId])

  // WAI-ARIA radio group: one tab stop, arrows move and select (wrapping).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const i = allTeams.findIndex(t => t.id === selectedTeamId)
    const next = allTeams[(i + step + allTeams.length) % allTeams.length]
    if (!next) return
    uiTap(); selectTeam(next.id)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[allTeams.indexOf(next)]?.focus()
  }

  const heroAnim = snapIn(reduced)

  return (
    <ScreenFrame label="Team select">
      <ScreenHeader eyebrow="NEW CAREER · STEP 1 OF 2" title="Pick your team" onBack={backToMenu} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Hero */}
        <div style={{ position: 'relative', height: 300, flexShrink: 0, overflow: 'hidden' }}>
          {team && tier && (
            <motion.div key={team.id} {...heroAnim} style={{ position: 'absolute', inset: 0 }}>
              <HeroBand color={team.colorPrimary} height={270} top={10} />
              <div style={{ position: 'relative', height: '100%', padding: '34px 16px 0', color: 'var(--ink)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0, maxWidth: '58%' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 2 }}>{tier} · {team.flag}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 40, lineHeight: 0.95, textTransform: 'uppercase', marginTop: 4, overflowWrap: 'anywhere' }}>{team.name}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 72, lineHeight: 1 }}>{rating}</div>
              </div>
              {/* CarArt rotates about its centre; this 240x96 box is the rotated footprint */}
              <div style={{ position: 'absolute', left: 8, bottom: 8, width: 240, height: 96 }}>
                <div style={{ position: 'absolute', left: 72, top: -72 }}>
                  <CarArt primary={liveryOf(team.id).primary} accent={liveryOf(team.id).accent} height={240} heading="left" label={`${team.name} car`} />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {team && (
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <StatTile value={team.facets.power} label="POWER" />
              <StatTile value={team.facets.aero} label="AERO" />
              <StatTile value={team.facets.handling} label="HANDLING" />
              <StatTile value={team.facets.pitCrew} label="PIT CREW" />
            </div>
            <p style={{ margin: 0, color: 'var(--lilac)', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.45 }}>
              {team.archetype ?? ''}. Drivers: {drivers[0]?.name ?? '—'} and {drivers[1]?.name ?? '—'}.
            </p>
          </div>
        )}
      </div>

      {/* Team strip */}
      <div ref={stripRef} role="radiogroup" aria-label="Teams" onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px', flexShrink: 0 }}>
        {allTeams.map(t => {
          const on = t.id === selectedTeamId
          const r = carRating(t.facets)
          return (
            <button key={t.id} type="button" role="radio" aria-checked={on} aria-label={`${t.name}, rating ${r}`}
              tabIndex={on || (!selectedTeamId && t === allTeams[0]) ? 0 : -1} className="slant-sm kit-focus"
              onClick={() => { uiTap(); selectTeam(t.id) }}
              style={{ width: 64, height: 64, flexShrink: 0, border: 'none', cursor: 'pointer', background: on ? 'var(--dusk)' : 'var(--grape)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--white)' }}>
              <span aria-hidden="true" style={{ width: 22, height: 8, background: t.colorPrimary, transform: 'skewX(-20deg)' }} />
              <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 22, lineHeight: 1 }}>{r}</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
        <KitButton variant="primary" size="lg" disabled={!team} onClick={confirmTeam} style={{ width: '100%' }}>
          {team ? `DRIVE FOR ${team.name.split(' ')[0]?.toUpperCase()} →` : 'SELECT A TEAM'}
        </KitButton>
      </div>
    </ScreenFrame>
  )
}
