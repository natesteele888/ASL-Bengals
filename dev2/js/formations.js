// Formation registry -- the single place that answers "where does each of the
// 11 players line up, and which of them are blockers?"
//
// WHY THIS EXISTS
// Before this file, "Shotgun" was not a thing in the codebase. It was the
// `else` branch: every formation decision in play-calls.js was a binary
// `formation === 'split'` test, and whatever fell through got the Wing
// rendering. That works for exactly two formations and silently mis-renders
// the third -- a card labelled "I-Form" that draws Shotgun, animates Shotgun
// and flashes the Wing signal, with nothing throwing to warn anyone.
//
// So formations become DATA here, and the renderers ask this registry instead
// of branching on a string.
//
// THE UNIFORM SHAPE
// Both shipped formations turn out to be the same 11 players -- 5 offensive
// linemen (LT/LG/C/RG/RT) plus 6 numbered skill players (1-6). They only
// LOOKED different because Wing's personnel was scattered across three
// unrelated DATA keys (DATA.formation held the line *and* TEs 5/6,
// DATA.backfield held 1/2/3, DATA.wing held player 4's anchor) while Split
// held all six numbered players in one DATA.split[side] object. Same eleven
// players, two different filing systems. This registry reassembles both into
// one shape: { positions: { slot: [x, y] }, lineSlots: [...] }.
//
// WHY POSITIONS ARE STORED PER SIDE, NOT MIRRORED ON THE FLY
// Reflecting x around the center (x=806) reproduces the authored Left side
// for players 3, 4, 5 and 6 -- but NOT for 1 and 2. The QB and the near back
// hold the same spots on both Split Left and Split Right; they do not flip.
// That is football-correct, not a data error, and deriving Left from Right
// would silently move them ~358px. Existing formations therefore keep their
// authored coordinates verbatim, so this refactor is pixel-identical to what
// ships today. mirrorPositions() below exists for the BUILDER -- generating a
// starting point for the opposite side of a brand-new formation -- and is
// deliberately not used to render anything that already has authored data.
//
// SOURCE OF TRUTH
// Reads window.DATA, which index.html boots from Firebase (dev2PlayData) and
// play-calls.js then layers coach edits onto. Falls back to
// window.SHIPPED_PLAYS_JSON only when DATA has not loaded. Note that the
// repo's dev2/data/plays.json is gitignored and 404s on the live site -- it is
// NOT a source of truth and must not be seeded from.

