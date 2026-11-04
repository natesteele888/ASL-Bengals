// Scout Diagrams -- Nathan: "we need to make these diagrams of the opposing
// offense available on the bengals 11u app. they need to see and recognize
// the formations. redo the formations with the same style as our other plays."
//
// CODE ONLY lives in this public repo. The diagrams themselves are scouting
// data, so they stay behind the login gate: a coach imports a pack file in
// Coach Tools > Opponent Film and it's stored in the database, never in git.
// It's kept as an entry in the existing opponentFilm document (the entry has
// `scoutTeam`, not `teamNames`, so the film lists skip it) -- that node's
// database rules already cover exactly this audience.
//
// Same look as Play Calls: CIRCLE_R 36 / stroke 11, routes 16 wide, navy
// routes, arrow = run/route, bar = block. Red is only used when a pack marks a
// route as the ball carrier (`ball`), because the hand-drawn sheets don't say
// who has it. The one deliberate difference: drawn from the DEFENSE'S side,
// offense coming DOWN the screen, because that's the picture our kids see
// across the line.
//
// Pack format (version 2): every diagram is centered on the center at 0,0
// (y up is negative), 100 units = one normal lineman gap, so tight splits and
// wide splits are kept:
//   { cat, name, notes[], src, players:[{x,y,c,line}],
//     routes:[{pts:[[x,y]...], end:'a'|'b'|'n', curve, dash, ball}],
//     labels:[{x,y,t}] }   // short words the coach wrote next to a diagram
(function () {
  'use strict';
  var BALL = '#e0201a', NOBALL = '#123a8c', INK = '#111';
  var R = 36, STROKE = 11, ROUTE = 16;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Catmull-Rom through the hand-drawn points, so curves stay curves.
  function curveD(p) {
    var d = 'M ' + p[0][0] + ' ' + p[0][1];
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ' C ' + (b[0] + (c[0] - a[0]) / 6) + ' ' + (b[1] + (c[1] - a[1]) / 6) + ' ' +
        (c[0] - (e[0] - b[0]) / 6) + ' ' + (c[1] - (e[1] - b[1]) / 6) + ' ' + c[0] + ' ' + c[1];
    }
    return d;
  }
  function lineD(p) { return 'M ' + p.map(function (q) { return q[0] + ' ' + q[1]; }).join(' L '); }

  // Arrow: its TIP sits on the last point (the hand-drawn tip), and the line is
  // cut back under the head so the stroke doesn't poke out past it.
  function trimmed(r) {
    var p = r.pts.map(function (q) { return [q[0], q[1]]; });
    if (r.end !== 'a' || p.length < 2) return p;
    var b = p[p.length - 1], a = p[p.length - 2];
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    var cut = Math.min(24, len * 0.9);
    p[p.length - 1] = [b[0] - dx / len * cut, b[1] - dy / len * cut];
    return p;
  }
  function endCap(r, color) {
    var p = r.pts, b = p[p.length - 1], a = p[p.length - 2];
    var deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    var t = 'translate(' + b[0] + ',' + b[1] + ') rotate(' + deg + ')';
    if (r.end === 'b') {
      var bar = ROUTE * 2.2;
      return '<line transform="' + t + '" x1="0" y1="' + (-bar / 2) + '" x2="0" y2="' + (bar / 2) + '" stroke="' + color + '" stroke-width="' + (ROUTE + 2) + '" stroke-linecap="round"/>';
    }
    if (r.end === 'a') {
      var s = ROUTE / 9;
      return '<polygon transform="' + t + ' translate(' + (-20 * s) + ',0)" points="' + (-2 * s) + ',' + (-11 * s) + ' ' + (20 * s) + ',0 ' + (-2 * s) + ',' + (11 * s) + '" fill="' + color + '"/>';
    }
    return '';
  }

  function svg(d) {
    // Fixed minimum width so every card draws at the same scale; it only grows
    // when something is drawn farther out than that.
    var maxX = 820, minY = -200, maxY = 110;
    (d.players || []).forEach(function (p) {
      maxX = Math.max(maxX, Math.abs(p.x) + 70); minY = Math.min(minY, p.y - 70); maxY = Math.max(maxY, p.y + 70);
    });
    (d.routes || []).forEach(function (r) {
      r.pts.forEach(function (q) {
        maxX = Math.max(maxX, Math.abs(q[0]) + 70); minY = Math.min(minY, q[1] - 70); maxY = Math.max(maxY, q[1] + 70);
      });
    });
    (d.labels || []).forEach(function (l) {
      maxX = Math.max(maxX, Math.abs(l.x) + 130); minY = Math.min(minY, l.y - 70); maxY = Math.max(maxY, l.y + 70);
    });
    var w = maxX * 2, h = maxY - minY;
    var o = '<svg viewBox="' + (-maxX) + ' ' + minY + ' ' + w + ' ' + h + '" role="img" aria-label="' + esc(d.name) + '" style="display:block;width:100%;height:auto;background:#fff;">';
    // Line of scrimmage: same dashed look as the sideline formation sheet.
    o += '<line x1="' + (-maxX) + '" y1="0" x2="' + maxX + '" y2="0" stroke="#bbb" stroke-width="5" stroke-dasharray="20 16"/>';
    (d.routes || []).forEach(function (r) {
      var color = r.ball ? BALL : NOBALL, pts = trimmed(r);
      var pathD = (r.curve && pts.length > 2) ? curveD(pts) : lineD(pts);
      o += '<path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="' + ROUTE + '" stroke-linecap="round" stroke-linejoin="round"' + (r.dash ? ' stroke-dasharray="10 26"' : '') + '/>';
    });
    (d.players || []).forEach(function (p) {
      o += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + R + '" fill="#fff" stroke="' + INK + '" stroke-width="' + STROKE + '"/>';
      if (p.c) o += '<text x="' + p.x + '" y="' + (p.y + 14) + '" font-size="40" font-weight="900" font-style="italic" text-anchor="middle" fill="' + INK + '">C</text>';
    });
    // Arrow heads and block bars go on top, so one that lands on a lineman's
    // circle (as on the sheet) is still visible.
    (d.routes || []).forEach(function (r) { o += endCap(r, r.ball ? BALL : NOBALL); });
    // The coach's own words next to the drawing ("Fake", "Roll"...), centered on
    // where he wrote them, \n = new line, with a white halo over any route.
    (d.labels || []).forEach(function (l) {
      var lines = String(l.t).split('\n'), LH = 52, y0 = l.y - (lines.length - 1) * LH / 2 + 16;
      o += '<text x="' + l.x + '" font-size="46" font-weight="800" text-anchor="middle" fill="#444" stroke="#fff" stroke-width="12" paint-order="stroke" stroke-linejoin="round">' +
        lines.map(function (t, i) { return '<tspan x="' + l.x + '" y="' + (y0 + i * LH) + '">' + esc(t) + '</tspan>'; }).join('') + '</text>';
    });
    return o + '</svg>';
  }

  window.ScoutDiagramSvg = svg;

  var GROUPS = [
    { key: 'formation', label: 'Formations' },
    { key: 'run', label: 'Runs' },
    { key: 'pass', label: 'Passes' },
  ];

  function cardHtml(d) {
    var notes = (d.notes || []).map(esc).join(' · ');
    return '<div style="border:2px solid #ddd;border-radius:8px;overflow:hidden;background:#fff;margin-bottom:10px;">' +
      '<div style="padding:8px 10px 4px;color:#111;font-weight:800;font-size:15px;">' + esc(d.name) + (d.tag ? ' · ' + esc(d.tag) : '') + '</div>' +
      svg(d) +
      (notes ? '<div style="padding:6px 10px 9px;color:#333;font-size:13px;line-height:1.4;">' + notes + '</div>' : '') +
      '</div>';
  }

  function inGroup(pack, key) {
    return (pack.diagrams || []).filter(function (d) { return d.cat === key; });
  }

  // Draws a pack browser into `el`: a team row (only when there is more than
  // one pack), then Formations / Runs / Passes chips with counts, then the
  // cards. Formations come first so a kid learns the look before the plays.
  // opts.title(pack) -> header text.
  function browse(el, packs, opts) {
    opts = opts || {};
    var pi = 0;
    var active = null;
    function draw() {
      var pack = packs[pi];
      var groups = GROUPS.filter(function (g) { return inGroup(pack, g.key).length; });
      if (!groups.some(function (g) { return g.key === active; })) active = groups.length ? groups[0].key : null;
      el.innerHTML =
        (opts.title ? '<div class="lbSectionHeader" style="font-size:13px;">' + esc(opts.title(pack)) + '</div>' : '') +
        (packs.length > 1
          ? '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:6px 0 2px;">' +
            packs.map(function (p, i) {
              return '<button type="button" class="gameplanChip' + (i === pi ? ' active' : '') + '" data-scout-pack="' + i + '">' + esc(p.scoutTeam) + '</button>';
            }).join('') + '</div>'
          : '') +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:6px 0 8px;">' +
        groups.map(function (g) {
          return '<button type="button" class="gameplanChip' + (g.key === active ? ' active' : '') + '" data-scout-group="' + g.key + '">' +
            g.label + ' (' + inGroup(pack, g.key).length + ')</button>';
        }).join('') + '</div>' +
        '<div class="hint" style="text-align:center;margin-bottom:8px;">Drawn from our side of the ball: they are coming down the screen at you. Arrow = where he goes. Bar = who he blocks.</div>' +
        (active ? inGroup(pack, active).map(cardHtml).join('') : '');
      el.querySelectorAll('[data-scout-group]').forEach(function (b) {
        b.addEventListener('click', function () { active = b.dataset.scoutGroup; draw(); });
      });
      el.querySelectorAll('[data-scout-pack]').forEach(function (b) {
        b.addEventListener('click', function () { pi = Number(b.dataset.scoutPack); draw(); });
      });
    }
    draw();
  }

  // Fills `el` with the team's diagrams, or leaves it empty if there are none.
  function mount(el, teamName) {
    if (!el || !window.OpponentFilm) return;
    window.OpponentFilm.load().then(function (entries) {
      if (!el.isConnected) return;
      var pack = window.OpponentFilm.scoutPackForTeam(entries, teamName);
      if (!pack) { el.innerHTML = ''; return; }
      browse(el, [pack], { title: function () { return '📋 ' + teamName + ' Offense'; } });
    }).catch(function () {});
  }

  // Coach Tools > Opponent Film: import a pack file for a team, or remove one.
  function initAdmin() {
    var wrap = document.getElementById('scoutDiagramsAdmin');
    if (!wrap || !window.OpponentFilm) return;
    function refresh(msg) {
      window.OpponentFilm.load().then(function (entries) {
        var packs = window.OpponentFilm.scoutPacks(entries);
        wrap.innerHTML = '<div class="lbSectionHeader" style="font-size:12px;margin-top:18px;">📋 Scout Diagrams</div>' +
          '<div class="hint" style="margin:4px 0 8px;">Import a diagram file for a team. Players see it on that team\'s page and in This Week when we play them. Importing again replaces it.</div>' +
          '<input id="scoutDiagTeam" placeholder="Team name, as on the Schedule" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:6px;">' +
          '<input id="scoutDiagFile" type="file" accept=".json,application/json" style="display:block;margin-bottom:6px;">' +
          '<button type="button" class="navBtn" id="scoutDiagImport" style="display:block;width:100%;">Import Diagrams</button>' +
          (msg ? '<div class="hint" style="margin-top:6px;text-align:center;">' + esc(msg) + '</div>' : '') +
          packs.map(function (p) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:14px;"><span>' + esc(p.scoutTeam) + ' (' + p.diagrams.length + ' diagrams)</span>' +
              '<button type="button" class="lbLinkBtn" data-scout-remove="' + esc(p.id) + '">Remove</button></div>';
          }).join('');
        wrap.querySelector('#scoutDiagImport').addEventListener('click', function () {
          var team = wrap.querySelector('#scoutDiagTeam').value;
          var file = wrap.querySelector('#scoutDiagFile').files[0];
          if (!team.trim()) return refresh('Type the team name first.');
          if (!file) return refresh('Choose the diagram file first.');
          file.text().then(JSON.parse).then(function (pack) {
            return window.OpponentFilm.saveScoutPack(team, pack && pack.diagrams);
          }).then(function (e) { refresh('Imported ' + e.diagrams.length + ' diagrams for ' + e.scoutTeam + '.'); })
            .catch(function (err) { refresh('Import failed: ' + err.message); });
        });
        wrap.querySelectorAll('[data-scout-remove]').forEach(function (b) {
          b.addEventListener('click', function () {
            window.OpponentFilm.removeClip(b.dataset.scoutRemove).then(function () { refresh('Removed.'); })
              .catch(function (err) { refresh('Remove failed: ' + err.message); });
          });
        });
      }).catch(function (err) { wrap.innerHTML = '<div class="lbEmpty">Could not load: ' + esc(err.message) + '</div>'; });
    }
    refresh();
  }

  window.ScoutDiagrams = { mount: mount, browse: browse, initAdmin: initAdmin };
})();
