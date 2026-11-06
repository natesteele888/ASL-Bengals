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
    function draw(g, picked, reveal, only, oneRun) {
      var d = JSON.parse(JSON.stringify(g.formation)), colors = [];
      d.labels = [];
      var shown = !reveal ? [] : g.runs.filter(function (x) { return oneRun ? x === oneRun : (!only || x.lane === only); });
      var withBlocks = shown.length === 1;
      d.routes = [].concat.apply([], shown.map(function (x) {
        var blocks = withBlocks ? blocksOf(x).map(function (r) {
          return { pts: placeOn(g, x, r), end: 'b', curve: true, ball: false };
        }) : [];
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

  // ---- Menu ----
  function mount(el, pack, options) {
    opts = options || {};
    var team = pack.scoutTeam || 'Opponent';
    var nCov = (pack.diagrams || []).filter(function (d) { return d.cat === 'formation' && d.tag; }).length;
    var nBall = runsByFormation(pack).length;
    function menu() {
      el.innerHTML = '<div style="text-align:center;font-weight:900;font-size:18px;margin:8px 0 2px;">🧠 ' + esc(team) + ' Quizzes</div>' +
        (nCov ? btn('Coverage Call<div style="font-size:13px;font-weight:600;opacity:.8;margin-top:2px;">' + nCov + ' formations · Cover 2 or Nightmare?</div>', 'data-quiz="cov"') : '') +
        (nBall ? btn("Where's the Ball?<div style=\"font-size:13px;font-weight:600;opacity:.8;margin-top:2px;\">" + nBall + ' formations · pick every lane they run to</div>', 'data-quiz="ball"') : '') +
        (!nCov && !nBall ? '<div class="lbEmpty">No quizzes for this team yet.</div>' : '');
      var c = el.querySelector('[data-quiz="cov"]'), b = el.querySelector('[data-quiz="ball"]');
      if (c) c.onclick = function () { coverageQuiz(el, pack, menu); };
      if (b) b.onclick = function () { ballQuiz(el, pack, menu); };
    }
    menu();
  }

  window.ScoutQuiz = { mount: mount, ballAnswer: ballAnswer, runsByFormation: runsByFormation };
})();
