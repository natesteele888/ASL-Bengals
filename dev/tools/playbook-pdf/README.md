# Sideline Playbook PDF — how to regenerate it

This folder builds `ASL_Bengals_Sideline_Playbook.pdf`, the printable
sideline reference. It's not a static document — it's generated from data,
so whenever plays change mid-season (new play, new blocking assignment, a
wrinkle added via Edit Plays), a fresh PDF can be produced without redoing
any design work.

## Where the data comes from

Two sources, combined:

1. **`live_playtypes.json`** (in this folder) — a snapshot of the actual
   live play data from the app's Firebase cloud save
   (`https://aslbengals-default-rtdb.firebaseio.com/playEdits.json`). This is
   what coaches actually see on the site, including anything edited through
   Edit Plays — it can differ from the checked-in `dev/data/plays.json`.
   **This file goes stale the moment a coach saves a new edit**, so it needs
   to be refreshed before regenerating the PDF (see below).
2. **`dev/data/plays.json`** (shipped repo file) — only used for the
   formation/backfield/wing/viewBox constants (never stored in Firebase) and
   as a source of truth for a handful of capability flags (`noBoot`,
   `hasReadToggle`, `hasInsideOutside`, `directionFixed`) that the app always
   force-applies over whatever's in the cloud, since those are code-level
   decisions, not coach data.

## To regenerate after plays change mid-season

Ask Claude (in a Cowork session with this project) something like:
> "Regenerate the sideline playbook PDF from the live site."

Claude will:
1. Fetch the current data with 7 requests (one per play index, since the
   full payload is too large to fetch in one shot):
   `https://aslbengals-default-rtdb.firebaseio.com/playEdits/0.json` through
   `/6.json`
2. Overwrite `live_playtypes.json` in this folder with the combined result
   (an array of all 7 play type objects, in index order).
3. Run `build_playbook_pdf.py` (needs Python 3 + the `reportlab` package).
   The script writes to `output/ASL_Bengals_Sideline_Playbook.pdf` (a
   gitignored scratch copy) and **also copies it to
   `dev/playbook/ASL_Bengals_Sideline_Playbook.pdf`** automatically — that
   second copy is the one that's actually committed and deployed, since it's
   the file the live app links to from the 5-tap Coach Stats admin panel
   ("Save Sideline Playbook PDF" button). No manual copy step needed.
4. Hand the PDF back to you, and stage a commit covering both the updated
   `live_playtypes.json` and the new `dev/playbook/...pdf` so the in-app
   download link stays current once you push.

## In-app download (5-tap admin panel)

Tap the header logo 5 times within 3 seconds, enter the coach PIN, and the
"COACH STATS" overlay now has a **Save Sideline Playbook PDF** button/link
at `dev/playbook/ASL_Bengals_Sideline_Playbook.pdf` (relative to
`dev/index.html`). On desktop browsers this downloads directly; on mobile
it opens the PDF in a new tab, from which "Share → Save to Files" (iOS) or
the browser's own download/save option (Android) saves it to the phone.

If a play is added or removed entirely (not just edited), update
`FAMILY_META` near the top of `build_playbook_pdf.py` — it's the ordered
list of `(play_key, section_color)` used to lay out the PDF. Everything
else (subvariant detection, Boot/Motion examples, page breaks) is driven
directly off the data, so no other changes should be needed.

## Tuning knobs (if the layout needs adjusting)

All near the top of `build_playbook_pdf.py`, under "Layout":
- `CELL_W` — size of each play diagram (bigger = fewer per page)
- `COLS` — diagrams per row (keep at 4+ to match the print brief)
- Path line weights are set inline in the `paths` loop inside
  `draw_diagram()` (`width = 0.9 if isBlocking else 1.5`)