(function () {
  'use strict';

  var OLINE = ['LT', 'LG', 'C', 'RG', 'RT'];
  var SKILL = ['1', '2', '3', '4', '5', '6'];

  function data() {
    return window.DATA || window.SHIPPED_PLAYS_JSON || null;
  }

  // Wing/Shotgun: reassemble the three scattered keys into one position map.
  // Only player 4 (the wing) actually moves between sides; the line, the tight
  // ends (5/6) and the backfield (1/2/3) are side-independent in the authored
  // data, so both sides read from the same source and differ in exactly one
  // entry.
  function wingPositions(D, side) {
    var pos = {};
    OLINE.forEach(function (k) {
      if (D.formation && D.formation[k]) pos[k] = D.formation[k].slice();
    });
    // 5 and 6 live in DATA.formation alongside the line -- they are tight ends
    // on the line of scrimmage, not linemen, so they are copied here but are
    // NOT in lineSlots.
    ['5', '6'].forEach(function (k) {
      if (D.formation && D.formation[k]) pos[k] = D.formation[k].slice();
    });
    ['1', '2', '3'].forEach(function (k) {
      if (D.backfield && D.backfield[k]) pos[k] = D.backfield[k].slice();
    });
    var anchor = D.wing && D.wing[side === 'Left' ? 'Left' : 'Right'];
    if (anchor) pos['4'] = anchor.slice();
    return pos;
  }

  // Split: all six numbered players come from DATA.split[side]; the offensive
  // line is unchanged from DATA.formation (Split moves skill players, never the
  // line).
  function splitPositions(D, side) {
    var pos = {};
    OLINE.forEach(function (k) {
      if (D.formation && D.formation[k]) pos[k] = D.formation[k].slice();
    });
    var s = D.split && D.split[side === 'Left' ? 'Left' : 'Right'];
    if (s) {
      SKILL.forEach(function (k) {
        if (s[k]) pos[k] = s[k].slice();
      });
    }
    return pos;
  }

  // The two shipped formations, expressed as registry entries. `derive` keeps
  // them reading from live DATA so a coach edit in Edit Plays still moves the
  // diagram -- the registry adds a formation axis, it does not snapshot data.
  var BUILT_IN = {
    wing: {
      id: 'wing',
      name: 'Wing',
      // What the existing code calls this formation internally. play-calls.js
      // uses 'shotgun' as its string for the Wing look; keeping the alias here
      // means callers can pass either and the registry resolves it, which is
      // what lets the old branches be retired incrementally.
      aliases: ['shotgun'],
      side: 'offense',
      builtIn: true,
      lineSlots: OLINE.slice(),
      sides: ['Left', 'Right'],
      derive: wingPositions,
      // Nathan: "new signal for Overload which tells the non-wing side TE to
      // play over as a second TE on the wing side."
      //
      // Declared rather than hardcoded because only a formation that HAS a
      // wing side and a tight end on each edge can be overloaded. Split has
      // no wing, so it has no overload -- and says so by omitting this.
      overload: { tightEnds: { Left: '5', Right: '6' }, flanker: '4',
                  edgeTackle: { Left: 'LT', Right: 'RT' } },
    },
    split: {
      id: 'split',
      name: 'Split',
      aliases: [],
      side: 'offense',
      builtIn: true,
      lineSlots: OLINE.slice(),
      sides: ['Left', 'Right'],
      derive: splitPositions,
    },
  };

  // Coach-created formations (the Formation Builder writes these). Stored as
  // explicit per-side position maps rather than a derive function, since there
  // is no legacy DATA layout to reassemble for them.
  var custom = {};

  function resolveId(id) {
    if (!id) return null;
    if (BUILT_IN[id]) return id;
    if (custom[id]) return id;
    for (var k in BUILT_IN) {
      if (BUILT_IN[k].aliases.indexOf(id) !== -1) return k;
    }
    return null;
  }

  function get(id) {
    var rid = resolveId(id);
    if (!rid) return null;
    return BUILT_IN[rid] || custom[rid];
  }

  function list() {
    var out = [];
    for (var k in BUILT_IN) out.push(BUILT_IN[k]);
    for (var c in custom) out.push(custom[c]);
    return out;
  }

  // Bring the back-side tight end over as a second tight end on the wing
  // side, and push the flanker out past him so the two do not stack.
  //
  // Every number is measured off the formation's own spacing rather than
  // written down: the new tight end lines up one natural TE-split outside the
  // tight end already there, and the flanker keeps the same gap from the end
  // man that he had before. So a formation with a wider or tighter split
  // overloads at ITS spacing, not at Wing's.
  function applyOverload(pos, f, side) {
    var o = f.overload;
    if (!o) return pos; // formation has no wing side; nothing to overload
    var frontTE = o.tightEnds[side];
    var backTE = o.tightEnds[side === 'Right' ? 'Left' : 'Right'];
    var tackle = o.edgeTackle[side];
    var flanker = o.flanker;
    if (!pos[frontTE] || !pos[backTE] || !pos[tackle]) return pos;

    var sign = side === 'Right' ? 1 : -1;
    var teSplit = Math.abs(pos[frontTE][0] - pos[tackle][0]);
    pos[backTE] = [Math.round(pos[frontTE][0] + sign * teSplit), pos[frontTE][1]];

    if (pos[flanker]) {
      var gap = Math.abs(pos[flanker][0] - pos[frontTE][0]);
      pos[flanker] = [Math.round(pos[backTE][0] + sign * gap), pos[flanker][1]];
    }
    return pos;
  }

  // The one call every renderer should make: give me all 11 spots for this
  // formation on this side.
  //
  // `opts.overload` is an ALIGNMENT modifier, which is the whole reason it
  // lives here: once a player's spot changes, the renderer shifts his routes
  // and blocks by the difference automatically, so nothing downstream needs
  // its own idea of what Overload means.
  function positions(id, side, opts) {
    var f = get(id);
    if (!f) return null;
    var s = side === 'Left' ? 'Left' : 'Right';
    var pos;
    if (f.derive) {
      var D = data();
      if (!D) return null;
      pos = f.derive(D, s);
    } else {
      pos = f.positions && f.positions[s] ? clone(f.positions[s]) : null;
    }
    if (pos && opts && opts.overload) pos = applyOverload(pos, f, s);
    return pos;
  }

  // A stable name for an ALIGNMENT -- a formation, a side, and any modifier
  // that moves people. Assignment overrides are stored against this, not against the
  // formation id, because Overload changes where players stand and therefore
  // changes what their assignment should be, exactly as a different formation
  // does. 'wing', 'wing+overload', 'iform', 'iform+overload'.
  //
  // SIDE IS PART OF THE KEY. Wing Right and Wing Left put players in different
  // places, so an assignment corrected for one is not corrected for the other
  // -- and a key that left side out would let a Right-side fix silently claim
  // to be a Left-side one. Reads as 'wing:Right', 'wing:Right+overload'. All
  // characters are legal in a Firebase key.
  function alignmentKey(id, side, opts) {
    var rid = resolveId(id) || id;
    var s = side === 'Left' ? 'Left' : 'Right';
    return rid + ':' + s + ((opts && opts.overload) ? '+overload' : '');
  }

  // Which of the eleven actually stand somewhere different between two
  // alignments. This is the whole review list: a play's authored assignments
  // are still correct for everyone who did not move, so those are not worth a
  // coach's attention, and a screen that asked him to check all eleven would
  // get skipped.
  function movedSlots(fromId, fromOpts, toId, toOpts, side) {
    var a = positions(fromId, side, fromOpts);
    var b = positions(toId, side, toOpts);
    if (!a || !b) return [];
    var out = [];
    Object.keys(b).forEach(function (k) {
      if (!a[k]) { out.push(k); return; }
      if (a[k][0] !== b[k][0] || a[k][1] !== b[k][1]) out.push(k);
    });
    return out;
  }

  // Whether this formation can be overloaded at all -- the toggle should not
  // offer a call that would do nothing.
  function supportsOverload(id) {
    var f = get(id);
    return !!(f && f.overload);
  }

  function lineSlots(id) {
    var f = get(id);
    return f ? f.lineSlots.slice() : OLINE.slice();
  }

  function isLine(id, slot) {
    return lineSlots(id).indexOf(String(slot)) !== -1;
  }

  // Every player in a formation, line first then skill, for iteration order
  // that matches how the diagrams stack circles today.
  function slots(id) {
    return lineSlots(id).concat(SKILL.slice());
  }

  function clone(map) {
    var out = {};
    for (var k in map) out[k] = map[k].slice();
    return out;
  }

  // BUILDER HELPER ONLY -- see the header note. Reflects x around the center's
  // x so a coach laying out a new formation on one side gets a sensible
  // starting point for the other, rather than placing 22 spots by hand.
  //
  // `anchored` slots keep their x (the QB and near back do not flip sides in
  // Split, and a new formation will usually want the same). `swap` pairs trade
  // identities, which is what the shipped Split data does with its two tight
  // ends -- 5 and 6 change places rather than each crossing the formation.
  function mirrorPositions(pos, opts) {
    opts = opts || {};
    var axisX = typeof opts.axisX === 'number'
      ? opts.axisX
      : (pos.C ? pos.C[0] : 806);
    var anchored = opts.anchored || [];
    var swap = opts.swap || [];

    var out = {};
    for (var k in pos) {
      var p = pos[k];
      out[k] = anchored.indexOf(k) !== -1
        ? p.slice()
        : [Math.round(2 * axisX - p[0]), p[1]];
    }
    swap.forEach(function (pair) {
      var a = pair[0], b = pair[1];
      if (out[a] && out[b]) {
        var t = out[a];
        out[a] = out[b];
        out[b] = t;
      }
    });
    return out;
  }

  function registerCustom(f) {
    if (!f || !f.id) throw new Error('formation needs an id');
    if (BUILT_IN[f.id]) throw new Error('cannot overwrite built-in formation: ' + f.id);
    custom[f.id] = {
      id: f.id,
      name: f.name || f.id,
      aliases: [],
      side: f.side || 'offense',
      builtIn: false,
      lineSlots: (f.lineSlots && f.lineSlots.slice()) || OLINE.slice(),
      // Slots that keep their spot when the formation is mirrored -- see
      // FormationBuilder's note on the shipped Split's anchored back.
      anchored: (f.anchored && f.anchored.slice()) || [],
      sides: ['Left', 'Right'],
      positions: {
        Left: clone(f.positions.Left),
        Right: clone(f.positions.Right),
      },
      createdBy: f.createdBy || null,
      createdAt: f.createdAt || null,
    };
    return custom[f.id];
  }

  function loadCustom(mapById) {
    custom = {};
    if (!mapById) return;
    Object.keys(mapById).forEach(function (id) {
      var f = mapById[id];
      if (!f || !f.positions) return;
      try {
        registerCustom(Object.assign({}, f, { id: id }));
      } catch (e) {
        if (window.console) console.warn('skipping bad formation', id, e);
      }
    });
  }

  function toJSON(id) {
    var f = get(id);
    if (!f) return null;
    return {
      id: f.id,
      name: f.name,
      side: f.side,
      lineSlots: f.lineSlots.slice(),
      anchored: (f.anchored || []).slice(),
      positions: {
        Left: positions(f.id, 'Left'),
        Right: positions(f.id, 'Right'),
      },
      createdBy: f.createdBy || null,
      createdAt: f.createdAt || null,
    };
  }

  window.Formations = {
    OLINE: OLINE.slice(),
    SKILL: SKILL.slice(),
    list: list,
    get: get,
    resolveId: resolveId,
    positions: positions,
    alignmentKey: alignmentKey,
    movedSlots: movedSlots,
    supportsOverload: supportsOverload,
    lineSlots: lineSlots,
    isLine: isLine,
    slots: slots,
    mirrorPositions: mirrorPositions,
    registerCustom: registerCustom,
    loadCustom: loadCustom,
    toJSON: toJSON,
  };
})();
