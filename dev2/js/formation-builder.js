// Formation Builder -- drag all 11 players into a new starting alignment and
// save it as a formation.
//
// Nathan: "Need to reference an existing formation and allow the coach to drag
// and drop them into new starting spot and save formation" ... "I want this to
// be SO EASY A COACHES BABY COULD DO IT."
//
// So: no blank canvas. You always start FROM a formation that already works
// (Wing or Split, or one you made earlier), move the players that need moving,
// name it, save it. The field, the coordinate space and the personnel are
// identical to what Play Calls draws, so what you lay out here is literally
// what the diagram will show.
//
// All 11 are draggable, linemen included -- that is what lets an unbalanced
// line or a shifted front be expressed at all. The line is still tracked
// separately via lineSlots, because a lineman's play assignment is a blocking
// scheme, not a route.
//
// SIDES: a formation is authored on one side and mirrored to the other. The
// mirror is a STARTING POINT, not a rule -- after mirroring you can drag the
// other side freely, because real formations are not always symmetric (the
// shipped Split isn't: its QB and near back hold the same spots on both
// sides while everyone else flips).

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var CIRCLE_R = 34;
  var LINE_COLOR = '#111';

  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function FormationBuilder(opts) {
    this.svg = opts.svg;
    this.onChange = opts.onChange || function () {};
    // Fired when the selected player changes. Separate from onChange, which
    // means "the formation's data changed" -- selecting someone doesn't.
    this.onSelect = opts.onSelect || function () {};
    this.viewBox = opts.viewBox || [1600, 1030];
    this.topPad = typeof opts.topPad === 'number' ? opts.topPad : 400;
    // The play diagrams reserve ~400 units above the line for the defense.
    // The builder draws only your own 11, so showing that band would shrink
    // the players to undraggable dots on a tablet. Crop to the offensive
    // area instead: a little air above the line of scrimmage, and enough
    // depth below it for a deep back in an I-formation.
    this.viewport = opts.viewport || { y: -170, height: 860 };
    this.side = 'Right';
    this.positions = { Left: null, Right: null };
    this.lineSlots = [];
    this.selected = null;
    // Players marked as NOT flipping when the formation is mirrored. The
    // shipped Split needs this: its QB and near back hold the same spots on
    // Split Left and Split Right while everyone else crosses the formation.
    // Without it, mirroring moves that back ~358 units to a spot no play was
    // ever authored against.
    this.anchored = [];
    this.snap = 0; // 0 = free placement
    this._drag = null;
    this._circles = {};
    this._wire();
  }

  // Seed from an existing formation. Both sides are copied up front so the
  // coach can flip back and forth without losing work.
  FormationBuilder.prototype.seedFrom = function (formationId) {
    var F = window.Formations;
    this.positions.Right = F.positions(formationId, 'Right');
    this.positions.Left = F.positions(formationId, 'Left');
    this.lineSlots = F.lineSlots(formationId);
    var seed = F.get(formationId);
    this.anchored = (seed && seed.anchored) ? seed.anchored.slice() : [];
    this.selected = null;
    this.render();
    this.onChange();
    this.onSelect(null);
  };

  FormationBuilder.prototype.setSide = function (side) {
    this.side = side === 'Left' ? 'Left' : 'Right';
    this.selected = null;
    this.render();
    this.onChange();
    this.onSelect(null);
  };

  // Which players trade identities when a formation is mirrored.
  //
  // Reflecting coordinates alone is not enough: it moves the left tackle to
  // the right side of the line and leaves him labelled LT, so the diagram
  // reads "RT RG C LG LT" and the left tackle is lined up at right tackle.
  // The paired players have to swap identities as well as positions, so LT
  // is always the man on the left.
  //
  // The two tight ends swap for the same reason, and this matches what the
  // shipped Split data already does: mirroring Split Right's #5 lands on
  // Split Left's #6 and vice versa, which is only consistent if 5 and 6
  // exchange places rather than each crossing the formation.
  var DEFAULT_SWAP = [['LT', 'RT'], ['LG', 'RG'], ['5', '6']];

  // Overwrite the side you are NOT looking at with a mirror of the one you
  // are, so a coach lays out one side and gets the other for free.
  FormationBuilder.prototype.mirrorToOtherSide = function (o) {
    o = o || {};
    var from = this.positions[this.side];
    var other = this.side === 'Right' ? 'Left' : 'Right';
    this.positions[other] = window.Formations.mirrorPositions(from, {
      axisX: from.C ? from.C[0] : this.viewBox[0] / 2,
      anchored: o.anchored || this.anchored,
      swap: o.swap || DEFAULT_SWAP,
    });
    this.onChange();
    return other;
  };

  FormationBuilder.DEFAULT_SWAP = DEFAULT_SWAP;

  FormationBuilder.prototype.isAnchored = function (slot) {
    return this.anchored.indexOf(String(slot)) !== -1;
  };

  FormationBuilder.prototype.toggleAnchor = function (slot) {
    slot = String(slot);
    var i = this.anchored.indexOf(slot);
    if (i === -1) this.anchored.push(slot); else this.anchored.splice(i, 1);
    this.render();
    this.onChange();
    return this.isAnchored(slot);
  };

  FormationBuilder.prototype.current = function () {
    return this.positions[this.side];
  };

  FormationBuilder.prototype.isLine = function (slot) {
    return this.lineSlots.indexOf(String(slot)) !== -1;
  };

  // Screen pixels -> the diagram's own coordinate space. Same technique the
  // existing Edit Plays editor uses (createSVGPoint + inverse screen CTM), so
  // dragging stays accurate at any zoom or container size.
  FormationBuilder.prototype._toLocal = function (ev) {
    var pt = this.svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    var ctm = this._group.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  FormationBuilder.prototype._wire = function () {
    var self = this;

    // Pointer events rather than mouse/touch pairs: one code path that works
    // with a finger on a sideline tablet and a mouse at the kitchen table.
    this.svg.addEventListener('pointerdown', function (ev) {
      var slot = ev.target.getAttribute && ev.target.getAttribute('data-slot');
      if (!slot) return;
      ev.preventDefault();
      var p = self._toLocal(ev);
      var pos = self.current()[slot];
      self._drag = { slot: slot, dx: pos[0] - p.x, dy: pos[1] - p.y, moved: false };
      self.selected = slot;
      self.svg.setPointerCapture(ev.pointerId);
      self.render();
      self.onSelect(slot);
    });

    this.svg.addEventListener('pointermove', function (ev) {
      if (!self._drag) return;
      ev.preventDefault();
      var p = self._toLocal(ev);
      var x = p.x + self._drag.dx;
      var y = p.y + self._drag.dy;
      if (self.snap > 0) {
        x = Math.round(x / self.snap) * self.snap;
        y = Math.round(y / self.snap) * self.snap;
      }
      // Keep players on the field -- a player dragged off the viewBox would
      // vanish from every diagram that formation ever draws.
      x = Math.max(CIRCLE_R, Math.min(self.viewBox[0] - CIRCLE_R, x));
      y = Math.max(self.viewport.y + CIRCLE_R,
                   Math.min(self.viewport.y + self.viewport.height - CIRCLE_R, y));
      self.current()[self._drag.slot] = [Math.round(x), Math.round(y)];
      self._drag.moved = true;
      self.render();
    });

    function endDrag(ev) {
      if (!self._drag) return;
      try { self.svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      var moved = self._drag.moved;
      self._drag = null;
      if (moved) self.onChange();
    }
    this.svg.addEventListener('pointerup', endDrag);
    this.svg.addEventListener('pointercancel', endDrag);
  };

  FormationBuilder.prototype.render = function () {
    var self = this;
    var pos = this.current();
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    if (!pos) return;

    // viewBox is expressed directly in the diagram's own coordinate space, so
    // no translate group is needed and a point's x/y here is the same number
    // that gets saved.
    var W = this.viewBox[0];
    var top = this.viewport.y;
    var bottom = this.viewport.y + this.viewport.height;
    this.svg.setAttribute('viewBox', '0 ' + top + ' ' + W + ' ' + this.viewport.height);
    var g = el('g', {});
    this._group = g;
    this.svg.appendChild(g);

    g.appendChild(el('rect', {
      x: 0, y: top, width: W, height: this.viewport.height, fill: 'var(--fb-turf)',
    }));

    // Yard lines every 60 units, heavier every 5th -- orientation cues only,
    // so a coach can see at a glance how deep a back is set.
    for (var y = top; y < bottom; y += 60) {
      var major = Math.round((y - top) / 60) % 5 === 0;
      g.appendChild(el('line', {
        x1: 0, y1: y, x2: W, y2: y,
        stroke: 'var(--fb-yardline)',
        'stroke-width': major ? 3 : 1.5,
        opacity: major ? 0.5 : 0.25,
      }));
    }

    // Line of scrimmage, derived from the center rather than hardcoded, so it
    // stays correct even if the coach drags the whole front.
    var losY = (pos.C ? pos.C[1] : 204) - CIRCLE_R - 4;
    g.appendChild(el('line', {
      x1: 0, y1: losY, x2: W, y2: losY,
      stroke: 'var(--fb-los)', 'stroke-width': 5, 'stroke-dasharray': '18 12',
    }));

    this._circles = {};

    // Draw the line first so skill players sit on top when they overlap.
    var order = this.lineSlots.concat(
      Object.keys(pos).filter(function (k) { return !self.isLine(k); }).sort()
    );

    order.forEach(function (slot) {
      var p = pos[slot];
      if (!p) return;
      var isLine = self.isLine(slot);
      var isSel = self.selected === slot;

      var cg = el('g', { 'data-slot': slot, style: 'cursor:grab' });

      if (isSel) {
        cg.appendChild(el('circle', {
          cx: p[0], cy: p[1], r: CIRCLE_R + 10,
          fill: 'none', stroke: 'var(--fb-accent)', 'stroke-width': 5, opacity: 0.9,
          'data-slot': slot,
        }));
      }

      cg.appendChild(el('circle', {
        cx: p[0], cy: p[1], r: CIRCLE_R,
        fill: isLine ? 'var(--fb-line-fill)' : 'var(--fb-skill-fill)',
        stroke: isLine ? 'var(--fb-line-stroke)' : 'var(--fb-skill-stroke)',
        'stroke-width': 5,
        'data-slot': slot,
      }));

      var t = el('text', {
        x: p[0], y: p[1],
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': String(slot).length > 1 ? 24 : 32,
        'font-weight': 800,
        fill: isLine ? 'var(--fb-line-text)' : 'var(--fb-skill-text)',
        'data-slot': slot,
        style: 'pointer-events:none;user-select:none',
      });
      t.textContent = slot;
      cg.appendChild(t);

      // A small dot marks a player who keeps his spot when the formation is
      // mirrored, so the exception is visible on the field rather than hidden
      // in a settings list.
      if (self.isAnchored(slot)) {
        cg.appendChild(el('circle', {
          cx: p[0] + CIRCLE_R - 6, cy: p[1] - CIRCLE_R + 6, r: 9,
          fill: 'var(--fb-accent)', stroke: 'var(--fb-turf)', 'stroke-width': 3,
          'data-slot': slot,
        }));
      }

      g.appendChild(cg);
      self._circles[slot] = cg;
    });
  };

  // What gets saved. Mirrors the Formation shape already modelled in the
  // rebuild's shared types (positions + lineSlots), so moving this data across
  // later is a copy, not a re-design.
  FormationBuilder.prototype.toFormation = function (meta) {
    meta = meta || {};
    return {
      id: meta.id,
      name: meta.name,
      side: 'offense',
      lineSlots: this.lineSlots.slice(),
      anchored: this.anchored.slice(),
      positions: {
        Left: JSON.parse(JSON.stringify(this.positions.Left)),
        Right: JSON.parse(JSON.stringify(this.positions.Right)),
      },
      createdBy: meta.createdBy || null,
      createdAt: meta.createdAt || null,
    };
  };

  window.FormationBuilder = FormationBuilder;
})();
