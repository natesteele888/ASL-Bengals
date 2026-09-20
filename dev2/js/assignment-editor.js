// Assignment editor: fix what a player does once a formation has moved him.
//
// THE PROBLEM THIS EXISTS FOR
// A play's routes are authored once, against one alignment. Drawing that play
// in a different formation shifts every route by how far its owner moved --
// which keeps the shape, is provably free for the formation it was authored
// in, and is the right default. It is not the same as being right:
//
//   * Overload carries the back-side tight end 801 units across the formation
//     and hands him his old block. It lands 57 units from the right defensive
//     end instead of on him, because Overload creates a body the play was
//     never authored for.
//   * An I-formation back runs a sweep shape from a spot 130 units deeper,
//     which is geometrically faithful and may be football nonsense.
//
// So the shift is the starting point and a coach can overwrite any individual
// assignment for a specific alignment.
//
// ONLY THE PLAYERS WHO MOVED
// A screen that asked a coach to check all eleven would be skipped, and
// rightly -- the eight who did not move still have the assignment they were
// authored with, and it is still correct. So this shows exactly the players
// whose spot changed between the authoring alignment and this one, which is
// usually two or three. Everyone else is drawn normally and left alone.
//
// THE FULL SHAPE IS EDITABLE, NOT JUST THE END
// The first version dragged only the last point of the path, leaving every
// interior point exactly where it was authored. A route with 3+ points is a
// curve -- chainedCurvePathD/quadPathD/multiCurvePathD all read the INTERIOR
// points to decide how it bends -- so moving only the tail left the bend
// itself pointing at the old, un-shifted spot: "renders a convex or concave
// line which doesn't change based on end point." Every point past the start
// is now its own handle, draggable, with the same add/insert-a-point and
// delete-a-point interaction the Edit Plays route editor already has, so a
// coach can shape the whole path, not nudge its tail.
//
// The START (index 0) stays pinned and gets no handle -- it is where the
// player now lines up, which is not a choice, unlike everywhere else in
// index.html's editor where the start of a fresh route genuinely is one.

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TAP_SLOP = 6; // px of movement below which a press is a tap, not a drag

  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function clonePts(pts) { return pts.map(function (p) { return p.slice(); }); }

  function AssignmentEditor(opts) {
    this.svg = opts.svg;
    this.onChange = opts.onChange || function () {};
    this.formationId = opts.formationId || 'wing';
    this.side = opts.side || 'Right';
    this.overload = !!opts.overload;
    this.playKey = opts.playKey || null;
    // { ownerKey: { pathIndex, points, points4x4 } } for THIS alignment only
    this.overrides = {};
    // The one handle currently picked -- shows its add/delete badges. Cleared
    // by any structural edit (insert/delete) or a play/side/formation switch,
    // same as Edit Plays clears selectedHandle after those.
    this._picked = null;
    this._drag = null;
    this._wire();
  }

  AssignmentEditor.prototype.alignKey = function () {
    return window.Formations.alignmentKey(this.formationId, this.side, { overload: this.overload });
  };

  // Who this alignment actually moved, relative to the one the plays were
  // drawn in. The review list.
  AssignmentEditor.prototype.movedSlots = function () {
    return window.Formations.movedSlots(
      'wing', null, this.formationId, { overload: this.overload }, this.side);
  };

  AssignmentEditor.prototype.setPlay = function (playKey) {
    this.playKey = playKey;
    this._picked = null;
    this.render();
  };

  AssignmentEditor.prototype.setOverrides = function (map) {
    this.overrides = map ? JSON.parse(JSON.stringify(map)) : {};
    this._picked = null;
    this.render();
  };

  // Hand the play its overrides for the duration of one render, then take them
  // back -- the editor must not leave edits on shared DATA that other screens
  // would then pick up as if they had been saved.
  AssignmentEditor.prototype.render = function () {
    var self = this;
    if (!this.playKey) return;
    var playType = window.DATA.playTypes.find(function (p) { return p.key === self.playKey; });
    if (!playType) return;

    var key = this.alignKey();
    var hadAssignments = playType.assignments;
    playType.assignments = Object.assign({}, hadAssignments || {});
    playType.assignments[key] = this.overrides;

    try {
      window.renderCardDiagram(
        this.svg, this.playKey, this.side, this.side, null, '4x4',
        playType.hasInsideOutside ? 'Outside' : null,
        false, false, 'A', false, false,
        this.formationId, this.overload);
    } finally {
      if (hadAssignments) playType.assignments = hadAssignments;
      else delete playType.assignments;
    }

    // Crop to the offensive half: the handles need to be big enough to grab
    // with a finger, and the defensive band eats half the height.
    this.svg.setAttribute('viewBox', '0 250 1600 760');
    this._drawHandles();
  };

  // Every path belonging to a moved player, as drawn RIGHT NOW -- after the
  // formation shift and any saved override, so a handle always starts from
  // what is actually on screen. { owner, pathIndex, points } per path.
  AssignmentEditor.prototype._editablePaths = function () {
    var moved = this.movedSlots();
    var paths = this.svg._resolvedPaths || [];
    var seen = {}, out = [];
    paths.forEach(function (p) {
      var owner = p.player != null ? String(p.player) : p.id;
      if (!owner || moved.indexOf(owner) === -1) return;
      var n = (seen[owner] = (seen[owner] === undefined ? 0 : seen[owner] + 1));
      if (!p.points || p.points.length < 2) return;
      out.push({ owner: owner, pathIndex: n, points: p.points });
    });
    return out;
  };

  // A grab-handle on every point past the start, for every moved player's
  // path(s). Drawn into the renderer's own transformed group so handle
  // coordinates and path coordinates are the same numbers.
  AssignmentEditor.prototype._drawHandles = function () {
    var self = this;
    var g = this.svg._mainGroup;
    if (!g) { this._handles = []; return; }
    this._handles = [];

    this._editablePaths().forEach(function (entry) {
      entry.points.forEach(function (pt, idx) {
        if (idx === 0) return; // the start -- where he lines up, not a choice
        var isPicked = self._picked && self._picked.owner === entry.owner
          && self._picked.pathIndex === entry.pathIndex && self._picked.ptIndex === idx;

        var handle = el('circle', {
          cx: pt[0], cy: pt[1], r: isPicked ? 22 : 18,
          fill: isPicked ? 'rgba(255,106,19,0.55)' : 'rgba(255,106,19,0.30)',
          stroke: '#ff6a13', 'stroke-width': isPicked ? 6 : 4,
          style: 'cursor:grab',
        });
        handle.__owner = entry.owner;
        handle.__pathIndex = entry.pathIndex;
        handle.__ptIndex = idx;
        g.appendChild(handle);
        self._handles.push(handle);

        if (!isPicked) return;

        var canDelete = entry.points.length > 2; // start + at least one more
        if (canDelete) {
          var dx = pt[0] + 28, dy = pt[1] - 28;
          var delBadge = el('g', { style: 'cursor:pointer' });
          delBadge.appendChild(el('circle', { cx: dx, cy: dy, r: 16, fill: '#e0201a', stroke: '#fff', 'stroke-width': 2 }));
          var xMark = el('text', { x: dx, y: dy + 6, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 900, fill: '#fff' });
          xMark.textContent = '✕';
          delBadge.appendChild(xMark);
          delBadge.__delete = { owner: entry.owner, pathIndex: entry.pathIndex, ptIndex: idx };
          g.appendChild(delBadge);
          self._handles.push(delBadge);
        }

        var ax = pt[0] - 28, ay = pt[1] - 28;
        var addBadge = el('g', { style: 'cursor:pointer' });
        addBadge.appendChild(el('circle', { cx: ax, cy: ay, r: 16, fill: '#1a8c3a', stroke: '#fff', 'stroke-width': 2 }));
        var plusMark = el('text', { x: ax, y: ay + 6, 'text-anchor': 'middle', 'font-size': 21, 'font-weight': 900, fill: '#fff' });
        plusMark.textContent = '+';
        addBadge.appendChild(plusMark);
        addBadge.__insert = { owner: entry.owner, pathIndex: entry.pathIndex, ptIndex: idx };
        g.appendChild(addBadge);
        self._handles.push(addBadge);
      });
    });
  };

  // Which moved players got at least one draggable point.
  //
  // Not every assignment has one. Player 4's dualSideBlock resolves its
  // target live from which side the wing is on, so there is no fixed shape to
  // hand-edit -- the same reason the study guide refuses to name a defender
  // for it. A moved player with nothing editable is reported as such rather
  // than listed as editable and then quietly having no handle, which would
  // read as a broken screen.
  AssignmentEditor.prototype.editableSlots = function () {
    var owners = {};
    (this._handles || []).forEach(function (h) { if (h.__owner) owners[h.__owner] = true; });
    return Object.keys(owners);
  };

  AssignmentEditor.prototype._toLocal = function (ev) {
    var pt = this.svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    var ctm = this.svg._mainGroup && this.svg._mainGroup.getScreenCTM();
    if (!ctm) return null;
    var p = pt.matrixTransform(ctm.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };

  // The live, mutable point array for one path -- seeded from an existing
  // override if there is one, or from what is currently drawn (the
  // auto-shifted default) the first time this path is touched at all. Once
  // seeded it lives in this.overrides, so every further edit -- drag, insert,
  // delete -- mutates the same array the next render will read back.
  AssignmentEditor.prototype._workingPoints = function (owner, pathIndex) {
    var ov = this.overrides[owner];
    if (ov && (ov.pathIndex || 0) === pathIndex && ov.points) return ov.points;

    var found = null;
    this._editablePaths().forEach(function (entry) {
      if (entry.owner === owner && entry.pathIndex === pathIndex) found = entry.points;
    });
    if (!found) return null;
    this.overrides[owner] = { pathIndex: pathIndex, points: clonePts(found), points4x4: clonePts(found) };
    return this.overrides[owner].points;
  };

  AssignmentEditor.prototype._syncPoints4x4 = function (owner) {
    var ov = this.overrides[owner];
    if (ov) ov.points4x4 = clonePts(ov.points);
  };

  AssignmentEditor.prototype._wire = function () {
    var self = this;

    this.svg.addEventListener('pointerdown', function (ev) {
      var t = ev.target;
      if (t.__insert) {
        var ins = t.__insert;
        var pts = self._workingPoints(ins.owner, ins.pathIndex);
        if (pts) {
          var a = pts[ins.ptIndex], b = pts[Math.min(ins.ptIndex + 1, pts.length - 1)];
          var mid = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2) - 20];
          pts.splice(ins.ptIndex + 1, 0, mid);
          self._syncPoints4x4(ins.owner);
          self._picked = null;
          self.render();
          self.onChange();
        }
        return;
      }
      if (t.__delete) {
        var del = t.__delete;
        var dpts = self._workingPoints(del.owner, del.pathIndex);
        if (dpts && dpts.length > 2) {
          dpts.splice(del.ptIndex, 1);
          self._syncPoints4x4(del.owner);
          self._picked = null;
          self.render();
          self.onChange();
        }
        return;
      }
      if (t.__owner) {
        ev.preventDefault();
        self._drag = {
          owner: t.__owner, pathIndex: t.__pathIndex, ptIndex: t.__ptIndex,
          startClient: [ev.clientX, ev.clientY], moved: false,
        };
        self.svg.setPointerCapture(ev.pointerId);
      }
    });

    this.svg.addEventListener('pointermove', function (ev) {
      if (!self._drag) return;
      ev.preventDefault();
      var d = self._drag;
      if (!d.moved) {
        var dx = ev.clientX - d.startClient[0], dy = ev.clientY - d.startClient[1];
        if (Math.hypot(dx, dy) < TAP_SLOP) return; // still within tap tolerance -- not a drag yet
        d.moved = true;
      }
      var p = self._toLocal(ev);
      if (!p) return;
      var pts = self._workingPoints(d.owner, d.pathIndex);
      if (!pts || !pts[d.ptIndex]) return;
      pts[d.ptIndex] = p;
      self._syncPoints4x4(d.owner);
      self.render();
    });

    function end(ev) {
      var d = self._drag;
      if (!d) return;
      try { self.svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      self._drag = null;
      if (d.moved) {
        self.onChange();
      } else {
        // A tap, not a drag -- toggle this handle's picked state so its
        // insert/delete badges show, same as Edit Plays' click-to-select.
        var isSame = self._picked && self._picked.owner === d.owner
          && self._picked.pathIndex === d.pathIndex && self._picked.ptIndex === d.ptIndex;
        self._picked = isSame ? null : { owner: d.owner, pathIndex: d.pathIndex, ptIndex: d.ptIndex };
        self.render();
      }
    }
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
  };

  AssignmentEditor.prototype.clear = function (owner) {
    delete this.overrides[owner];
    if (this._picked && this._picked.owner === owner) this._picked = null;
    this.render();
    this.onChange();
  };

  AssignmentEditor.prototype.clearAll = function () {
    this.overrides = {};
    this._picked = null;
    this.render();
    this.onChange();
  };

  AssignmentEditor.prototype.hasOverride = function (owner) {
    return !!this.overrides[owner];
  };

  AssignmentEditor.prototype.toJSON = function () {
    return JSON.parse(JSON.stringify(this.overrides));
  };

  window.AssignmentEditor = AssignmentEditor;
})();
