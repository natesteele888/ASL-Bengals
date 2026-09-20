// Authoring the ball's journey: tap the players in the order they touch it.
//
// Nathan: "it needs to be easy to make on the fly."
//
// So the whole interaction is TAP THE PLAYERS IN ORDER. Tap #1, tap #3, tap
// #4 and you have described a reverse; the exchange points place themselves
// halfway between the two men, and you drag one only if the automatic spot is
// wrong. Nobody types a coordinate, and nobody has to think about the data
// shape to describe a play he could say out loud in four words.
//
// The diagram already dispatches a 'playerclick' event when a circle is
// tapped -- the same one the Play Calls card uses to highlight a player -- so
// building the sequence needs no new hit-testing.
//
// WHAT A COACH STILL CHOOSES
// The exchange WORD: handoff, pitch, reverse, pass, keep. It is not
// cosmetic -- a pitch and a throw are taught differently, and "when do we
// want to pass on a pop pass" is exactly the question of which leg is the
// pass and where it happens. It defaults to handoff, which is the common
// case, so the fast path stays fast.

(function () {
  'use strict';

  function BallPathEditor(opts) {
    this.svg = opts.svg;
    this.onChange = opts.onChange || function () {};
    this.renderPlay = opts.renderPlay; // redraws the diagram, then we overlay
    this.align = opts.align || null;
    this.ballPath = [];
    this._drag = null;
    this._wire();
  }

  BallPathEditor.prototype.setAlign = function (align) { this.align = align; };

  BallPathEditor.prototype.set = function (bp) {
    this.ballPath = Array.isArray(bp) ? JSON.parse(JSON.stringify(bp)) : [];
    this.render();
  };

  BallPathEditor.prototype.get = function () {
    return JSON.parse(JSON.stringify(this.ballPath));
  };

  BallPathEditor.prototype.clear = function () {
    this.ballPath = [];
    this.render();
    this.onChange();
  };

  // Where an exchange goes when nobody has said otherwise: halfway between the
  // two players involved. That is close enough to read correctly for a
  // handoff, and for anything else the coach drags it -- which is a far
  // smaller ask than making him place every one.
  BallPathEditor.prototype._defaultPointFor = function (fromPlayer, toPlayer) {
    var a = this.align && this.align[String(fromPlayer)];
    var b = this.align && this.align[String(toPlayer)];
    if (!a || !b) return b ? b.slice() : (a ? a.slice() : [806, 300]);
    return [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  };

  // Tapping a player appends him. Tapping the man who already has it last is
  // treated as removing him again -- an undo that needs no separate button,
  // because the commonest authoring mistake is one tap too many.
  BallPathEditor.prototype.addPlayer = function (player) {
    if (player == null) return;
    var n = this.ballPath.length;
    if (n && String(this.ballPath[n - 1].player) === String(player)) {
      this.ballPath.pop();
      this.render();
      this.onChange();
      return;
    }
    if (!n) {
      this.ballPath.push({ player: player });
    } else {
      this.ballPath.push({
        player: player,
        how: 'handoff',
        at: this._defaultPointFor(this.ballPath[n - 1].player, player),
      });
    }
    this.render();
    this.onChange();
  };

  BallPathEditor.prototype.setHow = function (index, how) {
    if (!this.ballPath[index] || index === 0) return;
    this.ballPath[index].how = how;
    this.render();
    this.onChange();
  };

  BallPathEditor.prototype.removeAt = function (index) {
    if (index < 0 || index >= this.ballPath.length) return;
    this.ballPath.splice(index, 1);
    // The leg that inherits index 0 becomes the snap and must not keep an
    // exchange word or point.
    if (this.ballPath[0]) { delete this.ballPath[0].how; delete this.ballPath[0].at; }
    this.render();
    this.onChange();
  };

  BallPathEditor.prototype.render = function () {
    if (this.renderPlay) this.renderPlay();
    window.BallPath.clearOverlay(this.svg);
    window.BallPath.drawOverlay(this.svg, this.ballPath, this.align);
    this._makeBadgesDraggable();
  };

  BallPathEditor.prototype._makeBadgesDraggable = function () {
    var layer = this.svg._ballPathLayer;
    if (!layer) return;
    [].forEach.call(layer.querySelectorAll('[data-ball-step]'), function (badge) {
      var i = Number(badge.getAttribute('data-ball-step'));
      // Step 1 is the snap; it is where the center is, not a choice.
      if (i === 0) return;
      badge.style.cursor = 'grab';
      var c = badge.querySelector('circle');
      if (c) { c.__ballStep = i; c.style.cursor = 'grab'; }
    });
  };

  BallPathEditor.prototype._toLocal = function (ev) {
    var pt = this.svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    var ctm = this.svg._mainGroup && this.svg._mainGroup.getScreenCTM();
    if (!ctm) return null;
    var p = pt.matrixTransform(ctm.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };

  BallPathEditor.prototype._wire = function () {
    var self = this;

    this.svg.addEventListener('playerclick', function (ev) {
      if (self._suspended) return;
      self.addPlayer(ev.detail);
    });

    this.svg.addEventListener('pointerdown', function (ev) {
      var step = ev.target.__ballStep;
      if (step == null) return;
      ev.preventDefault();
      ev.stopPropagation();
      self._drag = step;
      // Wrapped like the matching releasePointerCapture calls below --
      // a synthetic or already-ended pointer (rare, but real: seen from an
      // automated test firing PointerEvents with a pointerId that was never
      // actually active) throws NotFoundError here uncaught otherwise.
      try { self.svg.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    this.svg.addEventListener('pointermove', function (ev) {
      if (self._drag == null) return;
      ev.preventDefault();
      var p = self._toLocal(ev);
      if (!p || !self.ballPath[self._drag]) return;
      self.ballPath[self._drag].at = p;
      self.render();
    });

    function end(ev) {
      if (self._drag == null) return;
      try { self.svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      self._drag = null;
      self.onChange();
    }
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
  };

  window.BallPathEditor = BallPathEditor;
})();
