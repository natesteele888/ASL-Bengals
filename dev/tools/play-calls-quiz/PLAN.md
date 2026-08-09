# Play Calls Quiz — design plan

**Build location**: `dev2/` (a full copy of `dev/`, same Firebase backend), not `dev/`.
The current `dev/` build is under coach review right now, so this feature gets built and
tested at `https://natesteele888.github.io/ASL-Bengals/dev2/` instead, with an on-page
banner marking it as an internal build. Once it's ready and reviewed, it gets folded back
into `dev/`. New Firebase paths this feature introduces (`players`, `points`,
`playCallsQuizResults`) will use a `dev2`-prefixed namespace during development so test data
never mixes with the real team's data — existing shared paths (`playEdits`, `leaderboard`,
`analytics`) are read normally from the same live data.

Status: **draft for review** — nothing built yet. This maps out the feature Nathan asked for
on 2026-08-09; once he signs off (or edits this doc), build proceeds phase by phase below.

## What it is

A new quiz mode, separate from the existing Signal Study Quiz / Timed Quiz. Ten rounds,
ordered easiest → hardest. Each round shows the hand-signal sequence for one specific play
call (silently, no text captions), and the player answers by setting up a call themselves —
Play, Wing side, Direction, Motion on/off, Boot on/off — to match what they saw. Not timed.
Pure recognition.

## Why this is mostly plumbing, not new invention

`buildSignalSequence(playKey, wingSide, direction, insideOutside, motionOn, bootOn)` in
`dev/js/play-calls.js` already generates the exact ordered signal-card list for any call.
The existing flip-card playback (same file, `startSignalSequence()`) already auto-loops a
sequence twice and shows a Replay button afterward. Both are reused almost as-is — the new
work is mostly the answer UI, scoring, the curated 10-round list, and player identity.

## Decisions locked in with Nathan (2026-08-09)

