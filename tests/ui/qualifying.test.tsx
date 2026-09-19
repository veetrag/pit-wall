import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Qualifying } from '@ui/Qualifying'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'

describe('Qualifying screen', () => {
  beforeEach(() => {
    // playerDriverId MUST be set. The screen is only reachable long after
    // driver selection, and runQualifyingSession throws without one -- by
    // design, so a null player can never qualify a grid without their own
    // upgrades applied. A fixture that omits it is testing a state the app
    // cannot produce, and tempts the component into compensating for it.
    useSeasonStore.setState({
      phase: 'qualifying', qualifyingResult: null, playerDriverId: 'd_voss',
    })
  })

  it('OFFERS THE ATTACK CALL WITH ITS RISK STATED AS A NUMBER', () => {
    /*
     * The outcome is irreversible (the seed derives from the race seed), so the
     * error chance must be visible BEFORE the player commits. A risk the player
     * could not have known about is a cheat, not a gamble.
     */
    render(<Qualifying />)
    const attack = screen.getByRole('button', { name: /attack/i })
    expect(attack.textContent).toMatch(/15\s*%/)
  })

  it('RUNS THE SESSION AND SHOWS THE PLAYER THEIR GRID SLOT', () => {
    render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    expect(useSeasonStore.getState().qualifyingResult).not.toBeNull()
    expect(screen.getByTestId('qualifying-status').textContent).toMatch(/P\d+/)
  })

  it('SIMULATE RESOLVES WITHOUT ANY PLAYER INPUT', () => {
    render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /simulate/i }))
    const result = useSeasonStore.getState().qualifyingResult
    expect(result).not.toBeNull()
    expect(result!.order.length).toBeGreaterThan(1)
  })

  it('LABELS A SCRAPPY LAP IN TEXT, NOT COLOUR ALONE', () => {
    // CLAUDE.md 6.3: colour is never the only signal. Inject a result with a
    // known scrappy lap rather than hunting for a seed that produces one.
    const order = ['d_voss', 'd_chen']
    useSeasonStore.setState({
      qualifyingResult: {
        order,
        laps: [
          { driverId: 'd_voss', teamId: 't1', time: 80, compound: 'S', attack: 'attack', scrappy: false },
          { driverId: 'd_chen', teamId: 't2', time: 81.2, compound: 'S', attack: 'attack', scrappy: true },
        ],
      },
    })
    render(<Qualifying />)
    expect(screen.getByText(/scrappy|error|mistake/i)).toBeTruthy()
  })

  it('HONOURS THE IN-APP REDUCED-MOTION TOGGLE', () => {
    // Must read the store, never window.matchMedia directly -- the defect
    // fixed in RaceResult. With the toggle on, no layout animation is applied.
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    expect(container.querySelectorAll('[data-animated="true"]')).toHaveLength(0)
  })

  it('PROCEEDS TO THE RACE ONLY AFTER A SESSION HAS RUN', () => {
    render(<Qualifying />)
    expect(screen.queryByRole('button', { name: /to the grid/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    fireEvent.click(screen.getByRole('button', { name: /to the grid/i }))
    expect(useSeasonStore.getState().phase).toBe('racing')
  })
})

describe('the compound decision must be informed', () => {
  it('STATES THE TRACK CONDITIONS', () => {
    /*
     * The session derives from the race seed, so a bad tyre call cannot be
     * re-run. Before this, the weather only gated WHICH chips appeared and was
     * never stated -- found on an API 30 emulator, where a soft tyre chosen in
     * a wet session qualified P20 with nothing on screen saying it was wet.
     */
    render(<Qualifying />)
    const el = screen.getByTestId('qualifying-conditions')
    expect(el.textContent).toMatch(/TRACK (DRY|DAMP|WET)/)
  })
})

describe('the player can always see their own row', () => {
  it('RENDERS EVERY DRIVER, NOT JUST THE TOP FEW', () => {
    /*
     * The result box is a flex child with overflow hidden, so without an
     * explicit flexShrink: 0 it shrinks and clips. On an API 30 emulator that
     * showed exactly four rows -- so a player who qualified P20 never saw
     * their own row at all.
     */
    render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    const result = useSeasonStore.getState().qualifyingResult!
    expect(result.laps.length).toBeGreaterThan(4)
    const rows = screen.getAllByTestId('qualifying-row')
    expect(rows.length, 'every driver must have a row in the DOM').toBe(result.laps.length)
  })
})

describe('race setup points at what it actually opens', () => {
  it('DOES NOT PROMISE LIGHTS OUT', async () => {
    /*
     * This button used to go straight to the race. It now opens qualifying,
     * and a player who taps "LIGHTS OUT" expecting the start of the race and
     * lands on a tyre decision has been misled by the label.
     */
    // jsdom does not implement scrollIntoView, which RaceSetup calls to centre
    // the selected circuit chip. Stub it rather than change the component.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function () {}
    }
    const { RaceSetup } = await import('@ui/RaceSetup')
    useSeasonStore.setState({ phase: 'race_setup', playerDriverId: 'd_voss' })
    render(<RaceSetup />)
    expect(screen.queryByRole('button', { name: /lights out/i })).toBeNull()
    expect(screen.getByRole('button', { name: /qualifying/i })).toBeTruthy()
  })
})
