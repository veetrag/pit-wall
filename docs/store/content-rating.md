# Play Console — Content Rating questionnaire

**Status:** prepared answers for Veet to enter. I will not submit the form.
**Last verified against the game:** 2026-09-19, commit d2774be

Google's questionnaire (IARC) drives the ratings for every territory. Answer
honestly — a wrong answer is a policy violation, and the rating can be revoked
later, which is worse than a higher rating now.

## Category

Select **Game**, then the sub-questionnaire.

## Answers

| Question | Answer | Why |
|---|---|---|
| Violence — does the app contain violence? | **No** | There is no depiction of violence. A "crash" is a retirement event shown as a line of text in the timing tower and a radio message. No imagery, no injury, no people depicted at all. |
| Realistic violence toward humans/animals | **No** | |
| Blood or gore | **No** | |
| Sexuality or nudity | **No** | |
| Crude humour | **No** | |
| Profanity | **No** | Radio messages and commentary are written clean. |
| Controlled substances (drugs, alcohol, tobacco) | **No** | |
| Gambling — simulated or real | **No** | See the note below; answer No, but read it first. |
| Horror or fear themes | **No** | |
| User-generated content | **No** | Nothing a player creates is stored or shown to anyone else. |
| Users can interact / communicate | **No** | No multiplayer, no chat, no leaderboards, no network of any kind. |
| Shares user location | **No** | |
| Allows purchase of digital goods | **No** | No IAP, no billing library. |
| Contains ads | **No** | No ad SDK. |
| Digital purchases or loot boxes | **No** | |

### The gambling question, and why the answer is No

The game involves risk and chance — a pit call can go wrong, weather can turn,
and outcomes are probabilistic. **That is not gambling.** IARC's gambling
questions are about wagering something of value (real or simulated currency)
on an outcome of chance, and about simulating casino-style games. Pit Wall has
no currency wagered on chance: development points are earned per race and spent
deterministically on upgrades with known effects. Nothing is staked on a random
outcome.

If asked specifically about "simulated gambling", the answer is still No.

## Expected outcome

With every answer above, Pit Wall should rate at the lowest band in every
territory — PEGI 3, ESRB Everyone, USK 0, and equivalents.

## Target audience and content

Play asks separately for target age groups. This is a text-heavy strategy game
with no violence and no data collection, so it can honestly target all ages —
but the *interest* skews older. Suggested: **13+**, not because of content but
because the game assumes you can read a timing tower and reason about tyre
degradation. Choosing 13+ also keeps you outside the Families policy programme
and its extra requirements, which is simpler for a solo developer.

**This is a judgement call, and it is yours.** Selecting "under 13" pulls the
app into Google Play Families policies, which add design and advertising
requirements. Since there are no ads and no data collection, you would likely
pass — but it is more paperwork for an audience the game is not really for.
