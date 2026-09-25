// ---------------------------------------------------------------------------
// Game Plan -- Nathan: "I need to be able to choose plays from the playbook,
// with the directions and toggles I want. Those are the plays of the week
// that the coach wants to run against the other team." Extends This Week's
// existing "Featured Plays" picker (js/thisweek.js) rather than a second,
// separate concept -- Nathan's own call, given "we can't have two places"
// (this session's own standing rule) when asked directly whether Game Plan
// should be a new section or an upgrade to This Week's existing one.
//
// A "play call" here is a full, dialed-in instance of a play -- not just
// {key, direction}, the shape every consumer of thisWeek.json's own `plays`
// array (This Week, Drive Scripts, schedule.js's inline preview) has stored
// until now. A `v: 2` entry carries every toggle js/play-calls.js's own
// buildCard() tracks (wingSide, direction, alignmentValues, Motion/Boot/
// Counter/PopVariant, Split's own side+pass+protection, Wing's own older
// overloadOn boolean) so "+ Add to Game Plan" on the real card captures
// EXACTLY what's on screen, not a guessed-at default.
//
// Every OLDER saved entry is bare {key, direction} -- v1, implicitly. Never
// migrated in place: describe() below normalizes on READ, everywhere, so
// old data keeps rendering exactly as it always has, with zero one-time
// conversion pass and zero risk to what's already saved.
// ---------------------------------------------------------------------------
(function () {

  const MAX_PLAYS = 15;

  // Same 8-family list window.playbookLiveFamilies() (js/playbook-pdf.js)
  // already encodes, matched against whatever's actually in
  // window.DATA.playTypes right now, plus custom-formation plays appended
  // after (never interleaved, so no existing number ever shifts) -- this is
  // the SAME pattern js/thisweek.js and js/drivebuilder.js each already keep
  // their own small copy of (drivebuilder.js's own header comment already
  // defends the duplication), not a new one. Kept here so every consumer of
  // a legacy (v1) entry -- This Week, Drive Scripts, the Call Sheet PDF --
  // resolves its label/color identically, through this one function.
  function numberedRows() {
    if (!window.playbookLiveFamilies || !window.DATA || !window.DATA.playTypes) return [];
    const families = window.playbookLiveFamilies();
    let n = 1;
    const rows = [];
    families.forEach((fam) => {
      ['Left', 'Right'].forEach((direction) => {
        rows.push({ number: n++, key: fam.key, label: fam.label, color: fam.color, direction });
      });
    });
    return rows.concat(customFormationRows(n));
  }

  const CUSTOM_FORMATION_COLORS = ['#8e44ad', '#16a085', '#c0392b', '#2c3e50'];
  function customFormationRows(startNumber) {
    if (!window.DATA || !window.DATA.playTypes || !window.Formations) return [];
    const colorByFormation = {};
    let colorIdx = 0;
    const rows = [];
    let n = startNumber;
    window.DATA.playTypes.forEach((pt) => {
      if (!pt.authoredFormationId) return;
      if (!(pt.authoredFormationId in colorByFormation)) {
        colorByFormation[pt.authoredFormationId] = CUSTOM_FORMATION_COLORS[colorIdx % CUSTOM_FORMATION_COLORS.length];
        colorIdx++;
      }
      const formation = window.Formations.get(pt.authoredFormationId);
      const formationName = formation ? formation.name : pt.authoredFormationId;
      const color = colorByFormation[pt.authoredFormationId];
      ['Left', 'Right'].forEach((direction) => {
        rows.push({ number: n++, key: pt.key, label: `${formationName}: ${pt.label}`, color, direction });
      });
    });
    return rows;
  }

  // A short, readable summary of a v2 entry's own active alignment toggles
  // (Heavy/Overload-style) -- e.g. "Overload Right". Walks the SAME data
  // js/play-calls.js's own title-bar logic already reads (only naming a
  // toggle when it's at a non-default value), so this can't drift from what
  // the toggle pills on the real card actually say.
  function alignmentSummary(entry) {
    if (!entry.alignmentValues || !window.PlayBuilderFormationsById) return '';
    const formation = window.PlayBuilderFormationsById[entry.formation];
    if (!formation || !formation.alignmentToggles) return '';
    const parts = [];
    formation.alignmentToggles.forEach((toggle) => {
      const value = entry.alignmentValues[toggle.id] || toggle.values[0].id;
      if (value !== toggle.values[0].id) {
        const valueDef = toggle.values.find((v) => v.id === value);
        parts.push(`${toggle.label} ${valueDef ? valueDef.label : value}`);
      }
    });
    return parts.join(', ');
  }

  function v2Label(entry) {
    const bits = [];
    if (entry.formation === 'split') {
      bits.push(`Split ${entry.splitSide}`);
    } else {
      const formationName = (entry.formation && entry.formation !== 'shotgun' && window.Formations && window.Formations.get(entry.formation))
        ? window.Formations.get(entry.formation).name : 'Wing';
      bits.push(`${formationName} ${entry.wingSide}`);
    }
    const align = alignmentSummary(entry);
    if (align) bits.push(align);
    bits.push(entry.label || entry.key);
    if (entry.formation !== 'split') bits.push(entry.direction);
    return bits.join(' — ');
  }

  // The one place every consumer (This Week's read-only grid, its coach
  // editor list, Drive Scripts' picker, the Call Sheet PDF) goes through to
  // turn a saved entry -- v1 or v2 -- into a label + color, and (for v2) the
  // full call detail needed to actually render it. Never branches on shape
  // anywhere else -- a v1 entry's rendering stays byte-identical to what
  // makeStaticCard already did before this file existed (returns `row`, not
  // a v2 shape, so the caller keeps using its own already-correct legacy
  // render path); a v2 entry is returned as-is for the caller to render with
  // its full, real toggle state.
  function describe(entry) {
    if (!entry) return { label: '', color: '#999', v2: null, row: null };
    if (entry.v === 2) return { label: v2Label(entry), color: '#2c3e50', v2: entry, row: null };
    const rows = numberedRows();
    const row = rows.find((r) => r.key === entry.key && r.direction === entry.direction);
    if (!row) return { label: `${entry.key || '?'} • ${entry.direction || ''}`, color: '#999', v2: null, row: null };
    return { label: `${row.label} • ${row.direction}`, color: row.color, v2: null, row };
  }

  // Same v1-defaulting js/thisweek.js's makeStaticCard already does inline
  // (that function's own copy is left untouched -- already verified working,
  // no reason to risk it for a DRY pass) -- but a SECOND real consumer, the
  // Call Sheet PDF (js/gameplan-pdf.js, new), needs the identical full
  // detail (not just enough to render a diagram -- also insideOutside/
  // formation for a correct window.buildSignalSequence call), so it's
  // factored out here rather than written a third time. Returns a full,
  // uniform object for EITHER shape -- a v2 entry as-is, a v1 entry
  // upgraded with the same real defaults (playbookDefaultSubvariant,
  // authoredFormationId) makeStaticCard already established as correct.
  function resolveForRender(entry) {
    if (!entry) return null;
    if (entry.v === 2) return entry;
    const rows = numberedRows();
    const row = rows.find((r) => r.key === entry.key && r.direction === entry.direction);
    if (!row) return null;
    const playType = (window.DATA && window.DATA.playTypes) ? window.DATA.playTypes.find((p) => p.key === row.key) : null;
    const def = (window.playbookDefaultSubvariant && playType) ? window.playbookDefaultSubvariant(playType) : { io: null, rp: null };
    return {
      v: 1, key: row.key, label: row.label, direction: row.direction, wingSide: row.direction,
      formation: playType ? playType.authoredFormationId : undefined,
      splitSide: 'Left', insideOutside: def.io, readPosition: def.rp,
      motionOn: false, bootOn: false, qbSneakOn: false, counterOn: false, popVariantOn: false,
      passOn: false, protection: null, overloadOn: false, leftCall: null, rightCall: null, alignmentValues: null,
    };
  }

  // Captures js/play-calls.js buildCard()'s OWN live state (its "+ Add to
  // Game Plan" button calls this directly with a snapshot of its own
  // closure) -- immediately fetches thisWeek.json, appends, and PUTs back,
  // rather than only pushing into js/thisweek.js's own in-memory
  // pendingSelection. Real reason, not just tidiness: thisweek.js's
  // loadThisWeek() does `pendingSelection = saved.plays.slice()` on every
  // load -- an in-memory-only add would be silently overwritten the next
  // time This Week's editor happens to (re)load, if this hadn't already
  // saved it for real first.
  function thisWeekUrl() { return `${FIREBASE_DB_URL}/thisWeek.json`; }
  function addEntry(state) {
    const entry = Object.assign({}, state, {
      v: 2,
      id: 'gp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      addedAt: new Date().toISOString(),
    });
    return window.firebaseAuthed(thisWeekUrl())
      .then((url) => fetch(url))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const current = (data && Array.isArray(data.plays)) ? data.plays : [];
        if (current.length >= MAX_PLAYS) {
          throw new Error(`Game Plan is full (${MAX_PLAYS}) — remove one on This Week first.`);
        }
        const payload = Object.assign({}, data, { plays: current.concat([entry]), updatedAt: new Date().toISOString() });
        return window.firebaseAuthed(thisWeekUrl()).then((url) => fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }));
      })
      .then((r) => {
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`);
        if (window.ThisWeekGamePlan) window.ThisWeekGamePlan.onExternalAdd(entry);
        return entry;
      });
  }

  // ---------------------------------------------------------------------
  // Game Plan Builder support (js/gameplan-builder.js) -- Nathan: "you add
  // those plays to a playlist and edit them from there to fine tune the
  // directions and all. Then you save to that game plan." The Builder is
  // a full-screen, self-contained authoring flow (same "own fetch, own
  // state" precedent as two-minute-drill.js) rather than one that depends
  // on This Week's own editor happening to already be open/loaded this
  // session -- so it does its OWN read/write of thisWeek.json here, the
  // one module that already owns that URL, rather than reaching into
  // js/thisweek.js's private module state.
  // ---------------------------------------------------------------------

  // Loads whatever's ALREADY in the Game Plan right now, independent of
  // whether This Week's own editor has been opened this session -- the
  // Builder pre-populates its draft from this (never starts blank), so
  // opening it and saving can never silently wipe out plays a coach
  // already curated some other way (the picker chips, or "+ Add to Game
  // Plan" on the real card).
  function loadCurrentGamePlan() {
    return window.firebaseAuthed(thisWeekUrl())
      .then((url) => fetch(url))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => ({
        gameId: (data && data.gameId) || '',
        plays: (data && Array.isArray(data.plays)) ? data.plays.slice() : [],
      }));
  }

  // Saves the Builder's current draft as THE Game Plan -- a whole-list
  // replace (matching "then you have your game plan," a complete,
  // coherent result, not an incremental append), but safe by construction
  // since the draft always started from loadCurrentGamePlan() above, not
  // empty. Fetches current data first (same pattern addEntry() already
  // uses) so coachKeys/anything else in thisWeek.json this file never
  // touches is preserved, not clobbered by a payload that only ever knew
  // about plays/gameId. Notifies This Week's own editor if it happens to
  // be open (mirrors onExternalAdd's own two-way-sync reasoning).
  function saveDraftAsGamePlan(gameId, plays) {
    return window.firebaseAuthed(thisWeekUrl())
      .then((url) => fetch(url))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const payload = Object.assign({}, data, {
          plays: plays.slice(),
          gameId: gameId || '',
          updatedAt: new Date().toISOString(),
        });
        return window.firebaseAuthed(thisWeekUrl()).then((url) => fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }));
      })
      .then((r) => {
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`);
        if (window.ThisWeekGamePlan && window.ThisWeekGamePlan.onReplace) {
          window.ThisWeekGamePlan.onReplace(gameId, plays);
        }
        return { gameId, plays };
      });
  }

  // Exposed standalone (not just used inside v2Label) so js/gameplan-pdf.js
  // can build its own, more compact per-card label (formation-grouped under
  // a section header, so repeating the formation name on every card would
  // be redundant) without a second copy of this same toggle-walking logic.
  window.GamePlan = {
    describe, resolveForRender, alignmentSummary, addEntry, numberedRows, MAX_PLAYS,
    loadCurrentGamePlan, saveDraftAsGamePlan,
  };
})();