- **Identity**: name + 4-digit PIN, no email. Same SHA-256-hash-on-device pattern already
  used for the login codes and FrontSeat/admin PIN (`auth.js`'s `sha256Hex`) — nothing new
  to invent there. Lets a player resume their point total on any device.
- **Points scope**: one running per-player total fed by *all* recognition activities —
  this new Play Calls Quiz, the existing Signal Study Quiz, and the Timed Quiz. Existing
  quizzes get retrofitted to add to the same total once a player is signed in.
- **Scoring rule**: sequence auto-plays twice (already built, unchanged). Answer correctly
  without touching Replay = full points for that round. Touch Replay at least once before
  submitting, then answer correctly = half points. Wrong even after replays = zero for that
  round. (10 rounds, so max score is round-count × full-point-value, e.g. 10 rounds × 10pts
  = 100 for a perfect no-replay run.)
- **What counts as an answer dimension**: six, not five. Nathan named Play, Wing, Direction,
  Motion, Boot — and confirmed Inside Zone's Read A/B is correctly left out (that's a
  live, in-the-moment read by the ball carrier, not something signaled from the sideline).
  But Inside/Outside on Blast and Double Blast *is* real signal information, not a hidden
  detail, so it's in:
  - **Blast and Double Blast** (corrected 2026-08-09, was wrong in the original draft
    below): Inside is a silent default for BOTH — no extra card at all, just the play card
    then direction. Outside is the one that gets called out explicitly, with the real
    Outside Zone card inserted before the play card (real example from Nathan: "Wing,
    Right, Outside, Double Blast, Right"). Blast used to show an explicit Inside/Outside
    card either way (reusing plain finger-count images) — that was wrong; both plays now
    behave identically. Answer control unchanged either way: pick which one was shown
    (same UI regardless of whether the underlying signal was silent or an explicit card).
  - Everything else (Inside Zone, Outside Zone, Option Pass, Sweep): no Inside/Outside
    control shown at all, since it doesn't apply to those plays.
- `option` is still excluded from the round pool below — it's `directionFixed`, and I want
  to confirm with Nathan what that should mean for a quiz answer before including it, rather
  than guess.

## Rounds change every attempt, not a fixed list of 10

Per Nathan's note, the same 10 questions every time would just get memorized. Instead of one
fixed list, there are **10 difficulty tiers** (still easiest → hardest, same progression
logic as before), and each tier has a pool of eligible calls — one gets picked at random from
its tier's pool each time someone plays. Global rule while picking: don't let the exact same
play come up more than twice in one 10-round run, and don't repeat a play two rounds in a row.

| Tier | Signals | Wing/Dir | Motion | Boot | Eligible plays | Notes |
|------|---------|----------|--------|------|-----------------|-------|
| 1 | 4 | same side | Off | Off | Inside Zone, Outside Zone, Sweep, Option Pass | Simplest base calls |
| 2 | 4 | same side | Off | Off | Inside Zone, Outside Zone, Sweep, Option Pass | Second simple round, different play than tier 1 |
| 3 | 4–5 | same side | Off | Off | Blast (Inside or Outside, random), Double Blast (Inside default or Outside) | First round with an Inside/Outside answer |
| 4 | 4–5 | opposite side | Off | Off | Same pool as tier 1 + 3 | First opposite wing/dir round |
| 5 | 4–5 | opposite side | Off | Off | Same pool as tier 1 + 3 | Second opposite-side round, reinforce before adding Motion |
| 6 | 5–6 | same side | On | Off | Any play (all allow Motion) | Introduces Motion |
| 7 | 5–6 | opposite side | On | Off | Any play | Motion + opposite sides |
| 8 | 5–6 | same side | Off | On | Inside Zone, Outside Zone, Blast, Sweep (only plays that allow Boot) | Introduces Boot |
| 9 | 6–7 | opposite side | On | On | Inside Zone, Outside Zone, Blast, Sweep | Motion + Boot stacked |
| 10 | 6–7 | opposite side | On | On | Inside Zone, Outside Zone, Blast, Sweep | Hardest: same stack as tier 9, one more pass at it |

This is a first draft, not final — easy to adjust any tier's pool, signal count, or
Motion/Boot introduction point. Flag anything that looks off. Recorded per-round in
`playCallsQuizResults` either way, so Coach Stats can later show which specific calls trip
players up most, same spirit as the existing "Hardest Signals" stat.

## Data model (proposed, Firebase Realtime Database)

```
players/{playerId}:        { name, pinHash, createdAt }
points/{playerId}:         { total, byActivity: { playCallsQuiz, standardQuiz, timedQuiz } }
playCallsQuizResults/{id}: { playerId, playerName, score, maxScore, date, rounds: [...] }
```

`playerId` is a generated ID, not derived from the name (so two kids named "Jake" don't
collide). Returning-player lookup: search `players` by typed name; if more than one match,
show a quick picker (e.g. add last-initial) before checking the PIN. All database calls go
through the same `window.firebaseAuthed()` anonymous-token flow already wired up today —
no separate auth system needed for this.

## UI flow (proposed)

1. New "Play Calls Quiz" entry alongside the existing Study / Quiz / Timed Quiz / Play
   Calls / Edit Plays tabs.
2. If no player is signed in on this device yet: "Who's playing?" screen — name + PIN,
   with an inline "new player? set a PIN" path. Signed-in state persists locally so this
   isn't re-entered every visit, only when switching players or on a new device.
3. Each round: same flip-card visual as today's Play Calls signal view, auto-plays twice
   with no text label under the image. Below it, an answer panel: Play picker, Wing L/R,
   Direction L/R, Motion on/off, Boot on/off (reusing the existing pill-toggle styling),
   plus Inside/Outside — shown only for Blast (pick one, like Wing/Direction) or Double
   Blast (on/off toggle, like Motion/Boot), hidden entirely for every other play. A Submit
   button, and a Replay button available any time before submitting.
4. Immediate per-round feedback (correct/half/wrong), a 10-dot progress tracker.
5. End screen: this run's score, full/half/wrong breakdown, and the player's updated
   lifetime point total. No manual "type your name to save" step needed — they're already
   signed in, so it saves automatically.
6. Coach Stats panel gets a new section: top point totals across the team, plus Play Calls
   Quiz aggregate stats (same style as the existing Standard/Timed Quiz sections there).

## Build phases

1. **Player identity** — sign-up/sign-in screen, `players` + PIN hashing, local session
   persistence.
2. **Quiz engine** — round sequencing off the curated 10-call list, reused signal playback
   with labels hidden, the answer-panel UI, scoring logic (full/half/zero per round).
3. **Points plumbing** — write results to `points/{playerId}`, and retrofit the existing
   Signal Study Quiz + Timed Quiz score-save paths to add to the same total when a player is
   signed in.
4. **Coach Stats additions** — team point leaderboard, Play Calls Quiz aggregate stats,
   plus a short onboarding tip overlay for the new mode (matching the existing Play Calls
   tutorial style).

Recommend building and shipping phase by phase rather than all at once, so each piece can be
tried on the field before the next is layered on.
