# Play Store listing copy — DRAFT

**Status:** a draft for Veet to rewrite. Store copy is voice, and the voice
should be yours. Treat this as a starting point to react against, not a
proposal to approve.

**Constraints:** title ≤ 30 chars, short description ≤ 80 chars, full
description ≤ 4000 chars.

---

## Title (30 max)

**`Pit Wall: Race Strategy`** — 23 characters.

Alternatives:
- `Pit Wall — F1 Strategy` (22) — see the trademark note below.
- `Pit Wall: Race Strategist` (25)
- `Pit Wall` (8) — cleanest, worst for search.

**Trademark note, and it matters:** "F1" and "Formula 1" are registered
trademarks of Formula One Licensing BV, aggressively enforced. Do not put them
in the title, the short description, or the graphics. The game uses fictional
teams, drivers and circuits, which is exactly why it is safe — keep it that way.
"Race strategy" and "open-wheel racing" carry the same meaning with none of the
risk.

---

## Short description (80 max)

**`You don't drive. You make the calls that win the race.`** — 54 characters.

Alternatives:
- `Read the race. Call the stop. Win on strategy, not reflexes.` (60)
- `A race strategy sim. No driving — just the decisions that decide it.` (68)

---

## Full description (4000 max)

```
You are not the driver. You are the strategist on the pit wall, and the race is
decided by what you call.

Tyres go off. Weather turns. A rival dives into the pits and suddenly you have
fourteen seconds to decide whether to cover them or hold track position. Pit
Wall is a race-strategy game about reading a race in progress and making a small
number of decisions that actually matter.

── THE RACE ──

Every race runs on a sector-by-sector simulation. Nothing is scripted. The
undercut works because fresh tyres are genuinely faster, not because the game
decided you deserved it. When you lose a position on the exit of a pit stop, you
can trace exactly why.

Watch it unfold on a live timing tower, with the gaps ticking in real time and
the tyre wear gauge shifting from teal to amber to red as the cliff approaches.

── THE CALLS ──

• PIT NOW — with a projection showing where you would rejoin before you commit
• COMPOUND — soft, medium, hard, and the wet tyres when the sky opens
• PACE — push for lap time and pay in tyre life, or save and hope the window holds

That is the whole control surface. It is small on purpose. Every one of them
changes the race.

── QUALIFYING ──

Grid position is earned. Choose how hard to attack your lap: conserve and bank a
safe time, or push and risk a scrappy one. Starting at the front is worth real
time, not just a better view.

── A CAREER, NOT A DEMO ──

Twelve races a season, then a winter. Development points buy upgrades across the
car and your driver. Your rivals develop too, and the champion's rivals develop
hardest — hold on to a title and the grid comes after you.

Between seasons your stats and your seat carry over, your upgrades erode a
little, and unspent points bank for next year. Fifteen badges track what you
actually did: a wet win, a win from P10, a season without a single retirement.

── AND WHAT IT DOESN'T DO ──

No ads. No in-app purchases. No account. No analytics.

Pit Wall makes no network requests at all — it does not even request permission
to use the internet. Everything runs on your device, including your save. It
works identically on a plane.
```

**Word on the last section:** it is unusual to advertise the absence of things,
but "no ads, no IAP, no tracking, works offline" is a genuine differentiator in
the mobile games category and costs us nothing to say — it is verifiable from
the permission list on the listing page itself.

---

## Screenshots — the shot list

Play needs at least 2; use all 8. Suggested order, strongest first:

1. **The race HUD mid-race** — timing tower, tyre gauge in amber, gap numbers
   visible. This is the game.
2. **The pit panel with the projection overlay open** — the centrepiece
   decision, showing "if you pit now, you rejoin P5".
3. **Qualifying, with the attack choice on screen.**
4. **The race result** with a badge toast landing, if you can catch one.
5. **The championship standings** at the end of a season.
6. **The development screen** — upgrades and the rival-development comparison.
7. **The career record with the trophy case.**
8. **The main menu** — least informative, but it sets the visual tone.

**Capture these AFTER the font fix** (commit ed8f8eb or later). Anything shot
before that shows the system fallback font, not the game's actual typography.

## Feature graphic (1024 × 500)

Dark, the teal accent, the circuit outline from the menu, and the title. Avoid
putting a screenshot in it — it gets scaled down heavily.

## App category

**Games → Strategy.** "Simulation" and "Sports" both fit the subject, but
Strategy fits the player: someone browsing Sports wants to play the sport.
