# Authoring a circuit

The repeatable pipeline from spec 2026-10-24 §1.5. Seven steps, each with a gate.
Tune only the new circuit's data; never a global tuning value for one circuit.

## 1. Brief
One paragraph: archetype; the one strategic question the circuit asks; time of
day; which existing circuit it must not duplicate.

## 2. Data (`src/data/circuits.json`)
- laps so the race runs 75-95 minutes of sim clock
- traits: timeOfDay, layout, tyreWear (0.7-1.6), crashRisk / neutralisationRisk (0.5-2.0)
- overtakingFactor: choose the circuit's rank on the calendar first, then values;
  keep max(sector) >= overtaking.factorFloor (0.35)
- pitLaneTimeLoss 18-24 s; car and driver sensitivities each summing 0.95-1.05
- add the id to `V2_CIRCUITS` in `src/data/circuitPaths.ts`
Gate: `npx vitest run tests/data/validators.test.ts tests/data/calendar.test.ts tests/data/circuitGeometry.test.ts`

## 3. Wing
d* = (gripGain(w1+w2) - speedGain*w0) / (2*balanceCost) must sit near a level:
step-off 0.08-0.30 s/lap. Gate: `npx vitest run tests/engine/setupBalance.test.ts`

## 4. Track path (`src/data/paths/<id>.json`)
18-26 points, closed, no segment more than 4x its neighbour; sectorBoundaries so
each sector's arc share is within 0.03 of its sectorBase share; pitEntry and
pitExit on the main straight. Register in `src/data/circuitPaths.ts`.
Gate: calendar and circuitGeometry tests.

## 5. Calibrate
`CIRCUIT_REPORT=1 CIRCUITS=<id> npx vitest run tests/tools/circuitReport.run.test.ts --reporter=verbose`
The report measures overtake clearing on 120 seeds (the sample size the
newCircuitBands gate checks) and each difficulty on RACES races (default 120).
Add the circuit to `tests/engine/newCircuitBands.test.ts` with its identity
targets and make the envelope gates pass by editing the circuit's data.

## 6. Art
Atmosphere: reuse a palette in `ATMOSPHERE_PALETTES` (src/canvas/TrackCanvas.tsx)
unless none fits. Trait pills and the outline derive from data. A store
screenshot only if the circuit is a headline.

## 7. Record
Paste the report lines into MODEL_SPEC.md §17 in the same commit.
