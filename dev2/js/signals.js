// Signals: the deck, and how a play call turns into a series of them.
//
// Nathan: "I don't have images yet for the overload, or i formation or some of
// the others. Need a way that you can assign the correct series of signals
// based on what the play call is."
//
// Two problems, and they are separate.
//
// ---------------------------------------------------------------------------
// 1. A SIGNAL HAS TO EXIST BEFORE ITS PHOTO DOES
//
// Every signal used to be a row in data/cards.json with an `img` path, so a
// signal without a photo simply could not be called -- SIGNAL_CARDS[id] came
// back undefined and the slideshow showed a broken image. That blocks adding
// Overload, I-Formation or the pass-protection calls until someone stands in
// a field with a camera.
//
// So a signal is now a registry entry, and the photo is optional. One with no
// photo renders as a generated placeholder card that says what the signal IS
// and that its photo is still to come. The card is deliberately unmistakable
// -- dashed border, no hand -- so nobody teaches it to a kid as a real sign.
//
// Because the placeholder is produced as a data: URI, every existing consumer
// keeps working untouched: the slideshow does `img.src = signal.src`, and so
// do the PDF exporters and the quiz. Nothing downstream needs to know the
// difference.
//
// ---------------------------------------------------------------------------
// 2. THE SERIES ITSELF HAS TO BE ASSIGNABLE
//
// A play's signal series was two hand-written functions of eleven arguments,
// with the order of the cards expressed as the order of `if` statements. Which
// meant "what does a coach signal for this call" could only be answered by
// reading code, and a new formation or a new modifier meant editing that code
// in two places.
//
// It is now a RECIPE: an ordered list of steps per formation, each step saying
// which card it shows and when it applies. Same output -- this was introduced
// under a regression harness that fingerprints every play's sequence, and the
// fingerprint did not move -- but the series is now a thing you can read, and
// a play can carry its own.

