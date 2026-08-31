# Stat Keeper → Player Profiles & Leaders — Integration Plan

Plan only, no live-app code yet. This is about connecting the standalone Stat Keeper prototype to the real ASL Bengals app (`dev2`) once you're ready — written after reading the actual live code (`player-profile.js`, `coachtools-stats.js`, `game-stats-editor.js`), not guessing at it.

## The good news: most of this already exists

Before designing anything new, it's worth being clear about what's already live and working today:

- **Player profiles already exist** (`player-profile.js`) — an ESPN-card-style page per player with season/career stat tables and a recent-games table, opened from a roster chip or a leaderboard name.
- **A leaders page already exists** (`coachtools-stats.js`, the "Leaderboard" tab under Coach Tools > Stats) — Team Leaders (top 3 per category for the season), Game Leaders (top performer per category for one picked game), and a per-player trend graph.
- Both of these are **fully derived, live, automatic** — there is no separate "leaders" data to maintain. They both read every game's `statSheet` off `schedule.json` through one shared function, `window.computeGamePlayerStats`, so a player's profile and the team leaderboard can never drift apart from each other.

This means the real ask isn't "build player profiles and a leaders page" — it's "get Stat Keeper's play-by-play log turned into a `schedule.json` game's `statSheet`, in the shape that machinery already expects." Once that one handoff exists, profiles and leaders update themselves with no further work.

## The gap: two different shapes for the same stats

Stat Keeper compiles its play log into per-player **totals** — e.g. `rushing: [{name:'Jacob W', att:4, yds:37, td:1, fd:2}]`.

The live app's `statSheet` stores per-player **attempt-by-attempt arrays** instead — e.g. `rushing: [{num:'6', attempts:[{yds:12,fd:false,dir:'Left'},{yds:9,fd:true,dir:'Right'},...]}]`, keyed by jersey **number**, not name, and rolled up into totals only at display time by `computeGamePlayerStats`.

So this isn't a drop-in — it needs a translator that takes Stat Keeper's `plays[]` log (not its already-summed totals) and replays each play into the live shape: one `attempts` entry per rushing/passing/receiving/kickoff play, one `marks` entry (`'solo'` or `'assist'`) per tackle, and a simple counter bump per defensive extra. That's a mechanical conversion, not a redesign — the live editor already builds exactly this shape one attempt at a time as a coach clicks "+" during manual entry; Stat Keeper's log just needs to feed the same shape from the other end.

Roster matching also needs to switch from name (what Stat Keeper stores) to jersey number (what `statSheet` keys on) at the translation step — using the same roster snapshot both tools already share.

## New categories Stat Keeper tracks that the live app doesn't have yet

Since building the punt/penalty/onside/scoring features, Stat Keeper now tracks several things `schedule.json`'s `statSheet` has no field for at all: touchdowns as their own flag, PAT/2-point/safety, penalties (team + player + yards), punting (result + net field position), and onside kicks. None of this is a translation problem — it's new ground. Before any of it can show up in a player profile or the leaderboard, three places in the live app need new fields, not just new data:

1. **`game-stats-editor.js`** — `blankGameStatSheet()` / `normalizeStatSheet()` need new arrays (e.g. `penalties`, `punts`, `scoring`) added to the shape every game record carries.
2. **`coachtools-stats.js`** — `gamePlayerStats()` (the shared aggregator) needs to know how to fold those new arrays into per-player totals, and the `CATS` list needs new entries if they should get their own leaderboard category (e.g. "Touchdowns," "Net Punting").
3. **`player-profile.js`** — `OFFENSE_CATS` / `DEFENSE_CATS` need the matching entries if they should appear on a player's card.

This is a real, if small, schema change to production data — worth doing deliberately rather than bolted on silently, since every existing game record predates these fields.

## Where "attach to game" would live

Coach Tools > Stats > **Enter Stats** already does exactly this pattern today: pick a real game from the schedule, edit its `statSheet` with the shared editor, hit Save, and it writes straight back into that game's record. The natural integration point is an **"Import from Stat Keeper"** button right there, next to the existing game picker — it would take a Stat Keeper export (the same JSON the prototype already downloads) and run it through the translator above into the selected game's `statSheet`, then drop the coach into the normal editor to review/adjust before saving. No new screen, no new save path — it rides the one that's already gate-checked, tested, and in daily use.

## Automatic once wired

Because profiles and leaders both read off `schedule.json` live, nothing else has to be built for "the stats should show for the leaders category" once the statSheet is written correctly:

- The player's profile page picks it up on next load (through `computeGamePlayerStats`).
- The team leaderboard picks it up on next load (same function).
- The per-player trend graph picks it up on next load (same function again).

That's the payoff of the app's existing "one aggregator, no separate copies" design — it's already built to absorb this.

## Rollout safety

Same discipline used everywhere else in this project: this writes to the real `schedule.json`, the same file the live Coach Tools reads for every team feature. Before this ever touches a real game:

1. Build the translator against a **throwaway test game** created in Coach Tools (the "+ New Game" button already there), not a real scheduled game.
2. Confirm the imported stats look identical whether entered manually through the existing editor or imported from Stat Keeper — same numbers, same player attribution.
3. Confirm a game statSheet that already has manually-entered stats isn't silently overwritten by an import (merge vs. replace needs an explicit choice at import time).
4. Only then attach a real game.

## Open decisions before building

- Do touchdowns/PAT/2-point/safety get their own leaderboard categories, or just annotate existing yardage rows (e.g. a small "TD" badge next to rushing yards)?
- Do penalties and punting belong on offensive or defensive player profiles, or their own "Special Teams" section on the card?
- Merge or replace when importing into a game that already has manually-entered stats?
- Do older, already-played games get backfilled with zeros for the new categories (penalties, punts, etc.), or do they just show "-" forever since no play-by-play exists for them? (The existing "Career Stats (tracking starts this season)" precedent on the player card suggests the app is already comfortable with "zero before a certain point," so this likely just follows that same pattern.)

## Suggested build order, when ready

1. Add the new `statSheet` fields (penalties/punts/scoring) to `game-stats-editor.js`'s blank/normalize functions — non-breaking, old games just get empty arrays.
2. Extend `gamePlayerStats()` in `coachtools-stats.js` to fold the new arrays into totals.
3. Add the new categories to `CATS` (leaderboard) and `OFFENSE_CATS`/`DEFENSE_CATS` (player profile) — decide the open questions above first.
4. Build the Stat Keeper → live-shape translator as a standalone function, unit-testable against a handful of real Stat Keeper exports before it touches any UI.
5. Add the "Import from Stat Keeper" button to Coach Tools > Stats > Enter Stats.
6. Test end-to-end against a throwaway game per the rollout safety section above.
7. Only then use it on a real game.
