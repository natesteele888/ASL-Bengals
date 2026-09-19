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
// WHAT IT EDITS
// The END of the assignment -- where the block lands or the route finishes --
// because that is what goes wrong when a man moves and what a lineman is
// actually taught. The start stays pinned to where he now lines up, since
// that is not a choice.

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function AssignmentEditor(opts) {
    this.svg = opts.svg;
    this.onChange = opts.onChange || function () {};
    this.formationId = opts.formationId || 'wing';
    this.side = opts.side || 'Right';
    this.overload = !!opts.overload;
    this.playKey = opts.playKey || null;
    // { ownerKey: { pathIndex, points, points4x4 } } for THIS alignment only
    this.overrides = {};
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
    this.render();
  };

  AssignmentEditor.prototype.setOverrides = function (map) {
    this.overrides = map ? JSON.parse(JSON.stringify(map)) : {};
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

  // A grab-handle on the end of each moved player's assignment. Drawn into the
  // renderer's own transformed group so handle coordinates and path
  // coordinates are the same numbers.
  AssignmentEditor.prototype._drawHandles = function () {
    var self = this;
    var g = this.svg._mainGroup;
    var paths = this.svg._resolvedPaths || [];
    if (!g) return;
    var moved = this.movedSlots();
    this._handles = [];

    var seen = {};
    paths.forEach(function (p) {
      var owner = p.player != null ? String(p.player) : p.id;
      if (!owner || moved.indexOf(owner) === -1) return;
      var n = (seen[owner] = (seen[owner] === undefined ? 0 : seen[owner] + 1));
      var pts = p.points;
      if (!pts || pts.length < 2) return;
      var end = pts[pts.length - 1];

      var handle = el('circle', {
        cx: end[0], cy: end[1], r: 26,
        fill: 'rgba(255,106,19,0.30)', stroke: '#ff6a13', 'stroke-width': 5,
        style: 'cursor:grab',
      });
      handle.__owner = owner;
      handle.__pathIndex = n;
      g.appendChild(handle);
      self._handles.push(handle);
    });
  };

  // Which moved players actually got a handle.
  //
  // Not every assignment has one fixed end to drag. Player 4's dualSideBlock
  // resolves its target live from which side the wing is on, so there is no
  // single point that IS the assignment -- the same reason the study guide
  // refuses to name a defender for it. A moved player with no editable end is
  // reported as such rather than listed as editable and then quietly having
  // no handle, which would read as a broken screen.
  AssignmentEditor.prototype.editableSlots = function () {
    return (this._handles || []).map(function (h) { return h.__owner; });
  };

  AssignmentEditor.prototype._toLocal = function (ev) {
    var pt = this.svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    var ctm = this.svg._mainGroup && this.svg._mainGroup.getScreenCTM();
    if (!ctm) return null;
    var p = pt.matrixTransform(ctm.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };

  AssignmentEditor.prototype._wire = function () {
    var self = this;

    this.svg.addEventListener('pointerdown', function (ev) {
      var t = ev.target;
      if (!t.__owner) return;
      ev.preventDefault();
      self._drag = { owner: t.__owner, pathIndex: t.__pathIndex };
      self.svg.setPointerCapture(ev.pointerId);
    });

    this.svg.addEventListener('pointermove', function (ev) {
      if (!self._drag) return;
      ev.preventDefault();
      var p = self._toLocal(ev);
      if (!p) return;
      self._setEnd(self._drag.owner, self._drag.pathIndex, p);
      self.render();
    });

    function end(ev) {
      if (!self._drag) return;
      try { self.svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      self._drag = null;
      self.onChange();
    }
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
  };

  // Move one assignment's end point. The rest of the path -- and its start,
  // which is where he lines up -- is taken from whatever is currently drawn,
  // so dragging edits the shifted default rather than starting from nothing.
  AssignmentEditor.prototype._setEnd = function (owner, pathIndex, point) {
    var paths = this.svg._resolvedPaths || [];
    var seen = {}, src = null;
    paths.forEach(function (p) {
      var o = p.player != null ? String(p.player) : p.id;
      if (!o) return;
      var n = (seen[o] = (seen[o] === undefined ? 0 : seen[o] + 1));
      if (o === owner && n === pathIndex) src = p;
    });
    if (!src || !src.points) return;

    var pts = src.points.map(function (q) { return q.slice(); });
    pts[pts.length - 1] = point.slice();
    // Both coordinate arrays move together. points4x4 is what actually renders
    // for a blocking path against the 4-4 front, and leaving it behind would
    // make the edit appear to do nothing for exactly the linemen this is for.
    var ov = { pathIndex: pathIndex, points: pts, points4x4: pts.map(function (q) { return q.slice(); }) };
    this.overrides[owner] = ov;
  };

  AssignmentEditor.prototype.clear = function (owner) {
    delete this.overrides[owner];
    this.render();
    this.onChange();
  };

  AssignmentEditor.prototype.clearAll = function () {
    this.overrides = {};
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
