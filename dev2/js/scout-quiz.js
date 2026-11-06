// Scout quizzes -- Nathan (2026-11-06): "a couple quick quizzes for the kids
// ... Just like the signal ones but recognizing formations and saying whether
// defense should be in Cover 2 or Cover 3. Then another quiz about play calls,
// show the formation without the lines and have the player show where the
// ball is going. Right or Wrong answers then show the correct path."
//
// Both quizzes run off the opponent's scout pack (js/scout-diagrams.js), so
// no scouting data lives in this file -- it is drawn from whatever pack a
// coach imported, behind the login.
//
// 1. Coverage Call: a formation is shown without its name; pick Cover 2 or
//    Nightmare (Cover 3). The answer key is the formation's `tag` -- a tag
//    with "Nightmare" in it is Cover 3, anything else is Cover 2. Formations
//    with no tag are left out.
// 2. Where's the Ball?: a formation is shown; tap every lane they have run
//    to from it, then Check. The lane of a run is where its ball carrier's
//    arrow ends. The hand-drawn sheets don't mark the carrier, so a run counts
//    only when every arrow out of the backfield ends in the same lane (a fake
//    or a roll is left out). Passes are left out for the same reason.
(function () {
  'use strict';

  var ORANGE = '#ff7a1a', GREEN = '#1f9d3a', RED = '#d62020';
  // Everyone without the ball (lead blockers, fakes, blocks) draws gray, so
  // the ball carrier's colored line is the only one that stands out.
  var GRAY = '#7a7a7a';
  var GRAD = 'linear-gradient(180deg,#fff 0%,' + ORANGE + ' 85%)';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function isNightmare(tag) { return /nightmare/i.test(tag || ''); }

  // ---- Lanes, in the pack's own units (100 = one lineman gap, center at 0).
  // Drawn from the defense's side, so left/right are as the kid sees it.
  var LANES = [
    { key: 'L2', label: 'Outside', min: -Infinity, max: -350 },
    { key: 'L1', label: 'Off tackle', min: -350, max: -110 },
    { key: 'M', label: 'Middle', min: -110, max: 110 },
    { key: 'R1', label: 'Off tackle', min: 110, max: 350 },
    { key: 'R2', label: 'Outside', min: 350, max: Infinity },
  ];
  function laneOf(x) {
    for (var i = 0; i < LANES.length; i++) if (x >= LANES[i].min && x < LANES[i].max) return LANES[i].key;
    return 'M';
  }
  function laneName(key) {
    var side = key.charAt(0) === 'L' ? 'left ' : key.charAt(0) === 'R' ? 'right ' : '';
    var l = LANES.filter(function (x) { return x.key === key; })[0];
    return side + l.label.toLowerCase();
  }

  // Index of the player a route starts from (nearest circle to its first point).
  function startPlayer(d, r) {
    var p = r.pts[0], best = -1, bd = Infinity;
    (d.players || []).forEach(function (q, i) {
      var dd = (q.x - p[0]) * (q.x - p[0]) + (q.y - p[1]) * (q.y - p[1]);
      if (dd < bd) { bd = dd; best = i; }
    });
    return best;
  }
  // The arrows that could be the ball: an arrow ('a') out of a player who is
  // not on the line. Returns { lane, routes } or null when they disagree.
  function ballAnswer(d) {
    // Nathan (2026-11-06): a coach can mark the ball carrier (`ball: true` on
    // that route, set in the formation picker). That always wins.
    var marked = (d.routes || []).filter(function (r) { return r.ball && r.end === 'a'; });
    if (marked.length) {
      var m = marked[marked.length - 1];
      return { lane: laneOf(m.pts[m.pts.length - 1][0]), routes: [m] };
    }
    var carriers = (d.routes || []).filter(function (r) {
      var i = startPlayer(d, r);
      return r.end === 'a' && i >= 0 && !d.players[i].line;
    });
    if (!carriers.length) return null;
    var lanes = carriers.map(function (r) { return laneOf(r.pts[r.pts.length - 1][0]); });
    if (lanes.some(function (l) { return l !== lanes[0]; })) return null;
    return { lane: lanes[0], routes: carriers };
  }

  function viewBoxOf(svgStr) {
    var m = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svgStr);
    return m ? m.slice(1).map(Number) : null;
  }

  // ---- Shared look ----
  function btn(label, attrs, style) {
    return '<button type="button" ' + attrs + ' style="display:block;width:100%;margin:6px 0;padding:14px 12px;border:0;border-radius:12px;' +
      'font-size:17px;font-weight:900;cursor:pointer;' + (style || 'background:#111;color:#fff;') + '">' + label + '</button>';
  }
  function callBtnStyle(nightmare) {
    return nightmare
      ? 'background:#000;color:' + ORANGE + ';'
      : 'background:' + GRAD + ';color:#000;box-shadow:inset 0 0 0 2px ' + ORANGE + ';';
  }
  function card(inner) {
    return '<div style="border:2px solid #ddd;border-radius:10px;overflow:hidden;background:#fff;margin:8px 0;">' + inner + '</div>';
  }
  function header(title, round, total, score) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 2px 2px;font-weight:900;">' +
      '<span style="font-size:15px;">' + esc(title) + '</span>' +
      '<span style="font-size:13px;opacity:.75;">' + round + ' of ' + total + ' · ' + score + ' right</span></div>' +
      '<div style="height:6px;background:#eee;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + Math.round((round - 1) / total * 100) + '%;background:' + ORANGE + ';"></div></div>';
  }
  function verdict(ok, text) {
    return '<div style="margin:8px 0;padding:10px 12px;border-radius:10px;font-weight:800;font-size:15px;color:#fff;background:' + (ok ? GREEN : RED) + ';">' +
      (ok ? '✅ Right! ' : '❌ Not quite. ') + text + '</div>';
  }
  function finish(el, title, score, total, again, back) {
    var pct = total ? Math.round(score / total * 100) : 0;
    var msg = pct === 100 ? 'Perfect! You know their offense cold.' : pct >= 80 ? 'Great work. Run it again to get them all.' : 'Keep studying their offense and try again.';
    el.innerHTML = card('<div style="padding:22px 14px;text-align:center;">' +
      '<div style="font-size:15px;font-weight:900;opacity:.7;">' + esc(title) + '</div>' +
      '<div style="font-size:46px;font-weight:900;margin:6px 0;">' + score + ' / ' + total + '</div>' +
      '<div style="font-size:15px;">' + msg + '</div></div>') +
      btn('Try again', 'data-sq="again"') + btn('Back to quizzes', 'data-sq="back"', 'background:#eee;color:#111;');
    el.querySelector('[data-sq="again"]').onclick = again;
    el.querySelector('[data-sq="back"]').onclick = back;
    if (typeof opts.onFinish === 'function') opts.onFinish({ quiz: title, score: score, total: total });
  }
  var opts = {};

  // ---- Quiz 1: Coverage Call ----
  function coverageQuiz(el, pack, back) {
    var pool = (pack.diagrams || []).filter(function (d) { return d.cat === 'formation' && d.tag; });
    var rounds = shuffle(pool), i = 0, score = 0, TITLE = 'Coverage Call';
    function ask() {
      if (i >= rounds.length) return finish(el, TITLE, score, rounds.length, function () { coverageQuiz(el, pack, back); }, back);
      var d = rounds[i];
      el.innerHTML = header(TITLE, i + 1, rounds.length, score) +
        '<div style="margin:10px 2px 0;font-size:15px;font-weight:800;">What do we call against this look?</div>' +
        card('<div style="padding:4px 0;">' + window.ScoutDiagramSvg(d) + '</div>') +
        btn('Cover 2', 'data-call="c2"', callBtnStyle(false)) +
        btn('Nightmare (Cover 3)', 'data-call="c3"', callBtnStyle(true)) +
        '<div id="sqResult"></div>';
      el.querySelectorAll('[data-call]').forEach(function (b) {
        b.onclick = function () {
          var pickedC3 = b.dataset.call === 'c3', right = pickedC3 === isNightmare(d.tag);
          if (right) score++;
          el.querySelectorAll('[data-call]').forEach(function (x) {
            x.disabled = true;
            x.style.opacity = (x.dataset.call === 'c3') === isNightmare(d.tag) ? '1' : '.35';
          });
          el.querySelector('#sqResult').innerHTML =
            verdict(right, 'That is <b>' + esc(d.name) + '</b>: ' + esc(d.tag) + '.') +
            btn(i + 1 < rounds.length ? 'Next' : 'See score', 'data-sq="next"');
          el.querySelector('[data-sq="next"]').onclick = function () { i++; ask(); };
        };
      });
    }
    ask();
  }

  // ---- Quiz 2: Where's the Ball? (formation tendencies) ----
  // Nathan (2026-11-06): the same formation runs to different places, so a
  // single answer per run was a guess. Instead: show one formation and tap
  // EVERY lane they have run to from it, then Check. The reveal draws all of
  // their runs from that look in red.
  //
  // The sheets don't say which formation each run comes from, so each run is
  // matched to the closest formation drawing (mirrored if that fits better,
  // with its lane flipped to match). A run can name its formation outright
  // with `formation` (the formation's name) and `mirror` (true/false), which
  // overrides the match.
  function matchCost(a, b, m) {
    function nn(A, B, ma, mb) {
      return A.reduce(function (s, q) {
        return s + Math.min.apply(null, B.map(function (r) { return Math.hypot(ma * q.x - mb * r.x, q.y - r.y); }));
      }, 0);
    }
    return (nn(a, b, m, 1) + nn(b, a, 1, m)) / (a.length + b.length);
  }
  // Nathan (2026-11-06): "the lines should be nice and smooth and
  // consistent." The run sheets are hand-traced, so each path is redrawn
  // as one clean stroke: a straight line when it is close to straight,
  // otherwise a single smooth bend through its midpoint.
  function smoothPts(p) {
    if (p.length < 3) return p;
    var segs = [0], total = 0;
    for (var j = 1; j < p.length; j++) { total += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]); segs.push(total); }
    function at(f) {
      var want = total * f;
      for (var j = 1; j < p.length; j++) {
        if (segs[j] >= want) {
          var t = (want - segs[j - 1]) / ((segs[j] - segs[j - 1]) || 1);
          return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * t, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * t];
        }
      }
      return p[p.length - 1];
    }
    var a = p[0], e = p[p.length - 1], m = at(0.5);
    var chord = Math.hypot(e[0] - a[0], e[1] - a[1]) || 1;
    var off = Math.abs((e[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (e[1] - a[1])) / chord;
    if (off < chord * 0.08) return [a, e];
    return [a, at(0.25), m, at(0.75), e];
  }

  function runsByFormation(pack) {
    var forms = (pack.diagrams || []).filter(function (d) { return d.cat === 'formation'; });
    var out = forms.map(function (f) { return { formation: f, runs: [] }; });
    (pack.diagrams || []).forEach(function (r) {
      if (r.cat !== 'run') return;
      var ans = ballAnswer(r);
      if (!ans) return;
      var best = null;
      if (r.formation) {
        out.forEach(function (o) { if (o.formation.name === r.formation) best = { o: o, m: r.mirror ? -1 : 1 }; });
      } else {
        out.forEach(function (o) {
          [1, -1].forEach(function (m) {
            var c = matchCost(r.players || [], o.formation.players || [], m);
            if (!best || c < best.c) best = { o: o, m: m, c: c };
          });
        });
      }
      if (!best) return;
      var lane = ans.lane;
      if (best.m < 0) lane = lane.charAt(0) === 'L' ? 'R' + lane.slice(1) : lane.charAt(0) === 'R' ? 'L' + lane.slice(1) : lane;
      best.o.runs.push({ run: r, lane: lane, mirror: best.m < 0, routes: ans.routes });
    });
    return out.filter(function (o) { return o.runs.length; });
  }

  function ballQuiz(el, pack, back) {
    var rounds = shuffle(runsByFormation(pack)), i = 0, score = 0, TITLE = "Where's the Ball?";
    var cycle = null;
    function stopCycle() { if (cycle) { clearInterval(cycle); cycle = null; } }
    function lanesUsed(g) {
      var set = {};
      g.runs.forEach(function (x) { set[x.lane] = (set[x.lane] || 0) + 1; });
      return set;
    }
    // Formation drawing; on reveal, every run's carrier path from this look.
    // Nathan (2026-11-06): six runs on one look was hard to read, so every
    // lane gets its own color -- the arrows, the lane's tint and its count
    // all match, with a color key under the field.
    var LANE_COLOR = { L2: '#1f5fd6', L1: '#7a3fd1', M: '#0e9a8a', R1: '#d6359b', R2: '#e07b00' };
    // The run sheet's backs don't stand exactly where the formation sheet's
    // do, so a path is slid over to start on the formation's nearest back or
    // receiver (same shape, same direction), then smoothed.
    function placeOn(g, x, r) {
      var pts = r.pts.map(function (q) { return [x.mirror ? -q[0] : q[0], q[1]]; });
      var s0 = pts[0], best = null, bd = Infinity;
      (g.formation.players || []).forEach(function (pl) {
        if (pl.line) return;
        var dd = Math.hypot(pl.x - s0[0], pl.y - s0[1]);
        if (dd < bd) { bd = dd; best = pl; }
      });
      if (best) {
        var dx = best.x - s0[0], dy = best.y - s0[1];
        pts = pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
      }
      return smoothPts(pts);
    }
    // Nathan (2026-11-06): "add the block lines back in for the backs or
    // receivers." Their blocks draw in navy with a bar end. With several runs
    // on screen at once they'd pile up, so blocks show when one run is shown
    // (a direction with one run, each flash frame, or a look with one run).
    function blocksOf(x) {
      return (x.run.routes || []).filter(function (r) {
        var k = startPlayer(x.run, r);
        return r.end === 'b' && k >= 0 && !x.run.players[k].line;
      });
    }
    function othersOf(x) {
      return (x.run.routes || []).filter(function (r) {
        var k = startPlayer(x.run, r);
        return r.end === 'a' && k >= 0 && !x.run.players[k].line && x.routes.indexOf(r) < 0;
      });
    }
    function draw(g, picked, reveal, only, oneRun) {
      var d = JSON.parse(JSON.stringify(g.formation)), colors = [];
      d.labels = [];
      var shown = !reveal ? [] : g.runs.filter(function (x) { return oneRun ? x === oneRun : (!only || x.lane === only); });
      var withBlocks = shown.length === 1;
      d.routes = [].concat.apply([], shown.map(function (x) {
        var blocks = withBlocks ? blocksOf(x).map(function (r) {
          return { pts: placeOn(g, x, r), end: 'b', curve: true, ball: false };
        }).concat(othersOf(x).map(function (r) {
          return { pts: placeOn(g, x, r), end: 'a', curve: true, ball: false };
        })) : [];
        return blocks.concat(x.routes.map(function (r) {
          colors.push(LANE_COLOR[x.lane]);
          return { pts: placeOn(g, x, r), end: 'a', curve: true, ball: true };
        }));
      }));
      var pic = window.ScoutDiagramSvg(d), vb = viewBoxOf(pic), grown = vb.slice();
      // Recolor each run's line and arrow head (drawn in route order) by lane.
      var k = 0;
      pic = pic.replace(/(<path [^>]*stroke=")#e0201a"/g, function (m, a) { return a + colors[k++] + '"'; });
      k = 0;
      pic = pic.replace(/(<polygon [^>]*fill=")#e0201a"/g, function (m, a) { return a + colors[k++] + '"'; });
      pic = pic.replace(/#123a8c/g, GRAY);
      grown[3] += 300;
      pic = pic.replace(/viewBox="[^"]*"/, 'viewBox="' + grown.join(' ') + '"');
      pic = pic.replace(/<(circle|path|polygon|text|line) /g, '<$1 pointer-events="none" ');
      // Lanes go under the formation so the players stay crisp on top.
      return pic.replace(/(<svg [^>]*>)/, '$1' + multiLaneLayer(grown, picked, reveal ? lanesUsed(g) : null));
    }
    function tint(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function multiLaneLayer(vb, picked, used) {
      var x0 = vb[0], y0 = vb[1], w = vb[2], h = vb[3], o = '';
      LANES.forEach(function (l) {
        var a = Math.max(l.min, x0), b = Math.min(l.max, x0 + w), on = !!picked[l.key], fill = 'transparent', col = LANE_COLOR[l.key];
        if (used) {
          if (used[l.key]) fill = tint(col, on ? .2 : .1);
          else if (on) fill = 'rgba(214,32,32,.14)';
        } else if (on) fill = 'rgba(255,122,26,.28)';
        o += '<rect data-lane="' + l.key + '" x="' + a + '" y="' + y0 + '" width="' + (b - a) + '" height="' + h + '" fill="' + fill + '" style="cursor:pointer;"/>';
        if (l.min > -Infinity) o += '<line x1="' + l.min + '" y1="' + y0 + '" x2="' + l.min + '" y2="' + (y0 + h) + '" stroke="#ccc" stroke-width="4" stroke-dasharray="14 14" pointer-events="none"/>';
        var mark = used ? (used[l.key] ? (on ? '✓ ' : '') : (on ? '✗ ' : '')) : (on ? '✓ ' : '');
        o += '<text x="' + ((a + b) / 2) + '" y="' + (y0 + h - 18) + '" font-size="40" font-weight="800" text-anchor="middle" fill="' +
          (used && used[l.key] ? col : used && on ? RED : on ? '#c25200' : '#999') + '" pointer-events="none">' + mark + esc(l.label) + '</text>';
        if (used && used[l.key]) o += '<text x="' + ((a + b) / 2) + '" y="' + (y0 + h - 72) + '" font-size="56" font-weight="900" text-anchor="middle" fill="' + col + '" pointer-events="none">' + used[l.key] + 'x</text>';
      });
      return o;
    }
    // Color key under the field: one chip per lane they ran to, plus a note
    // for any lane the player missed.
    // Nathan (2026-11-06): tap a chip to see only that direction's runs; tap
    // it again (or All) to see them all.
    function keyHtml(used, picked, only) {
      var lanes = LANES.filter(function (l) { return used[l.key]; });
      var chip = function (key, label, col, active) {
        return '<button type="button" data-only="' + key + '" style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;cursor:pointer;' +
          'border:2px solid ' + (active ? col : 'transparent') + ';background:' + (active ? '#fff' : tint(col, .12)) + ';color:' + col + ';font-size:13px;font-weight:900;">' + label + '</button>';
      };
      return '<div style="font-size:12px;font-weight:800;opacity:.6;margin:8px 2px 2px;">Tap a direction to see only those runs</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:2px 0;">' +
        (lanes.length > 1 ? chip('', 'All ' + Object.keys(used).reduce(function (n, k) { return n + used[k]; }, 0), '#111111', !only) : '') +
        lanes.map(function (l) {
          var col = LANE_COLOR[l.key];
          return chip(l.key, '<span style="width:12px;height:12px;border-radius:50%;background:' + col + ';"></span>' +
            esc(laneName(l.key).replace(/^./, function (c) { return c.toUpperCase(); })) + ' ' + used[l.key] + 'x' + (picked[l.key] ? '' : ' · missed'), col, only === l.key);
        }).join('') + '</div>';
    }
    function ask() {
      if (i >= rounds.length) return finish(el, TITLE, score, rounds.length, function () { ballQuiz(el, pack, back); }, back);
      var g = rounds[i], picked = {}, used = lanesUsed(g);
      el.innerHTML = header(TITLE, i + 1, rounds.length, score) +
        '<div style="margin:10px 2px 0;font-size:15px;font-weight:800;">Tap every lane they run to from this look, then Check.</div>' +
        card('<div id="sqField" style="padding:4px 0;"></div>') +
        '<div id="sqResult">' + btn('Check', 'data-sq="check"', 'background:#111;color:#fff;opacity:.4;') + '</div>';
      var field = el.querySelector('#sqField'), check = el.querySelector('[data-sq="check"]');
      function paint() {
        field.innerHTML = draw(g, picked, false);
        field.querySelectorAll('[data-lane]').forEach(function (r) {
          r.addEventListener('click', function () {
            var k = r.getAttribute('data-lane');
            if (picked[k]) delete picked[k]; else picked[k] = true;
            check.style.opacity = Object.keys(picked).length ? '1' : '.4';
            paint();
          });
        });
      }
      paint();
      check.onclick = function () {
        if (!Object.keys(picked).length) return;
        var keys = LANES.map(function (l) { return l.key; });
        var right = keys.every(function (k) { return !!picked[k] === !!used[k]; });
        if (right) score++;
        var verdictHtml = verdict(right, '<b>' + esc(g.formation.name) + '</b>: ' + g.runs.length + ' run' + (g.runs.length === 1 ? '' : 's') + ' drawn.');
        // Nathan (2026-11-06): when one direction has several runs, flash
        // between them -- each shows for 2 seconds, then fades to the next.
        function showRuns(only) {
          stopCycle();
          var inLane = only ? g.runs.filter(function (x) { return x.lane === only; }) : [];
          if (inLane.length > 1) {
            // Players and lanes stay put; only each run's arrows fade in and out.
            var base = draw(g, picked, true, only, { none: true }), vb = viewBoxOf(base);
            field.innerHTML = '<div style="position:relative;">' + base + inLane.map(function (x, n) {
              var one = draw(g, picked, true, only, x);
              var arrows = (one.match(/<path [^>]*\/>/g) || []).join('') +
                (one.match(/<circle [^>]*\/>|<text [^>]*font-size="40" font-weight="900"[^>]*>C<\/text>/g) || []).join('') +
                (one.match(/<polygon [^>]*\/>|<line [^>]*transform="[^"]*"[^>]*\/>/g) || []).join('');
              return '<svg data-frame viewBox="' + vb.join(' ') + '" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:' + (n ? 0 : 1) + ';transition:opacity .45s ease;">' + arrows + '</svg>';
            }).join('') +
              '<div data-frame-label style="position:absolute;top:6px;left:8px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.9);font-size:12px;font-weight:900;color:' + LANE_COLOR[only] + ';"></div></div>';
            var frames = field.querySelectorAll('[data-frame]'), label = field.querySelector('[data-frame-label]'), at = 0;
            var setLabel = function () { label.textContent = inLane[at].run.name + ' · ' + (at + 1) + ' of ' + inLane.length; };
            setLabel();
            cycle = setInterval(function () {
              if (!field.isConnected) return stopCycle();
              frames[at].style.opacity = 0;
              at = (at + 1) % frames.length;
              frames[at].style.opacity = 1;
              setLabel();
            }, 2450);
          } else {
            field.innerHTML = draw(g, picked, true, only);
          }
          el.querySelector('#sqResult').innerHTML = verdictHtml + keyHtml(used, picked, only) +
            btn(i + 1 < rounds.length ? 'Next' : 'See score', 'data-sq="next"');
          el.querySelectorAll('[data-only]').forEach(function (c) {
            c.onclick = function () { var k = c.dataset.only; showRuns(k && k !== only ? k : ''); };
          });
          el.querySelector('[data-sq="next"]').onclick = function () { stopCycle(); i++; ask(); };
        }
        showRuns('');
      };
    }
    ask();
  }

  // ---- Shared by the two pass quizzes ----
  // Which formation drawing a play comes from: the closest one, mirrored if
  // that fits better. A play can name it with `formation` / `mirror`.
  function formationOf(forms, d) {
    var best = null;
    if (d.formation) {
      forms.forEach(function (f) { if (f.name === d.formation) best = { f: f, m: d.mirror ? -1 : 1 }; });
      if (best) return best;
    }
    forms.forEach(function (f) {
      [1, -1].forEach(function (m) {
        var c = matchCost(d.players || [], f.players || [], m);
        if (!best || c < best.c) best = { f: f, m: m, c: c };
      });
    });
    return best;
  }
  // Slide a play's route onto the formation drawing (mirrored if needed): it
  // starts on the formation's nearest player of the same kind (on the line or
  // off it), keeps its shape, and is smoothed.
  function slideOnto(form, mirror, d, r) {
    var pts = r.pts.map(function (q) { return [mirror ? -q[0] : q[0], q[1]]; });
    var k = startPlayer(d, r), onLine = k >= 0 && !!d.players[k].line, s0 = pts[0], best = null, bd = Infinity;
    (form.players || []).forEach(function (pl) {
      if (!!pl.line !== onLine) return;
      var dd = Math.hypot(pl.x - s0[0], pl.y - s0[1]);
      if (dd < bd) { bd = dd; best = pl; }
    });
    if (best) pts = pts.map(function (q) { return [q[0] + best.x - s0[0], q[1] + best.y - s0[1]]; });
    return smoothPts(pts);
  }
  // Arrows a receiver (or back) runs past the line on a pass play.
  function passRoutes(d) {
    return (d.routes || []).filter(function (r) { return r.end === 'a' && r.pts[r.pts.length - 1][1] > 0; });
  }
  // The arrows that show where a run goes: the carrier's when the sheet makes
  // that clear, otherwise every backfield arrow.
  function runRoutes(d) {
    var a = ballAnswer(d);
    if (a) return a.routes;
    return (d.routes || []).filter(function (r) { var k = startPlayer(d, r); return r.end === 'a' && k >= 0 && !d.players[k].line; });
  }
  // Draw a formation with some routes, each in its own color, at a fixed
  // viewBox, with an optional layer under the players. Players stay crisp on
  // top and ignore taps, so a layer underneath can take them.
  function drawWith(form, routes, colors, vb, under) {
    var d = JSON.parse(JSON.stringify(form));
    d.labels = []; d.tag = null;
    d.routes = routes.map(function (r) { return { pts: r.pts, end: r.end || 'a', curve: true, ball: true }; });
    var heads = [], bars = [];
    routes.forEach(function (r, n) { ((r.end || 'a') === 'b' ? bars : heads).push(colors[n]); });
    var pic = window.ScoutDiagramSvg(d), k = 0;
    pic = pic.replace(/(<path [^>]*stroke=")#e0201a"/g, function (m, a) { return a + colors[k++] + '"'; });
    k = 0;
    pic = pic.replace(/(<polygon [^>]*fill=")#e0201a"/g, function (m, a) { return a + heads[k++] + '"'; });
    k = 0;
    pic = pic.replace(/(<line transform="[^"]*"[^>]*stroke=")#e0201a"/g, function (m, a) { return a + bars[k++] + '"'; });
    if (vb) pic = pic.replace(/viewBox="[^"]*"/, 'viewBox="' + vb.join(' ') + '"');
    pic = pic.replace(/<(circle|path|polygon|text|line) /g, '<$1 pointer-events="none" ');
    return under ? pic.replace(/(<svg [^>]*>)/, '$1' + under) : pic;
  }
  // Flash between several plays: the base (players) stays, each play's
  // arrows fade in for 2 seconds, then the next. Returns a stop function.
  function flashPlays(field, base, frames, labels, color) {
    var vb = viewBoxOf(base);
    field.innerHTML = '<div style="position:relative;">' + base + frames.map(function (svgStr, n) {
      var arrows = (svgStr.match(/<path [^>]*\/>/g) || []).join('') +
        (svgStr.match(/<circle [^>]*\/>|<text [^>]*font-size="40" font-weight="900"[^>]*>C<\/text>/g) || []).join('') +
        (svgStr.match(/<polygon [^>]*\/>|<line [^>]*transform="[^"]*"[^>]*\/>/g) || []).join('');
      return '<svg data-frame viewBox="' + vb.join(' ') + '" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:' + (n ? 0 : 1) + ';transition:opacity .45s ease;">' + arrows + '</svg>';
    }).join('') +
      '<div data-frame-label style="position:absolute;top:6px;left:8px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.9);font-size:12px;font-weight:900;color:' + color + ';"></div></div>';
    var els = field.querySelectorAll('[data-frame]'), label = field.querySelector('[data-frame-label]'), at = 0;
    label.textContent = labels[0];
    var t = setInterval(function () {
      if (!field.isConnected) { clearInterval(t); return; }
      els[at].style.opacity = 0;
      at = (at + 1) % els.length;
      els[at].style.opacity = 1;
      label.textContent = labels[at];
    }, 2450);
    return function () { clearInterval(t); };
  }
  function chipRow(chips, active) {
    return '<div style="font-size:12px;font-weight:800;opacity:.6;margin:8px 2px 2px;">Tap to see only those plays</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:2px 0;">' + chips.map(function (c) {
        var on = c.key === active;
        return '<button type="button" data-only="' + c.key + '" style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;cursor:pointer;' +
          'border:2px solid ' + (on ? c.color : 'transparent') + ';background:' + (on ? '#fff' : tint(c.color, .12)) + ';color:' + c.color + ';font-size:13px;font-weight:900;">' +
          (c.dot ? '<span style="width:12px;height:12px;border-radius:50%;background:' + c.color + ';"></span>' : '') + c.label + '</button>';
      }).join('') + '</div>';
  }
  function tint(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function grownBox(vb, minBottom) {
    var g = vb.slice(), bottom = g[1] + g[3];
    if (bottom < minBottom) g[3] = minBottom - g[1];
    return g;
  }

  // ---- Quiz 3: Run or Pass? ----
  // Nathan (2026-11-06): "something similar with the pass plays." A formation
  // is shown; does Milford mostly run or pass from it? The reveal counts the
  // plays drawn from that look and draws them: runs red, passes blue, with a
  // key to see only the runs or only the passes (flashing between them).
  var RUN_C = '#e0201a', PASS_C = '#1f5fd6';
  function playsByFormation(pack) {
    var forms = (pack.diagrams || []).filter(function (d) { return d.cat === 'formation'; });
    var out = forms.map(function (f) { return { formation: f, runs: [], passes: [] }; });
    (pack.diagrams || []).forEach(function (d) {
      if (d.cat !== 'run' && d.cat !== 'pass') return;
      var b = formationOf(forms, d);
      if (!b) return;
      var o = out.filter(function (x) { return x.formation === b.f; })[0];
      (d.cat === 'run' ? o.runs : o.passes).push({ play: d, mirror: b.m < 0 });
    });
    return out.filter(function (o) { return o.runs.length + o.passes.length; });
  }
  function runPassQuiz(el, pack, back) {
    var rounds = shuffle(playsByFormation(pack)), i = 0, score = 0, TITLE = 'Run or Pass?', stop = null;
    function halt() { if (stop) { stop(); stop = null; } }
    // detail = one play on screen: add everyone else's arrows and blocks in
    // gray. With several plays at once only the ball's path is drawn.
    function routesOf(g, x, kind, detail) {
      var d = x.play, main = kind === 'run' ? runRoutes(d) : passRoutes(d), known = kind === 'pass' || !!ballAnswer(d);
      var put = function (r, color) { return { pts: slideOnto(g.formation, x.mirror, d, r), end: r.end, color: color }; };
      var out = main.map(function (r) { return put(r, known ? (kind === 'run' ? RUN_C : PASS_C) : GRAY); });
      if (!detail) return out;
      var rest = (d.routes || []).filter(function (r) {
        var k = startPlayer(d, r);
        return main.indexOf(r) < 0 && k >= 0 && !d.players[k].line && (r.end === 'a' || r.end === 'b');
      });
      return rest.map(function (r) { return put(r, GRAY); }).concat(out);
    }
    function labelOf(x, kind) {
      return x.play.name + (kind === 'run' && !ballAnswer(x.play) ? ' · ball carrier not marked' : '');
    }
    function ask() {
      halt();
      if (i >= rounds.length) return finish(el, TITLE, score, rounds.length, function () { runPassQuiz(el, pack, back); }, back);
      var g = rounds[i], nr = g.runs.length, np = g.passes.length;
      var answer = nr > np ? 'run' : np > nr ? 'pass' : 'even';
      var all = [].concat(
        [].concat.apply([], g.runs.map(function (x) { return routesOf(g, x, 'run'); })),
        [].concat.apply([], g.passes.map(function (x) { return routesOf(g, x, 'pass'); })));
      var vb = grownBox(viewBoxOf(drawWith(g.formation, all, all.map(function (r) { return r.color; }))), 300);
      el.innerHTML = header(TITLE, i + 1, rounds.length, score) +
        '<div style="margin:10px 2px 0;font-size:15px;font-weight:800;">Do they mostly run or pass from this look?</div>' +
        card('<div id="sqField" style="padding:4px 0;">' + drawWith(g.formation, [], [], vb) + '</div>') +
        '<div style="display:flex;gap:8px;">' +
          ['run', 'pass', 'even'].map(function (k) {
            return '<div style="flex:1;">' + btn({ run: 'Mostly run', pass: 'Mostly pass', even: 'About even' }[k], 'data-rp="' + k + '"', 'background:#111;color:#fff;font-size:15px;padding:14px 6px;') + '</div>';
          }).join('') + '</div>' +
        '<div id="sqResult"></div>';
      var field = el.querySelector('#sqField');
      el.querySelectorAll('[data-rp]').forEach(function (b) {
        b.onclick = function () {
          var right = b.dataset.rp === answer;
          if (right) score++;
          el.querySelectorAll('[data-rp]').forEach(function (x) { x.disabled = true; x.style.opacity = x.dataset.rp === answer ? '1' : '.3'; });
          var head = verdict(right, '<b>' + esc(g.formation.name) + '</b>: ' + nr + ' run' + (nr === 1 ? '' : 's') + ', ' + np + ' pass' + (np === 1 ? '' : 'es') + ' drawn.');
          function show(only) {
            halt();
            var list = only === 'run' ? g.runs : only === 'pass' ? g.passes : null;
            if (list && list.length > 1) {
              stop = flashPlays(field, drawWith(g.formation, [], [], vb),
                list.map(function (x) { var rs = routesOf(g, x, only, true); return drawWith(g.formation, rs, rs.map(function (r) { return r.color; }), vb); }),
                list.map(function (x, n) { return labelOf(x, only) + ' · ' + (n + 1) + ' of ' + list.length; }), only === 'run' ? RUN_C : PASS_C);
            } else {
              var rs = list ? routesOf(g, list[0], only, true) : all;
              field.innerHTML = drawWith(g.formation, rs, rs.map(function (r) { return r.color; }), vb);
            }
            var chips = [];
            if (nr && np) chips.push({ key: '', label: 'All ' + (nr + np), color: '#111111' });
            if (nr) chips.push({ key: 'run', label: 'Runs ' + nr, color: RUN_C, dot: true });
            if (np) chips.push({ key: 'pass', label: 'Passes ' + np, color: PASS_C, dot: true });
            el.querySelector('#sqResult').innerHTML = head + chipRow(chips, only || (nr && np ? '' : null)) +
              btn(i + 1 < rounds.length ? 'Next' : 'See score', 'data-sq="next"');
            el.querySelectorAll('[data-only]').forEach(function (c) {
              c.onclick = function () { var k = c.dataset.only; show(k && k !== only ? k : ''); };
            });
            el.querySelector('[data-sq="next"]').onclick = function () { i++; ask(); };
          }
          show('');
        };
      });
    }
    ask();
  }

  // ---- Quiz 4: Where Do Receivers Go? ----
  // A pass play is shown with the players only; tap every zone a receiver
  // runs to (short or deep, left, middle or right), then Check. The reveal
  // draws the routes in blue. Short = up to 250 units (about 2.5 lineman
  // gaps) past the line; deep is beyond that.
  var ZCOLS = [{ k: 'L', min: -Infinity, max: -250, label: 'left' }, { k: 'M', min: -250, max: 250, label: 'middle' }, { k: 'R', min: 250, max: Infinity, label: 'right' }];
  var ZROWS = [{ k: 'S', min: 0, max: 250, label: 'Short' }, { k: 'D', min: 250, max: Infinity, label: 'Deep' }];
  function zoneOf(p) {
    var c = ZCOLS.filter(function (z) { return p[0] >= z.min && p[0] < z.max; })[0] || ZCOLS[1];
    var r = p[1] <= 250 ? ZROWS[0] : ZROWS[1];
    return r.k + c.k;
  }
  function zoneName(k) {
    var r = ZROWS.filter(function (z) { return z.k === k.charAt(0); })[0], c = ZCOLS.filter(function (z) { return z.k === k.charAt(1); })[0];
    return r.label.toLowerCase() + ' ' + c.label;
  }
  function receiversQuiz(el, pack, back) {
    var forms = (pack.diagrams || []).filter(function (d) { return d.cat === 'formation'; });
    var pool = (pack.diagrams || []).filter(function (d) { return d.cat === 'pass' && passRoutes(d).length; });
    var rounds = shuffle(pool).slice(0, 10), i = 0, score = 0, TITLE = 'Where Do Receivers Go?';
    function zoneLayer(vb, picked, used) {
      var x0 = vb[0], w = vb[2], bottom = vb[1] + vb[3], o = '';
      ZROWS.forEach(function (r) {
        var y1 = r.min, y2 = Math.min(r.max, bottom);
        ZCOLS.forEach(function (c) {
          var k = r.k + c.k, a = Math.max(c.min, x0), b = Math.min(c.max, x0 + w), on = !!picked[k], fill = 'transparent', txt = '#999', mark = '';
          if (used) {
            if (used[k]) { fill = tint(GREEN, on ? .22 : .1); txt = GREEN; mark = on ? '✓ ' : ''; }
            else if (on) { fill = 'rgba(214,32,32,.14)'; txt = RED; mark = '✗ '; }
          } else if (on) { fill = 'rgba(255,122,26,.28)'; txt = '#c25200'; mark = '✓ '; }
          o += '<rect data-zone="' + k + '" x="' + a + '" y="' + y1 + '" width="' + (b - a) + '" height="' + (y2 - y1) + '" fill="' + fill + '" stroke="#ddd" stroke-width="3" style="cursor:pointer;"/>';
          var cx = (a + b) / 2, cy = y1 + (y2 - y1) / 2;
          o += '<text x="' + cx + '" y="' + (cy - 8) + '" font-size="64" font-weight="900" text-anchor="middle" fill="' + txt + '" pointer-events="none">' + mark + esc(r.label) + '</text>' +
            '<text x="' + cx + '" y="' + (cy + 58) + '" font-size="56" font-weight="800" text-anchor="middle" fill="' + txt + '" pointer-events="none">' +
            esc(c.label) + (used && used[k] ? ' · ' + used[k] + 'x' : '') + (used && used[k] && !on ? ' missed' : '') + '</text>';
        });
      });
      return o;
    }
    function ask() {
      if (i >= rounds.length) return finish(el, TITLE, score, rounds.length, function () { receiversQuiz(el, pack, back); }, back);
      var d = rounds[i], routes = passRoutes(d), used = {}, picked = {};
      routes.forEach(function (r) { var k = zoneOf(r.pts[r.pts.length - 1]); used[k] = (used[k] || 0) + 1; });
      var smooth = routes.map(function (r) { return { pts: smoothPts(r.pts) }; });
      var vb = grownBox(viewBoxOf(drawWith(d, smooth, smooth.map(function () { return PASS_C; }))), 620);
      // Only name the look when the coach has set it on the play (`formation`):
      // a guessed match can be wrong, and the kid sees the players anyway.
      var f = d.formation ? forms.filter(function (x) { return x.name === d.formation; })[0] : null;
      var look = f ? '<div style="display:flex;align-items:center;gap:8px;margin:10px 2px 0;font-weight:900;font-size:15px;">' + esc(f.name) +
        (f.tag ? '<span style="padding:3px 9px;border-radius:999px;font-size:12px;' + (isNightmare(f.tag) ? 'background:#000;color:' + ORANGE : 'background:' + GRAD + ';color:#000') + ';">' + esc(f.tag) + '</span>' : '') + '</div>' : '';
      el.innerHTML = header(TITLE, i + 1, rounds.length, score) + look +
        '<div style="margin:4px 2px 0;font-size:15px;font-weight:800;">Tap every zone a receiver runs to, then Check.</div>' +
        card('<div id="sqField" style="padding:4px 0;"></div>') +
        '<div id="sqResult">' + btn('Check', 'data-sq="check"', 'background:#111;color:#fff;opacity:.4;') + '</div>';
      var field = el.querySelector('#sqField'), check = el.querySelector('[data-sq="check"]');
      function paint() {
        field.innerHTML = drawWith(d, [], [], vb, zoneLayer(vb, picked, null));
        field.querySelectorAll('[data-zone]').forEach(function (z) {
          z.addEventListener('click', function () {
            var k = z.getAttribute('data-zone');
            if (picked[k]) delete picked[k]; else picked[k] = true;
            check.style.opacity = Object.keys(picked).length ? '1' : '.4';
            paint();
          });
        });
      }
      paint();
      check.onclick = function () {
        if (!Object.keys(picked).length) return;
        var keys = [];
        ZROWS.forEach(function (r) { ZCOLS.forEach(function (c) { keys.push(r.k + c.k); }); });
        var right = keys.every(function (k) { return !!picked[k] === !!used[k]; });
        if (right) score++;
        field.innerHTML = drawWith(d, smooth, smooth.map(function () { return PASS_C; }), vb, zoneLayer(vb, picked, used));
        var list = keys.filter(function (k) { return used[k]; }).map(zoneName).join(', ');
        el.querySelector('#sqResult').innerHTML =
          verdict(right, '<b>' + esc(d.name) + '</b>: receivers go ' + esc(list) + '.') +
          btn(i + 1 < rounds.length ? 'Next' : 'See score', 'data-sq="next"');
        el.querySelector('[data-sq="next"]').onclick = function () { i++; ask(); };
      };
    }
    ask();
  }

  // ---- Menu ----
  function mount(el, pack, options) {
    opts = options || {};
    var team = pack.scoutTeam || 'Opponent';
    var nCov = (pack.diagrams || []).filter(function (d) { return d.cat === 'formation' && d.tag; }).length;
    var nBall = runsByFormation(pack).length;
    var nRP = playsByFormation(pack).length;
    var nRec = Math.min(10, (pack.diagrams || []).filter(function (d) { return d.cat === 'pass' && passRoutes(d).length; }).length);
    function menu() {
      el.innerHTML = '<div style="text-align:center;font-weight:900;font-size:18px;margin:8px 0 2px;">🧠 ' + esc(team) + ' Quizzes</div>' +
        (nCov ? btn('Coverage Call<div style="font-size:13px;font-weight:600;opacity:.8;margin-top:2px;">' + nCov + ' formations · Cover 2 or Nightmare?</div>', 'data-quiz="cov"') : '') +
        (nBall ? btn("Where's the Ball?<div style=\"font-size:13px;font-weight:600;opacity:.8;margin-top:2px;\">" + nBall + ' formations · pick every lane they run to</div>', 'data-quiz="ball"') : '') +
        (nRP ? btn('Run or Pass?<div style="font-size:13px;font-weight:600;opacity:.8;margin-top:2px;">' + nRP + ' formations · what do they do from this look?</div>', 'data-quiz="rp"') : '') +
        (nRec ? btn('Where Do Receivers Go?<div style="font-size:13px;font-weight:600;opacity:.8;margin-top:2px;">' + nRec + ' pass plays · pick every zone</div>', 'data-quiz="rec"') : '') +
        (!nCov && !nBall && !nRP && !nRec ? '<div class="lbEmpty">No quizzes for this team yet.</div>' : '');
      var c = el.querySelector('[data-quiz="cov"]'), b = el.querySelector('[data-quiz="ball"]');
      var rp = el.querySelector('[data-quiz="rp"]'), rec = el.querySelector('[data-quiz="rec"]');
      if (rp) rp.onclick = function () { runPassQuiz(el, pack, menu); };
      if (rec) rec.onclick = function () { receiversQuiz(el, pack, menu); };
      if (c) c.onclick = function () { coverageQuiz(el, pack, menu); };
      if (b) b.onclick = function () { ballQuiz(el, pack, menu); };
    }
    menu();
  }

  window.ScoutQuiz = { mount: mount, ballAnswer: ballAnswer, runsByFormation: runsByFormation, playsByFormation: playsByFormation, formationOf: formationOf };
})();
