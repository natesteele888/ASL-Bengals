// Which modifiers a coach can actually SIGNAL for a given play, out of a
// given formation. The printed quick-reference sheet exists to answer
// exactly this question at a glance, so the badges on it have to be derived
// from the same facts the real signal builder (js/signals.js) uses -- not
// from a hand-typed table that can quietly drift out of sync with what the
// team is actually taught to run.
//
// Nathan: "Shotgun would have Option Pass with Wing, Motion and Direction
// icons. Inside Zone would have Wing, motion, Boot and direction icons...
// we can say W for Wing, M for Motion, L/R, and B for Boot. Whatever is
// simple to see."
//
// Checked against the real data, not assumed:
//   option_pass : noBoot only              -> Wing, Motion, Direction (no Boot)
//   inside_zone : hasReadToggle only        -> Wing, Motion, Boot, Direction
// Both match his examples exactly -- and inside_zone's hasReadToggle does
// NOT produce a badge, on purpose: js/signals.js's wing recipe never adds a
// card for Read A/B. It changes which defender the diagram says to key on,
// but nothing is signaled to the team for it, so a sideline call chart has
// nothing to say about it either.
//
// A FORMATION OTHER THAN 'split' SIGNALS LIKE WING TODAY. Every formation
// built in the wizard -- I-Formation, a custom one, anything -- resolves to
// the 'wing' recipe in js/signals.js (recipeNameFor's own fallback), because
// no formation-specific touch card exists yet for a coach-built formation.
// That is a real, current fact about the app, not a simplification made
// here: the badges below read it from the SAME resolution signals.js uses,
// so if that ever changes (a formation gets its own recipe), this sheet
// changes with it automatically instead of needing its own update.

(function () {
  'use strict';

  var BADGES = {
    side:      { code: 'W',  label: 'Wing/Side call',  color: '#e0570a' },
    sideSplit: { code: 'Sp', label: 'Split side call',  color: '#111111' },
    dir:       { code: 'Dir', label: 'Direction (L/R)', color: '#1b1b1b' },
    motion:    { code: 'M',  label: 'Motion',           color: '#1baf7a' },
    boot:      { code: 'B',  label: 'Boot',             color: '#e34948' },
    counter:   { code: 'C',  label: 'Counter',          color: '#6b3fa0' },
    overload:  { code: 'Ov', label: 'Overload',         color: '#c2703a' },
    pass:      { code: 'P',  label: 'Pass',             color: '#2a78d6' },
    io:        { code: '*',  label: 'Inside/Outside',   color: '#2a78d6' },
  };

  // Same test play-calls.js itself uses to decide which signal grammar a
  // formation gets (buildSignalSequence's own formationId === 'split'
  // check) -- resolved through the registry so an alias ('shotgun') reads
  // the same as its canonical id ('wing').
  function grammarFor(formationId) {
    var rid = (window.Formations && window.Formations.resolveId(formationId)) || formationId;
    return rid === 'split' ? 'split' : 'wing';
  }

  // playType flags are read the exact way the real toggle-availability
  // checks in js/play-calls.js read them (updateBootAvailability's !noBoot,
  // updateCounterAvailability's hasCounter, the Outside Zone slot's
  // hasInsideOutside) -- see that file's own comments for why each one
  // means what it means; this does not re-derive the rule, only the flag.
  function badgesFor(playType, formationId) {
    if (!playType) return [];
    var grammar = grammarFor(formationId);
    var out = [];

    if (grammar === 'split') {
      out.push(BADGES.sideSplit);
      if (playType.hasInsideOutside) out.push(BADGES.io);
      out.push(BADGES.dir); // Split's recipe calls Direction on every play, no exception
      // Pass is offered for any play that has real Split data at all --
      // noSplit means the opposite (no Split alignment exists for it, so it
      // cannot appear in a Split section in the first place; kept as a
      // belt-and-suspenders check in case a caller passes one anyway).
      if (!playType.noSplit) out.push(BADGES.pass);
      return out;
    }

    out.push(BADGES.side);
    if (window.Formations && window.Formations.supportsOverload(formationId)) out.push(BADGES.overload);
    out.push(BADGES.motion); // universal in the wing recipe -- no when() gates it by play
    if (playType.hasInsideOutside) out.push(BADGES.io);
    // pop_pass is the one play the wing recipe never calls a Direction card
    // for -- its own Pop Pass 2 modifier takes that slot instead.
    if (playType.key !== 'pop_pass') out.push(BADGES.dir);
    if (!playType.noBoot) out.push(BADGES.boot);
    if (playType.hasCounter) out.push(BADGES.counter);
    return out;
  }

  // A short, sheet-friendly footnote for a badge, for a legend printed once
  // per page rather than spelled out on every row.
  function legendEntries() {
    return [BADGES.side, BADGES.sideSplit, BADGES.dir, BADGES.motion,
      BADGES.boot, BADGES.counter, BADGES.overload, BADGES.pass, BADGES.io];
  }

  window.PlayModifiers = {
    BADGES: BADGES,
    grammarFor: grammarFor,
    badgesFor: badgesFor,
    legendEntries: legendEntries,
  };
})();