(function () {
  'use strict';

  // --- Signals that have no photo yet -----------------------------------
  //
  // Ids continue past cards.json's 1..32. Kept here rather than in
  // data/cards.json because that file is the PHOTOGRAPHED deck (it is also
  // what the study-guide and quiz enumerate as learnable cards); these are
  // declared calls awaiting a shoot. When a photo is taken, move the entry
  // into cards.json with its img and delete it here -- the id stays the same,
  // so nothing that references it has to change.
  //
  // I-FORMATION (33) is a special case of that same rule, not an exception:
  // Nathan photographed it and it's in data/cards.json locally (id 33,
  // assets/cards/33.png), but this app's cards actually come from live
  // Firebase (dev2PlayData/cards.json), which only he can write to (no
  // login here) -- so it's NOT yet confirmed live. Kept here too, at the
  // SAME id, purely as a fallback: register() below only uses this entry
  // when id 33 isn't already real (byId[33] unset), so this is a harmless
  // no-op the moment Firebase actually has it, and a real placeholder
  // ("photo coming") instead of a broken "UNKNOWN 33" card until then.
  // Remove this entry once Firebase is confirmed to have id 33 for real.
  var PENDING = [
    { id: 33, group: 'Formation', meaning: 'I-FORMATION' },
    // Same situation as 33 above -- Nathan: "this is signal #34 which is
    // 5 Guys formation signal," uploading the real photo himself (no
    // login here to do it for him). Kept as a fallback at the SAME id;
    // harmless no-op the moment Firebase actually has 34 for real.
    { id: 34, group: 'Formation', meaning: '5 GUYS' },
    // Same situation, found live (2026-09-25) via a direct Firebase read:
    // Nathan had already uploaded a real Overload photo, continuing the
    // sequence normally at id 35 (not the 102 this file guessed at before
    // any of 33/34/35 existed for real) -- so this entry, and every
    // recipe step that referenced 102, were silently pointing at a
    // placeholder while the real photo sat unused at byId[35]. Fixed to
    // the SAME real id; harmless no-op now that Firebase already has it.
    { id: 35, group: 'Formation', meaning: 'OVERLOAD' },
    // Nathan: linemen "need to work in a pass pocket protection vs a straight
    // pass block". Two distinct calls, because they are two distinct jobs:
    // one sets and cups around the quarterback, the other fires out at the man
    // over you.
    { id: 103, group: 'Blocking', meaning: 'PASS POCKET' },
    { id: 104, group: 'Blocking', meaning: 'STRAIGHT PASS BLOCK' },
  ];

  var byId = {};

  function register(card) {
    byId[card.id] = {
      id: card.id,
      group: card.group || '',
      meaning: card.meaning || '',
      img: card.img || null,
    };
  }

  // A card drawn from nothing, for a signal whose photo has not been taken.
  // 277x339 matches the real cards in assets/cards, so it drops into the same
  // slot at the same aspect without any layout special-casing.
  function placeholderSrc(meaning) {
    var words = String(meaning || 'SIGNAL').split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      if ((line + ' ' + w).trim().length > 12) { lines.push(line.trim()); line = w; }
      else { line = (line + ' ' + w).trim(); }
    });
    if (line) lines.push(line);
    var startY = 170 - (lines.length - 1) * 16;
    var text = lines.map(function (l, i) {
      return '<text x="138.5" y="' + (startY + i * 32) + '" text-anchor="middle" '
        + 'font-family="system-ui,sans-serif" font-size="25" font-weight="800" '
        + 'fill="#7a3b00">' + escapeXml(l) + '</text>';
    }).join('');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="277" height="339" viewBox="0 0 277 339">'
      + '<rect x="4" y="4" width="269" height="331" rx="14" fill="#fff5ea" '
      + 'stroke="#e0570a" stroke-width="4" stroke-dasharray="12 9"/>'
      + '<text x="138.5" y="70" text-anchor="middle" font-family="system-ui,sans-serif" '
      + 'font-size="13" font-weight="800" letter-spacing="1.5" fill="#c2703a">SIGNAL</text>'
      + text
      + '<text x="138.5" y="288" text-anchor="middle" font-family="system-ui,sans-serif" '
      + 'font-size="13" font-weight="700" fill="#c2703a">photo coming</text>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Load the photographed deck, then the pending ones. Called once ALL_CARDS
  // is available (index.html boots it from Firebase).
  function load(allCards) {
    byId = {};
    (allCards || []).forEach(register);
    PENDING.forEach(function (p) {
      // A pending signal whose photo has since landed in cards.json must not
      // overwrite the real thing.
      if (!byId[p.id]) register(p);
    });
  }

  function get(id) { return byId[id] || null; }

  // What the slideshow, the PDFs and the quiz all actually want: something to
  // put in an <img src>. Falls back to a placeholder rather than a broken
  // image, so an un-photographed signal degrades to "we know what this is,
  // we just haven't shot it" instead of a grey box.
  function src(id) {
    var c = byId[id];
    if (!c) return placeholderSrc('UNKNOWN ' + id);
    return c.img || placeholderSrc(c.meaning);
  }

  function label(id) {
    var c = byId[id];
    return c ? c.meaning : ('Signal ' + id);
  }

  // For a coach: what still needs photographing. Worth surfacing, because a
  // placeholder that nobody ever replaces quietly becomes the real card.
  function needsPhoto() {
    return Object.keys(byId)
      .map(function (k) { return byId[k]; })
      .filter(function (c) { return !c.img; })
      .sort(function (a, b) { return a.id - b.id; });
  }

  // --- Sequence recipes -------------------------------------------------
  //
  // A play's signal series, as DATA. Each step says which card it shows and
  // when it applies; the series is the order of the steps.
  //
  // `ctx` carries everything a step can branch on: playKey, wingSide,
  // direction, splitSide, insideOutside, and the booleans for motion, boot,
  // counter, pass, popVariant. A step's `when` decides whether it fires;
  // `card` and `label` may each be a value or a function of ctx.
  //
  // This replaces two hand-written functions whose card ORDER was expressed
  // as the order of `if` statements. It produces byte-identical sequences
  // (proven by the regression harness), but now a formation's series can be
  // read in one place, and a play can override it -- see sequenceFor().
  //
  // Card ids referenced by name so the recipes stay readable.
  var WING_TOUCH = 7, SPLIT_TOUCH = 31, I_TOUCH = 33, FIVE_GUYS_TOUCH = 34, BOOT = 26, COUNTER = 18, POP2 = 29,
      QB_SNEAK = 27, OUTSIDE_ZONE = 10, OVERLOAD = 35;
  // "WING LOCATION" already exists as a real, photographed 2-photo pool (7,
  // 8, data/cards.json -- Nathan: "Wing (signal 7 or 8)") from Wing's own
  // deck. I's "Wing" modifier call (moving #4 out from Heavy's tucked
  // default) is the same real-world signal/gesture, so it reuses this pool
  // directly rather than needing its own new photo -- picked randomly, same
  // pattern as MOTION_IDS/PASS_IDS below, so the defense can't key a single
  // fixed photo.
  var I_WING_IDS = [7, 8];
  var FINGERS = { Right: [4, 5, 6], Left: [1, 2, 3] };
  var MOTION_IDS = [11, 12];
  var PASS_IDS = [28, 29, 30];

  // Some cards are deliberately drawn at random from a pool so the defense
  // cannot pattern-read a fixed sign -- the finger counts for a side, and the
  // interchangeable Motion/Pass cards. `exclude` stops the same photo showing
  // twice in a row when two consecutive steps call the same side.
  function pickFinger(side, exclude) {
    var pool = FINGERS[side === 'Right' ? 'Right' : 'Left'];
    var options = exclude === undefined ? pool : pool.filter(function (id) { return id !== exclude; });
    return options[Math.floor(Math.random() * options.length)];
  }
  function pickFrom(pool) { return pool[Math.floor(Math.random() * pool.length)]; }

  var RECIPES = {
    // The Wing/Shotgun call: touch, where the wing is, then the play, then
    // which way it goes, then any modifiers.
    wing: [
      { card: WING_TOUCH, label: 'Wing' },
      { card: function (c) { return (c.wingFinger = pickFinger(c.wingSide)); },
        label: function (c) { return 'Wing Location: ' + c.wingSide; } },
      // Overload is an alignment call, so it comes while the pre-snap picture
      // is still being set -- before the play itself, and before Motion, since
      // it decides where the tight end lines up and Motion moves someone from
      // wherever they ended up.
      { when: function (c) { return c.overloadOn; }, card: OVERLOAD, label: 'Overload' },
      // Motion is called right after the wing spot is set: it is part of the
      // pre-snap picture, and that is where the toggle sits in the UI too.
      { when: function (c) { return c.motionOn; },
        card: function () { return pickFrom(MOTION_IDS); }, label: 'Motion' },
      // Inside is a silent default for Blast and Double Blast; only Outside
      // is called out, and it comes BEFORE the play card -- Nathan's own
      // example: "Wing, Right, Outside, Double Blast, Right".
      { when: function (c) { return isBlast(c.playKey) && c.insideOutside === 'Outside'; },
        card: OUTSIDE_ZONE, label: 'Outside Zone' },
      { card: function (c) { return c.playSignalId; }, label: function (c) { return c.playSignalLabel; } },
      // Pop Pass never calls a direction -- its own Pop 2 modifier takes
      // that slot instead.
      { when: function (c) { return c.playKey !== 'pop_pass'; },
        card: function (c) {
          return c.direction === c.wingSide ? pickFinger(c.direction, c.wingFinger) : pickFinger(c.direction);
        },
        label: function (c) { return 'Direction: ' + c.direction; } },
      { when: function (c) { return c.bootOn; }, card: BOOT, label: 'Boot' },
      { when: function (c) { return c.counterOn; }, card: COUNTER, label: 'Counter' },
      { when: function (c) { return c.popVariantOn && c.playKey === 'pop_pass'; },
        card: POP2, label: 'Pop Pass 2' },
    ],

    // Split: touch, the split side, the play, then the side AGAIN as its own
    // card. Nathan: "Ensure the run is always going to the split side" -- both
    // direction cards name the same side, matching the diagram and the way a
    // coach says the play out loud ("Inside Blast Right").
    split: [
      { card: SPLIT_TOUCH, label: 'Split' },
      { card: function (c) { return (c.splitFinger = pickFinger(c.splitSide)); },
        label: function (c) { return 'Split: ' + c.splitSide; } },
      { when: function (c) { return isBlast(c.playKey) && c.insideOutside === 'Outside'; },
        card: OUTSIDE_ZONE, label: 'Outside Zone' },
      { card: function (c) { return c.playSignalId; }, label: function (c) { return c.playSignalLabel; } },
      { card: function (c) { return pickFinger(c.splitSide, c.splitFinger); },
        label: function (c) { return 'Direction: ' + c.splitSide; } },
      // Pass negates the run call. Which of Pass 1/2/3 shows is random --
      // Nathan: "it's just any of those signals means it is pass".
      { when: function (c) { return c.passOn; },
        card: function () { return pickFrom(PASS_IDS); }, label: 'Pass' },
      // The line's protection call. Only meaningful once it IS a pass, and
      // only when a scheme has actually been chosen for the play.
      { when: function (c) { return c.passOn && c.protection === 'pocket'; },
        card: 103, label: 'Pass Pocket' },
      { when: function (c) { return c.passOn && c.protection === 'straight'; },
        card: 104, label: 'Straight Pass Block' },
    ],

    // I formation. Nathan's own spec, verbatim:
    // "I formation (heavy) - I > Direction > Play (dive) > Direction
    //  I formation (non-heavy) - I > Wing > Direction > Play (Dive) > Direction"
    // Heavy is I's own default (the tucked-in alignment, callable with no
    // extra signal, per the naming already established this session) --
    // ctx.alignmentValues.heavy defaults to 'on' (Heavy) the same way
    // getVariant's own data-driven toggle walk does, so a play with no
    // alignmentToggles state at all still reads as the (only) Heavy case
    // rather than silently showing a Wing card that doesn't apply.
    // Overload: Nathan's own spec, verbatim -- "I > Wing > Direction >
    // Overload > Direction > Play (dive) > Direction" (or, Heavy on, the
    // same shape minus the Wing step). alignmentValues.overload is one of
    // 'off'/'right'/'left' (the real 'overload' AlignmentToggle, formation
    // I -- js/playbuilder/schema.js), and gets a card of its own PLUS a
    // second finger-count card naming its side, same shape the wing-side
    // step already has -- two distinct direction-bearing calls, since
    // Overload's own side is independently callable, not tied to wingSide.
    i: [
      { card: I_TOUCH, label: 'I' },
      { when: function (c) { return (c.alignmentValues && c.alignmentValues.heavy) === 'off'; },
        card: function () { return pickFrom(I_WING_IDS); }, label: 'Wing' },
      { card: function (c) { return (c.wingFinger = pickFinger(c.wingSide)); },
        label: function (c) { return 'I: ' + c.wingSide; } },
      { when: function (c) { return c.alignmentValues && c.alignmentValues.overload && c.alignmentValues.overload !== 'off'; },
        card: OVERLOAD, label: 'Overload' },
      // Nathan: "if we add overload to a play, be sure to have the
      // signals be Overload then direction. The overload side is always
      // to the wing side unless it is the Left Overload or Right Overload
      // toggle selected." Overload's own side is only independently
      // callable when it DIFFERS from wingSide (the natural default --
      // the extra tight end goes to the side already heavier from the
      // wing) -- when it matches, a separate side card would just repeat
      // the wing/final-direction call already carrying that same side, so
      // it's skipped: "Overload" then straight to the play/direction, no
      // redundant "Overload: right" card in between.
      { when: function (c) { return c.alignmentValues && c.alignmentValues.overload && c.alignmentValues.overload !== 'off'
          && c.alignmentValues.overload !== (c.wingSide || '').toLowerCase(); },
        card: function (c) { return pickFinger(c.alignmentValues.overload === 'right' ? 'Right' : 'Left'); },
        label: function (c) { return 'Overload: ' + c.alignmentValues.overload; } },
      { card: function (c) { return c.playSignalId; }, label: function (c) { return c.playSignalLabel; } },
      // I's Sweep: Nathan: "There is no sweep left handing off to the 4,
      // with the wing in heavy on the left side" -- direction is never
      // independently callable for a directionOpposesWing play (it's
      // always the opposite of wing, implied, same reason the real card
      // hides its own Dir L/R toggle for one). The final card restates
      // the WING side instead of naming a separate "direction" -- Nathan's
      // own example: "I > Wing > Right > Overload > Right > Sweep >
      // Right" (the trailing side matches Wing/Overload's own Right, not
      // an opposite value).
      { card: function (c) { return c.directionOpposesWing ? c.wingFinger : pickFinger(c.direction, c.wingFinger); },
        label: function (c) { return c.directionOpposesWing ? ('I: ' + c.wingSide) : ('Direction: ' + c.direction); } },
    ],

    // "I Wing" formation: Nathan: "We should break the formation into I
    // formation with the 4 in the heavy position, then call 'I wing' the
    // one with the wing off the end of the line." Structurally identical
    // to RECIPES.i -- same touch card (still recognizably "I"), same
    // Overload steps, same play-card/direction steps -- except the "Wing"
    // modifier ALWAYS fires here (no `when` guard): this formation has no
    // Heavy state to gate it on, the wing-out alignment isn't a toggle
    // any more, it's the formation's own whole identity.
    'i-wing': [
      { card: I_TOUCH, label: 'I' },
      { card: function () { return pickFrom(I_WING_IDS); }, label: 'Wing' },
      { card: function (c) { return (c.wingFinger = pickFinger(c.wingSide)); },
        label: function (c) { return 'I: ' + c.wingSide; } },
      { when: function (c) { return c.alignmentValues && c.alignmentValues.overload && c.alignmentValues.overload !== 'off'; },
        card: OVERLOAD, label: 'Overload' },
      // Same "wing side is the implicit default, only an explicit
      // opposite-side call needs its own card" rule as RECIPES.i -- see
      // that recipe's own comment for Nathan's full spec.
      { when: function (c) { return c.alignmentValues && c.alignmentValues.overload && c.alignmentValues.overload !== 'off'
          && c.alignmentValues.overload !== (c.wingSide || '').toLowerCase(); },
        card: function (c) { return pickFinger(c.alignmentValues.overload === 'right' ? 'Right' : 'Left'); },
        label: function (c) { return 'Overload: ' + c.alignmentValues.overload; } },
      { card: function (c) { return c.playSignalId; }, label: function (c) { return c.playSignalLabel; } },
      { card: function (c) { return c.directionOpposesWing ? c.wingFinger : pickFinger(c.direction, c.wingFinger); },
        label: function (c) { return c.directionOpposesWing ? ('I: ' + c.wingSide) : ('Direction: ' + c.direction); } },
    ],

    // "5 Guys": Nathan, verbatim -- "the only signals are 5 guys > Left or
    // 5 Guys > Right, thats it." No play card (the QB calls the 1-5 number
    // himself, verbally, at the line -- never a hand signal from the
    // sideline) and no direction step (every "5 Guys" play is noDirection;
    // Wing side IS the only call this formation ever needs).
    '5-guys': [
      { card: FIVE_GUYS_TOUCH, label: '5 Guys' },
      { card: function (c) { return pickFinger(c.wingSide); },
        label: function (c) { return '5 Guys: ' + c.wingSide; } },
    ],
  };

  function isBlast(k) { return k === 'blast' || k === 'double_blast'; }

  function resolve(step, ctx) {
    return typeof step === 'function' ? step(ctx) : step;
  }

  // Walk a recipe against the current call. `ctx` is mutated as it goes so a
  // later step can see what an earlier one picked (the dedup of two
  // consecutive same-side finger cards depends on it). A step whose card
  // resolves to null/undefined (today, only ever the play's own card, for a
  // play with no signalCardId set yet) is silently OMITTED -- correct for
  // the real, live coach-facing sequence: a call in progress shouldn't show
  // a visible gap for content that doesn't exist yet.
  function runRecipe(recipe, ctx) {
    var out = [];
    recipe.forEach(function (step) {
      if (step.when && !step.when(ctx)) return;
      var id = resolve(step.card, ctx);
      if (id == null) return;
      // id exposed alongside src/label -- js/gameplan-pdf.js's own compact
      // "which cards, in order" reference (Nathan: "a quick look to ensure
      // he is calling in the right sequence") needs the raw card number,
      // not just the photo/text a coach reads off the app's own flip-card
      // UI. Purely additive -- every existing consumer only ever reads
      // .src/.label off this shape.
      out.push({ id: id, src: src(id), label: resolve(step.label, ctx) });
    });
    return out;
  }

  // Same walk, for Play Builder V2's own authoring-time preview
  // (js/playbuilder/editor.js's buildSignalSequencePreview) ONLY -- a coach
  // authoring a play WANTS to see "no card set" as a visible row for its
  // own play-card step, so they notice it's still missing, rather than have
  // it silently vanish the way it correctly does in the real sequence
  // above. Never used by the real app's own buildSignalSequence.
  function runRecipePreview(recipe, ctx) {
    var out = [];
    recipe.forEach(function (step) {
      if (step.when && !step.when(ctx)) return;
      var id = resolve(step.card, ctx);
      out.push({ src: id != null ? src(id) : null, label: resolve(step.label, ctx) });
    });
    return out;
  }

  // The series for a call. A play may carry its own recipe name via
  // playType.signalRecipe -- which is how a new formation's plays get their
  // own series assigned without touching this file.
  function sequenceFor(recipeName, ctx) {
    var recipe = RECIPES[recipeName] || RECIPES.wing;
    return runRecipe(recipe, ctx);
  }

  window.Signals = {
    load: load,
    RECIPES: RECIPES,
    sequenceFor: sequenceFor,
    runRecipe: runRecipe,
    runRecipePreview: runRecipePreview,
    pickFinger: pickFinger,
    pickFrom: pickFrom,
    get: get,
    src: src,
    label: label,
    needsPhoto: needsPhoto,
    placeholderSrc: placeholderSrc,
    PENDING_IDS: PENDING.map(function (p) { return p.id; }),
    // Each formation's own identity/touch card -- shown first in its real
    // sequence (see RECIPES.wing/.split above), before naming a specific
    // play. Exposed as data, not just used internally here, so Play
    // Builder V2's own preview (js/playbuilder/editor.js's
    // buildSignalSequencePreview) can show the real photo too, for
    // "i" and any future custom formation that gets one, not just
    // re-derive Wing/Split's own hardcoded ids a second time.
    TOUCH_CARD_BY_FORMATION: { wing: WING_TOUCH, split: SPLIT_TOUCH, i: I_TOUCH, '5-guys': FIVE_GUYS_TOUCH, 'i-wing': I_TOUCH },
    I_FORMATION: I_TOUCH,
    OVERLOAD: OVERLOAD,
    PASS_POCKET: 103,
    STRAIGHT_PASS_BLOCK: 104,
  };
})();
