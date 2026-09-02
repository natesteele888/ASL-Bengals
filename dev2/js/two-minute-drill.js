/* ============================================================
   TWO MINUTE DRILL -- standalone prototype (Nathan, 2026-08-23).

   "You are shown signals for a play call. It will be 4 multiple
   choice. The options will be close to try and fool them. If you
   get the play call correct it shows there is a gain on the play
   and the play call shows its animation. If you get the play call
   wrong it's a false start and it's a 5 yd penalty. Passing plays
   which are more difficult to call out will gain you more yardage.
   By getting several correct you can score a touchdown and have a
   chance at another drive before your 2 minute expires."

   Follow-up answers (AskUserQuestion):
   - Drive length: full realistic drive, ~75-80 yds from your own 25.
   - Difficulty: originally "full mix from play one" (no ramp) -- Nathan
     later (2026-08-23) revised this to "easier to start and a little
     harder as you go"; see difficultyTier/generateCorrectCall/
     generateChoices for the ramp that replaced the old fixed-odds
     design -- PLUS: "bonus for multiple correct in a row" (see STREAK
     below) and "big gain and get out of bounds" (see BIG PLAY below,
     which also protects clock time).

   2026-08-23 additions (Nathan): split-call routes (SEA/HOU/FLO/BOS) no
   longer appear in the displayed/quizzed answer text -- "the routes are
   given at the line independent of the play call" (see describeCall/
   callKey/neighborSplitCalls); and a new "TW Sweep (TE counter)" toggle
   was added alongside Boot/Counter on outside_zone/option, built
   entirely in this file's own rendering layer (see buildTwSweepVariant)
   without touching data/plays.json or the real coaching tool.

   ORIGINALLY a standalone test page (two-minute-drill-test.html,
   "create this in a standalone test environment that can be added
   later"), now also loaded as part of the live app itself (Nathan,
   2026-08-23: "I am ready to add this into the live app as a test.
   press and hold the logo for 3 seconds launches it.") -- see
   index.html's #twoMinDrillOverlay for the in-app markup and boot()'s
   scripts array, and study-quiz.js's headerLogo long-press handler for
   how it's opened. The standalone test page still exists too and keeps
   working unchanged (same file, no login required there).

   Its own data loading still fetches data/plays.json directly (same
   public file the rest of the app treats as the source of truth for
   shipped defaults) and, for the real hand-signal photos, reads
   Firebase's public dev2PlayData/cards.json the same way index.html's
   boot() does, falling back to plain text signal cards if that's
   unreachable -- left as-is since it's harmless either standalone or
   live-app-loaded (no naming collisions with the rest of the app; see
   this file's own top-level IIFE wrapper). Personal-best TD count/
   streak stay in localStorage only, same as before. The new team
   leaderboard (Nathan: "this will also need a leaderboard... The
   leaderboard for the game is only contained within the 2 minute
   drill") is a separate addition -- see SECTION 6c below -- that DOES
   write to the cloud, auto-saving every completed drive via the
   already-signed-in session's identity (no manual name-entry step).

   Field-diagram rendering (renderCardDiagram/playCardAnimation and
   their helpers below) is copied near-verbatim from js/play-calls.js
   so the play animation looks and behaves exactly like the one
   coaches already know from Play Calls -- including the blue-then-
   red handoff-split fix and the animatePathDraw hide-before-delay
   fix from earlier this session. play-calls.js itself can't just be
   <script>-included here: it wires up a bunch of top-level DOM
   listeners (password gate, tutorial overlay, etc.) that assume the
   real index.html markup exists, and throws immediately without it.
   ============================================================ */
