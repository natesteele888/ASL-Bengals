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
   - Difficulty: full mix from play one (no easy->hard ramp, matches
     real end-of-half chaos) -- PLUS: "bonus for multiple correct in
     a row" (see STREAK below) and "big gain and get out of bounds"
     (see BIG PLAY below, which also protects clock time).

   THIS IS A STANDALONE TEST PAGE, not wired into the live app's nav
   yet ("create this in a standalone test environment that can be
   added later"). It deliberately avoids the real login/Firebase auth
   path so it's safe to try without touching production accounts --
   it fetches data/plays.json directly (same public file the rest of
   the app treats as the source of truth for shipped defaults) and,
   for the real hand-signal photos, reads Firebase's public
   dev2PlayData/cards.json the same way index.html's boot() does,
   falling back to plain text signal cards if that's unreachable so
   the drill still works with zero network dependencies. No results
   are written to the cloud -- personal-best/longest-streak are kept
   in localStorage only, scoped to this page, so testing this never
   touches real player records. Folding this into the real app later
   (own tab, real login gate, cloud stats) is a follow-up step once
   Nathan's happy with how it plays.

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

  function getVariant(playType, direction, insideOutside, readPosition, counterOn) {
    let v = playType.directions[direction];
    if (playType.hasInsideOutside) v = v[insideOutside || 'Outside'];
    if (playType.hasReadToggle) v = v[readPosition || 'A'];
    if (playType.hasCounter) v = v[counterOn ? 'Counter' : 'Normal'];
    return v;
  }

  // ---- Render a call's diagram into its SVG stage ----
  // Copied from play-calls.js's renderCardDiagram (same name kept for
  // easy diffing against the original). DATA is the module-level
  // object populated in SECTION 4 below.
  let DATA = null;
  function renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition, counterOn) {
    stage.innerHTML = '';
    const playType = DATA.playTypes.find(p => p.key === playKey);
    const variant = getVariant(playType, direction, insideOutside, readPosition, counterOn);
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
  async function playCardAnimation(stage, playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition, counterOn) {
    if (isPlayingRef.value) return;
    isPlayingRef.value = true;
    renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition, counterOn);

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
  // SECTION 2: signal-sequence builder
  // (copied from js/play-calls.js's buildSignalSequence + its
  // supporting constants/random-finger-id logic -- self-contained,
  // only needs DATA.playTypes and the SIGNAL_CARDS map built below)
  // ================================================================
  let SIGNAL_CARDS = {};
  const PLAY_TYPE_SIGNAL_ID = {
    inside_zone: 9, outside_zone: 10, option: 15, option_pass: 16, blast: 13, double_blast: 14, sweep: 17,
  };
  const PLAY_TYPE_SIGNAL_LABEL = {
    inside_zone: 'Inside Zone', outside_zone: 'Outside Zone', option: 'Option',
    option_pass: 'Option Pass', blast: 'Blast', double_blast: 'Double Blast', sweep: 'Sweep',
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

  function randomFingerId(side, exclude) {
    const pool = side === 'Right' ? FINGER_RIGHT_IDS : FINGER_LEFT_IDS;
    const options = exclude !== undefined ? pool.filter(id => id !== exclude) : pool;
    return options[Math.floor(Math.random() * options.length)];
  }

  function buildSignalSequence(playKey, wingSide, direction, insideOutside, motionOn, bootOn, counterOn) {
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
    // Boot and Counter are mutually exclusive (normalizeCall above never
    // sets both), so at most one of these two fires.
    if (bootOn) {
      signals.push({ src: SIGNAL_CARDS[BOOT_SIGNAL_ID], label: 'Boot' });
    }
    if (counterOn) {
      signals.push({ src: SIGNAL_CARDS[COUNTER_SIGNAL_ID], label: 'Counter' });
    }
    return signals;
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
  const ELIGIBLE_PLAY_KEYS = ['inside_zone', 'outside_zone', 'blast', 'double_blast', 'option_pass', 'sweep', 'option'];
  // "Passing plays which are more difficult to call out will gain you
  // more yardage" -- Option Pass is the only real drop-back pass among
  // these 7 plays (Split's Pass toggle is a separate formation this
  // v1 doesn't include yet -- see the note at the end of this file).
  const PASSING_PLAY_KEYS = ['option_pass'];
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
    return { noBoot: !!pt.noBoot, hasInsideOutside: !!pt.hasInsideOutside, hasCounter: !!pt.hasCounter };
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
  // forcing Boot/Counter off when the wing/dir/motion combo makes
  // them illegal) -- used both when generating the correct answer and
  // when generating each multiple-choice decoy, so nothing offered on
  // screen is ever a combo the real Play Calls toggles couldn't
  // actually produce.
  function normalizeCall(call) {
    const flags = playFlags(call.playKey);
    const out = {
      playKey: call.playKey, wingSide: call.wingSide, direction: call.direction,
      motionOn: !!call.motionOn, bootOn: false, counterOn: false, insideOutside: null,
    };
    if (flags.hasInsideOutside) out.insideOutside = call.insideOutside === 'Inside' ? 'Inside' : 'Outside';
    const eligibleForCounter = flags.hasCounter && effectiveWingSide(out) === out.direction;
    if (call.counterOn && eligibleForCounter) {
      out.counterOn = true;
    } else if (call.bootOn && !flags.noBoot) {
      out.bootOn = true;
    }
    return out;
  }

  function describeCall(call) {
    const parts = [`Wing ${call.wingSide}`];
    if (call.motionOn) parts.push('Motion');
    if (call.insideOutside) parts.push(call.insideOutside);
    parts.push(playLabel(call.playKey));
    parts.push(call.direction);
    if (call.bootOn) parts.push('Boot');
    if (call.counterOn) parts.push('Counter');
    return parts.join(' ');
  }
  function callKey(call) {
    return [call.playKey, call.wingSide, call.direction, call.motionOn, call.bootOn, call.counterOn, call.insideOutside].join('|');
  }

  function randomSide() { return Math.random() < 0.5 ? 'Left' : 'Right'; }

  // "Full mix from play one" (Nathan's answer) -- every play, every
  // modifier, right from the first snap. No easy->hard ramp.
  function generateCorrectCall() {
    const playKey = ELIGIBLE_PLAY_KEYS[Math.floor(Math.random() * ELIGIBLE_PLAY_KEYS.length)];
    const flags = playFlags(playKey);
    const raw = {
      playKey: playKey,
      wingSide: randomSide(),
      direction: randomSide(),
      motionOn: Math.random() < 0.45,
      insideOutside: flags.hasInsideOutside ? (Math.random() < 0.5 ? 'Inside' : 'Outside') : null,
      // Offer Counter about 1/3 of the time it's even legal, Boot
      // about 1/3 of the time otherwise -- normalizeCall sorts out
      // legality and the Boot/Counter exclusivity either way.
      counterOn: flags.hasCounter && Math.random() < 0.35,
      bootOn: !flags.noBoot && Math.random() < 0.35,
    };
    return normalizeCall(raw);
  }

  // One-attribute "neighbor" mutations of a legal call, each
  // re-normalized so it's still a combo the real toggles could
  // produce -- this is the "close to try and fool them" part.
  function neighborCalls(call) {
    const flags = playFlags(call.playKey);
    const candidates = [];
    candidates.push(normalizeCall(Object.assign({}, call, { wingSide: oppositeSide(call.wingSide) })));
    candidates.push(normalizeCall(Object.assign({}, call, { direction: oppositeSide(call.direction) })));
    candidates.push(normalizeCall(Object.assign({}, call, { motionOn: !call.motionOn })));
    if (flags.hasInsideOutside) {
      candidates.push(normalizeCall(Object.assign({}, call, { insideOutside: call.insideOutside === 'Inside' ? 'Outside' : 'Inside' })));
    }
    if (!flags.noBoot) {
      candidates.push(normalizeCall(Object.assign({}, call, { bootOn: !call.bootOn, counterOn: false })));
    }
    if (flags.hasCounter) {
      candidates.push(normalizeCall(Object.assign({}, call, { counterOn: !call.counterOn, bootOn: false })));
    }
    (SIBLING_PLAY_KEYS[call.playKey] || []).forEach(siblingKey => {
      const siblingFlags = playFlags(siblingKey);
      candidates.push(normalizeCall({
        playKey: siblingKey, wingSide: call.wingSide, direction: call.direction, motionOn: call.motionOn,
        insideOutside: siblingFlags.hasInsideOutside ? (call.insideOutside || (Math.random() < 0.5 ? 'Inside' : 'Outside')) : null,
        bootOn: call.bootOn, counterOn: call.counterOn,
      }));
    });
    return candidates;
  }

  // Correct call + 3 legal, distinct, "close" decoys, shuffled.
  function generateChoices(correctCall) {
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
    const decoys = pool.slice(0, 3);
    // Fallback: if this play's flags don't yield enough distinct
    // single-attribute neighbors (rare -- e.g. Option has few
    // togglable extras), top up with fresh independent random calls
    // instead of ever showing fewer than 4 options.
    let guard = 0;
    while (decoys.length < 3 && guard < 40) {
      guard++;
      const fresh = generateCorrectCall();
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
      Object.entries(pt.directions || {}).forEach(([dirKey, dirVal]) => {
        const variants = (dirVal.paths) ? [dirVal] : Object.values(dirVal);
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

  async function loadData() {
    let plays;
    try {
      plays = await (await fetchWithTimeout('data/plays.json')).json();
    } catch (e) {
      // This one's NOT optional -- there's no play data at all without it --
      // so surface it clearly instead of leaving init()'s generic catch to
      // guess, and re-throw so init() still shows the loading note as an
      // error and leaves Start Drive correctly disabled (nothing to play).
      throw new Error('Could not load data/plays.json (' + e.message + ')');
    }
    DATA = plays;

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
      };
      SHIPPED_PLAY_TYPES_BY_KEY[pt.key] = pt;
      Object.entries(pt.directions || {}).forEach(([dirKey, dirVal]) => {
        const variants = dirVal.paths ? [dirVal] : Object.values(dirVal);
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
      const editsUrl = (typeof window.firebaseAuthed === 'function')
        ? await window.firebaseAuthed(`${FIREBASE_DB_URL}/playEdits.json`)
        : `${FIREBASE_DB_URL}/playEdits.json`;
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

    try {
      const res = await fetchWithTimeout(`${FIREBASE_DB_URL}/dev2PlayData/cards.json`);
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

  const state = {
    clockMs: CLOCK_START_MS,
    clockPausedUntil: 0,
    running: false,
    fieldPos: START_FIELD_POS,
    score: 0, // touchdowns
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    totalYards: 0,
    roundActive: false,
    currentCorrectCall: null,
  };

  function randRange(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

  // "Passing plays which are more difficult to call out will gain you
  // more yardage" + "bonus for multiple correct in a row" + "big gain
  // and get out of bounds" (all from Nathan) combined into one result:
  function resolveGain(call) {
    const isPass = PASSING_PLAY_KEYS.includes(call.playKey);
    const base = isPass ? randRange(11, 22) : randRange(4, 9);
    const streakBonus = Math.min(state.streak * 2, 16); // streak counted AFTER this play increments it, see below
    const bigPlayChance = (isPass ? 0.22 : 0.12) + Math.min(state.streak * 0.02, 0.15);
    const bigPlay = Math.random() < bigPlayChance;
    const bigYards = bigPlay ? randRange(15, 35) : 0;
    return {
      isPass: isPass,
      baseYards: base,
      streakBonus: streakBonus,
      bigPlay: bigPlay,
      bigYards: bigYards,
      totalYards: base + streakBonus + bigYards,
      // Out of bounds "stops the clock" -- implemented as a brief
      // window where the master countdown just doesn't tick, rather
      // than literally adding time back (see tickClock below).
      clockPauseMs: bigPlay ? randRange(3000, 6000) : 0,
    };
  }

  // ================================================================
  // SECTION 6: DOM wiring
  // ================================================================
  const el = {
    startScreen: document.getElementById('startScreen'),
    startBtn: document.getElementById('startBtn'),
    gameScreen: document.getElementById('gameScreen'),
    endScreen: document.getElementById('endScreen'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    endSummary: document.getElementById('endSummary'),
    hudClock: document.getElementById('hudClock'),
    hudScore: document.getElementById('hudScore'),
    hudStreak: document.getElementById('hudStreak'),
    hudFieldPos: document.getElementById('hudFieldPos'),
    fieldMarker: document.getElementById('fieldMarker'),
    fieldMarkerLabel: document.getElementById('fieldMarkerLabel'),
    getReadyEl: document.getElementById('getReadyEl'),
    signalImg: document.getElementById('signalImg'),
    signalTextCard: document.getElementById('signalTextCard'),
    signalProgress: document.getElementById('signalProgress'),
    choicesGrid: document.getElementById('choicesGrid'),
    resultBanner: document.getElementById('resultBanner'),
    playDiagramWrap: document.getElementById('playDiagramWrap'),
    playDiagramSvg: document.getElementById('playDiagramSvg'),
    loadingNote: document.getElementById('loadingNote'),
  };

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
  }

  let clockTimer = null;
  function startClock() {
    let last = performance.now();
    clockTimer = setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      if (now < state.clockPausedUntil) { updateHud(); return; }
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

  function showBanner(text, cls, holdMs) {
    el.resultBanner.textContent = text;
    el.resultBanner.className = 'twoMinBanner show ' + cls;
    return wait(holdMs).then(() => {
      el.resultBanner.className = 'twoMinBanner';
    });
  }

  const GET_READY_MS = 900;
  const BASE_STEP_MS = 900, EXTRA_MS_PER_SIGNAL = 100;

  function playSignals(signals) {
    return new Promise(resolve => {
      el.signalProgress.innerHTML = '';
      signals.forEach(() => { const d = document.createElement('div'); d.className = 'dot'; el.signalProgress.appendChild(d); });
      const stepMs = BASE_STEP_MS + Math.max(0, signals.length - 4) * EXTRA_MS_PER_SIGNAL;
      let i = 0;
      function showStep() {
        if (i >= signals.length) { resolve(); return; }
        const sig = signals[i];
        if (sig.src) {
          el.signalImg.src = sig.src;
          el.signalImg.style.display = '';
          el.signalTextCard.style.display = 'none';
        } else {
          el.signalTextCard.textContent = sig.label;
          el.signalTextCard.style.display = '';
          el.signalImg.style.display = 'none';
        }
        [...el.signalProgress.children].forEach((d, idx) => d.classList.toggle('done', idx <= i));
        i++;
        setTimeout(showStep, stepMs);
      }
      el.getReadyEl.style.display = 'flex';
      setTimeout(() => { el.getReadyEl.style.display = 'none'; showStep(); }, GET_READY_MS);
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
    el.playDiagramWrap.style.display = 'block';
    const isPlayingRef = { value: false };
    await playCardAnimation(el.playDiagramSvg, call.playKey, call.direction, call.wingSide, 1, isPlayingRef,
      null, '4x4', call.insideOutside, call.motionOn, call.bootOn, 'A', call.counterOn);
  }

  async function runRound() {
    state.roundActive = true;
    el.playDiagramWrap.style.display = 'none';
    el.choicesGrid.innerHTML = '';

    const correctCall = generateCorrectCall();
    state.currentCorrectCall = correctCall;
    const choices = generateChoices(correctCall);
    const io = correctCall.insideOutside || 'Outside';
    const signals = buildSignalSequence(correctCall.playKey, correctCall.wingSide, correctCall.direction, io, correctCall.motionOn, correctCall.bootOn, correctCall.counterOn);

    await playSignals(signals);
    if (!state.running) return;

    const isCorrectPromise = renderChoices(choices, correctCall);
    const isCorrect = await isCorrectPromise;
    if (!state.running) return;

    if (isCorrect) {
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.correctCount++;
      const gain = resolveGain(correctCall);
      state.totalYards += gain.totalYards;
      state.fieldPos += gain.totalYards;
      if (gain.clockPauseMs) state.clockPausedUntil = performance.now() + gain.clockPauseMs;

      await playGainAnimation(correctCall);
      // The clock keeps ticking in the background through all of the
      // above (that's the whole "2 minute drill" point) -- it can hit
      // 0 and trigger endGame() mid-animation. Once that's happened,
      // nothing from this in-flight round should touch state or the
      // HUD any further, or a touchdown/gain resolving a beat late
      // could increment the score (and repaint the live HUD) AFTER
      // the end screen already rendered its now-stale summary.
      if (!state.running) return;

      const scored = state.fieldPos >= 100;
      if (scored) state.fieldPos = 100;
      updateHud();

      if (gain.bigPlay) {
        await showBanner(`💥 BREAKS FREE! +${gain.totalYards} YDS — OUT OF BOUNDS!`, 'good big', 1700);
      } else {
        await showBanner(`GAIN! +${gain.totalYards} YDS`, 'good', 1300);
      }
      if (!state.running) return;

      if (scored) {
        state.score++;
        updateHud();
        await showBanner('🏈 TOUCHDOWN!', 'touchdown', 2000);
        if (!state.running) return;
        state.fieldPos = START_FIELD_POS;
        updateHud();
      }
    } else {
      state.streak = 0;
      state.wrongCount++;
      state.fieldPos = Math.max(1, state.fieldPos - PENALTY_YARDS);
      updateHud();
      await showBanner(`FALSE START! -${PENALTY_YARDS} YDS`, 'bad', 1400);
      if (!state.running) return;
    }

    state.roundActive = false;
    if (state.running) runRound();
  }

  function endGame() {
    if (!state.running) return;
    state.running = false;
    stopClock();
    // The clock can hit 0 while a result banner is still mid-hold
    // (its own wait(holdMs) hasn't resolved yet) -- without this it
    // stays visible, floating over the end screen until that timer
    // finally clears it. Force it gone immediately instead.
    el.resultBanner.className = 'twoMinBanner';
    el.gameScreen.style.display = 'none';
    el.endScreen.style.display = '';
    const maxScore = state.correctCount + state.wrongCount;
    el.endSummary.innerHTML = `
      <div class="twoMinEndStat">🏈 Touchdowns: <b>${state.score}</b></div>
      <div class="twoMinEndStat">Total yards gained: <b>${state.totalYards}</b></div>
      <div class="twoMinEndStat">Yards lost to penalties: <b>${state.wrongCount * PENALTY_YARDS}</b></div>
      <div class="twoMinEndStat">Calls correct: <b>${state.correctCount}</b> / ${maxScore || 0}</div>
      <div class="twoMinEndStat">False starts: <b>${state.wrongCount}</b></div>
      <div class="twoMinEndStat">Best streak: <b>${state.bestStreak}</b></div>
    `;
    try {
      const bestTds = Number(localStorage.getItem('twoMinDrillBestTDs') || 0);
      const bestStreak = Number(localStorage.getItem('twoMinDrillBestStreak') || 0);
      if (state.score > bestTds) localStorage.setItem('twoMinDrillBestTDs', String(state.score));
      if (state.bestStreak > bestStreak) localStorage.setItem('twoMinDrillBestStreak', String(state.bestStreak));
    } catch (e) { /* localStorage unavailable -- fine, just no persisted best */ }
  }

  function startGame() {
    Object.assign(state, {
      clockMs: CLOCK_START_MS, clockPausedUntil: 0, running: true, fieldPos: START_FIELD_POS,
      score: 0, streak: 0, bestStreak: 0, correctCount: 0, wrongCount: 0, totalYards: 0,
      roundActive: false, currentCorrectCall: null,
    });
    el.startScreen.style.display = 'none';
    el.endScreen.style.display = 'none';
    el.gameScreen.style.display = '';
    updateHud();
    startClock();
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

  // Exposes internals for automated testing (headless smoke tests) --
  // same spirit as window.__pcqTestHooks in play-calls-quiz.js.
  // Harmless in normal play, just a debug hook.
  window.__twoMinDrillTestHooks = {
    getState: function () { return state; },
    describeCall: describeCall,
    callKey: callKey,
    forceClockMs: function (ms) { state.clockMs = ms; },
    buildSignalSequence: buildSignalSequence,
  };

  init();
})();
