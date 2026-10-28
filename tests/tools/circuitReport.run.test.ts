import { it } from 'vitest'

// The circuit calibration report. Not a gate:
//   CIRCUIT_REPORT=1 CIRCUITS=lantern_quay,mesa_roja RACES=120 npx vitest run tests/tools/circuitReport.run.test.ts --reporter=verbose
// The specifier is a variable so tsc does not type-check the script.
const TOOL = '../../scripts/circuit-report'
it.runIf(process.env.CIRCUIT_REPORT === '1')('prints the circuit calibration report', async () => {
  await import(/* @vite-ignore */ TOOL)
}, 1_800_000)