(function () {
  'use strict';

  // ================================================================
  // SECTION 1: low-level SVG / animation primitives
  // (copied from js/play-calls.js -- see that file for the original,
  // more heavily-commented version; kept in sync manually for now)
  // ================================================================
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function tweenPoint(from, to, durationMs, onUpdate) {
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / durationMs);
        onUpdate({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  function straightPathD(pts) { const [[x0,y0],[x1,y1]] = pts; return `M ${x0} ${y0} L ${x1} ${y1}`; }
  function quadPathD(pts) { const [[x0,y0],[x1,y1],[x2,y2]] = pts; return `M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2}`; }
  function lineThenCurvePathD(pts) {
    const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = pts;
    return `M ${x0} ${y0} L ${x1} ${y1} Q ${x2} ${y2} ${x3} ${y3}`;
  }
  function multiCurvePathD(pts) {
    const [[x0,y0],[x1,y1],[x2,y2],[x3,y3],[x4,y4]] = pts;
    return `M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2} Q ${x3} ${y3} ${x4} ${y4}`;
  }
  function chainedCurvePathD(points) {
    let d = `M ${points[0][0]} ${points[0][1]}`;
    let i = 1;
    for (; i + 1 < points.length; i += 2) {
      const [cx, cy] = points[i];
      const [ex, ey] = points[i + 1];
      d += ` Q ${cx} ${cy} ${ex} ${ey}`;
    }
    if (i < points.length) {
      const [lx, ly] = points[i];
      d += ` L ${lx} ${ly}`;
    }
    return d;
  }
  function routeDForRange(pts) {
    if (pts.length === 2) return straightPathD(pts);
    if (pts.length === 3) return quadPathD(pts);
    if (pts.length === 5) return multiCurvePathD(pts);
    return chainedCurvePathD(pts);
  }
  function placeArrowAtFraction(arrowEl, pathEl, frac) {
    const len = pathEl.getTotalLength();
    const pt = pathEl.getPointAtLength(len * frac);
    const pt2 = pathEl.getPointAtLength(Math.max(0, len * frac - 1));
    const angle = Math.atan2(pt.y - pt2.y, pt.x - pt2.x) * 180 / Math.PI;
    arrowEl.setAttribute('transform', `translate(${pt.x},${pt.y}) rotate(${angle})`);
  }
  function endTypeFor(p) {
    return p.endType || (p.isBlocking ? 'block' : 'run');
  }
  function buildEndCapEl(endType, color, width) {
    if (endType === 'block') {
      const barLen = Math.max(13, width * 2.2);
      return svgEl('line', {
        x1: 0, y1: -barLen / 2, x2: 0, y2: barLen / 2,
        stroke: color, 'stroke-width': Math.max(6, width + 2), 'stroke-linecap': 'round',
      });
    }
    return svgEl('polygon', { points: '-2,-11 20,0 -2,11', fill: color });
  }
  // Same hide-before-delay fix applied to play-calls.js earlier this
  // session (Nathan: "it needs to run the blue segment first, then
  // the red") -- kept identical here so a handoff-split route (if one
  // ever shows up in the drill) animates the same way it does in Play
  // Calls, not the old before-fix behavior.
  function animatePathDraw(pathEl, arrowEl, durationMs, delayMs, circleEl, textEl) {
    return new Promise(async resolve => {
      const len = pathEl.getTotalLength();
      pathEl.style.strokeDasharray = `${len} ${len}`;
      pathEl.style.strokeDashoffset = `${len}`;
      if (arrowEl) arrowEl.style.opacity = '0';
      if (delayMs) await wait(delayMs);
      if (arrowEl) arrowEl.style.opacity = '1';
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / durationMs);
        pathEl.style.strokeDashoffset = `${len * (1 - t)}`;
        if (arrowEl) placeArrowAtFraction(arrowEl, pathEl, t);
        if (circleEl) {
          const pt = pathEl.getPointAtLength(len * t);
          circleEl.setAttribute('cx', pt.x); circleEl.setAttribute('cy', pt.y);
          if (textEl) { textEl.setAttribute('x', pt.x); textEl.setAttribute('y', pt.y + 12); }
        }
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  const DEFENSE_COLOR = '#1a3fae';
  const READKEY_COLOR = '#e0201a';
  const BALL_COLOR = '#e0201a';
  const NOBALL_COLOR = '#123a8c';
  const CIRCLE_R = 36;

  function getVariant(playType, direction, insideOutside, readPosition, counterOn, twSweepOn) {
    // Same defensive fallback as play-calls.js's copy of this function --
    // see its comment. Not load-bearing for the drill's own random call
    // generation (shuffle_pass is deliberately excluded from
    // ELIGIBLE_PLAY_KEYS above), just cheap insurance.
    let v = playType.directions[direction] || playType.directions.Right || playType.directions.Left;
    if (playType.hasInsideOutside) v = v[insideOutside || 'Outside'];
    if (playType.hasReadToggle) v = v[readPosition || 'A'];
    if (playType.hasCounter) {
      // TW Sweep reuses Counter's own variant data (see
      // buildTwSweepVariant below) rather than having its own
      // Normal/Counter/TWSweep slot in the data -- it's a two-minute-
      // drill-only rendering construction, not a real data/plays.json
      // variant.
      if (twSweepOn) return buildTwSweepVariant(v['Counter']);
      v = v[counterOn ? 'Counter' : 'Normal'];
    }
    return v;
  }

  // ---- Render a call's diagram into its SVG stage ----
  // Copied from play-calls.js's renderCardDiagram (same name kept for
  // easy diffing against the original). DATA is the module-level
  // object populated in SECTION 4 below.
  let DATA = null;
  function renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition, counterOn, twSweepOn) {
    stage.innerHTML = '';
    const playType = DATA.playTypes.find(p => p.key === playKey);
    const variant = getVariant(playType, direction, insideOutside, readPosition, counterOn, twSweepOn);
    const vw = DATA.viewBox[0], vh = DATA.viewBox[1];

    let bootBallPath = null, bootFakePath = null;
    if (bootOn) {
      const realBallPath = variant.paths.find(p => p.ball && !p.optionLine);
      const qbPath = variant.paths.find(p => p.player === 1 && !p.optionLine && !p.ball);
      if (realBallPath && qbPath) { bootBallPath = qbPath; bootFakePath = realBallPath; }
    }
    stage.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const g = svgEl('g', { transform: `translate(0,${DATA.topPad})` });
    const pathsLayer = svgEl('g', {});
    const circlesLayer = svgEl('g', {});
    const isLineSelectedForCircles = typeof selectedPlayer === 'string';
    const wingPos = DATA.wing[wingSide];
    const activeDefense = (defenseMode === '4x4' && variant.defense4x4) ? variant.defense4x4 : variant.defense;

    function drawCircle(x, y, label, stroke, fontSize, isSelected, r, playerNum) {
      r = r || CIRCLE_R;
      const wrap = svgEl('g', { class: isSelected ? 'full-op selected-glow' : 'full-op' });
      wrap.appendChild(svgEl('circle', { cx: x, cy: y, r, fill: '#fff', stroke, 'stroke-width': 8 }));
      const t = svgEl('text', { x, y: y + 12, 'font-size': fontSize, 'font-weight': 900, 'font-style': 'italic', 'text-anchor': 'middle', fill: stroke });
      t.textContent = label;
      wrap.appendChild(t);
      wrap.circleEl = wrap.children[0]; wrap.textEl = t;
      return wrap;
    }
    const playerCircles = {};

    function buildReadNoteEl(endPoint, fullText) {
      const [ex, ey] = endPoint;
      const g2 = svgEl('g', {});
      const title = svgEl('title', {});
      title.textContent = fullText;
      g2.appendChild(title);
      const fontSize = 45, lineHeight = 51, gapAboveCircle = 14;
      const lines = ['TE READ:', 'If no LB', 'behind DE,', 'take the CB'];
      const lastLineY = ey - CIRCLE_R - gapAboveCircle;
      const firstLineY = lastLineY - lineHeight * (lines.length - 1);
      const t = svgEl('text', { x: ex, y: firstLineY, 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 800, 'font-style': 'italic', fill: READKEY_COLOR });
      lines.forEach((line, i) => {
        const tspan = svgEl('tspan', { x: ex, dy: i === 0 ? 0 : lineHeight });
        tspan.textContent = line;
        t.appendChild(tspan);
      });
      g2.appendChild(t);
      return g2;
    }

    const defenseCircles = {};
    function flashDefenderAt(pt) {
      const [px, py] = pt;
      let bestId = null, bestDist = Infinity;
      activeDefense.forEach(d => {
        const dist = Math.hypot(d.pos[0] - px, d.pos[1] - py);
        if (dist < bestDist) { bestDist = dist; bestId = d.id; }
      });
      if (bestId && defenseCircles[bestId]) defenseCircles[bestId].classList.add('te-read-flash');
    }

    activeDefense.forEach(d => {
      const isReadKey = variant.readKeyId && d.id === variant.readKeyId;
      const stroke = isReadKey ? READKEY_COLOR : DEFENSE_COLOR;
      const dc = drawCircle(d.pos[0], d.pos[1], d.label, stroke, 26, false, CIRCLE_R);
      circlesLayer.appendChild(dc);
      defenseCircles[d.id] = dc;
    });

    const c5 = drawCircle(DATA.formation['5'][0], DATA.formation['5'][1], '5', '#111', 34, selectedPlayer === 5, null);
    circlesLayer.appendChild(c5); playerCircles['5'] = c5;
    ['LT','LG','C','RG','RT'].forEach(k => {
      const isSelected = isLineSelectedForCircles && selectedPlayer === k;
      const c = drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, '#111', 22, isSelected, null);
      circlesLayer.appendChild(c); playerCircles[k] = c;
    });
    const c6 = drawCircle(DATA.formation['6'][0], DATA.formation['6'][1], '6', '#111', 34, selectedPlayer === 6, null);
    circlesLayer.appendChild(c6); playerCircles['6'] = c6;

    const oppositeWingSide = wingSide === 'Left' ? 'Right' : 'Left';
    const p4Anchor = motionOn ? DATA.wing[oppositeWingSide] : wingPos;
    const p4Side = motionOn ? oppositeWingSide : wingSide;

    const c4 = drawCircle(p4Anchor[0], p4Anchor[1], '4', '#111', 34, selectedPlayer === 4, null);
    circlesLayer.appendChild(c4); playerCircles['4'] = c4;

    if (motionOn) {
      circlesLayer.appendChild(svgEl('path', {
        d: `M ${wingPos[0]} ${wingPos[1]} L ${p4Anchor[0]} ${p4Anchor[1]}`,
        fill: 'none', stroke: '#111', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '3 12',
      }));
    }

    ['3','1','2'].forEach(num => {
      const isSelected = String(selectedPlayer) === num;
      const c = drawCircle(DATA.backfield[num][0], DATA.backfield[num][1], num, '#111', 34, isSelected, null);
      circlesLayer.appendChild(c); playerCircles[num] = c;
    });

    const lastRenderedPaths = [];
    const isLineSelected = typeof selectedPlayer === 'string';
    variant.paths.forEach(p => {
      const isSelected = selectedPlayer !== null && (isLineSelected ? (p.id === selectedPlayer) : (p.player === selectedPlayer));
      const wrap = svgEl('g', { class: isSelected ? 'full-op selected-glow' : 'full-op' });

      let points = (defenseMode === '4x4' && p.isBlocking && !p.blockRelative && !p.dualSideBlock && p.points4x4) ? p.points4x4 : p.points;
      let readNoteToShow = null;
      if (p.dualSideBlock) {
        const sameSide = p4Side === direction;
        const baseKey = sameSide ? 'sameSidePoints' : 'crossPoints';
        const fieldKey = defenseMode === '4x4' ? baseKey + '4x4' : baseKey;
        points = p[fieldKey] || p.points;
        if (!sameSide && p.crossNote) readNoteToShow = p.crossNote;
      } else if (p.player === 4 && !p.optionLine) {
        if (p.wingSeamRelative) {
          const sameSide = p4Side === direction;
          const offsets = sameSide ? p.sameSideOffsets : p.crossOffsets;
          const sign = p4Side === 'Left' ? 1 : -1;
          points = offsets.map(([dx, dy]) => [p4Anchor[0] + sign * dx, p4Anchor[1] + dy]);
        } else if (p.blockRelative) {
          const sameSide = p4Side === direction;
          const baseKey = sameSide ? 'sameSidePoints' : 'crossPoints';
          const fieldKey = defenseMode === '4x4' ? baseKey + '4x4' : baseKey;
          const srcPoints = p[fieldKey] || p.points;
          const [dx, dy] = srcPoints[1];
          const sign = p4Side === 'Left' ? 1 : -1;
          points = [p4Anchor, [p4Anchor[0] + sign * dx, p4Anchor[1] + dy]];
        } else {
          points = [p4Anchor, ...points.slice(1)];
        }
      }
      if (p.optionLine) {
        const [[x1,y1],[x2,y2]] = p.points;
        const path = svgEl('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, fill: 'none', stroke: '#555', 'stroke-width': p.width, 'stroke-linecap': 'round', 'stroke-dasharray': '9 7' });
        wrap.appendChild(path);
        pathsLayer.appendChild(wrap);
        return;
      }

      const effectiveBall = p === bootBallPath ? true : (p === bootFakePath ? false : p.ball);
      const color = p.isBlocking ? '#e8720c' : (effectiveBall ? BALL_COLOR : NOBALL_COLOR);

      const handoffIdx = Number.isInteger(p.handoffIndex) ? p.handoffIndex : null;
      const hasHandoffSplit = handoffIdx !== null && handoffIdx >= 1 && handoffIdx <= points.length - 1
        && !p.isBlocking && !p.fake;

      let arrowEl = null;
      const ownerKey = p.player !== null ? String(p.player) : p.id;
      const ownerCircle = (ownerKey && !p.fake) ? playerCircles[ownerKey] : null;

      if (hasHandoffSplit) {
        const leftPts = points.slice(0, handoffIdx + 1);
        const rightPts = points.slice(handoffIdx);
        const leftPath = svgEl('path', { d: routeDForRange(leftPts), fill: 'none', stroke: NOBALL_COLOR, 'stroke-width': p.width, 'stroke-linecap': 'round' });
        wrap.appendChild(leftPath);
        let rightPath = null;
        if (rightPts.length >= 2) {
          rightPath = svgEl('path', { d: routeDForRange(rightPts), fill: 'none', stroke: BALL_COLOR, 'stroke-width': p.width, 'stroke-linecap': 'round' });
          wrap.appendChild(rightPath);
        }
        pathsLayer.appendChild(wrap);
        const leftLen = leftPath.getTotalLength();
        const rightLen = rightPath ? rightPath.getTotalLength() : 0;
        const totalLen = leftLen + rightLen;
        const startFracRight = totalLen > 0 ? leftLen / totalLen : 1;

        arrowEl = buildEndCapEl(endTypeFor(p), BALL_COLOR, p.width);
        wrap.appendChild(arrowEl);
        placeArrowAtFraction(arrowEl, rightPath || leftPath, 1);

        lastRenderedPaths.push({ el: leftPath, arrowEl: rightPath ? null : arrowEl, player: p.player, id: p.id, isBall: false, isBlocking: false, delayMs: p.delayMs || 0,
          circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null,
          startFrac: 0, lenFrac: startFracRight });
        if (rightPath) {
          lastRenderedPaths.push({ el: rightPath, arrowEl, player: p.player, id: p.id, isBall: false, isBlocking: false, delayMs: p.delayMs || 0,
            circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null,
            startFrac: startFracRight, lenFrac: 1 - startFracRight, handoffFraction: startFracRight });
        }
      } else {
        const d = p.lineThenCurve ? lineThenCurvePathD(points)
          : points.length === 5 ? multiCurvePathD(points)
          : points.length === 2 ? straightPathD(points)
          : points.length === 3 ? quadPathD(points)
          : chainedCurvePathD(points);
        const attrs = { d, fill: 'none', stroke: color, 'stroke-width': p.width, 'stroke-linecap': 'round' };
        if (p.fake) attrs['stroke-dasharray'] = '10 8';
        const path = svgEl('path', attrs);
        wrap.appendChild(path);

        if (!p.fake) {
          arrowEl = buildEndCapEl(endTypeFor(p), color, p.width);
          wrap.appendChild(arrowEl);
          placeArrowAtFraction(arrowEl, path, 1);
        }
        pathsLayer.appendChild(wrap);

        lastRenderedPaths.push({ el: path, arrowEl, player: p.player, id: p.id, isBall: effectiveBall, isBlocking: !!p.isBlocking, delayMs: p.delayMs || 0,
          circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null });
      }

      if (readNoteToShow) {
        flashDefenderAt(points[points.length - 1]);
        pathsLayer.appendChild(buildReadNoteEl(points[points.length - 1], readNoteToShow));
      }
    });

    g.appendChild(pathsLayer);
    g.appendChild(circlesLayer);
    stage.appendChild(g);

    stage._mainGroup = g;
    stage._circlesLayerRef = circlesLayer;
    stage._lastRenderedPaths = lastRenderedPaths;
  }

  // ---- Play the animation for a call (copied from play-calls.js's
  // playCardAnimation, same reasoning as renderCardDiagram above) ----
  async function playCardAnimation(stage, playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition, counterOn, twSweepOn) {
    if (isPlayingRef.value) return;
    isPlayingRef.value = true;
    renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition, counterOn, twSweepOn);

    const animMs = 1400 * speedMultiplier;
    const mainGroup = stage._mainGroup;
    const circlesLayerRef = stage._circlesLayerRef;
    const lastRenderedPaths = stage._lastRenderedPaths;

    const ball = svgEl('ellipse', { rx: 34, ry: 21, fill: '#7a4a24', stroke: '#f4e9dc', 'stroke-width': 3 });
    const centerPos = { x: DATA.formation['C'][0], y: DATA.formation['C'][1] };
    const qbPos = { x: DATA.backfield['1'][0], y: DATA.backfield['1'][1] };
    ball.setAttribute('cx', centerPos.x); ball.setAttribute('cy', centerPos.y);
    mainGroup.insertBefore(ball, circlesLayerRef);

    if (motionOn) {
      const p4Entry = lastRenderedPaths.find(p => p.player === 4);
      if (p4Entry && p4Entry.circleEl) {
        const oppositeSide = wingSide === 'Left' ? 'Right' : 'Left';
        const startPos = { x: DATA.wing[wingSide][0], y: DATA.wing[wingSide][1] };
        const endPos = { x: DATA.wing[oppositeSide][0], y: DATA.wing[oppositeSide][1] };
        p4Entry.circleEl.setAttribute('cx', startPos.x); p4Entry.circleEl.setAttribute('cy', startPos.y);
        if (p4Entry.textEl) { p4Entry.textEl.setAttribute('x', startPos.x); p4Entry.textEl.setAttribute('y', startPos.y + 12); }
        await tweenPoint(startPos, endPos, 2200 * speedMultiplier, pt => {
          p4Entry.circleEl.setAttribute('cx', pt.x); p4Entry.circleEl.setAttribute('cy', pt.y);
          if (p4Entry.textEl) { p4Entry.textEl.setAttribute('x', pt.x); p4Entry.textEl.setAttribute('y', pt.y + 12); }
        });
        await wait(150 * speedMultiplier);
      }
    }

    await wait(250 * speedMultiplier);
    await tweenPoint(centerPos, qbPos, 450 * speedMultiplier, pt => { ball.setAttribute('cx', pt.x); ball.setAttribute('cy', pt.y); });
    await wait(150 * speedMultiplier);

    const pathPromises = lastRenderedPaths.map(({ el, arrowEl, delayMs, circleEl, textEl, startFrac, lenFrac }) =>
      animatePathDraw(el, arrowEl, (lenFrac != null ? lenFrac : 1) * animMs,
        (delayMs || 0) * speedMultiplier + (startFrac || 0) * animMs, circleEl, textEl));

    const ballEntry = lastRenderedPaths.find(p => p.isBall);
    const handoffEntry = lastRenderedPaths.find(p => p.handoffFraction != null && p.circleEl);
    const OFFY = 50;
    if (ballEntry && ballEntry.circleEl) {
      let carrier = ballEntry.circleEl;
      let cx = qbPos.x, cy = qbPos.y;
      let catchingUp = true;
      let easing = true;
      let tracking = false;
      function catchUpFrame() {
        const targetX = Number(carrier.getAttribute('cx'));
        const targetY = Number(carrier.getAttribute('cy')) + OFFY;
        cx += (targetX - cx) * 0.25;
        cy += (targetY - cy) * 0.25;
        ball.setAttribute('cx', cx);
        ball.setAttribute('cy', cy);
        const dist = Math.hypot(targetX - cx, targetY - cy);
        if (catchingUp && dist > 3) {
          requestAnimationFrame(catchUpFrame);
        } else {
          catchingUp = false;
          easing = false;
          track();
        }
      }
      function track() {
        if (!tracking) return;
        if (easing) { requestAnimationFrame(track); return; }
        ball.setAttribute('cx', carrier.getAttribute('cx'));
        ball.setAttribute('cy', Number(carrier.getAttribute('cy')) + OFFY);
        requestAnimationFrame(track);
      }
      if (handoffEntry && handoffEntry.circleEl !== carrier) {
        const handoffDelay = (handoffEntry.delayMs || 0) * speedMultiplier + handoffEntry.handoffFraction * animMs;
        wait(handoffDelay).then(() => {
          if (!tracking) return;
          carrier = handoffEntry.circleEl;
          catchingUp = true;
          easing = true;
          catchUpFrame();
        });
      }
      await wait((ballEntry.delayMs || 0) * speedMultiplier);
      tracking = true;
      catchUpFrame();
      await wait(animMs);
      tracking = false;
    } else {
      await wait(animMs);
    }
    await Promise.all(pathPromises);
    await wait(300 * speedMultiplier);
    ball.remove();
    isPlayingRef.value = false;
  }

  // ================================================================
  // SECTION 1b: Split formation rendering -- Nathan: "add in split as we
  // will run a lot of split on 2 minute drill." Copied near-verbatim from
  // js/play-calls.js's own Split support (getSplitDefense/
  // getSplitBlockingPaths/getSplitPassProtectionPaths/getSplitRoutePaths/
  // reanchorRoute/renderSplitDiagram/playSplitAnimation -- see that file
  // for the full history/rationale on each piece), with one deliberate
  // simplification: the drill's diagram is never player-selectable/click-
  // to-highlight the way Play Calls' card is (playGainAnimation always
  // renders with nothing selected), so the click-to-select wiring and
  // isSelected/glow plumbing from the original drawCircle isn't ported --
  // every circle just draws plain. Split route EDITS (a coach's saved
  // Houston/Seattle/Florida/Boston tweaks, separate from playEdits.json)
  // also aren't fetched here -- same "generic shipped data is an
  // acceptable fallback" trade-off this file already makes for Wing.
  // ================================================================
  function getSplitDefense() {
    return [
      { id: 'DE_L', label: 'DE', pos: [436, 110] },
      { id: 'DT_L', label: 'DT', pos: [662, 110] },
      { id: 'DT_R', label: 'DT', pos: [949, 110] },
      { id: 'DE_R', label: 'DE', pos: [1183, 110] },
      { id: 'LB1', label: 'LB', pos: [500, -20] },
      { id: 'LB2', label: 'LB', pos: [700, -20] },
      { id: 'LB3', label: 'LB', pos: [900, -20] },
      { id: 'LB4', label: 'LB', pos: [1100, -20] },
      { id: 'CB_L', label: 'CB', pos: [150, 90] },
      { id: 'CB_R', label: 'CB', pos: [1460, 90] },
      { id: 'FS', label: 'S', pos: [805, -190] },
    ];
  }

  // "Option-style relative blocking isn't wired for Split yet" (same
  // caveat as play-calls.js) -- optionLine/dualSideBlock paths are
  // dropped rather than shown wrong.
  function getSplitBlockingPaths(playType, splitSide, insideOutside, readPosition) {
    const variant = getVariant(playType, splitSide, insideOutside, readPosition);
    const wideNum = splitSide === 'Right' ? 6 : 5;
    const flexBackNum = splitSide === 'Right' ? 2 : 3;
    const excluded = new Set([wideNum, flexBackNum, 4]);
    return (variant.paths || []).filter(p => {
      if (p.optionLine || p.dualSideBlock) return false;
      return p.player === null || !excluded.has(p.player);
    });
  }

  function getSplitPassProtectionPaths(playType, splitSide, insideOutside, readPosition) {
    const pos = DATA.split[splitSide];
    const tightNum = splitSide === 'Right' ? 5 : 6;
    const companionNum = splitSide === 'Right' ? 3 : 2;
    const paths = [];
    ['LT', 'LG', 'C', 'RG', 'RT'].forEach(k => {
      const [x, y] = DATA.formation[k];
      paths.push({ id: k, isBlocking: true, endType: 'block', width: 7, points: [[x, y], [x, y + 22]] });
    });
    const [tx, ty] = pos[tightNum];
    paths.push({ player: tightNum, isBlocking: true, endType: 'block', width: 7, points: [[tx, ty], [tx, ty + 22]] });
    const [cx] = pos[companionNum];
    const variant = playType ? getVariant(playType, splitSide, insideOutside, readPosition) : null;
    const realBallPath = variant && (variant.paths || []).find(p => p.player === companionNum && p.ball && !p.optionLine);
    if (realBallPath) {
      paths.push({ player: companionNum, ball: false, fake: true, width: 9, points: realBallPath.points });
    }
    const [qx, qy] = pos['1'];
    const meshSign = cx >= qx ? 1 : -1;
    const fakeMeshSpot = [qx + meshSign * 40, qy - 15];
    paths.push({ player: 1, ball: false, fake: true, width: 9, points: [[qx, qy], fakeMeshSpot] });
    const dropSpot = [qx, qy + 35];
    paths.push({ player: 1, ball: true, endType: 'run', width: 9, points: [fakeMeshSpot, dropSpot] });
    return paths;
  }

  function reanchorRoute(points, newAnchor) {
    const [ax, ay] = points[0];
    const vw = (DATA.viewBox && DATA.viewBox[0]) || 1600;
    return points.map(([x, y]) => [
      Math.max(20, Math.min(vw - 20, x - ax + newAnchor[0])),
      Math.max(-390, Math.min(600, y - ay + newAnchor[1])),
    ]);
  }

  // Nathan: "Almost identical to counter, we need to add in a TW sweep
  // (TE counter) option. Instead of the TE blocking and the 4 going
  // across for the handoff, it's the TE just next to the wing that goes
  // for the handoff while the 4 blocks." Built entirely in this file's
  // own rendering layer -- NOT a change to data/plays.json/play-calls.js/
  // edit-plays.js's shared schema -- by taking the SAME Counter variant
  // (same eligible plays -- outside_zone/option -- and the same wing/
  // direction legality rule as Counter, see normalizeCall) and swapping
  // which jersey number (6=TE vs 4=wing) owns each of its two existing
  // path shapes.
  //
  // Player 6 (TE) is always drawn at one fixed formation slot
  // (DATA.formation['6']) no matter which way the play runs, while
  // player 4 (wing) is drawn at a motion-aware anchor that
  // renderCardDiagram already auto-repositions for any player===4 path
  // -- so handing TE's old short block shape to player 4 "just works"
  // via that existing mechanism, no changes needed here. TE has no such
  // auto-anchor, so its new (formerly #4's) crossing shape is
  // re-anchored here via the same reanchorRoute() helper Split uses to
  // slide a route to wherever its owner actually lines up -- this also
  // keeps a Left-direction play's long cross (which starts on the far
  // side of the field from TE's fixed spot) safely on-screen instead of
  // running off the edge of the diagram.
  function buildTwSweepVariant(counterVariant) {
    const tePath = counterVariant.paths.find(p => p.player === 6);
    const wingPath = counterVariant.paths.find(p => p.player === 4);
    if (!tePath || !wingPath) return counterVariant; // fail safe -- shouldn't happen for outside_zone/option
    const newTePath = Object.assign({}, wingPath, {
      player: 6,
      points: reanchorRoute(wingPath.points, DATA.formation['6']),
    });
    const newWingPath = Object.assign({}, tePath, { player: 4 });
    const otherPaths = counterVariant.paths.filter(p => p.player !== 4 && p.player !== 6);
    return Object.assign({}, counterVariant, { paths: otherPaths.concat([newTePath, newWingPath]) });
  }

  function getSplitRoutePaths(splitSide, leftCall, rightCall) {
    const routes = DATA.splitRoutes;
    if (!routes) return [];
    const out = [];
    const splitSideData = routes[splitSide];
    const splitSideCall = splitSide === 'Right' ? rightCall : leftCall;
    if (splitSideData) {
      if (splitSideData.wide && splitSideData.wide[splitSideCall]) {
        out.push({ points: splitSideData.wide[splitSideCall], player: splitSideData.wide.player, width: 7 });
      }
      if (splitSideData.flex && splitSideData.flex[splitSideCall]) {
        out.push({ points: splitSideData.flex[splitSideCall], player: splitSideData.flex.player, width: 7 });
      }
    }
    const oppositeSideKey = splitSide === 'Right' ? 'Left' : 'Right';
    const oppositeCall = splitSide === 'Right' ? leftCall : rightCall;
    const oppositeFlexSource = routes[oppositeSideKey] && routes[oppositeSideKey].flex;
    const fourPos = DATA.split[splitSide] && DATA.split[splitSide]['4'];
    if (oppositeFlexSource && oppositeFlexSource[oppositeCall] && fourPos) {
      out.push({ points: reanchorRoute(oppositeFlexSource[oppositeCall], fourPos), player: 4, width: 7 });
    }
    return out;
  }

  function renderSplitDiagram(stage, playKey, splitSide, insideOutside, readPosition, leftCall, rightCall, passOn) {
    stage.innerHTML = '';
    const vw = DATA.viewBox[0], vh = DATA.viewBox[1];
    stage.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const g = svgEl('g', { transform: `translate(0,${DATA.topPad})` });
    const pathsLayer = svgEl('g', {});
    const circlesLayer = svgEl('g', {});
    const pos = DATA.split[splitSide];

    function drawCircle(x, y, label, fontSize) {
      const wrap = svgEl('g', { class: 'full-op' });
      wrap.appendChild(svgEl('circle', { cx: x, cy: y, r: CIRCLE_R, fill: '#fff', stroke: '#111', 'stroke-width': 8 }));
      const t = svgEl('text', { x, y: y + 12, 'font-size': fontSize, 'font-weight': 900, 'font-style': 'italic', 'text-anchor': 'middle', fill: '#111' });
      t.textContent = label;
      wrap.appendChild(t);
      wrap.circleEl = wrap.children[0]; wrap.textEl = t;
      return wrap;
    }
    function drawDefCircle(x, y, label) {
      const wrap = svgEl('g', { class: 'full-op' });
      wrap.appendChild(svgEl('circle', { cx: x, cy: y, r: CIRCLE_R, fill: '#fff', stroke: DEFENSE_COLOR, 'stroke-width': 8 }));
      const t = svgEl('text', { x, y: y + 12, 'font-size': 26, 'font-weight': 900, 'font-style': 'italic', 'text-anchor': 'middle', fill: DEFENSE_COLOR });
      t.textContent = label;
      wrap.appendChild(t);
      return wrap;
    }

    getSplitDefense().forEach(d => circlesLayer.appendChild(drawDefCircle(d.pos[0], d.pos[1], d.label)));

    const playerCircles = {};
    ['LT', 'LG', 'C', 'RG', 'RT'].forEach(k => {
      const c = drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, 22);
      circlesLayer.appendChild(c); playerCircles[k] = c;
    });
    ['5', '6', '3', '4', '1', '2'].forEach(num => {
      const c = drawCircle(pos[num][0], pos[num][1], num, 34);
      circlesLayer.appendChild(c); playerCircles[num] = c;
    });

    const lastRenderedPaths = [];
    function drawPath(p) {
      const color = p.isBlocking ? '#e8720c' : (p.ball ? BALL_COLOR : NOBALL_COLOR);
      const points = p.points;
      const d = p.lineThenCurve ? lineThenCurvePathD(points)
        : points.length === 5 ? multiCurvePathD(points)
        : points.length === 2 ? straightPathD(points)
        : points.length === 3 ? quadPathD(points)
        : chainedCurvePathD(points);
      const attrs = { d, fill: 'none', stroke: color, 'stroke-width': p.width, 'stroke-linecap': 'round' };
      if (p.fake) attrs['stroke-dasharray'] = '10 8';
      const pathEl = svgEl('path', attrs);
      const wrap = svgEl('g', { class: 'full-op' });
      wrap.appendChild(pathEl);
      let arrowEl = null;
      if (!p.fake) {
        arrowEl = buildEndCapEl(endTypeFor(p), color, p.width);
        wrap.appendChild(arrowEl);
        placeArrowAtFraction(arrowEl, pathEl, 1);
      }
      pathsLayer.appendChild(wrap);
      const ownerKey = (p.player !== null && p.player !== undefined) ? String(p.player) : p.id;
      const ownerCircle = ownerKey ? playerCircles[ownerKey] : null;
      lastRenderedPaths.push({
        el: pathEl, arrowEl, player: p.player, id: p.id, isBall: !!p.ball, isBlocking: !!p.isBlocking, delayMs: p.delayMs || 0,
        circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null,
      });
    }

    const playType = DATA.playTypes.find(p => p.key === playKey);
    if (passOn) {
      getSplitPassProtectionPaths(playType, splitSide, insideOutside, readPosition).forEach(drawPath);
    } else if (playType) {
      getSplitBlockingPaths(playType, splitSide, insideOutside, readPosition).forEach(drawPath);
    }
    getSplitRoutePaths(splitSide, leftCall, rightCall).forEach(drawPath);

    g.appendChild(pathsLayer);
    g.appendChild(circlesLayer);
    stage.appendChild(g);

    stage._mainGroup = g;
    stage._circlesLayerRef = circlesLayer;
    stage._lastRenderedPaths = lastRenderedPaths;
  }

  async function playSplitAnimation(stage, splitSide, speedMultiplier, isPlayingRef) {
    if (isPlayingRef.value) return;
    isPlayingRef.value = true;
    const animMs = 1400 * speedMultiplier;
    const mainGroup = stage._mainGroup;
    const circlesLayerRef = stage._circlesLayerRef;
    const lastRenderedPaths = stage._lastRenderedPaths || [];

    const ball = svgEl('ellipse', { rx: 34, ry: 21, fill: '#7a4a24', stroke: '#f4e9dc', 'stroke-width': 3 });
    const centerPos = { x: DATA.formation['C'][0], y: DATA.formation['C'][1] };
    const qbPos = { x: DATA.split[splitSide]['1'][0], y: DATA.split[splitSide]['1'][1] };
    ball.setAttribute('cx', centerPos.x); ball.setAttribute('cy', centerPos.y);
    mainGroup.insertBefore(ball, circlesLayerRef);

    await wait(250 * speedMultiplier);
    await tweenPoint(centerPos, qbPos, 450 * speedMultiplier, pt => { ball.setAttribute('cx', pt.x); ball.setAttribute('cy', pt.y); });
    await wait(150 * speedMultiplier);

    const pathPromises = lastRenderedPaths.map(({ el, arrowEl, delayMs, circleEl, textEl }) =>
      animatePathDraw(el, arrowEl, animMs, (delayMs || 0) * speedMultiplier, circleEl, textEl));

    const ballEntry = lastRenderedPaths.find(p => p.isBall);
    const OFFY = 50;
    if (ballEntry && ballEntry.circleEl) {
      await wait((ballEntry.delayMs || 0) * speedMultiplier);
      const carrier = ballEntry.circleEl;
      let cx = qbPos.x, cy = qbPos.y;
      let catchingUp = true;
      function catchUpFrame() {
        const targetX = Number(carrier.getAttribute('cx'));
        const targetY = Number(carrier.getAttribute('cy')) + OFFY;
        cx += (targetX - cx) * 0.25;
        cy += (targetY - cy) * 0.25;
        ball.setAttribute('cx', cx);
        ball.setAttribute('cy', cy);
        const dist = Math.hypot(targetX - cx, targetY - cy);
        if (catchingUp && dist > 3) {
          requestAnimationFrame(catchUpFrame);
        } else {
          catchingUp = false;
          track();
        }
      }
      catchUpFrame();
      let tracking = true;
      function track() {
        if (!tracking) return;
        ball.setAttribute('cx', carrier.getAttribute('cx'));
        ball.setAttribute('cy', Number(carrier.getAttribute('cy')) + OFFY);
        requestAnimationFrame(track);
      }
      await wait(animMs);
      tracking = false;
    } else {
      await wait(animMs);
    }
    await Promise.all(pathPromises);
    await wait(300 * speedMultiplier);
    ball.remove();
    isPlayingRef.value = false;
  }

  // ================================================================
  // SECTION 2: signal-sequence builder
  // (copied from js/play-calls.js's buildSignalSequence + its
  // supporting constants/random-finger-id logic -- self-contained,
  // only needs DATA.playTypes and the SIGNAL_CARDS map built below)
  // ================================================================
  let SIGNAL_CARDS = {};
  const PLAY_TYPE_SIGNAL_ID = {
    inside_zone: 9, outside_zone: 10, option: 15, option_pass: 16, blast: 13, double_blast: 14, sweep: 17,
    shuffle_pass: 23,
  };
  const PLAY_TYPE_SIGNAL_LABEL = {
    inside_zone: 'Inside Zone', outside_zone: 'Outside Zone', option: 'Option',
    option_pass: 'Option Pass', blast: 'Blast', double_blast: 'Double Blast', sweep: 'Sweep',
    shuffle_pass: 'Shuffle Pass',
  };
  const WING_TOUCH_ID = 7;
  const FINGER_RIGHT_IDS = [4, 5, 6];
  const FINGER_LEFT_IDS = [1, 2, 3];
  const MOTION_SIGNAL_IDS = [11, 12];
  const BOOT_SIGNAL_ID = 26;
  // Nathan: "you aren't adding Counter to the play signals on the back side
  // of the card. Signal 18 is Counter. it comes in last, just like Boot" --
  // same fix as play-calls.js's buildSignalSequence, mirrored here since
  // this copy was made before that gap was noticed.
  const COUNTER_SIGNAL_ID = 18;
  // Nathan: "Almost identical to counter, we need to add in a TW sweep
  // (TE counter) option." Same "comes in last" placement as Boot/Counter
  // above (see buildWingSignalSequence) since it's mutually exclusive
  // with both. ID 19 is otherwise unused (18=Counter, 26=Boot, 28-31=
  // Split-only) -- like any brand-new signal ID, it has no real
  // coach-uploaded photo yet, so it gracefully falls back to a plain
  // text card (see SIGNAL_CARDS/loadData) until one is added.
  const TW_SWEEP_SIGNAL_ID = 19;

  function randomFingerId(side, exclude) {
    const pool = side === 'Right' ? FINGER_RIGHT_IDS : FINGER_LEFT_IDS;
    const options = exclude !== undefined ? pool.filter(id => id !== exclude) : pool;
    return options[Math.floor(Math.random() * options.length)];
  }

  // Split-only signal touch/finger cards -- see js/play-calls.js's own
  // SPLIT_TOUCH_ID/PASS_SIGNAL_IDS/SPLIT_ROUTE_CALLS for the full history.
  const SPLIT_TOUCH_ID = 31;
  const PASS_SIGNAL_IDS = [28, 29, 30];
  const SPLIT_ROUTE_CALLS = ['seattle', 'houston', 'florida', 'boston'];
  // Nathan: "the routes are given at the line independent of the play
  // call... Answer options should never contain routes like Hou, Flo, Bos
  // or Sea." -- routes are still randomized on the call object below (for
  // the diagram animation) but are never abbreviated into displayed or
  // quizzed text, so no short-label map is needed here anymore.

  // Split's signal order: Split -> Direction (split side) -> Play call ->
  // Direction (split side again) -> optional Pass. See play-calls.js's
  // buildSplitSignalSequence for the full history on why both direction
  // cards say the same side.
  function buildSplitSignalSequence(playKey, splitSide, insideOutside, passOn) {
    const splitFingerId = randomFingerId(splitSide);
    const dirFingerId = randomFingerId(splitSide, splitFingerId);
    const playType = DATA.playTypes.find(p => p.key === playKey);
    const playSignalId = (playType && playType.signalCardId != null) ? playType.signalCardId : PLAY_TYPE_SIGNAL_ID[playKey];
    const playSignalLabel = (playType && playType.signalLabel) ? playType.signalLabel : PLAY_TYPE_SIGNAL_LABEL[playKey];
    const signals = [
      { src: SIGNAL_CARDS[SPLIT_TOUCH_ID], label: 'Split' },
      { src: SIGNAL_CARDS[splitFingerId], label: `Split: ${splitSide}` },
    ];
    if (playKey === 'blast' || playKey === 'double_blast') {
      if (insideOutside === 'Outside') {
        signals.push({ src: SIGNAL_CARDS[PLAY_TYPE_SIGNAL_ID['outside_zone']], label: 'Outside Zone' });
      }
      signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
    } else {
      signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
    }
    signals.push({ src: SIGNAL_CARDS[dirFingerId], label: `Direction: ${splitSide}` });
    if (passOn) {
      const passId = PASS_SIGNAL_IDS[Math.floor(Math.random() * PASS_SIGNAL_IDS.length)];
      signals.push({ src: SIGNAL_CARDS[passId], label: 'Pass' });
    }
    return signals;
  }

  function buildWingSignalSequence(playKey, wingSide, direction, insideOutside, motionOn, bootOn, counterOn, twSweepOn) {
    const wingFingerId = randomFingerId(wingSide);
    const dirFingerId = direction === wingSide
      ? randomFingerId(direction, wingFingerId)
      : randomFingerId(direction);
    const playType = DATA.playTypes.find(p => p.key === playKey);
    const playSignalId = (playType && playType.signalCardId != null) ? playType.signalCardId : PLAY_TYPE_SIGNAL_ID[playKey];
    const playSignalLabel = (playType && playType.signalLabel) ? playType.signalLabel : PLAY_TYPE_SIGNAL_LABEL[playKey];
    const signals = [
      { src: SIGNAL_CARDS[WING_TOUCH_ID], label: 'Wing' },
      { src: SIGNAL_CARDS[wingFingerId], label: `Wing Location: ${wingSide}` },
    ];
    if (motionOn) {
      const motionId = MOTION_SIGNAL_IDS[Math.floor(Math.random() * MOTION_SIGNAL_IDS.length)];
      signals.push({ src: SIGNAL_CARDS[motionId], label: 'Motion' });
    }
    if (playKey === 'blast' || playKey === 'double_blast') {
      if (insideOutside === 'Outside') {
        signals.push({ src: SIGNAL_CARDS[PLAY_TYPE_SIGNAL_ID['outside_zone']], label: 'Outside Zone' });
      }
      signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
    } else {
      signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
    }
    signals.push({ src: SIGNAL_CARDS[dirFingerId], label: `Direction: ${direction}` });
    // Boot, Counter, and TW Sweep are mutually exclusive (normalizeCall
    // above never sets more than one), so at most one of these three
    // fires.
    if (bootOn) {
      signals.push({ src: SIGNAL_CARDS[BOOT_SIGNAL_ID], label: 'Boot' });
    }
    if (counterOn) {
      signals.push({ src: SIGNAL_CARDS[COUNTER_SIGNAL_ID], label: 'Counter' });
    }
    if (twSweepOn) {
      signals.push({ src: SIGNAL_CARDS[TW_SWEEP_SIGNAL_ID], label: 'TW Sweep' });
    }
    return signals;
  }

  // Dispatches to the Wing or Split builder based on the call's own
  // `formation` field -- the only thing runRound() actually calls; the two
  // formation-specific builders above stay reachable individually (by
  // their original names) for the test hooks below, unchanged.
  function buildSignalSequenceForCall(call) {
    return call.formation === 'split'
      ? buildSplitSignalSequence(call.playKey, call.splitSide, call.insideOutside, call.passOn)
      : buildWingSignalSequence(call.playKey, call.wingSide, call.direction, call.insideOutside, call.motionOn, call.bootOn, call.counterOn, call.twSweepOn);
  }

  // ================================================================
  // SECTION 3: call legality + generation
  // Mirrors the same rules just added to play-calls.js this session:
  //   - Counter only legal when #4's side AFTER motion matches
  //     Direction (Nathan: "you can only run counter if you are
  //     running to the wing side").
  //   - Boot and Counter are mutually exclusive (Nathan: "on outside
  //     zone -- we can either do boot or counter, not both").
  //   - noBoot plays (Option) never show Boot.
  //   - hasInsideOutside plays (Blast/Double Blast) require a pick.
  // Counter itself only exists on Option/Outside Zone (hasCounter).
  // ================================================================
  // Nathan: new play, signal #23, "Wing Right, Shuffle Pass Right" --
  // deliberately NOT added here. This generator picks wingSide/direction
  // independently at random (see generateCorrectCall below) and getVariant
  // does an unguarded playType.directions[direction] lookup -- fine for
  // every other play here since each has both Left and Right authored, but
  // shuffle_pass only has a Right variant so far (only "Wing Right,
  // Shuffle Pass Right" was ever described), and it's also Wing-only with
  // no Split data at all. Picking it randomly would crash the diagram the
  // moment Left, or the Split branch, came up. Safe to add once a coach
  // mirrors a Left variant (and, if wanted, a Split one) via Edit Plays.
  const ELIGIBLE_PLAY_KEYS = ['inside_zone', 'outside_zone', 'blast', 'double_blast', 'option_pass', 'sweep', 'option'];
  // "Passing plays which are more difficult to call out will gain you
  // more yardage" -- Option Pass is the only real drop-back pass among
  // these 7 plays on Wing (Split's independent Pass toggle, checked via
  // call.passOn in resolveGain, is the other passing path -- see
  // SPLIT_PASS_CHANCE below).
  const PASSING_PLAY_KEYS = ['option_pass'];
  // Nathan (2026-08-24): "We also need more passing calls to move the
  // ball such as option pass, or split formation with a pass at the
  // end." A plain uniform pick over the 7 keys above gives Option Pass
  // only a 1-in-7 (~14%) shot at being the base play -- weighting it 2x
  // here roughly doubles that to ~25% without crowding out run-play
  // variety entirely. (SPLIT_PASS_CHANCE further down is the other half
  // of this -- Split's independent "pass at the end" toggle.)
  const ELIGIBLE_PLAY_WEIGHTS = { option_pass: 2 };
  function pickWeightedPlayKey() {
    const pool = [];
    ELIGIBLE_PLAY_KEYS.forEach(key => {
      const weight = ELIGIBLE_PLAY_WEIGHTS[key] || 1;
      for (let i = 0; i < weight; i++) pool.push(key);
    });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Near-miss play-type swaps for decoy generation -- conceptually
  // adjacent calls a coach could plausibly mix up (same family: two
  // zone runs, two blast variants, Option's run vs its play-action
  // pass, Sweep vs the other outside run).
  const SIBLING_PLAY_KEYS = {
    inside_zone: ['outside_zone'], outside_zone: ['inside_zone', 'sweep'],
    blast: ['double_blast'], double_blast: ['blast'],
    option: ['option_pass'], option_pass: ['option'],
    sweep: ['outside_zone'],
  };

  function playFlags(key) {
    const pt = (DATA.playTypes || []).find(p => p.key === key) || {};
    return { noBoot: !!pt.noBoot, hasInsideOutside: !!pt.hasInsideOutside, hasCounter: !!pt.hasCounter, counterAwayFromWing: !!pt.counterAwayFromWing };
  }
  function playLabel(key) {
    const pt = (DATA.playTypes || []).find(p => p.key === key);
    return pt ? pt.label : key;
  }
  function oppositeSide(side) { return side === 'Left' ? 'Right' : 'Left'; }
  function effectiveWingSide(call) {
    return call.motionOn ? oppositeSide(call.wingSide) : call.wingSide;
  }

  // Normalizes a candidate call to respect every toggle's real
  // constraints (dropping fields that don't apply to this play, and
  // forcing Boot/Counter/TW Sweep off when the wing/dir/motion combo
  // makes them illegal) -- used both when generating the correct answer
  // and when generating each multiple-choice decoy, so nothing offered
  // on screen is ever a combo the real Play Calls toggles (plus this
  // drill's own TW Sweep, see buildTwSweepVariant) could actually
  // produce. Dispatches to the Split-specific normalizer when the
  // candidate is a Split call (see normalizeSplitCall below).
  function normalizeCall(call) {
    if (call.formation === 'split') return normalizeSplitCall(call);
    const flags = playFlags(call.playKey);
    const out = {
      formation: 'wing',
      playKey: call.playKey, wingSide: call.wingSide, direction: call.direction,
      motionOn: !!call.motionOn, bootOn: false, counterOn: false, twSweepOn: false, insideOutside: null,
    };
    if (flags.hasInsideOutside) out.insideOutside = call.insideOutside === 'Inside' ? 'Inside' : 'Outside';
    // Nathan: TW Sweep is "almost identical to counter" -- it shares
    // Counter's exact legality rule (only legal running to the wing's
    // own side) and is mutually exclusive with both Counter and Boot.
    // All three can never be true at once; Counter wins a tie over TW
    // Sweep, which wins a tie over Boot, purely so a decoy mutation that
    // ends up with more than one flag set still normalizes to something
    // deterministic and legal.
    // Nathan (2026-08-24), on Blast's own Counter (the TE takes the
    // handoff instead of #4 cutting back): "the ball has to be run away
    // from the 4... [not] the 4 cutting back to take it" -- the OPPOSITE
    // legality rule from Option/Outside Zone's Counter (same side as the
    // 4). counterAwayFromWing flips the comparison for any play that
    // opts into it (see the matching branch in play-calls.js's
    // updateCounterAvailability).
    const eligibleForCounterFamily = flags.hasCounter && (flags.counterAwayFromWing
      ? effectiveWingSide(out) !== out.direction
      : effectiveWingSide(out) === out.direction);
    // TW Sweep (buildTwSweepVariant, below) is a two-minute-drill-only
    // construction built specifically around Option/Outside Zone's
    // Counter shape -- it swaps player 4's path with player 6's,
    // hardcoded, because on THAT family #4 is always the one who'd
    // otherwise cut back. Blast's own Counter already IS a real,
    // authored "TE counter" (5 or 6, whichever side the play runs to,
    // not always 6) with its own diagram, so TW Sweep never applies
    // there -- reusing counterAwayFromWing as that signal instead of
    // adding a third flag just to exclude Blast here.
    const eligibleForTwSweep = eligibleForCounterFamily && !flags.counterAwayFromWing;
    if (call.counterOn && eligibleForCounterFamily) {
      out.counterOn = true;
    } else if (call.twSweepOn && eligibleForTwSweep) {
      out.twSweepOn = true;
    } else if (call.bootOn && !flags.noBoot) {
      out.bootOn = true;
    }
    return out;
  }

  // Split has none of Wing's Boot/Counter/Motion legality quirks --
  // insideOutside is the only toggle that depends on the play type
  // (Blast/Double Blast), everything else (splitSide/passOn/leftCall/
  // rightCall) is always legal in any combination.
  function normalizeSplitCall(call) {
    const flags = playFlags(call.playKey);
    return {
      formation: 'split',
      playKey: call.playKey,
      splitSide: call.splitSide === 'Left' ? 'Left' : 'Right',
      insideOutside: flags.hasInsideOutside ? (call.insideOutside === 'Inside' ? 'Inside' : 'Outside') : null,
      passOn: !!call.passOn,
      leftCall: SPLIT_ROUTE_CALLS.includes(call.leftCall) ? call.leftCall : SPLIT_ROUTE_CALLS[0],
      rightCall: SPLIT_ROUTE_CALLS.includes(call.rightCall) ? call.rightCall : SPLIT_ROUTE_CALLS[0],
    };
  }

  function shortSide(side) { return side === 'Left' ? 'L' : 'R'; }

  // Nathan originally wanted every modifier word abbreviated here (Mo/Bt/
  // Ctr/In/Out) so a 4-choice grid would read at a glance instead of
  // wrapping across 3 lines each -- but later (2026-08-24) reversed that:
  // "Don't abbreviate the answers like 'mo' for motion, it isn't
  // obvious." Modifier words are spelled out in full below now (Motion/
  // Inside/Outside/Boot/Counter/TW Sweep); only the Left/Right side
  // letters stay abbreviated (L/R is a standard, unambiguous football
  // shorthand Nathan never flagged, unlike the word fragments).
  function describeCall(call) {
    if (call.formation === 'split') {
      const parts = [`Split ${shortSide(call.splitSide)}`];
      if (call.insideOutside) parts.push(call.insideOutside);
      parts.push(playLabel(call.playKey));
      // Nathan: "many of the answers didn't include a final play call
      // direction" -- this branch used to stop right after the play name,
      // unlike play-calls.js's own title bar for the same Split combo,
      // which always repeats the direction at the end ("Split Side IS the
      // run direction... the final direction word is always appended too,
      // and it always matches splitSide", see onComboChanged). Since Split
      // comes up in about half of all drill rounds (SPLIT_FORMATION_CHANCE),
      // every one of those answer choices/recap lines was silently missing
      // its final direction while every Wing-formation one (below) already
      // had it -- matching play-calls.js's convention exactly now.
      parts.push(shortSide(call.splitSide));
      if (call.passOn) parts.push('Pass');
      // Nathan: "the routes are given at the line independent of the play
      // call... Answer options should never contain routes like Hou, Flo,
      // Bos or Sea." -- leftCall/rightCall stay on the call object (used
      // by renderSplitDiagram/playSplitAnimation for the diagram) but are
      // deliberately left out of the displayed/quizzed text below.
      return parts.join(' ');
    }
    const parts = [`Wing ${shortSide(call.wingSide)}`];
    if (call.motionOn) parts.push('Motion');
    if (call.insideOutside) parts.push(call.insideOutside);
    parts.push(playLabel(call.playKey));
    parts.push(shortSide(call.direction));
    if (call.bootOn) parts.push('Boot');
    if (call.counterOn) parts.push('Counter');
    if (call.twSweepOn) parts.push('TW Sweep');
    return parts.join(' ');
  }
  function callKey(call) {
    if (call.formation === 'split') {
      // leftCall/rightCall (routes) are intentionally excluded -- they're
      // never shown/quizzed, so two calls differing only by route are the
      // same displayed answer and must dedupe as one choice.
      return ['split', call.playKey, call.splitSide, call.insideOutside, call.passOn].join('|');
    }
    return ['wing', call.playKey, call.wingSide, call.direction, call.motionOn, call.bootOn, call.counterOn, call.twSweepOn, call.insideOutside].join('|');
  }

  function randomSide() { return Math.random() < 0.5 ? 'Left' : 'Right'; }
  function randomSplitRouteCall() { return SPLIT_ROUTE_CALLS[Math.floor(Math.random() * SPLIT_ROUTE_CALLS.length)]; }

  // Nathan: "we will run a lot of split on 2 minute drill" -- Split comes
  // up about as often as Wing, not as a rare curveball.
  const SPLIT_FORMATION_CHANCE = 0.5;
  // Nathan (2026-08-24): "We also need more passing calls to move the
  // ball such as option pass, or split formation with a pass at the
  // end." Bumped from the original 0.35 -- combined with
  // ELIGIBLE_PLAY_WEIGHTS' extra weight on Option Pass above, this is
  // the "split formation with a pass at the end" half of that ask.
  const SPLIT_PASS_CHANCE = 0.5;

  // Nathan: "Questions should be easier to start and a little harder as
  // you go." Replaces the old "full mix from play one" design (every
  // play, every modifier, right from the first snap, no ramp) with a
  // gentle ramp keyed off how many rounds have already been played this
  // drive (roundIndex -- 0 on the very first snap; callers pass
  // state.correctCount + state.wrongCount, see runRound). Two things
  // move together as the ramp advances, both driven by the same tier:
  //   1) generateCorrectCall below scales down how often a correct call
  //      stacks extra optional modifiers (Motion/Boot/Counter/Pass) --
  //      fewer moving parts is an easier call to read off the signals.
  //   2) generateChoices further down scales up how many of the 3
  //      multiple-choice decoys are "close" single-attribute neighbors
  //      of the correct call vs. clearly-different fresh calls -- close
  //      decoys are what make a question hard to guess even when the
  //      signals were read correctly.
  // A missing/invalid roundIndex (e.g. a caller that doesn't track
  // rounds, like the standalone test hooks) intentionally falls back to
  // the MAX tier -- i.e. the original always-full-difficulty behavior --
  // rather than silently defaulting to the easiest tier.
  const DIFFICULTY_RAMP_ROUNDS_PER_TIER = 4;
  const DIFFICULTY_RAMP_MAX_TIER = 3;
  function difficultyTier(roundIndex) {
    if (typeof roundIndex !== 'number' || !isFinite(roundIndex)) return DIFFICULTY_RAMP_MAX_TIER;
    return Math.min(DIFFICULTY_RAMP_MAX_TIER, Math.floor(Math.max(0, roundIndex) / DIFFICULTY_RAMP_ROUNDS_PER_TIER));
  }
  function generateCorrectCall(roundIndex) {
    const tier = difficultyTier(roundIndex);
    // tier 0 -> 1/4 of the normal modifier odds, ramping up to 4/4 (the
    // original, unscaled odds) by the max tier.
    const rampFactor = (tier + 1) / (DIFFICULTY_RAMP_MAX_TIER + 1);
    const playKey = pickWeightedPlayKey();
    const flags = playFlags(playKey);
    if (Math.random() < SPLIT_FORMATION_CHANCE) {
      return normalizeCall({
        formation: 'split',
        playKey: playKey,
        splitSide: randomSide(),
        insideOutside: flags.hasInsideOutside ? (Math.random() < 0.5 ? 'Inside' : 'Outside') : null,
        passOn: Math.random() < SPLIT_PASS_CHANCE * rampFactor,
        leftCall: randomSplitRouteCall(),
        rightCall: randomSplitRouteCall(),
      });
    }
    const raw = {
      formation: 'wing',
      playKey: playKey,
      wingSide: randomSide(),
      direction: randomSide(),
      motionOn: Math.random() < 0.45 * rampFactor,
      insideOutside: flags.hasInsideOutside ? (Math.random() < 0.5 ? 'Inside' : 'Outside') : null,
      // Offer Counter/TW Sweep/Boot each about 1/3 of the time they're
      // even legal -- normalizeCall sorts out legality and the three-way
      // exclusivity either way. All three scaled down early in the ramp
      // along with Motion/Pass above.
      counterOn: flags.hasCounter && Math.random() < 0.35 * rampFactor,
      twSweepOn: flags.hasCounter && Math.random() < 0.35 * rampFactor,
      bootOn: !flags.noBoot && Math.random() < 0.35 * rampFactor,
    };
    return normalizeCall(raw);
  }

  // One-attribute "neighbor" mutations of a legal call, each
  // re-normalized so it's still a combo the real toggles could
  // produce -- this is the "close to try and fool them" part.
  // Dispatches to the Split-specific version for Split calls.
  function neighborCalls(call) {
    if (call.formation === 'split') return neighborSplitCalls(call);
    const flags = playFlags(call.playKey);
    const candidates = [];
    candidates.push(normalizeCall(Object.assign({}, call, { wingSide: oppositeSide(call.wingSide) })));
    candidates.push(normalizeCall(Object.assign({}, call, { direction: oppositeSide(call.direction) })));
    candidates.push(normalizeCall(Object.assign({}, call, { motionOn: !call.motionOn })));
    if (flags.hasInsideOutside) {
      candidates.push(normalizeCall(Object.assign({}, call, { insideOutside: call.insideOutside === 'Inside' ? 'Outside' : 'Inside' })));
    }
    if (!flags.noBoot) {
      candidates.push(normalizeCall(Object.assign({}, call, { bootOn: !call.bootOn, counterOn: false, twSweepOn: false })));
    }
    if (flags.hasCounter) {
      candidates.push(normalizeCall(Object.assign({}, call, { counterOn: !call.counterOn, bootOn: false, twSweepOn: false })));
      candidates.push(normalizeCall(Object.assign({}, call, { twSweepOn: !call.twSweepOn, counterOn: false, bootOn: false })));
    }
    (SIBLING_PLAY_KEYS[call.playKey] || []).forEach(siblingKey => {
      const siblingFlags = playFlags(siblingKey);
      candidates.push(normalizeCall({
        formation: 'wing',
        playKey: siblingKey, wingSide: call.wingSide, direction: call.direction, motionOn: call.motionOn,
        insideOutside: siblingFlags.hasInsideOutside ? (call.insideOutside || (Math.random() < 0.5 ? 'Inside' : 'Outside')) : null,
        bootOn: call.bootOn, counterOn: call.counterOn, twSweepOn: call.twSweepOn,
      }));
    });
    return candidates;
  }

  // Split's own "close to fool them" decoys: flip the split side, flip
  // Pass, flip In/Out (Blast/Double Blast only), plus the same
  // sibling-play-key swaps Wing uses. Routes (leftCall/rightCall) are
  // NOT varied here anymore -- they're called at the line independent of
  // the play call and never appear in the displayed/quizzed text, so a
  // route-only variant would be indistinguishable from the correct answer
  // (see describeCall/callKey).
  function neighborSplitCalls(call) {
    const flags = playFlags(call.playKey);
    const candidates = [];
    candidates.push(normalizeCall(Object.assign({}, call, { splitSide: oppositeSide(call.splitSide) })));
    candidates.push(normalizeCall(Object.assign({}, call, { passOn: !call.passOn })));
    if (flags.hasInsideOutside) {
      candidates.push(normalizeCall(Object.assign({}, call, { insideOutside: call.insideOutside === 'Inside' ? 'Outside' : 'Inside' })));
    }
    (SIBLING_PLAY_KEYS[call.playKey] || []).forEach(siblingKey => {
      const siblingFlags = playFlags(siblingKey);
      candidates.push(normalizeCall({
        formation: 'split',
        playKey: siblingKey, splitSide: call.splitSide,
        insideOutside: siblingFlags.hasInsideOutside ? (call.insideOutside || (Math.random() < 0.5 ? 'Inside' : 'Outside')) : null,
        passOn: call.passOn, leftCall: call.leftCall, rightCall: call.rightCall,
      }));
    });
    return candidates;
  }

  // Correct call + 3 legal, distinct decoys, shuffled. How many of those
  // 3 are "close" single-attribute neighbors (the confusable kind) vs.
  // clearly-different fresh calls (the easy-to-rule-out kind) ramps up
  // with roundIndex -- see difficultyTier/generateCorrectCall above for
  // the shared ramp this is keyed off of.
  function generateChoices(correctCall, roundIndex) {
    const closeDecoyTarget = difficultyTier(roundIndex); // 0..DIFFICULTY_RAMP_MAX_TIER, i.e. 0..3
    const seen = new Set([callKey(correctCall)]);
    const pool = [];
    neighborCalls(correctCall).forEach(c => {
      const k = callKey(c);
      if (!seen.has(k)) { seen.add(k); pool.push(c); }
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const decoys = pool.slice(0, closeDecoyTarget);
    // Fallback: tops up any decoys the close-neighbor pool didn't supply,
    // whether that's because this play's flags don't yield enough
    // distinct single-attribute neighbors (rare -- e.g. Option has few
    // togglable extras) or because the difficulty ramp above
    // deliberately capped closeDecoyTarget below 3 -- either way we
    // never show fewer than 4 options, and early-ramp rounds end up
    // filled mostly (or entirely) with these clearly-different fresh
    // calls instead of close neighbors, which is the "easier to start"
    // half of the ramp.
    // Keep the fallback's fresh random calls in the SAME formation as the
    // correct answer -- a round only ever shows one formation's signal
    // touch card, so a Split correct answer can never legitimately be
    // fooled by a Wing-formation decoy or vice versa.
    let guard = 0;
    while (decoys.length < 3 && guard < 40) {
      guard++;
      let fresh = generateCorrectCall(roundIndex);
      if (fresh.formation !== correctCall.formation) continue;
      const k = callKey(fresh);
      if (!seen.has(k)) { seen.add(k); decoys.push(fresh); }
    }
    const choices = [correctCall].concat(decoys);
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
  }

  // ================================================================
  // SECTION 4: DATA loading (no login required to OPEN this page -- see
  // file header -- but Nathan: "wire it in now" -- once open, it still
  // pulls the coach's real saved play edits from the same Firebase project
  // the main app uses, same as Play Calls does, so the drill shows the
  // actual routes a coach has drawn instead of always the generic shipped
  // defaults.)
  // ================================================================
  const FIREBASE_DB_URL = 'https://aslbengals-default-rtdb.firebaseio.com';

  // Nathan: "the Start Drive button is not selectable" -> traced to
  // data/plays.json returning a 404 (HTML "not found" page, not JSON) on
  // the live site. Turns out that file is INTENTIONALLY excluded from the
  // deployed site (see .gitignore: "Play/card data now lives in the
  // database... these local copies stay for tools/playbook-pdf's offline
  // use, but no longer need to be (and shouldn't be) published to the live
  // site") -- and the Firebase alternative (dev2PlayData/plays.json) needs
  // real auth this standalone, no-login page has no way to provide (401
  // confirmed directly). Nathan's call (asked directly): bake the shipped
  // play data into this JS file itself instead, same as any other code on
  // this page -- no separate fetch, no file that can go missing or 404,
  // and it ships/updates the same way as the rest of two-minute-drill.js.
  // Trade-off he accepted: like any client-side JS, someone who reaches
  // this PIN-gated page and opens dev tools could read the routes out of
  // here -- same exposure level as everything else past this page's PIN.
  // Machine-generated (compact JSON, not meant to be hand-edited) --
  // regenerate by re-running the embed step against a fresh data/plays.json
  // if the shipped play data changes.
  const SHIPPED_PLAY_DATA = {"formation":{"5":[462,204],"6":[1149,204],"LT":[577,204],"LG":[692,204],"C":[806,204],"RG":[921,204],"RT":[1035,204]},"backfield":{"1":[809,438],"2":[985,438],"3":[638,438]},"wing":{"Left":[360,269],"Right":[1251,269]},"split":{"Right":{"1":[809,438],"2":[1362,289],"3":[638,438],"4":[185,269],"5":[463,204],"6":[1512,204]},"Left":{"1":[809,438],"2":[985,438],"3":[248,269],"4":[1415,289],"5":[98,204],"6":[1147,204]}},"splitRoutes":{"Right":{"wide":{"player":6,"seattle":[[1512,204],[1515,60],[1252,-61]],"houston":[[1512,204],[1518,-206]],"florida":[[1512,204],[1352,338],[1195,236]],"boston":[[1512,204],[1314,94],[1496,85]]},"flex":{"player":2,"seattle":[[1362,289],[1523,108],[1580,139]],"houston":[[1362,289],[1362,119],[1318,103]],"florida":[[1362,289],[1370,-118]],"boston":[[1362,289],[1128,137]]}},"Left":{"wide":{"player":5,"seattle":[[98,204],[94,45],[352,-60]],"houston":[[98,204],[94,-204]],"florida":[[98,204],[418,237],[259,-145]],"boston":[[98,204],[296,94],[114,85]]},"flex":{"player":3,"seattle":[[248,269],[88,122],[20,122]],"houston":[[248,269],[248,95],[304,75]],"florida":[[248,269],[243,-138]],"boston":[[248,269],[482,117]]}}},"viewBox":[1600,1030],"topPad":400,"playTypes":[{"key":"inside_zone","label":"Inside Zone","hasReadToggle":true,"directions":{"Left":{"A":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DT_L","paths":[{"player":2,"ball":true,"width":9,"points":[[945,415],[856.8,320],[749,245]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1011,400],[1161,280]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"B":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[749,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DT_L","paths":[{"player":2,"ball":true,"width":9,"points":[[945,415],[805.275,320],[634.5,255]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1011,400],[1161,280]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[445,143]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[485,143]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[672,143]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[939,143]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1171,143]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[749,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}},"Right":{"A":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DT_R","paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[600,400],[450,280]]},{"player":3,"ball":true,"width":9,"points":[[666,415],[754.2,320],[862,245]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"B":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[864,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DT_R","paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[600,400],[450,280]]},{"player":3,"ball":true,"width":9,"points":[[666,415],[805.725,320],[976.5,255]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[445,143]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[485,143]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[672,143]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[939,143]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1171,143]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[864,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}}},{"key":"outside_zone","label":"Outside Zone","hasCounter":true,"hasReadToggle":false,"directions":{"Left":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DE_L","paths":[{"player":2,"ball":true,"width":9,"points":[[945,415],[830,320],[487,290]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1000,400],[1145,275]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DE_L","paths":[{"player":2,"ball":true,"width":9,"points":[[945,415],[830,320],[487,290]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1000,400],[1145,275]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"points":[[360,269],[520,340],[700,309],[900,220]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}},"Right":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DE_R","paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[611,400],[466,275]]},{"player":3,"ball":true,"width":9,"points":[[666,415],[781,320],[1124,290]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":"DE_R","paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[611,400],[466,275]]},{"player":3,"ball":true,"width":9,"points":[[666,415],[781,320],[1124,290]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"points":[[1251,269],[1091,340],[911,309],[711,220]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}}},{"key":"option","label":"Option","hasCounter":true,"noBoot":true,"directionFixed":true,"hasReadToggle":false,"directions":{"Left":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":true,"width":9,"points":[[802,438],[611,400],[466,275]]},{"player":3,"ball":false,"width":9,"points":[[666,415],[781,320],[862,245]]},{"player":null,"ball":false,"width":4,"optionLine":true,"points":[[557.14,342.17],[529.4799999999999,447.92]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]],"dualSideBlock":true,"sameSidePoints":[[462,204],[586.2,2.4]],"crossPoints":[[462,204],[181.2,101.4]],"sameSidePoints4x4":[[462,204],[496.2,2.4]],"crossPoints4x4":[[462,204],[181.2,101.4]],"crossNote":"Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":true,"width":9,"points":[[802,438],[611,400],[466,275]]},{"player":3,"ball":false,"width":9,"points":[[666,415],[781,320],[862,245]]},{"player":null,"ball":false,"width":4,"optionLine":true,"points":[[557.14,342.17],[529.4799999999999,447.92]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]],"dualSideBlock":true,"sameSidePoints":[[462,204],[586.2,2.4]],"crossPoints":[[462,204],[181.2,101.4]],"sameSidePoints4x4":[[462,204],[496.2,2.4]],"crossPoints4x4":[[462,204],[181.2,101.4]],"crossNote":"Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"points":[[360,269],[480,360],[520,322],[650,230]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}},"Right":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[945,415],[830,320],[749,245]]},{"player":1,"ball":true,"width":9,"points":[[809,438],[1000,400],[1145,275]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":null,"ball":false,"width":4,"optionLine":true,"points":[[1053.8600000000001,342.17],[1081.5200000000002,447.92]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]],"dualSideBlock":true,"sameSidePoints":[[1149,204],[1023.9,2.4]],"crossPoints":[[1149,204],[1428.9,101.4]],"sameSidePoints4x4":[[1149,204],[1104.9,2.4]],"crossPoints4x4":[[1149,204],[1428.9,101.4]],"crossNote":"Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[945,415],[830,320],[749,245]]},{"player":1,"ball":true,"width":9,"points":[[809,438],[1000,400],[1145,275]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":null,"ball":false,"width":4,"optionLine":true,"points":[[1053.8600000000001,342.17],[1081.5200000000002,447.92]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]],"dualSideBlock":true,"sameSidePoints":[[1149,204],[1023.9,2.4]],"crossPoints":[[1149,204],[1428.9,101.4]],"sameSidePoints4x4":[[1149,204],[1104.9,2.4]],"crossPoints4x4":[[1149,204],[1428.9,101.4]],"crossNote":"Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"},{"player":4,"ball":false,"width":7,"points":[[1251,269],[1131,360],[1091,322],[961,230]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}}},{"key":"blast","label":"Blast","hasReadToggle":false,"directions":{"Left":{"Outside":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":3,"ball":false,"width":9,"points":[[638,438],[638,200],[619,70],[600,-20]],"lineThenCurve":true},{"player":2,"ball":true,"width":9,"points":[[985,438],[793,355],[634.5,155]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1010,400],[1160,280]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":3,"ball":false,"width":9,"points":[[638,438],[638,200],[619,70],[600,-20]],"lineThenCurve":true},{"player":2,"ball":false,"width":9,"points":[[985,438],[793,355],[634.5,155]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1010,400],[1160,280]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]},{"player":5,"ball":true,"width":9,"points":[[462,204],[724,438],[634.5,155]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}},"Inside":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":3,"ball":false,"width":9,"points":[[638,438],[638,200],[619,70],[600,-20]],"lineThenCurve":true},{"player":2,"ball":true,"width":9,"points":[[985,438],[793,355],[703.1,155]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1010,400],[1160,280]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":3,"ball":false,"width":9,"points":[[638,438],[638,200],[619,70],[600,-20]],"lineThenCurve":true},{"player":2,"ball":false,"width":9,"points":[[985,438],[793,355],[703.1,155]]},{"player":1,"ball":false,"width":9,"points":[[809,438],[1010,400],[1160,280]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]},{"player":5,"ball":true,"width":9,"points":[[462,204],[724,438],[703.1,155]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}},"Right":{"Outside":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1011,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[973,200],[992,70],[1011,-20]],"lineThenCurve":true},{"player":3,"ball":true,"width":9,"points":[[626,438],[818,355],[976.5,155]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[601,400],[451,280]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1011,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[973,200],[992,70],[1011,-20]],"lineThenCurve":true},{"player":3,"ball":false,"width":9,"points":[[626,438],[818,355],[976.5,155]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[601,400],[451,280]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]},{"player":6,"ball":true,"width":9,"points":[[1149,204],[888,438],[976.5,155]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}},"Inside":{"Normal":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1011,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[973,200],[992,70],[1011,-20]],"lineThenCurve":true},{"player":3,"ball":true,"width":9,"points":[[626,438],[818,355],[908.3,155]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[601,400],[451,280]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Counter":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1011,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[973,200],[992,70],[1011,-20]],"lineThenCurve":true},{"player":3,"ball":false,"width":9,"points":[[626,438],[818,355],[908.3,155]]},{"player":1,"ball":false,"width":9,"points":[[802,438],[601,400],[451,280]]},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]},{"player":6,"ball":true,"width":9,"points":[[1149,204],[888,438],[908.3,155]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}}},"hasInsideOutside":true,"hasCounter":true,"counterAwayFromWing":true},{"key":"double_blast","label":"Double Blast","noBoot":true,"hasReadToggle":false,"directions":{"Left":{"Outside":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":3,"ball":false,"width":9,"points":[[638,438],[638,200],[619,70],[600,-20]],"lineThenCurve":true},{"player":2,"ball":false,"width":9,"points":[[985,438],[793,355],[634.5,155]]},{"player":1,"ball":true,"width":9,"points":[[809,438],[718,350],[634.5,180]],"delayMs":500},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Inside":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":3,"ball":false,"width":9,"points":[[638,438],[638,200],[619,70],[600,-20]],"lineThenCurve":true},{"player":2,"ball":false,"width":9,"points":[[985,438],[793,355],[634.5,155]]},{"player":1,"ball":true,"width":9,"points":[[809,438],[718,350],[703.1,180]],"delayMs":500},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[156,-188]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}},"Right":{"Outside":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1011,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[973,200],[992,70],[1011,-20]],"lineThenCurve":true},{"player":3,"ball":false,"width":9,"points":[[626,438],[818,355],[976.5,155]]},{"player":1,"ball":true,"width":9,"points":[[802,438],[893,350],[976.5,180]],"delayMs":500},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Inside":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1011,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[973,200],[992,70],[1011,-20]],"lineThenCurve":true},{"player":3,"ball":false,"width":9,"points":[[626,438],[818,355],[976.5,155]]},{"player":1,"ball":true,"width":9,"points":[[802,438],[893,350],[908.3,180]],"delayMs":500},{"player":5,"ball":false,"width":7,"points":[[462,204],[438.6,119.39999999999999]],"isBlocking":true,"points4x4":[[462,204],[438.6,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[577,204],[450.1,119.39999999999999]],"id":"LT","isBlocking":true,"points4x4":[[577,204],[507.7,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[692,204],[665,119.39999999999999]],"id":"LG","isBlocking":true,"points4x4":[[692,204],[665,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[806,204],[806,144]],"id":"C","isBlocking":true,"points4x4":[[806,204],[890.6,2.4000000000000057]]},{"player":null,"ball":false,"width":7,"points":[[921,204],[946.2,119.39999999999999]],"id":"RG","isBlocking":true,"points4x4":[[921,204],[946.2,119.39999999999999]]},{"player":null,"ball":false,"width":7,"points":[[1035,204],[1131,143]],"id":"RT","isBlocking":true,"points4x4":[[1035,204],[1093.5,2.4000000000000057]]},{"player":6,"ball":false,"width":7,"points":[[1149,204],[1179.6,119.39999999999999]],"isBlocking":true,"points4x4":[[1149,204],[1179.6,119.39999999999999]]},{"player":4,"ball":false,"width":7,"blockRelative":true,"isBlocking":true,"sameSidePoints":[[0,0],[156,-188]],"crossPoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]],"crossPoints4x4":[[0,0],[135.8499999999999,-116.35000000000002]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}},"hasInsideOutside":true},{"key":"option_pass","label":"Option Pass","noBoot":true,"hasReadToggle":false,"directions":{"Left":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[973,438],[851,545],[341,400]]},{"player":1,"ball":true,"width":9,"points":[[802,438],[611,400],[466,275]]},{"player":3,"ball":false,"width":9,"points":[[666,415],[781,320],[862,245]]},{"player":null,"ball":false,"width":4,"optionLine":true,"points":[[557.14,342.17],[529.4799999999999,447.92]]},{"player":5,"ball":false,"width":9,"points":[[462,204],[511,90],[531,30],[211,-70],[91,-90]]},{"player":4,"ball":false,"width":9,"points":[[0,0]],"wingSeamRelative":true,"sameSideOffsets":[[0,0],[-15,-189],[140,-409],[70,-519],[-30,-599]],"crossOffsets":[[0,0],[-15,-209],[40,-499],[390,-569],[740,-599]]},{"player":6,"ball":false,"width":9,"points":[[1149,204],[1081,90],[1051,42],[806,35],[633,42]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]},"Right":{"defense":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[600,-20],"label":"LB","id":"OLB_L","extra":true},{"pos":[805,-20],"label":"LB","id":"MLB","extra":true},{"pos":[1010,-20],"label":"LB","id":"OLB_R","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[650,-190],"label":"S","id":"FS","extra":true},{"pos":[960,-190],"label":"S","id":"SS","extra":true}],"readKeyId":null,"paths":[{"player":2,"ball":false,"width":9,"points":[[945,415],[830,320],[749,245]]},{"player":1,"ball":true,"width":9,"points":[[809,438],[1000,400],[1145,275]]},{"player":3,"ball":false,"width":9,"points":[[638,438],[760,545],[1270,400]]},{"player":null,"ball":false,"width":4,"optionLine":true,"points":[[1053.8600000000001,342.17],[1081.5200000000002,447.92]]},{"player":5,"ball":false,"width":9,"points":[[462,204],[530,90],[560,42],[805,35],[978,42]]},{"player":4,"ball":false,"width":9,"points":[[0,0]],"wingSeamRelative":true,"sameSideOffsets":[[0,0],[-15,-189],[140,-409],[70,-519],[-30,-599]],"crossOffsets":[[0,0],[-15,-209],[40,-499],[390,-569],[740,-599]]},{"player":6,"ball":false,"width":9,"points":[[1149,204],[1100,90],[1080,30],[1400,-70],[1520,-90]]}],"defense4x4":[{"pos":[436,110],"label":"DE","id":"DE_L"},{"pos":[662,110],"label":"DT","id":"DT_L"},{"pos":[949,110],"label":"DT","id":"DT_R"},{"pos":[1183,110],"label":"DE","id":"DE_R"},{"pos":[500,-20],"label":"LB","id":"LB1","extra":true},{"pos":[700,-20],"label":"LB","id":"LB2","extra":true},{"pos":[900,-20],"label":"LB","id":"LB3","extra":true},{"pos":[1100,-20],"label":"LB","id":"LB4","extra":true},{"pos":[150,90],"label":"CB","id":"CB_L","extra":true},{"pos":[1460,90],"label":"CB","id":"CB_R","extra":true},{"pos":[805,-190],"label":"S","id":"FS","extra":true}]}}},{"key":"sweep","label":"Sweep","hasReadToggle":false,"directions":{"Left":{"defense":[{"id":"DE_L","label":"DE","pos":[436,110]},{"id":"DT_L","label":"DT","pos":[662,110]},{"id":"DT_R","label":"DT","pos":[949,110]},{"id":"DE_R","label":"DE","pos":[1183,110]},{"extra":true,"id":"OLB_L","label":"LB","pos":[600,-20]},{"extra":true,"id":"MLB","label":"LB","pos":[805,-20]},{"extra":true,"id":"OLB_R","label":"LB","pos":[1010,-20]},{"extra":true,"id":"CB_L","label":"CB","pos":[150,90]},{"extra":true,"id":"CB_R","label":"CB","pos":[1460,90]},{"extra":true,"id":"FS","label":"S","pos":[650,-190]},{"extra":true,"id":"SS","label":"S","pos":[960,-190]}],"readKeyId":null,"paths":[{"ball":false,"lineThenCurve":true,"player":3,"points":[[638,438],[307.57000732421875,349.84368896484375],[182.96408081054688,288.3293762207031],[176.65492248535156,228.39236450195312]],"width":9},{"ball":true,"player":2,"points":[[985,438],[520.504150390625,411.3580017089844],[427.4440612792969,332.4934997558594]],"width":9},{"ball":false,"delayMs":500,"player":1,"points":[[809,438],[1083.5394287109375,460.3507995605469],[1295.05859375,427.9092102050781]],"width":9},{"ball":false,"isBlocking":true,"player":5,"points":[[462,204],[438.6,119.39999999999999]],"points4x4":[[462,204],[438.6,119.39999999999999]],"width":7},{"ball":false,"id":"LT","isBlocking":true,"points":[[577,204],[450.1,119.39999999999999]],"points4x4":[[577,204],[507.7,2.4000000000000057]],"width":7},{"ball":false,"id":"LG","isBlocking":true,"points":[[692,204],[665,119.39999999999999]],"points4x4":[[692,204],[665,119.39999999999999]],"width":7},{"ball":false,"id":"C","isBlocking":true,"points":[[806,204],[806,144]],"points4x4":[[806,204],[710.6,2.4000000000000057]],"width":7},{"ball":false,"id":"RG","isBlocking":true,"points":[[921,204],[1383.2818603515625,351.4209899902344]],"points4x4":[[921,204],[902.1,2.4000000000000057]],"width":7},{"ball":false,"id":"RT","isBlocking":true,"points":[[1035,204],[1168.2,119.39999999999999]],"points4x4":[[1035,204],[957.6,119.39999999999999]],"width":7},{"ball":false,"isBlocking":true,"player":6,"points":[[1149,204],[1179.6,119.39999999999999]],"points4x4":[[1149,204],[1104.9,2.4000000000000057]],"width":7},{"ball":false,"blockRelative":true,"crossPoints":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[401.4000000000001,-413.1]],"isBlocking":true,"player":4,"sameSidePoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[68.39999999999998,-143.1]],"width":7}],"defense4x4":[{"id":"DE_L","label":"DE","pos":[436,110]},{"id":"DT_L","label":"DT","pos":[662,110]},{"id":"DT_R","label":"DT","pos":[949,110]},{"id":"DE_R","label":"DE","pos":[1183,110]},{"extra":true,"id":"LB1","label":"LB","pos":[500,-20]},{"extra":true,"id":"LB2","label":"LB","pos":[700,-20]},{"extra":true,"id":"LB3","label":"LB","pos":[900,-20]},{"extra":true,"id":"LB4","label":"LB","pos":[1100,-20]},{"extra":true,"id":"CB_L","label":"CB","pos":[150,90]},{"extra":true,"id":"CB_R","label":"CB","pos":[1460,90]},{"extra":true,"id":"FS","label":"S","pos":[805,-190]}]},"Right":{"defense":[{"id":"DE_L","label":"DE","pos":[436,110]},{"id":"DT_L","label":"DT","pos":[662,110]},{"id":"DT_R","label":"DT","pos":[949,110]},{"id":"DE_R","label":"DE","pos":[1183,110]},{"extra":true,"id":"OLB_L","label":"LB","pos":[600,-20]},{"extra":true,"id":"MLB","label":"LB","pos":[805,-20]},{"extra":true,"id":"OLB_R","label":"LB","pos":[1011,-20]},{"extra":true,"id":"CB_L","label":"CB","pos":[150,90]},{"extra":true,"id":"CB_R","label":"CB","pos":[1460,90]},{"extra":true,"id":"FS","label":"S","pos":[805,-190]}],"readKeyId":null,"paths":[{"ball":false,"lineThenCurve":true,"player":2,"points":[[973,438],[1179.8114013671875,376.6576232910156],[1358.045166015625,316.7206115722656],[1462.1463623046875,157.414306640625]],"width":9},{"ball":true,"player":3,"points":[[626,438],[859.043701171875,404.55126953125],[1040.716552734375,377.30035400390625],[1141.934326171875,364.3236999511719],[1305.99462890625,280.44293212890625]],"width":9},{"ball":false,"delayMs":500,"player":1,"points":[[802,438],[576.3677978515625,470.321044921875],[382.70697021484375,425.36407470703125]],"width":9},{"ball":false,"isBlocking":true,"player":5,"points":[[462,204],[438.6,119.39999999999999]],"points4x4":[[462,204],[496.2,2.4000000000000057]],"width":7},{"ball":false,"id":"LT","isBlocking":true,"points":[[577,204],[450.1,119.39999999999999]],"points4x4":[[577,204],[653.5,119.39999999999999]],"width":7},{"ball":false,"id":"LG","isBlocking":true,"points":[[692,204],[665,119.39999999999999]],"points4x4":[[692,204],[699.2,2.4000000000000057]],"width":7},{"ball":false,"id":"C","isBlocking":true,"points":[[806,204],[806,144]],"points4x4":[[806,204],[890.6,2.4000000000000057]],"width":7},{"ball":false,"id":"RG","isBlocking":true,"points":[[921,204],[946.2,119.39999999999999]],"points4x4":[[921,204],[946.2,119.39999999999999]],"width":7},{"ball":false,"id":"RT","isBlocking":true,"points":[[1035,204],[1168.2,119.39999999999999]],"points4x4":[[1035,204],[1093.5,2.4000000000000057]],"width":7},{"ball":false,"isBlocking":true,"player":6,"points":[[1149,204],[1179.6,119.39999999999999]],"points4x4":[[1149,204],[1179.6,119.39999999999999]],"width":7},{"ball":false,"blockRelative":true,"crossPoints":[[0,0],[156,-188]],"crossPoints4x4":[[0,0],[400.5,-413.1]],"isBlocking":true,"player":4,"sameSidePoints":[[0,0],[156,-188]],"sameSidePoints4x4":[[0,0],[61.200000000000045,-143.1]],"width":7}],"defense4x4":[{"id":"DE_L","label":"DE","pos":[436,110]},{"id":"DT_L","label":"DT","pos":[662,110]},{"id":"DT_R","label":"DT","pos":[949,110]},{"id":"DE_R","label":"DE","pos":[1183,110]},{"extra":true,"id":"LB1","label":"LB","pos":[500,-20]},{"extra":true,"id":"LB2","label":"LB","pos":[700,-20]},{"extra":true,"id":"LB3","label":"LB","pos":[900,-20]},{"extra":true,"id":"LB4","label":"LB","pos":[1100,-20]},{"extra":true,"id":"CB_L","label":"CB","pos":[150,90]},{"extra":true,"id":"CB_R","label":"CB","pos":[1460,90]},{"extra":true,"id":"FS","label":"S","pos":[805,-190]}]}},"hasInsideOutside":false}]};

  // Mirrors play-calls.js's normalizePlayData() repair pipeline (see that
  // file for the full rationale on each piece) -- copied near-verbatim
  // rather than depending on play-calls.js having loaded first, since this
  // page is fully standalone. Unlike play-calls.js, where window.DATA is
  // already populated by index.html before play-calls.js even runs, this
  // standalone page has no guarantee anything has populated DATA until the
  // data/plays.json fetch below resolves -- so these snapshot tables are
  // filled in at the top of loadData(), right after that fetch, instead of
  // at module-load time.
  let SHIPPED_PLAY_FLAGS = {};
  let SHIPPED_PLAY_TYPES_BY_KEY = {};
  let SHIPPED_DUAL_SIDE_BLOCKS = {};

  // A direction node can be nested one OR two levels deep before you reach
  // an actual {defense,paths,...} variant -- just hasCounter (direction ->
  // {Normal,Counter}), just hasInsideOutside (direction -> {Outside,
  // Inside}), both at once (Blast, since its own Counter shipped 2026-08-24:
  // direction -> {Outside,Inside} -> {Normal,Counter}), or neither. Mirrors
  // play-calls.js's own collectLeafVariants -- copied rather than shared
  // since this file stays standalone (see the note above).
  function collectLeafVariants(node) {
    if (!node) return [];
    if (node.paths) return [node];
    return Object.values(node).flatMap(collectLeafVariants);
  }

  function repairStaleDirectionOrientation(pt) {
    if (!pt.directions || !pt.directions.Left || !pt.directions.Right) return;
    const isDirectionPath = (p) => p.player === 1 || p.player === 2 || p.player === 3 || p.optionLine;
    function swapVariant(leftVariant, rightVariant) {
      const leftMatches = (leftVariant.paths || []).filter(isDirectionPath);
      const rightMatches = (rightVariant.paths || []).filter(isDirectionPath);
      leftMatches.forEach(lp => {
        const key = lp.player != null ? lp.player : 'optionLine';
        const rp = rightMatches.find(r => (r.player != null ? r.player : 'optionLine') === key);
        if (!rp) return;
        const tmp = lp.points;
        lp.points = rp.points;
        rp.points = tmp;
      });
    }
    if (pt.directions.Left.paths) {
      swapVariant(pt.directions.Left, pt.directions.Right);
    } else {
      Object.keys(pt.directions.Left).forEach(subKey => {
        const lv = pt.directions.Left[subKey];
        const rv = pt.directions.Right[subKey];
        if (lv && rv) swapVariant(lv, rv);
      });
    }
  }

  function normalizePlayData(playTypes) {
    playTypes = playTypes || [];
    const presentKeys = new Set(playTypes.map(pt => pt.key));
    Object.keys(SHIPPED_PLAY_TYPES_BY_KEY).forEach(key => {
      if (!presentKeys.has(key)) {
        playTypes.push(JSON.parse(JSON.stringify(SHIPPED_PLAY_TYPES_BY_KEY[key])));
      }
    });
    playTypes.forEach(pt => {
      if (PLAY_TYPE_SIGNAL_ID[pt.key] !== undefined) pt.signalCardId = PLAY_TYPE_SIGNAL_ID[pt.key];
      const shippedFlags = SHIPPED_PLAY_FLAGS[pt.key];
      if (shippedFlags && shippedFlags.directionFixed && !pt.directionFixed) {
        repairStaleDirectionOrientation(pt);
      }
      if (shippedFlags) Object.assign(pt, shippedFlags);
      if (pt.hasCounter && pt.directions) {
        ['Left', 'Right'].forEach(dirKey => {
          const dv = pt.directions[dirKey];
          if (dv && dv.paths) {
            pt.directions[dirKey] = { Normal: dv, Counter: JSON.parse(JSON.stringify(dv)) };
          } else if (dv && pt.hasInsideOutside) {
            // Blast (2026-08-24 Counter) is the first play to combine
            // hasInsideOutside with hasCounter -- see play-calls.js's
            // matching graft for the full rationale.
            ['Outside', 'Inside'].forEach(ioKey => {
              const iov = dv[ioKey];
              if (iov && iov.paths) {
                dv[ioKey] = { Normal: iov, Counter: JSON.parse(JSON.stringify(iov)) };
              }
            });
          }
        });
      }
      if (pt.key === 'option' || pt.key === 'outside_zone') {
        const REPAIRED_COUNTER_P4_POINTS = {
          'option|Left': [[360, 269], [480, 360], [520, 322], [650, 230]],
          'option|Right': [[1251, 269], [1131, 360], [1091, 322], [961, 230]],
          'outside_zone|Left': [[360, 269], [520, 340], [700, 309], [900, 220]],
          'outside_zone|Right': [[1251, 269], [1091, 340], [911, 309], [711, 220]],
        };
        ['Left', 'Right'].forEach(dirKey => {
          const counterVariant = pt.directions && pt.directions[dirKey] && pt.directions[dirKey].Counter;
          if (!counterVariant || !counterVariant.paths) return;
          const idx = counterVariant.paths.findIndex(p => p.player === 4 && p.isBlocking);
          if (idx === -1) return;
          const points = REPAIRED_COUNTER_P4_POINTS[`${pt.key}|${dirKey}`];
          if (points) counterVariant.paths[idx] = { player: 4, ball: false, width: 7, points: JSON.parse(JSON.stringify(points)) };
        });
      }
      // Same "stale auto-grafted clone" repair as #4 above, one level
      // deeper for Blast -- see play-calls.js's matching block for the
      // full rationale (Nathan: "I can't edit the TE path").
      if (pt.key === 'blast') {
        const REPAIRED_COUNTER_TE_POINTS = {
          'Left|Outside': { player: 5, points: [[462, 204], [724, 438], [634.5, 155]] },
          'Left|Inside': { player: 5, points: [[462, 204], [724, 438], [703.1, 155]] },
          'Right|Outside': { player: 6, points: [[1149, 204], [888, 438], [976.5, 155]] },
          'Right|Inside': { player: 6, points: [[1149, 204], [888, 438], [908.3, 155]] },
        };
        ['Left', 'Right'].forEach(dirKey => {
          const dv = pt.directions && pt.directions[dirKey];
          if (!dv) return;
          ['Outside', 'Inside'].forEach(ioKey => {
            const counterVariant = dv[ioKey] && dv[ioKey].Counter;
            if (!counterVariant || !counterVariant.paths) return;
            const repair = REPAIRED_COUNTER_TE_POINTS[`${dirKey}|${ioKey}`];
            if (!repair) return;
            const idx = counterVariant.paths.findIndex(p => p.player === repair.player && p.isBlocking);
            if (idx === -1) return;
            counterVariant.paths[idx] = { player: repair.player, ball: true, width: 9, points: JSON.parse(JSON.stringify(repair.points)) };
          });
        });
      }
      Object.entries(pt.directions || {}).forEach(([dirKey, dirVal]) => {
        const variants = collectLeafVariants(dirVal);
        variants.forEach(variant => {
          if (!variant) return;
          if (variant.readKeyId === undefined) variant.readKeyId = null;
          (variant.paths || []).forEach(p => {
            if (p.player === undefined) p.player = null;
            if (!p.dualSideBlock) {
              const shipped = SHIPPED_DUAL_SIDE_BLOCKS[`${pt.key}|${dirKey}|${p.player}`];
              if (shipped) Object.assign(p, shipped);
            }
          });
        });
      });
    });
    return playTypes.filter(pt => pt.key !== 'boot');
  }

  // Nathan: "the Start Drive button is not selectable" (after adding the
  // playEdits.json/cards.json cloud fetches above) -- a try/catch only
  // protects against a fetch that cleanly REJECTS (bad network, CORS
  // failure, connection refused), but does nothing for one that just hangs
  // and never settles at all, which real sideline wifi/cell connections can
  // do. Since loadData() awaits each fetch in sequence, a single hung
  // request anywhere in it means the whole function -- and the "Start
  // Drive" button, gated on it in init() below -- never resolves, forever,
  // with no error shown. Every fetch in loadData() now races against this
  // timeout so the button always ends up in a real state (enabled with
  // whatever data DID load in time) within a few seconds, never stuck.
  const FETCH_TIMEOUT_MS = 6000;
  function fetchWithTimeout(url, opts) {
    return Promise.race([
      fetch(url, opts),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out fetching ' + url)), FETCH_TIMEOUT_MS)),
    ]);
  }

  // window.firebaseAuthed (js/cloud-auth.js, loaded by two-minute-drill-
  // test.html specifically so the real signal photos can load -- see
  // "it cant say the name, that gives it away" below) itself makes a
  // network call (sign-in/refresh) before it can return an authed URL --
  // same unbounded-hang risk fetchWithTimeout exists to prevent, just one
  // layer earlier. Races it the same way, and falls back to the plain
  // (unauthenticated) URL on any failure/timeout rather than aborting the
  // whole load -- an unauthenticated request to a gated path just comes
  // back 401, which the caller's own try/catch already handles.
  async function resolveAuthedUrl(url) {
    if (typeof window.firebaseAuthed !== 'function') return url;
    try {
      return await Promise.race([
        window.firebaseAuthed(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timed out getting auth token')), FETCH_TIMEOUT_MS)),
      ]);
    } catch (e) {
      return url;
    }
  }

  async function loadData() {
    // No fetch, no network, nothing that can 404 or hang -- SHIPPED_PLAY_DATA
    // is baked directly into this file (see the comment where it's defined,
    // above). Deep-cloned so nothing downstream (normalizePlayData's
    // repairs, etc.) ever mutates the shipped constant itself.
    DATA = JSON.parse(JSON.stringify(SHIPPED_PLAY_DATA));

    // Snapshot shipped flags/full play objects/dualSideBlock capability from
    // the shipped data we JUST loaded, before any cloud playEdits.json data
    // (fetched next) has a chance to replace DATA.playTypes -- same
    // ordering play-calls.js relies on, see normalizePlayData above.
    (DATA.playTypes || []).forEach(pt => {
      SHIPPED_PLAY_FLAGS[pt.key] = {
        noBoot: !!pt.noBoot,
        hasReadToggle: !!pt.hasReadToggle,
        hasInsideOutside: !!pt.hasInsideOutside,
        directionFixed: !!pt.directionFixed,
        hasCounter: !!pt.hasCounter,
        counterAwayFromWing: !!pt.counterAwayFromWing,
      };
      SHIPPED_PLAY_TYPES_BY_KEY[pt.key] = pt;
      Object.entries(pt.directions || {}).forEach(([dirKey, dirVal]) => {
        const variants = collectLeafVariants(dirVal);
        variants.forEach(variant => {
          (variant && variant.paths || []).forEach(p => {
            if (!p.dualSideBlock) return;
            SHIPPED_DUAL_SIDE_BLOCKS[`${pt.key}|${dirKey}|${p.player}`] = {
              dualSideBlock: true,
              sameSidePoints: p.sameSidePoints,
              crossPoints: p.crossPoints,
              sameSidePoints4x4: p.sameSidePoints4x4,
              crossPoints4x4: p.crossPoints4x4,
            };
          });
        });
      });
    });

    // Nathan: "the preview play I saw had the generic path instead of the
    // showing the latest saved play edits" -- pull the coach's real saved
    // edits (the same playEdits.json a coach's "Save to Cloud" in Edit
    // Plays writes) and repair/normalize them exactly like Play Calls does,
    // so the drill shows the SAME routes a coach is actually running. Uses
    // window.firebaseAuthed if this page happens to have it (matching the
    // rest of the app's read pattern), but falls straight through to a
    // plain fetch otherwise -- either way, any failure here just leaves
    // DATA.playTypes as the shipped defaults already loaded above, so the
    // drill still works fine with generic routes.
    try {
      const editsUrl = await resolveAuthedUrl(`${FIREBASE_DB_URL}/playEdits.json`);
      const res = await fetchWithTimeout(editsUrl);
      if (res.ok) {
        const saved = await res.json();
        if (saved) {
          DATA.playTypes = normalizePlayData(saved);
        }
      }
    } catch (e) {
      // No network / Firebase unreachable / no saved edits yet -- generic
      // shipped routes are already in DATA, so the drill still works.
    }

    // Nathan: "None of the signal images are showing" / "it cant say the
    // name, that gives it away, just the image of the signal" -- this
    // fetch previously never used window.firebaseAuthed at all (an
    // oversight -- only the playEdits.json fetch above had it), so it was
    // ALWAYS an unauthenticated request against a path that requires real
    // login, ALWAYS 401ing, no matter what. Now goes through the same
    // resolveAuthedUrl() as playEdits.json above.
    try {
      const cardsUrl = await resolveAuthedUrl(`${FIREBASE_DB_URL}/dev2PlayData/cards.json`);
      const res = await fetchWithTimeout(cardsUrl);
      if (res.ok) {
        const cards = await res.json();
        if (Array.isArray(cards)) {
          const map = {};
          cards.forEach(c => { if (c && c.id != null) map[c.id] = c.img; });
          SIGNAL_CARDS = map;
        }
      }
    } catch (e) {
      // No network / Firebase unreachable -- signalImgFor() below
      // falls back to a plain text card, so the drill still works.
    }
  }
  // ================================================================
  // SECTION 5: game state + scoring
  // ================================================================
  const DRIVE_YARDS_TO_GO = 75; // start at own 25, opponent's goal line is the 100
  const START_FIELD_POS = 25;
  const CLOCK_START_MS = 2 * 60 * 1000;
  const PENALTY_YARDS = 5;

  // Nathan: "thats also incorporate 2 timeouts that you can take." -- real
  // football semantics: calling a timeout stops the game clock so you get
  // a breather. Doesn't touch the signal sequence or the current call,
  // just buys clock time -- usable any time the drive is running, not just
  // mid-round, same as real football. (Used to buy a fixed number of
  // seconds via clockPausedUntil -- now an open-ended hold via
  // state.clockHoldForSelection instead, see the state object below.)
  const TIMEOUTS_PER_GAME = 2;

  // Nathan: "We need to time out after 10 seconds for delay of game.
  // -5 yards, same whistle and crowd groan on the play." A per-play shot
  // clock, independent of the master 2-minute clock (and of whether that
  // master clock is currently held for a timeout/out-of-bounds) -- if
  // choices have been visible/clickable this long with no pick made,
  // it's an automatic penalty. See the Promise.race in runRound.
  const DELAY_OF_GAME_MS = 10000;

  const state = {
    clockMs: CLOCK_START_MS,
    running: false,
    fieldPos: START_FIELD_POS,
    score: 0, // touchdowns
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    delayOfGameCount: 0,
    totalYards: 0,
    roundActive: false,
    currentCorrectCall: null,
    timeoutsLeft: TIMEOUTS_PER_GAME,
    // Nathan: "it shouldn't run the clock when it plays back the play
    // diagram" -- the diagram playback's length isn't known ahead of time,
    // so it gets its own open-ended pause flag: set true right before
    // playGainAnimation starts, false right after it resolves (see
    // runRound).
    animationPauseActive: false,
    // Nathan: "after a timeout, dont start the clock until you choose the
    // play... If it's time out or out of bounds, don't start the clock
    // until the play selection is made." Replaces the old fixed-duration
    // clockPausedUntil timestamp -- real football doesn't restart the
    // clock after a fixed number of seconds, it restarts on the next
    // snap. Set true by callTimeout() and by an out-of-bounds big play
    // (see resolveGain/runRound); cleared the instant a CORRECT pick is
    // made in a later round (a false start/wrong pick while this is true
    // leaves it true -- "if you false start on a stopped clock, it
    // doesn't start").
    clockHoldForSelection: false,
    // Nathan: "at the end of the game, have a drive recap" -- one entry
    // per resolved round (gain/touchdown/false start/delay of game),
    // rendered by endGame() below. Timeouts don't get their own entry --
    // they're not a play call.
    driveLog: [],
  };

  function randRange(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

  // Nathan: "faster you pick the better your gain" -- pickElapsedMs is the
  // time from when choices actually became visible/clickable (end of the
  // first signal pass, see runRound) to the moment the player clicked an
  // answer. Answer inside SPEED_BONUS_INSTANT_MS for the full bonus, at or
  // past SPEED_BONUS_ZERO_MS for none, linear in between.
  // Nathan (2026-08-31): "It's too easy to score, let's increase difficulty
  // a little." A fast, hot-streak player was routinely stacking base yards
  // + streak bonus + speed bonus + a big-play bonus on the same snap,
  // regularly averaging 20-30+ yards a play -- a 75-yard drive could be
  // three plays. SPEED_BONUS_MAX_YARDS trimmed from 10 to 6 as one part of
  // that pass; see resolveGain below for the base-yardage/big-play trims
  // that go with it.
  const SPEED_BONUS_MAX_YARDS = 6;
  const SPEED_BONUS_INSTANT_MS = 800;
  const SPEED_BONUS_ZERO_MS = 6000;
  function speedBonusYards(pickElapsedMs) {
    if (typeof pickElapsedMs !== 'number' || !isFinite(pickElapsedMs)) return 0;
    if (pickElapsedMs <= SPEED_BONUS_INSTANT_MS) return SPEED_BONUS_MAX_YARDS;
    if (pickElapsedMs >= SPEED_BONUS_ZERO_MS) return 0;
    const t = 1 - (pickElapsedMs - SPEED_BONUS_INSTANT_MS) / (SPEED_BONUS_ZERO_MS - SPEED_BONUS_INSTANT_MS);
    return Math.round(t * SPEED_BONUS_MAX_YARDS);
  }

  // Nathan: "if it's say 4 in a row correct, out of bounds, the clock
  // should stop" -- read as: the FIRST time the streak reaches this many,
  // the big-play/out-of-bounds/clock-stop result is guaranteed rather than
  // just increasingly likely, as a one-time reward for hitting the hot
  // streak. Nathan (2026-08-24) then flagged the original always-"streak
  // >= 4" version as a real bug: "we can't go giving us consecutive 40+
  // yard plays because they got 5 or 6 in a row" -- since streak only
  // resets on a wrong answer, ">= 4" was guaranteeing a huge gain on
  // EVERY play once a player got hot, compounding without limit for the
  // rest of the drive. Changed to "=== 4" (exactly the play that crosses
  // the threshold) so it fires once per streak, not every play after.
  // Every other play still gets the existing gradually-ramping
  // probability below, which stays somewhat elevated with a long streak
  // but is never a guarantee again until the streak resets and re-earns
  // it.
  // Nathan (2026-08-31): "It's too easy to score, let's increase difficulty
  // a little." Raised from 4 to 5 -- one extra correct call before a streak
  // cashes in its guaranteed big play, since 4-in-a-row was coming up
  // often enough that the "one-time reward" read more like "the norm."
  const STREAK_GUARANTEED_BIG_PLAY = 5;

  // "Passing plays which are more difficult to call out will gain you
  // more yardage" + "bonus for multiple correct in a row" + "big gain
  // and get out of bounds" (all from Nathan) combined into one result:
  //
  // Nathan (2026-08-31): "It's too easy to score, let's increase difficulty
  // a little." Base yardage, the streak-bonus rate/cap, and the big-play
  // odds/payout were all trimmed here -- a hot, fast player was stacking
  // base + streak + speed + big-play bonuses on the same snap often enough
  // to turn a 75-yard drive into 2-3 plays. Together with
  // SPEED_BONUS_MAX_YARDS (10 -> 6, above) and STREAK_GUARANTEED_BIG_PLAY
  // (4 -> 5, above), an average correct call should now go for noticeably
  // less, without changing what a "big play" or "streak bonus" actually
  // look like when they do happen.
  function resolveGain(call, pickElapsedMs) {
    // Split's Pass is an independent toggle any play can carry (unlike
    // Wing, where only Option Pass is a real drop-back pass) -- a Split
    // call with Pass on gets the same passing-yardage treatment.
    const isPass = call.formation === 'split' ? !!call.passOn : PASSING_PLAY_KEYS.includes(call.playKey);
    const base = isPass ? randRange(8, 16) : randRange(3, 7);
    const streakBonus = Math.min(Math.round(state.streak * 1.5), 10); // streak counted AFTER this play increments it, see below
    const speedBonus = speedBonusYards(pickElapsedMs);
    const bigPlayChance = (isPass ? 0.16 : 0.08) + Math.min(state.streak * 0.015, 0.10);
    const bigPlay = state.streak === STREAK_GUARANTEED_BIG_PLAY || Math.random() < bigPlayChance;
    const bigYards = bigPlay ? randRange(12, 28) : 0;
    return {
      isPass: isPass,
      baseYards: base,
      streakBonus: streakBonus,
      speedBonus: speedBonus,
      bigPlay: bigPlay,
      bigYards: bigYards,
      totalYards: base + streakBonus + speedBonus + bigYards,
    };
  }

  // ================================================================
  // SECTION 6: DOM wiring
  // ================================================================
  const el = {
    twoMinDrillOverlay: document.getElementById('twoMinDrillOverlay'),
    twoMinDrillCloseBtn: document.getElementById('twoMinDrillCloseBtn'),
    twoMinWrap: document.querySelector('.twoMinWrap'),
    startScreen: document.getElementById('startScreen'),
    startBtn: document.getElementById('startBtn'),
    twoMinLbOpenBtn: document.getElementById('twoMinLbOpenBtn'),
    twoMinLbScreen: document.getElementById('twoMinLbScreen'),
    twoMinLbList: document.getElementById('twoMinLbList'),
    twoMinLbBackBtn: document.getElementById('twoMinLbBackBtn'),
    gameScreen: document.getElementById('gameScreen'),
    endScreen: document.getElementById('endScreen'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    endSummary: document.getElementById('endSummary'),
    driveRecap: document.getElementById('driveRecap'),
    hudClock: document.getElementById('hudClock'),
    hudScore: document.getElementById('hudScore'),
    hudStreak: document.getElementById('hudStreak'),
    hudFieldPos: document.getElementById('hudFieldPos'),
    fieldMarker: document.getElementById('fieldMarker'),
    fieldMarkerLabel: document.getElementById('fieldMarkerLabel'),
    timeoutBtn: document.getElementById('timeoutBtn'),
    timeoutCount: document.getElementById('timeoutCount'),
    getReadyEl: document.getElementById('getReadyEl'),
    signalImg: document.getElementById('signalImg'),
    signalTextCard: document.getElementById('signalTextCard'),
    signalProgress: document.getElementById('signalProgress'),
    choicesGrid: document.getElementById('choicesGrid'),
    resultBanner: document.getElementById('resultBanner'),
    playDiagramWrap: document.getElementById('playDiagramWrap'),
    playDiagramSvg: document.getElementById('playDiagramSvg'),
    loadingNote: document.getElementById('loadingNote'),
    sndWhistle: document.getElementById('drillWhistleSound'),
    sndFalseStartCrowd: document.getElementById('drillFalseStartCrowdSound'),
    sndTouchdownHorn: document.getElementById('drillTouchdownHornSound'),
    sndCrowdCheer: document.getElementById('drillCrowdCheerSound'),
    sndCrowdNoise: document.getElementById('drillCrowdNoiseSound'),
  };

  // ================================================================
  // SECTION 6b: sound effects
  // Nathan: "have it do the police whistle with the crowd disappointed
  // sound right after it" (false start) + "have the crowd noise start
  // playing and after .6 seconds, play the Touchdown sound. Crowdnoise can
  // be used in the background throughout, then switch to the other crowd"
  // (touchdown). All of this is scoped to this drill only, not the whole
  // app -- separate <audio> elements from the study-quiz correct/wrong/
  // bgMusic ones (see two-minute-drill-test.html), same
  // play-from-the-start-every-time pattern as study-quiz.js's playSound().
  // ================================================================
  function playSfx(elAudio, opts) {
    if (!elAudio) return;
    try {
      elAudio.currentTime = 0;
      if (opts && typeof opts.volume === 'number') elAudio.volume = opts.volume;
      elAudio.play().catch(() => { /* autoplay blocked -- fine, just silent */ });
    } catch (e) { /* ignore -- sound is a nice-to-have, never worth breaking the drill over */ }
  }

  // Nathan: "have it do the police whistle with the crowd disappointed
  // sound right after it." Chained off the whistle's own 'ended' event
  // (rather than a fixed setTimeout) so it stays in sync even if the clip
  // ever gets swapped for a different-length one.
  function playFalseStartSfx() {
    const whistle = el.sndWhistle;
    const crowd = el.sndFalseStartCrowd;
    if (!whistle) { playSfx(crowd); return; }
    const onEnded = () => { whistle.removeEventListener('ended', onEnded); playSfx(crowd); };
    whistle.addEventListener('ended', onEnded);
    playSfx(whistle);
  }

  const TOUCHDOWN_HORN_DELAY_MS = 600;
  // Nathan: "the main crowd noise is too loud to begin" -- was 0.35, which
  // fought with the signal-calling/play-by-play focus of the drill; kept
  // well above CROWD_NOISE_DUCKED_VOLUME so the touchdown duck (see
  // playTouchdownSfx) is still audibly a step down, not just a rounding
  // difference.
  const CROWD_NOISE_AMBIENT_VOLUME = 0.16;
  const CROWD_NOISE_DUCKED_VOLUME = 0.08;
  // How long the "other crowd" (the excited cheer burst) plays before the
  // ambient crowd-noise bed comes back up to its normal level -- matches
  // crowd-cheer.mp3's own length plus a little breathing room.
  const CROWD_DUCK_MS = 4600;
  let crowdDuckTimer = null;
  function playTouchdownSfx() {
    if (crowdDuckTimer) { clearTimeout(crowdDuckTimer); crowdDuckTimer = null; }
    // "the crowd noise start playing" -- the excited crowd (the OTHER
    // crowd track, distinct from the calm ambient one already looping)
    // kicks in right at the score.
    playSfx(el.sndCrowdCheer);
    if (el.sndCrowdNoise && !el.sndCrowdNoise.paused) el.sndCrowdNoise.volume = CROWD_NOISE_DUCKED_VOLUME;
    setTimeout(() => playSfx(el.sndTouchdownHorn), TOUCHDOWN_HORN_DELAY_MS);
    crowdDuckTimer = setTimeout(() => {
      crowdDuckTimer = null;
      if (el.sndCrowdNoise && !el.sndCrowdNoise.paused) el.sndCrowdNoise.volume = CROWD_NOISE_AMBIENT_VOLUME;
    }, CROWD_DUCK_MS);
  }

  // Ambient bed for the whole drive -- Nathan: "Crowdnoise can be used in
  // the background throughout." Started quiet on kickoff, stopped when the
  // drive ends. The clip (~2:26) comfortably outlasts one drive (2:00) so
  // it never needs to actually loop.
  function startAmbientCrowd() {
    const a = el.sndCrowdNoise;
    if (!a) return;
    try {
      a.currentTime = 0;
      a.volume = CROWD_NOISE_AMBIENT_VOLUME;
      a.play().catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function stopAmbientCrowd() {
    if (crowdDuckTimer) { clearTimeout(crowdDuckTimer); crowdDuckTimer = null; }
    const a = el.sndCrowdNoise;
    if (!a) return;
    try { a.pause(); } catch (e) { /* ignore */ }
  }

  // Drive-recap rows are built from describeCall() output/fixed result
  // strings, never real user input -- but escaping before innerHTML is
  // still the cheap, safe default, same as the rest of the app's own
  // escapeHtml/escapeHtmlGD helpers.
  function escapeAttr(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function fmtClock(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
  function fieldPosLabel(pos) {
    const p = Math.round(Math.max(1, Math.min(99, pos)));
    if (p === 50) return `Ball on the 50`;
    return p > 50 ? `Ball on their ${100 - p}` : `Ball on your ${p}`;
  }
  function updateHud() {
    el.hudClock.textContent = fmtClock(state.clockMs);
    el.hudClock.classList.toggle('urgent', state.clockMs <= 20000 && state.running);
    el.hudScore.textContent = `TDs: ${state.score}`;
    el.hudStreak.textContent = state.streak > 1 ? `🔥 Streak x${state.streak}` : (state.streak === 1 ? 'Streak x1' : '');
    el.hudFieldPos.textContent = fieldPosLabel(state.fieldPos);
    const pct = Math.max(0, Math.min(100, state.fieldPos));
    el.fieldMarker.style.left = `${pct}%`;
    el.fieldMarkerLabel.textContent = `${Math.round(state.fieldPos)}`;
    if (el.timeoutBtn) {
      el.timeoutCount.textContent = state.timeoutsLeft;
      el.timeoutBtn.disabled = !state.running || state.timeoutsLeft <= 0;
    }
  }

  // Nathan: "after a timeout, dont start the clock until you choose the
  // play" -- pauses the master clock the same open-ended way an
  // out-of-bounds big play does now (see resolveGain/runRound), just
  // player-triggered instead of luck-triggered. Usable any time the drive
  // is running.
  function callTimeout() {
    if (!state.running || state.timeoutsLeft <= 0) return;
    state.timeoutsLeft--;
    state.clockHoldForSelection = true;
    updateHud();
    showBanner('⏱️ TIMEOUT!', 'timeout', 1100);
  }

  let clockTimer = null;
  function startClock() {
    let last = performance.now();
    clockTimer = setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      if (state.clockHoldForSelection || state.animationPauseActive) { updateHud(); return; }
      state.clockMs -= delta;
      if (state.clockMs <= 0) {
        state.clockMs = 0;
        updateHud();
        endGame();
        return;
      }
      updateHud();
    }, 100);
  }
  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  // Nathan: "Graphics for the completions should be cooler looking and
  // more dynamic." -- reads this as the celebration banners (GAIN!,
  // BREAKS FREE!, TOUCHDOWN!), since those are what fire on every
  // completed/correct call. Layered three things on top of the existing
  // punch-scale banner: a radial "impact ring" burst behind it (CSS, see
  // .twoMinBanner::before), a screen-shake + pulsing glow on the bigger
  // moments (CSS, see the .big/.touchdown animation rules), and a real
  // particle burst (below) radiating out from the banner -- fired for any
  // positive outcome, skipped for the false-start/timeout banners so
  // nothing celebratory shows on a miss.
  const BURST_CONFIG = {
    good: { count: 10, colors: ['#35a24a', '#8be89a', '#c9f7c9'], distance: 70, chars: ['🏈'] },
    big: { count: 18, colors: ['#ffd54f', '#f9a825', '#fff3c4'], distance: 120, chars: ['🏈', '⚡'] },
    touchdown: { count: 30, colors: ['#ffb347', '#ff7a00', '#ffe08a', '#fff'], distance: 160, chars: ['🏈', '⭐'] },
  };
  function spawnBurst(kind) {
    const cfg = BURST_CONFIG[kind];
    if (!cfg || !el.resultBanner) return;
    const rect = el.resultBanner.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < cfg.count; i++) {
      const p = document.createElement('div');
      p.className = 'twoMinSpark';
      p.textContent = cfg.chars[i % cfg.chars.length];
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.color = cfg.colors[i % cfg.colors.length];
      document.body.appendChild(p);
      const angle = (Math.PI * 2 * i) / cfg.count + (Math.random() - 0.5) * 0.5;
      const dist = cfg.distance * (0.55 + Math.random() * 0.6);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const spin = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360);
      let anim;
      try {
        anim = p.animate([
          { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin}deg) scale(.35)`, opacity: 0 },
        ], { duration: 650 + Math.random() * 350, easing: 'cubic-bezier(.2,.6,.3,1)' });
      } catch (e) { /* Web Animations API unavailable -- just skip the burst, no crash */ }
      if (anim) anim.onfinish = () => p.remove();
      else p.remove();
    }
  }

  function showBanner(text, cls, holdMs) {
    el.resultBanner.textContent = text;
    el.resultBanner.className = 'twoMinBanner show ' + cls;
    if (cls.indexOf('bad') === -1 && cls.indexOf('timeout') === -1) {
      spawnBurst(cls.indexOf('touchdown') !== -1 ? 'touchdown' : (cls.indexOf('big') !== -1 ? 'big' : 'good'));
    }
    return wait(holdMs).then(() => {
      el.resultBanner.className = 'twoMinBanner';
    });
  }

  // Nathan: "lets make sure it matches the speed rules of the timed quiz."
  // Same constants/pacing formula as play-calls-quiz.js's playSequence().
  const GET_READY_MS = 1300;
  const BASE_STEP_MS = 950, EXTRA_MS_PER_SIGNAL = 120, MAX_LOOPS = 2;

  // Tracks the in-flight signal-display timer so a new round (or an early
  // answer) can stop a still-running background loop before it keeps
  // touching el.signalImg/el.signalTextCard on top of whatever comes next.
  let signalTimer = null;
  function stopSignalSequence() {
    if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  }

  // Nathan: "lets do the signals 2 times through. options visible after 1
  // time through. faster you pick the better your gain." -- unlike the
  // timed quiz (which reveals only after both passes), this resolves once
  // the FIRST pass finishes so choices can appear while the signal display
  // keeps cycling through its second pass in the background -- that
  // background loop is what a player who wants a second look can watch
  // while still answering as fast as they're comfortable with. Call
  // stopSignalSequence() once the round has an answer (or ends) to halt it.
  function playSignals(signals) {
    return new Promise(resolve => {
      stopSignalSequence();
      el.signalProgress.innerHTML = '';
      // Bug fix (Nathan: "the play direction from the previous call still
      // shows at the start of the next call") -- #signalImg/#signalTextCard
      // are normal (non-absolutely-positioned) children of the same flex
      // column as #getReadyEl, so showing #getReadyEl alone during the
      // GET READY beat never hid whichever signal card the PREVIOUS round
      // last displayed (often its Direction card) -- both sat stacked in
      // the column together until the new sequence's first showStep() call
      // finally overwrote signalImg.src. Hide both explicitly right here,
      // before GET READY even shows, so a new round always starts blank.
      el.signalImg.style.display = 'none';
      el.signalTextCard.style.display = 'none';
      if (!signals.length) { resolve(); return; }
      signals.forEach(() => { const d = document.createElement('div'); d.className = 'dot'; el.signalProgress.appendChild(d); });
      const stepMs = BASE_STEP_MS + Math.max(0, signals.length - 4) * EXTRA_MS_PER_SIGNAL;
      let i = 0, loopCount = 0, revealed = false;
      function showStep() {
        if (i >= signals.length) {
          i = 0;
          loopCount++;
          if (!revealed) { revealed = true; resolve(); }
          if (loopCount >= MAX_LOOPS) { signalTimer = null; return; }
        }
        const sig = signals[i];
        // Nathan: "it cant say the name, that gives it away, just the
        // image of the signal" -- sig.label (e.g. "Wing Location: Left",
        // "Outside Zone") is the literal answer, so it can NEVER be shown
        // as visible text -- this fallback branch only exists for the rare
        // case a signal photo genuinely fails to load (network hiccup,
        // signed-out session), and even then it must not leak the call.
        // Real fix for photos not loading at all is cloud-auth.js now
        // being loaded on this page (see two-minute-drill-test.html) so
        // window.firebaseAuthed can actually read the gated signal photos;
        // this text branch is just the safety net under that, not a
        // legitimate second way to play the game.
        if (sig.src) {
          el.signalImg.src = sig.src;
          el.signalImg.style.display = 'block';
          el.signalTextCard.style.display = 'none';
        } else {
          el.signalTextCard.textContent = '📡';
          el.signalTextCard.style.display = 'block';
          el.signalImg.style.display = 'none';
        }
        [...el.signalProgress.children].forEach((d, idx) => d.classList.toggle('done', idx <= i));
        i++;
        signalTimer = setTimeout(showStep, stepMs);
      }
      el.getReadyEl.style.display = 'flex';
      signalTimer = setTimeout(() => { el.getReadyEl.style.display = 'none'; showStep(); }, GET_READY_MS);
    });
  }

  function renderChoices(choices, correctCall) {
    return new Promise(resolve => {
      el.choicesGrid.innerHTML = '';
      choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'twoMinChoiceBtn';
        btn.textContent = describeCall(choice);
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          [...el.choicesGrid.children].forEach(b => b.disabled = true);
          const isCorrect = callKey(choice) === callKey(correctCall);
          btn.classList.add(isCorrect ? 'picked-correct' : 'picked-wrong');
          if (!isCorrect) {
            [...el.choicesGrid.children].forEach(b => {
              if (b.textContent === describeCall(correctCall)) b.classList.add('reveal-correct');
            });
          }
          resolve(isCorrect);
        }, { once: false });
        el.choicesGrid.appendChild(btn);
      });
    });
  }

  async function playGainAnimation(call) {
    el.playDiagramWrap.style.display = 'flex';
    const isPlayingRef = { value: false };
    // Nathan: "it shouldn't run the clock when it plays back the play
    // diagram" -- pause for the whole duration of the diagram animation
    // (see animationPauseActive in the clock tick above), not just the
    // visible banner text, so the drill clock only ever burns real
    // decision time, never watch-the-replay time.
    state.animationPauseActive = true;
    try {
      if (call.formation === 'split') {
        // renderSplitDiagram (unlike renderCardDiagram) isn't called
        // implicitly by the animation function itself -- it has to be
        // rendered first, then animated, same two-step split play-calls.js
        // itself uses (rerenderDiagram() then playSplitAnimation()).
        renderSplitDiagram(el.playDiagramSvg, call.playKey, call.splitSide, call.insideOutside, 'A', call.leftCall, call.rightCall, call.passOn);
        await playSplitAnimation(el.playDiagramSvg, call.splitSide, 1, isPlayingRef);
      } else {
        await playCardAnimation(el.playDiagramSvg, call.playKey, call.direction, call.wingSide, 1, isPlayingRef,
          null, '4x4', call.insideOutside, call.motionOn, call.bootOn, 'A', call.counterOn, call.twSweepOn);
      }
    } finally {
      state.animationPauseActive = false;
    }
  }

  async function runRound() {
    state.roundActive = true;
    el.playDiagramWrap.style.display = 'none';
    el.choicesGrid.innerHTML = '';

    // Nathan: "Questions should be easier to start and a little harder as
    // you go." roundIndex is 0 on the very first snap of the drive and
    // climbs with every completed round (right or wrong) -- see
    // difficultyTier/generateCorrectCall/generateChoices above.
    const roundIndex = state.correctCount + state.wrongCount;
    const correctCall = generateCorrectCall(roundIndex);
    state.currentCorrectCall = correctCall;
    const choices = generateChoices(correctCall, roundIndex);
    const signals = buildSignalSequenceForCall(correctCall);

    await playSignals(signals);
    if (!state.running) { stopSignalSequence(); return; }

    // Nathan: "faster you pick the better your gain" -- the clock for the
    // speed bonus starts the instant choices are actually visible/
    // clickable (end of the first signal pass), not when the round began,
    // so warm-up time and signal-playback time never count against the
    // player. The signal display itself keeps looping through its second
    // pass in the background (see playSignals) until stopSignalSequence()
    // below, once an answer is in.
    //
    // Nathan: "We need to time out after 10 seconds for delay of game."
    // Races the real pick against a 10s shot clock -- whichever settles
    // first wins. If the shot clock wins, the choice buttons are disabled
    // immediately so a stray late click on the old (still-visible) grid
    // can't also resolve isCorrectPromise after the fact.
    const pickStartMs = performance.now();
    const isCorrectPromise = renderChoices(choices, correctCall);
    const pickResult = await Promise.race([
      isCorrectPromise.then(isCorrect => ({ delayOfGame: false, isCorrect })),
      wait(DELAY_OF_GAME_MS).then(() => ({ delayOfGame: true, isCorrect: false })),
    ]);
    stopSignalSequence();
    if (!state.running) return;
    const pickElapsedMs = performance.now() - pickStartMs;

    if (pickResult.delayOfGame) {
      [...el.choicesGrid.children].forEach(b => b.disabled = true);
      state.streak = 0;
      state.delayOfGameCount++;
      // Nathan: "You also can't get backed up into the endzone" -- same
      // Math.max(1, ...) floor false start already uses below.
      state.fieldPos = Math.max(1, state.fieldPos - PENALTY_YARDS);
      state.driveLog.push({ text: describeCall(correctCall), result: `DELAY OF GAME -${PENALTY_YARDS}`, cls: 'penalty' });
      updateHud();
      // "same whistle and crowd groan on the play" -- the exact false
      // start sfx chain, just for a different cause of the dead play.
      playFalseStartSfx();
      await showBanner(`⏱️ DELAY OF GAME! -${PENALTY_YARDS} YDS`, 'bad', 1400);
      if (!state.running) return;
      state.roundActive = false;
      if (state.running) runRound();
      return;
    }

    const isCorrect = pickResult.isCorrect;

    if (isCorrect) {
      // Nathan: "If it's time out or out of bounds, don't start the clock
      // until the play selection is made." A correct pick IS the next
      // snap -- clear any held-from-last-round stop right here, before
      // this play's own potential out-of-bounds re-engages it below.
      state.clockHoldForSelection = false;

      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.correctCount++;
      const gain = resolveGain(correctCall, pickElapsedMs);
      // Nathan: "make sure you know where they are on the field. If they
      // are at the 5, they can't get a 22 yard gain out of bounds, it
      // would be a 5 yard TD run." resolveGain() has no idea where the
      // ball actually is (it's just rolling a random gain for the call
      // made), so a big play rolled deep in opponent territory could claim
      // more yards than there's actually field left to gain -- clamp it to
      // the real distance to the goal line before it touches totalYards,
      // fieldPos, the drive log, or the banner text, so every number shown
      // downstream reflects what could really happen (a play that reaches
      // the end zone with distance to spare is still a touchdown, just for
      // the real yardage, not the raw roll).
      const distanceToGoal = 100 - state.fieldPos;
      if (gain.totalYards > distanceToGoal) gain.totalYards = distanceToGoal;
      state.totalYards += gain.totalYards;
      state.fieldPos += gain.totalYards;
      // Out of bounds stops the clock dead, same open-ended hold a
      // timeout uses -- cleared again on the NEXT round's correct pick
      // (see just above), not after a fixed number of seconds.
      if (gain.bigPlay) state.clockHoldForSelection = true;

      await playGainAnimation(correctCall);
      // The clock is paused for the play-diagram replay itself (see
      // animationPauseActive), but a timeout/out-of-bounds hold clearing
      // mid-animation could still let it hit 0 and trigger endGame()
      // before this line (e.g. a timeout was called, then a LATER correct
      // pick clears the hold while the diagram is still playing). Once
      // that's happened, nothing from this in-flight round should touch
      // state or the HUD any further, or a touchdown/gain resolving a
      // beat late could increment the score (and repaint the live HUD)
      // AFTER the end screen already rendered its now-stale summary.
      if (!state.running) return;

      const scored = state.fieldPos >= 100;
      if (scored) state.fieldPos = 100;
      updateHud();

      // Nathan: "it says they ran out of bounds when they scored a
      // touchdown." A big play that ALSO crosses the goal line is a
      // touchdown, not an out-of-bounds gain -- it never actually went out
      // of bounds, it just kept going into the end zone. `scored` (above)
      // already tells us which one happened, so the OOB wording (both here
      // in the drive log and in the banner below) only applies when the
      // play did NOT score. A scoring big play still gets the "BREAKS
      // FREE" excitement and whistle, just without the false OOB claim --
      // the real TOUCHDOWN banner right below covers the score itself.
      const wentOob = gain.bigPlay && !scored;
      state.driveLog.push({
        text: describeCall(correctCall),
        result: `+${gain.totalYards} YDS${wentOob ? ' (OOB)' : ''}`,
        cls: 'gain',
      });

      if (gain.bigPlay) {
        // Nathan: "If you go out of bounds on a play, have the whistle
        // blow." Plain whistle, no crowd-groan chain -- this is a good
        // play, not a penalty.
        playSfx(el.sndWhistle);
        if (wentOob) {
          await showBanner(`💥 BREAKS FREE! +${gain.totalYards} YDS — OUT OF BOUNDS!`, 'good big', 1700);
        } else {
          await showBanner(`💥 BREAKS FREE! +${gain.totalYards} YDS!`, 'good big', 1700);
        }
      } else {
        await showBanner(`GAIN! +${gain.totalYards} YDS`, 'good', 1300);
      }
      if (!state.running) return;

      if (scored) {
        // Nathan: "if you score a touchdown, the clock should stop." Same
        // open-ended hold a timeout/out-of-bounds play uses -- it only
        // clears again on the NEXT round's correct pick (line ~2183), once
        // the "kickoff" for the following possession has actually been run.
        state.clockHoldForSelection = true;
        state.score++;
        updateHud();
        state.driveLog.push({ text: '', result: '🏈 TOUCHDOWN', cls: 'touchdown' });
        playTouchdownSfx();
        await showBanner('🏈 TOUCHDOWN!', 'touchdown', 2000);
        if (!state.running) return;
        state.fieldPos = START_FIELD_POS;
        updateHud();
      }
    } else {
      state.streak = 0;
      state.wrongCount++;
      // Nathan: "You also can't get backed up into the endzone."
      state.fieldPos = Math.max(1, state.fieldPos - PENALTY_YARDS);
      state.driveLog.push({ text: describeCall(correctCall), result: `FALSE START -${PENALTY_YARDS}`, cls: 'penalty' });
      updateHud();
      // Nathan: "if you false start on a stopped clock, it doesn't
      // start" -- a wrong pick never clears clockHoldForSelection (unlike
      // the correct-pick branch above), so a hold from a prior timeout/
      // out-of-bounds just carries through into the next round untouched.
      playFalseStartSfx();
      await showBanner(`FALSE START! -${PENALTY_YARDS} YDS`, 'bad', 1400);
      if (!state.running) return;
    }

    state.roundActive = false;
    if (state.running) runRound();
  }

  // ================================================================
  // SECTION 6c: leaderboard -- Nathan: "this will also need a
  // leaderboard... The leaderboard for the game is only contained within
  // the 2 minute drill." Auto-saves every completed drive (no manual
  // name-entry step, unlike the Quiz/Timed boards -- this already runs
  // inside the signed-in app, so currentPlayerTag() has everything
  // needed) to its own Firebase list, kept completely separate from the
  // app's general #lbOverlay leaderboard used by Quiz/Timed Quiz/Play
  // Calls Quiz. Reuses study-quiz.js's cloudPush/cloudFetch/
  // currentPlayerTag/dedupeBestByName/splitByCoach/lbRowHtml/
  // coachSectionHtml -- all top-level FUNCTION declarations in that
  // file, which is guaranteed to load before this one (see boot()'s
  // scripts array in index.html). Function declarations are hoisted and
  // become real window properties, so they're safely readable here as
  // plain identifiers.
  //
  // LEADERBOARD_MAX is deliberately NOT reused the same way, even though
  // it's also declared top-level in study-quiz.js: unlike a function
  // declaration, a plain `const` only becomes visible to a later
  // <script> once its own declaration statement actually runs -- if
  // study-quiz.js were ever to throw partway through its own top-level
  // setup (verified directly: a stray throw before that line makes the
  // const invisible here, while hoisted functions declared even later in
  // the same file stay unaffected), this file would inherit that
  // breakage for an unrelated reason. TWO_MIN_LB_MAX just duplicates the
  // same value (20) locally instead, so the drill's leaderboard can't be
  // taken down by something going wrong elsewhere in the app.
  // ================================================================
  const TWO_MIN_LB_PATH = 'twoMinDrillLeaderboard';
  const TWO_MIN_LB_LOCAL_KEY = 'bengalsTwoMinDrillLeaderboard';
  const TWO_MIN_LB_MAX = 20;

  function getTwoMinLeaderboardLocal() {
    try { const raw = localStorage.getItem(TWO_MIN_LB_LOCAL_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function saveTwoMinLeaderboardLocal(entry) {
    const list = getTwoMinLeaderboardLocal();
    list.push(entry);
    list.sort(twoMinLbSortCompare);
    try { localStorage.setItem(TWO_MIN_LB_LOCAL_KEY, JSON.stringify(list.slice(0, TWO_MIN_LB_MAX))); } catch (e) { /* localStorage unavailable -- fine, cloud save (if it succeeded) still stands */ }
  }
  // Best drive wins on touchdowns first, total yards as the tiebreak, best
  // streak after that -- same order of importance the end-screen summary
  // itself already lists these stats in.
  function twoMinDrillIsBetter(a, b) {
    if ((a.score || 0) !== (b.score || 0)) return (a.score || 0) > (b.score || 0);
    if ((a.totalYards || 0) !== (b.totalYards || 0)) return (a.totalYards || 0) > (b.totalYards || 0);
    return (a.bestStreak || 0) > (b.bestStreak || 0);
  }
  function twoMinLbSortCompare(a, b) {
    return (b.score || 0) - (a.score || 0) || (b.totalYards || 0) - (a.totalYards || 0) || (b.bestStreak || 0) - (a.bestStreak || 0) || new Date(a.date) - new Date(b.date);
  }
  async function saveTwoMinDrillResult() {
    // study-quiz.js's cloudPush/currentPlayerTag etc. are only loaded
    // when this file runs as part of the live app (see
    // boot()'s scripts array in index.html) -- the standalone
    // two-minute-drill-test.html page never loads study-quiz.js at all,
    // so this quietly no-ops there instead of throwing a ReferenceError
    // out of endGame() and breaking the rest of the standalone page.
    if (typeof currentPlayerTag !== 'function' || typeof cloudPush !== 'function') return;
    const entry = Object.assign({
      score: state.score,
      totalYards: state.totalYards,
      bestStreak: state.bestStreak,
      date: new Date().toISOString(),
    }, currentPlayerTag());
    saveTwoMinLeaderboardLocal(entry);
    await cloudPush(TWO_MIN_LB_PATH, entry);
  }
  async function fetchTwoMinDrillLeaderboardData() {
    const cloudList = await cloudFetch(TWO_MIN_LB_PATH);
    const offline = cloudList === null;
    const raw = (offline ? getTwoMinLeaderboardLocal() : cloudList).slice();
    const deduped = dedupeBestByName(raw, twoMinDrillIsBetter);
    deduped.sort(twoMinLbSortCompare);
    const { players, coaches } = splitByCoach(deduped);
    return { players: players.slice(0, TWO_MIN_LB_MAX), coaches: coaches.slice(0, TWO_MIN_LB_MAX), offline: offline };
  }
  // Nathan: "A score section should be added to the overall leaderboard."
  // Exposed so study-quiz.js's renderOverallLeaderboard() can pull the same
  // drill results into a section on the main team leaderboard, not just
  // the drill's own internal Leaderboard screen (#twoMinLbScreen above).
  window.fetchTwoMinDrillLeaderboardData = fetchTwoMinDrillLeaderboardData;

  async function renderTwoMinDrillLeaderboard() {
    const list = el.twoMinLbList;
    if (!list) return;
    list.innerHTML = '<div class="lbEmpty">Loading team drives…</div>';
    const { players, coaches, offline } = await fetchTwoMinDrillLeaderboardData();
    const scoreFn = e => `${e.score || 0} TD${(e.score || 0) === 1 ? '' : 's'} • ${e.totalYards || 0} yds`;
    list.innerHTML = players.length === 0
      ? '<div class="lbEmpty">No drives yet — finish a drill to be the first!</div>'
      : players.map((e, i) => lbRowHtml(e, i, null, scoreFn(e))).join('');
    list.innerHTML += coachSectionHtml(coaches, scoreFn);
    if (offline) {
      list.innerHTML += '<div class="lbOfflineNote">⚠️ Showing drives saved on this device only — could not reach the team server.</div>';
    }
  }

  function endGame() {
    if (!state.running) return;
    state.running = false;
    stopClock();
    stopAmbientCrowd();
    // The clock can hit 0 while a result banner is still mid-hold
    // (its own wait(holdMs) hasn't resolved yet) -- without this it
    // stays visible, floating over the end screen until that timer
    // finally clears it. Force it gone immediately instead.
    el.resultBanner.className = 'twoMinBanner';
    if (el.twoMinWrap) el.twoMinWrap.classList.remove('gameActive');
    el.gameScreen.style.display = 'none';
    el.endScreen.style.display = '';
    const maxScore = state.correctCount + state.wrongCount;
    const totalPenaltyYards = (state.wrongCount + state.delayOfGameCount) * PENALTY_YARDS;
    el.endSummary.innerHTML = `
      <div class="twoMinEndStat">🏈 Touchdowns: <b>${state.score}</b></div>
      <div class="twoMinEndStat">Total yards gained: <b>${state.totalYards}</b></div>
      <div class="twoMinEndStat">Yards lost to penalties: <b>${totalPenaltyYards}</b></div>
      <div class="twoMinEndStat">Calls correct: <b>${state.correctCount}</b> / ${maxScore || 0}</div>
      <div class="twoMinEndStat">False starts: <b>${state.wrongCount}</b></div>
      <div class="twoMinEndStat">Delay of game penalties: <b>${state.delayOfGameCount}</b></div>
      <div class="twoMinEndStat">Best streak: <b>${state.bestStreak}</b></div>
    `;
    // Nathan: "At the end of the game, have a drive recap." Oldest play
    // first, so it reads top-to-bottom the same order the drive happened.
    if (el.driveRecap) {
      el.driveRecap.innerHTML = state.driveLog.length
        ? state.driveLog.map((entry, i) => `
            <div class="twoMinRecapRow ${entry.cls}">
              <span class="recapPlay">${entry.text ? `${i + 1}. ${escapeAttr(entry.text)}` : `${i + 1}.`}</span>
              <span class="recapResult">${escapeAttr(entry.result)}</span>
            </div>`).join('')
        : `<div class="twoMinRecapRow"><span class="recapPlay">No plays run this drive.</span></div>`;
    }
    try {
      const bestTds = Number(localStorage.getItem('twoMinDrillBestTDs') || 0);
      const bestStreak = Number(localStorage.getItem('twoMinDrillBestStreak') || 0);
      if (state.score > bestTds) localStorage.setItem('twoMinDrillBestTDs', String(state.score));
      if (state.bestStreak > bestStreak) localStorage.setItem('twoMinDrillBestStreak', String(state.bestStreak));
    } catch (e) { /* localStorage unavailable -- fine, just no persisted best */ }
    // Nathan: "this will also need a leaderboard" -- auto-saved, no manual
    // "enter your name" step (unlike Quiz/Timed Quiz), since this always
    // runs inside an already-signed-in session. Fire-and-forget so a slow
    // or failed cloud write never blocks the end screen from showing.
    saveTwoMinDrillResult();
  }

  function startGame() {
    Object.assign(state, {
      clockMs: CLOCK_START_MS, running: true, fieldPos: START_FIELD_POS,
      score: 0, streak: 0, bestStreak: 0, correctCount: 0, wrongCount: 0, delayOfGameCount: 0, totalYards: 0,
      roundActive: false, currentCorrectCall: null, timeoutsLeft: TIMEOUTS_PER_GAME,
      animationPauseActive: false, clockHoldForSelection: false, driveLog: [],
    });
    el.startScreen.style.display = 'none';
    if (el.twoMinLbScreen) el.twoMinLbScreen.style.display = 'none';
    el.endScreen.style.display = 'none';
    el.gameScreen.style.display = '';
    // Nathan: "Whole game should fit to one screen" -- compact padding only
    // while actually playing (see .twoMinWrap.gameActive in styles.css);
    // removed again in endGame() so the end screen's recap/summary keep
    // their normal roomier layout.
    if (el.twoMinWrap) el.twoMinWrap.classList.add('gameActive');
    updateHud();
    startClock();
    startAmbientCrowd();
    runRound();
  }

  async function init() {
    el.loadingNote.textContent = 'Loading play data…';
    try {
      await loadData();
      el.loadingNote.textContent = '';
      el.startBtn.disabled = false;
    } catch (e) {
      el.loadingNote.textContent = e.message + ' -- check your connection and reload.';
    }
  }

  el.startBtn.addEventListener('click', startGame);
  el.playAgainBtn.addEventListener('click', startGame);
  if (el.timeoutBtn) el.timeoutBtn.addEventListener('click', callTimeout);

  // Nathan: "make the entry screen cooler with 2 options, play and
  // leaderboard" -- the Leaderboard button swaps the entry panel for the
  // drill's own leaderboard screen (Back returns to the entry panel);
  // neither ever touches the game screen itself.
  if (el.twoMinLbOpenBtn) {
    el.twoMinLbOpenBtn.addEventListener('click', () => {
      el.startScreen.style.display = 'none';
      if (el.twoMinLbScreen) el.twoMinLbScreen.style.display = '';
      renderTwoMinDrillLeaderboard();
    });
  }
  if (el.twoMinLbBackBtn) {
    el.twoMinLbBackBtn.addEventListener('click', () => {
      if (el.twoMinLbScreen) el.twoMinLbScreen.style.display = 'none';
      el.startScreen.style.display = '';
    });
  }

  // Nathan: "press and hold the logo for 3 seconds launches it" -- opened
  // from study-quiz.js's headerLogo long-press handler via this global
  // (the drill's own overlay div/game state live entirely in this file).
  // Closing the overlay doesn't reset or pause an in-progress drive -- a
  // coach who closes mid-drive and long-presses again later comes right
  // back to it, same as any other minimized game.
  window.openTwoMinDrillOverlay = function () {
    if (el.twoMinDrillOverlay) {
      el.twoMinDrillOverlay.classList.add('show');
      // Nathan (2026-08-24): "every single page has 2 minute drill at the
      // bottom... remove it immediately" -- belt-and-suspenders alongside
      // the 'show' class. Set the inline style directly too, since a
      // stale/slow-to-update css/styles.css can otherwise leave
      // .twoMinDrillOverlay.show with no display rule to actually apply
      // (see the inline style="display:none" on the element itself in
      // index.html for the other half of this fix -- it no longer depends
      // on the external stylesheet at all).
      el.twoMinDrillOverlay.style.display = 'block';
    }
  };
  if (el.twoMinDrillCloseBtn) {
    el.twoMinDrillCloseBtn.addEventListener('click', () => {
      // Nathan: "if you hit the X to close it, it should ask you to
      // confirm if you want to quit the game. If you proceed it will stop
      // the game and close. If you say no, it will keep the game going."
      // Only a drive actually in progress has anything to lose -- closing
      // from the start/end/leaderboard screens (state.running is false
      // there) just closes immediately, same as before.
      if (state.running) {
        const proceed = window.confirm('Quit this 2 Minute Drill? Your current drive will end.');
        if (!proceed) return;
        endGame(); // stops the clock/crowd audio and saves the result, same cleanup as the clock hitting 0
      }
      if (el.twoMinDrillOverlay) {
        el.twoMinDrillOverlay.classList.remove('show');
        el.twoMinDrillOverlay.style.display = 'none';
      }
    });
  }

  // Exposes internals for automated testing (headless smoke tests) --
  // same spirit as window.__pcqTestHooks in play-calls-quiz.js.
  // Harmless in normal play, just a debug hook.
  window.__twoMinDrillTestHooks = {
    getState: function () { return state; },
    describeCall: describeCall,
    callKey: callKey,
    forceClockMs: function (ms) { state.clockMs = ms; },
    // buildSignalSequence kept mapped to the original Wing-only positional
    // function (same name/signature older tests already call) --
    // buildSplitSignalSequence/buildSignalSequenceForCall are the new
    // Split-aware entry points, exposed separately rather than changing
    // this one's shape out from under existing tests.
    buildSignalSequence: buildWingSignalSequence,
    buildSplitSignalSequence: buildSplitSignalSequence,
    buildSignalSequenceForCall: buildSignalSequenceForCall,
    resolveGain: resolveGain,
    speedBonusYards: speedBonusYards,
    generateCorrectCall: generateCorrectCall,
    generateChoices: generateChoices,
    normalizeCall: normalizeCall,
    renderSplitDiagram: renderSplitDiagram,
    playSplitAnimation: playSplitAnimation,
    twoMinDrillIsBetter: twoMinDrillIsBetter,
    fetchTwoMinDrillLeaderboardData: fetchTwoMinDrillLeaderboardData,
    renderTwoMinDrillLeaderboard: renderTwoMinDrillLeaderboard,
    saveTwoMinDrillResult: saveTwoMinDrillResult,
    difficultyTier: difficultyTier,
    getVariant: getVariant,
    buildTwSweepVariant: buildTwSweepVariant,
    renderCardDiagram: renderCardDiagram,
    playCardAnimation: playCardAnimation,
    neighborCalls: neighborCalls,
  };

  init();
})();
