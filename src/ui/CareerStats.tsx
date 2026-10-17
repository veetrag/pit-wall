import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { careerStats, type RecordLine } from '@state/careerStats'
import { loadGameData } from '@data/validators'
import { ScreenFrame, ScreenHeader, StatTile, StandingRow, TyreChip, Pill, snapIn, useReducedMotion } from '@ui/kit'

const DATA = loadGameData()
const HEAD = { margin: '20px 0 10px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: 1, color: 'var(--lilac-dim)', display: 'flex', alignItems: 'center', gap: 8 } as const
const pct = (r: number) => `${Math.round(r * 100)}%`
const pos = (p: number | null) => (p === null ? '—' : `P${p}`)

function Since({ show }: { show: boolean }) {
  return show ? <Pill ariaLabel="Recorded since version 1.6">SINCE 1.6</Pill> : null
}
function Record({ label, r }: { label: string; r: RecordLine }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }} role="group" aria-label={label}>
      <StatTile value={r.races} label="RACES" /><StatTile value={r.wins} label="WINS" />
      <StatTile value={r.podiums} label="PODIUMS" /><StatTile value={pos(r.best)} label="BEST" />
    </div>
  )
}

/** Career stats (spec 1.6 §7): every number a pure fold over the race log (careerStats.ts). */
export function CareerStats() {
  const exit = useSeasonStore(s => s.exitCareerStats)
  const raceLog = useCareerStore(s => s.raceLog)
  const reduced = useReducedMotion()
  const s = useMemo(() => careerStats(raceLog, CIRCUIT_ORDER), [raceLog])
  let i = 0
  const next = () => snapIn(reduced, i++)

  return (
    <ScreenFrame label="Career stats">
      <ScreenHeader eyebrow="CAREER" title="Stats" onBack={exit} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px', fontVariantNumeric: 'tabular-nums' }}>
        <motion.div {...next()}>
          <h2 style={HEAD}>THE BASICS</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <StatTile value={s.gpRaces} label="GRANDS PRIX" />
            <StatTile value={s.dnfRate === null ? '—' : pct(s.dnfRate)} label="DNF RATE" />
            <StatTile value={s.longestStint === null ? '—' : `${s.longestStint}L`} label="LONGEST STINT" />
          </div>
          {s.stintPartial && s.longestStint !== null && <div style={{ marginTop: 6 }}><Since show /></div>}
          <div style={{ marginTop: 8 }}>
            <StandingRow pos="▲" teamColor="var(--gain)" name="BIGGEST COMEBACK"
              value={s.biggestComeback ? `+${s.biggestComeback.gained} · S${s.biggestComeback.season} R${s.biggestComeback.round + 1}` : '—'} />
          </div>
        </motion.div>

        <motion.div {...next()}>
          <h2 style={HEAD}>BY START TYRE <Since show={s.compoundPartial} /></h2>
          {s.byStartCompound.length === 0
            ? <p style={{ color: 'var(--lilac)', fontSize: 13 }}>Race a Grand Prix and your start tyres land here.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.byStartCompound.map(c => (
                  <StandingRow key={c.compound} pos={<TyreChip compound={c.compound} size={24} />} teamColor="var(--dusk)"
                    name={`${c.races} RACE${c.races === 1 ? '' : 'S'}`} value={`${pct(c.winRate)} WIN · ${pct(c.podiumRate)} POD`} />
                ))}
              </div>}
        </motion.div>

        <motion.div {...next()}>
          <h2 style={HEAD}>WET RACES</h2><Record label="Wet race record" r={s.wet} />
          <h2 style={HEAD}>SPRINTS</h2><Record label="Sprint record" r={s.sprint} />
        </motion.div>

        <motion.div {...next()}>
          <h2 style={HEAD}>BEST BY CIRCUIT <Since show={s.circuitPartial} /></h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.bestByCircuit.map(c => (
              <StandingRow key={c.circuitId} pos={pos(c.best)} teamColor={c.best === 1 ? 'var(--volt)' : 'var(--dusk)'}
                name={(DATA.circuits[c.circuitId]?.name ?? c.circuitId).toUpperCase()} value={`${c.races} GP`} />
            ))}
          </div>
        </motion.div>

        <motion.div {...next()}>
          <h2 style={HEAD}>AVERAGE FINISH BY SEASON</h2>
          {s.averageBySeason.length === 0
            ? <p style={{ color: 'var(--lilac)', fontSize: 13 }}>No seasons raced yet.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.averageBySeason.map(r => (
                  <StandingRow key={r.season} pos={`S${r.season}`} teamColor="var(--dusk)" name={`${r.races} GP`}
                    value={r.average === null ? '—' : `P${r.average.toFixed(1)}`} />
                ))}
              </div>}
        </motion.div>
      </div>
    </ScreenFrame>
  )
}
