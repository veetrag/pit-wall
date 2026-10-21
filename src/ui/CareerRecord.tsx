import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore, sprintWins } from '@state/careerStore'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'
import { BadgeCase } from './BadgeCase'
import { ScreenFrame, ScreenHeader, StatTile, StandingRow, KitButton, Pill } from '@ui/kit'

type DriverEntry = { id: string; name: string; teamId: string }
type TeamEntry = { id: string; name: string; colorPrimary: string }
const drivers = driversData.drivers as DriverEntry[]
const teams = carsData.teams as TeamEntry[]

// Short forms so the label fits one line in a fixed-height StandingRow:
// the driver's three-letter code and the first word of the team name.
function driverCode(id: string): string {
  const d = drivers.find(x => x.id === id) as (DriverEntry & { code?: string }) | undefined
  return d?.code ?? id.replace('d_', '').slice(0, 3).toUpperCase()
}
function teamShort(id: string): string {
  const n = teams.find(t => t.id === id)?.name
  return n ? (n.split(' ')[0] ?? n) : id.toUpperCase()
}
function teamColor(id: string): string {
  return teams.find(t => t.id === id)?.colorPrimary ?? 'var(--dusk)'
}

const SECTION_HEAD = {
  margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
  letterSpacing: 1, color: 'var(--lilac-dim)',
} as const


export function CareerRecord() {
  const exitCareer = useSeasonStore(s => s.exitCareer)
  const viewCareerStats = useSeasonStore(s => s.viewCareerStats)
  const {
    seasonNumber, titles, wins, podiums, poles, racesStarted, bestFinish, seasonHistory, raceLog,
  } = useCareerStore()

  const sprintWinCount = sprintWins(raceLog)

  return (
    <ScreenFrame label="Trophy room">
      <ScreenHeader eyebrow={`CAREER · SEASON ${seasonNumber}`} title="Trophy room" onBack={exitCareer} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <StatTile value={titles} label="TITLES" />
          <StatTile value={wins} label="WINS" />
          <StatTile value={podiums} label="PODIUMS" />
          <StatTile value={bestFinish === null ? '—' : `P${bestFinish}`} label="BEST" tone={bestFinish === 1 ? 'volt' : 'default'} />
        </div>
        <p style={{ margin: '10px 0 12px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--lilac-dim)' }}>
          {poles} poles · {racesStarted} races · {sprintWinCount} sprint win{sprintWinCount === 1 ? '' : 's'} · {seasonNumber - 1} seasons
        </p>
        <div style={{ marginBottom: 20 }}>
          <KitButton variant="secondary" size="sm" ariaLabel="Career stats" onClick={viewCareerStats} style={{ width: '100%' }}>
            STATS →
          </KitButton>
        </div>

        <BadgeCase />

        <h2 style={SECTION_HEAD}>SEASON HISTORY</h2>

        {seasonHistory.length === 0 ? (
          <div className="slant-lg" style={{ background: 'var(--grape)', padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 20, color: 'var(--white)', marginBottom: 6 }}>
              THE RECORD STARTS AT THE CHEQUERED FLAG
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--lilac)', lineHeight: 1.5 }}>
              Finish your first season and it lands here — every result, every title, for as long as you keep racing.
            </div>
          </div>
        ) : (
          // Natural-height list: never sliced, so an endless career's full
          // history always renders inside the scrolling parent.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {seasonHistory.map((s, i) => {
              const moved = i > 0 && seasonHistory[i - 1]!.teamId !== s.teamId
              return (
              <div key={s.seasonNumber} data-testid="career-season-row">
                <StandingRow
                  pos={`S${s.seasonNumber}`}
                  teamColor={teamColor(s.teamId)}
                  name={`${driverCode(s.driverId)} · ${teamShort(s.teamId)}`}
                  value={`P${s.championshipPosition} · ${s.points} PTS`}
                  trailing={(s.championshipPosition === 1 || moved) ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {moved && <Pill ariaLabel="Changed team">NEW TEAM</Pill>}
                      {s.championshipPosition === 1 && <span role="img" aria-label="Champion">🏆</span>}
                    </span>
                  ) : undefined}
                />
              </div>
              )
            })}
          </div>
        )}
      </div>
    </ScreenFrame>
  )
}
