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
  var PENDING = [
    { id: 101, group: 'Formation', meaning: 'I-FORMATION' },
    { id: 102, group: 'Formation', meaning: 'OVERLOAD' },
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
  var WING_TOUCH = 7, SPLIT_TOUCH = 31, BOOT = 26, COUNTER = 18, POP2 = 29,
      QB_SNEAK = 27, OUTSIDE_ZONE = 10;
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
      // Overload moves the back-side tight end over as a second wing-side TE.
      { when: function (c) { return c.overloadOn; }, card: 102, label: 'Overload' },
    ],
  };

  function isBlast(k) { return k === 'blast' || k === 'double_blast'; }

  function resolve(step, ctx) {
    return typeof step === 'function' ? step(ctx) : step;
  }

  // Walk a recipe against the current call. `ctx` is mutated as it goes so a
  // later step can see what an earlier one picked (the dedup of two
  // consecutive same-side finger cards depends on it).
  function runRecipe(recipe, ctx) {
    var out = [];
    recipe.forEach(function (step) {
      if (step.when && !step.when(ctx)) return;
      var id = resolve(step.card, ctx);
      if (id == null) return;
      out.push({ src: src(id), label: resolve(step.label, ctx) });
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
    pickFinger: pickFinger,
    pickFrom: pickFrom,
    get: get,
    src: src,
    label: label,
    needsPhoto: needsPhoto,
    placeholderSrc: placeholderSrc,
    PENDING_IDS: PENDING.map(function (p) { return p.id; }),
    I_FORMATION: 101,
    OVERLOAD: 102,
    PASS_POCKET: 103,
    STRAIGHT_PASS_BLOCK: 104,
  };
})();
