import { it } from 'vitest'

// The scenario authoring tool, runnable without tsx/vite-node. Not a gate:
//   FIND_SCENARIOS=1 SEEDS=400 npx vitest run tests/tools/findScenarios.run.test.ts --reporter=verbose
// The specifier is a variable on purpose: tsc then does not type-check the
// script (it was written for vite-node, not for this project's strict tsc).
const TOOL = '../../scripts/find-scenarios'
it.runIf(process.env.FIND_SCENARIOS === '1')('prints scenario candidates (authoring tool)', async () => {
  await import(/* @vite-ignore */ TOOL)
}, 1_800_000)
