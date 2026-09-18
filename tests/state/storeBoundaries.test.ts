import { describe, it, expect } from 'vitest'

// A file-content test is blunt, but this repo has no ESLint config and Rollup
// emits no circular-dependency warning for this cycle: a value import here
// passes tsc, `npm run build` and the whole suite *silently*. Without this test
// the only protection is a prose comment. No new dependency required.
// Read via Vite's ?raw glob rather than node:fs — this repo has no @types/node,
// and adding one for a single test is not worth it.
const SOURCES = import.meta.glob('../../src/state/*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function src(name: string): string {
  const key = Object.keys(SOURCES).find(k => k.endsWith(`/${name}`))
  if (key === undefined) throw new Error(`source not found: ${name} (have ${Object.keys(SOURCES).join(', ')})`)
  return SOURCES[key]!
}

describe('raceStore -> seasonStore boundary', () => {
  it('never imports seasonStore as a value', () => {
    // Every `... from './seasonStore'` must be a type-only import. `import type`
    // is fully erased at compile time; anything else emits a runtime require.
    // `[^']*` deliberately excludes quotes so the match cannot span an earlier
    // import's source string; it still crosses newlines for multi-line braces.
    // BOTH specifier forms. The relative './seasonStore' is what these files
    // happen to use today, but '@state/seasonStore' is the house style
    // everywhere else in src/ — and a regex matching only the relative form let
    // an ADDED aliased value import pass silently, which is the entire failure
    // this test exists to catch.
    //
    // buildConfig (now buildRaceConfig) moved out of raceStore.ts into
    // buildRaceConfig.ts, taking its `import type { PlayerStrategyChoice }`
    // with it — so both files are checked, and the rot-guard below only needs
    // the import to appear in whichever one currently carries the hazard.
    const files = ['raceStore.ts', 'buildRaceConfig.ts']
    const allImports: string[] = []
    const allValueImports: string[] = []
    for (const file of files) {
      const text = src(file)
      const imports = [...text.matchAll(
        /^import\s+(?:type\s+)?[^']*from\s+'(?:\.\/|@state\/)seasonStore'/gm,
      )].map(m => m[0])
      allImports.push(...imports)
      allValueImports.push(...imports.filter(i => !/^import\s+type\s/.test(i)))
    }
    expect(allImports.length).toBeGreaterThan(0) // guard against the regex silently rotting
    expect(allValueImports, [
      'Neither src/state/raceStore.ts nor src/state/buildRaceConfig.ts may',
      'import seasonStore as a value.',
      '',
      'seasonStore.ts imports CIRCUIT_ORDER from raceStore.ts as a VALUE, at',
      'module scope. Either file importing seasonStore back as a value closes a',
      'real ESM cycle. A lazy `useSeasonStore.getState()` inside a function',
      'appears to work, but any later top-level use of either import puts',
      'CIRCUIT_ORDER in the temporal dead zone or leaves useSeasonStore',
      'undefined at module scope — an inscrutable module-init bug.',
      '',
      'This is why the upgrade overlay is INJECTED into buildRaceConfig as an',
      'optional parameter and supplied by src/ui/RaceWatcher.tsx (which already',
      'subscribes to both stores) rather than read from seasonStore here.',
      'Keep `import type { PlayerStrategyChoice }` type-only in',
      'buildRaceConfig.ts, and pass any new season state in as an argument.',
    ].join('\n')).toEqual([])
  })

  it('keeps the overlay module free of any store import', () => {
    // upgradeOverlay is pure computation; a store import would invert the
    // state -> pure-computation dependency direction (CLAUDE.md §3) and make it
    // unusable by Task 6's preview, which applies hypothetical tiers.
    const text = src('upgradeOverlay.ts')
    expect(text).not.toMatch(/from\s+'\.\/(season|race|clock|settings)Store'/)
    expect(text).not.toMatch(/from\s+'@state\//)
  })
})
