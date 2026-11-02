// ============================================================
// Play Studio -- a full-screen, phone-first play builder.
//
// Nathan: "I would like the ability to create plays from scratch on a full
// screen extension of the app. Just choose my formation, choose the type
// (pass, run, play action, etc), set the players in their spots. Draw routes,
// draw running paths, choose receivers and the reads in order. Make it super
// simple... Need to choose things like, is the play flippable? is there
// motion? boot option? so the app can build it out. I could also see us using
// this in the off season where the coaches can create the plays on their own
// phones, share the plays and then build out the playbook from that."
//
// WHAT THIS IS AND IS NOT
// It authors the SAME object Play Builder v2 already stores
// (js/playbuilder/schema.js's Play) -- one canonical drawing that the app
// mirrors for the other side -- so everything downstream (the adapter, the
// cards, the quiz, the PDFs) keeps working with no change. What is new is the
// way a coach gets there: seven plain steps instead of a toolbar of selects.
// Nothing here talks to js/play-calls.js; the review step previews through
// PlayBuilderMirror, the exact code the app's adapter uses, so what a coach
// sees on the last screen is what the card will show.
//
// A DRAFT IS NOT A PLAY
// Drafts live on the phone (localStorage), can be shared by link or dropped in
// the team inbox (dev2PlayData/playDrafts), and only become a real play when a
// signed-in coach taps "Add to playbook". That split is what makes the
// off-season workflow possible: anyone can draw, one person approves.
//
// HOW A ROUTE IS STORED WHILE DRAWING
// As the VERTICES the coach drew plus a style (straight cuts or one smooth
// curve). The app's alternating control/on-curve point list is generated from
// those on demand (chain()), never edited by hand, so dragging a corner or
// flipping Straight/Curved can never leave a half-converted route behind.
// ============================================================
(function () {
'use strict';

var NS = 'http://www.w3.org/2000/svg';
var M = window.PlayBuilderMirror;
var LS_DRAFTS = 'playStudio.drafts.v1';
var LS_CUR = 'playStudio.current.v1';
var LS_AUTHOR = 'playStudio.author';
var DB = 'https://aslbengals-default-rtdb.firebaseio.com';
var LOS_Y = 157;          // between the defense (y 110) and the O-line (y 204)
var HANDOFF_AT = 0.16;    // how far along the carrier's path the exchange happens
var PASS_AT = 0.75;       // how far along a receiver's route the ball arrives
var SCREEN_AT = 0.9;
var ANIM_MS = 2600;

var STEPS = [
  { k: 'formation', t: 'Formation' }, { k: 'type', t: 'Type' }, { k: 'spots', t: 'Spots' },
  { k: 'draw', t: 'Draw' }, { k: 'ball', t: 'Ball' }, { k: 'options', t: 'Options' }, { k: 'review', t: 'Review' },
];
var STYLES = [
  { k: 'run', t: 'Run', d: 'Hand it off and run it.', pass: false },
  { k: 'option', t: 'Option', d: 'QB can hand it, pitch it or keep it.', pass: false },
  { k: 'pass', t: 'Pass', d: 'Drop back and throw to a read.', pass: true },
  { k: 'playaction', t: 'Play Action', d: 'Fake the run, then throw.', pass: true },
  { k: 'screen', t: 'Screen', d: 'Let them rush, then dump it off short.', pass: true },
];

var W = { formations: [], defense: null, viewBox: [1600, 1030], topPad: 400, offline: false };
var S = fresh();
var VB = { x: 0, y: 0, w: 1600, h: 1030 };
var els = {};
var anim = null;
var flipSide = 'right';
var gesture = null;
var pointers = new Map();
var teamDrafts = null;

// ---------------------------------------------------------------- state
function rid() { return Math.random().toString(36).slice(2, 10); }
function fresh() {
  return {
    id: 'studio_' + rid(), name: '', style: null, formationId: null, formation: null, baseFormation: null,
    moved: false, routes: {}, carrier: null, carryHow: 'handoff', fakeTo: null, reads: [], target: 0,
    opts: { flip: true, motion: true, boot: false }, boot: null, step: 0, sel: null, drawKind: null,
    ballMode: null, defense: true, mode: null, author: '', publishedAs: null, createdAt: Date.now(),
  };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function copyPt(p) { return { x: p.x, y: p.y }; }
function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function hasContent() { return !!(S.formationId && (S.style || Object.keys(S.routes).length)); }

function P(id) { return S.formation && S.formation.positions.find(function (p) { return String(p.id) === String(id); }); }
function isLine(p) { return typeof p.id === 'string'; }
function eligible(p) { return !isLine(p) && String(p.id) !== '1'; }
function styleOf() { return STYLES.find(function (s) { return s.k === S.style; }); }
function isPassStyle() { var s = styleOf(); return !!(s && s.pass); }
function label(p) { return p.label || String(p.id); }

// ---------------------------------------------------------------- routes
// Vertices -> the app's point list (see header). `curve` = one smooth line
// through the corners' midpoints; otherwise straight cuts with sharp corners.
function chain(verts, style) {
  var n = verts.length - 1;
  if (n < 1) return verts.map(copyPt);
  if (n === 1) return [copyPt(verts[0]), copyPt(verts[1])];
  var out = [copyPt(verts[0])], i;
  if (style === 'curve') {
    for (i = 1; i < n; i++) { out.push(copyPt(verts[i])); out.push(i < n - 1 ? mid(verts[i], verts[i + 1]) : copyPt(verts[n])); }
  } else {
    for (i = 1; i <= n; i++) { out.push(mid(verts[i - 1], verts[i])); out.push(copyPt(verts[i])); }
  }
  return out;
}
function pointsOf(r) { return chain(r.verts, r.style); }
function curvedPathD(points) {
  if (points.length < 2) return '';
  if (points.length === 2) return 'M ' + points[0].x + ' ' + points[0].y + ' L ' + points[1].x + ' ' + points[1].y;
  var d = 'M ' + points[0].x + ' ' + points[0].y, i = 1;
  for (; i + 1 < points.length; i += 2) d += ' Q ' + points[i].x + ' ' + points[i].y + ' ' + points[i + 1].x + ' ' + points[i + 1].y;
  if (i < points.length) d += ' L ' + points[i].x + ' ' + points[i].y;
  return d;
}
// Dense polyline of a point list so we can ask "where is he 60% of the way".
function poly(points) {
  var pts = [];
  if (points.length <= 2) pts = points.map(copyPt);
  else {
    pts = [copyPt(points[0])];
    var i = 1;
    for (; i + 1 < points.length; i += 2) {
      var a = pts[pts.length - 1], c = points[i], b = points[i + 1];
      for (var s = 1; s <= 16; s++) {
        var t = s / 16, u = 1 - t;
        pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
      }
    }
    if (i < points.length) pts.push(copyPt(points[i]));
  }
  var cum = [0];
  for (var k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return { pts: pts, cum: cum, total: cum[cum.length - 1] || 0 };
}
function atFrac(pl, f) {
  if (!pl.pts.length) return { x: 0, y: 0 };
  if (!pl.total || f <= 0) return copyPt(pl.pts[0]);
  if (f >= 1) return copyPt(pl.pts[pl.pts.length - 1]);
  var want = f * pl.total, i = 1;
  while (i < pl.cum.length - 1 && pl.cum[i] < want) i++;
  var seg = pl.cum[i] - pl.cum[i - 1] || 1, t = (want - pl.cum[i - 1]) / seg;
  return { x: pl.pts[i - 1].x + (pl.pts[i].x - pl.pts[i - 1].x) * t, y: pl.pts[i - 1].y + (pl.pts[i].y - pl.pts[i - 1].y) * t };
}
function fracOf(pl, target) {
  if (!pl.total) return 0;
  var best = Infinity, bf = 0;
  for (var i = 1; i < pl.pts.length; i++) {
    var a = pl.pts[i - 1], b = pl.pts[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    var t = l2 ? ((target.x - a.x) * dx + (target.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(target.x - px, target.y - py);
    if (d < best) { best = d; bf = (pl.cum[i - 1] + Math.sqrt(l2) * t) / pl.total; }
  }
  return bf;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  var a = pts[0], b = pts[pts.length - 1], idx = -1, dmax = 0, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  for (var i = 1; i < pts.length - 1; i++) {
    var d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [a, b];
}
function routeLength(verts) { var t = 0; for (var i = 1; i < verts.length; i++) t += Math.hypot(verts[i].x - verts[i - 1].x, verts[i].y - verts[i - 1].y); return t; }
function defaultKind(p) { return isLine(p) ? 'block' : 'run'; }

// ---------------------------------------------------------------- the play
function ballInfo() {
  var legs = [], carrierId = null;
  if (isPassStyle()) {
    var t = S.reads[Math.min(S.target, S.reads.length - 1)];
    if (t != null && S.routes[String(t)]) {
      carrierId = t;
      legs = [{ player: 1 }, { player: P(t).id, frac: S.style === 'screen' ? SCREEN_AT : PASS_AT, how: 'pass' }];
    } else if (t != null) carrierId = t;
  } else if (S.carrier != null) {
    carrierId = S.carrier;
    if (String(S.carrier) !== '1' && S.routes[String(S.carrier)]) legs = [{ player: 1 }, { player: P(S.carrier).id, frac: HANDOFF_AT, how: S.carryHow }];
  }
  return { legs: legs, carrierId: carrierId };
}
function buildPlay(formationIdOverride) {
  var f = S.formation, wingIds = f.wingPositionIds || [], info = ballInfo(), players = [];
  f.positions.forEach(function (pos) {
    var r = S.routes[String(pos.id)];
    if (!r || r.verts.length < 2) return;
    var pts = pointsOf(r).map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y) }; });
    var a = { player: pos.id, hasBall: info.carrierId != null && String(info.carrierId) === String(pos.id), delayMs: 0, endType: r.kind === 'block' ? 'block' : 'run' };
    if (wingIds.indexOf(pos.id) !== -1) {
      // The wing's own side-flip is handled by the app's wing toggle; the drawn
      // route is used for both shapes so "same side" vs "cross side" can never
      // disagree about what the coach drew.
      a.sameSideRoute = pts; a.crossSideRoute = pts.map(function (p) { return { x: p.x, y: p.y }; });
    } else {
      a.points = pts;
      if (!S.opts.flip) a.directionIndependent = true;
    }
    players.push(a);
  });
  var ballPath = info.legs.map(function (leg, i) {
    if (i === 0) return { player: leg.player };
    var r = S.routes[String(leg.player)];
    var at = atFrac(poly(chain(r.verts, r.style)), leg.frac);
    return { player: leg.player, at: [Math.round(at.x), Math.round(at.y)], how: leg.how };
  });
  var play = {
    id: S.id, label: S.name || 'New Play', formationId: formationIdOverride || f.id,
    defenseLookId: W.defense ? W.defense.id : 'base_4x4', viewBox: W.viewBox, topPad: W.topPad,
    variants: [{ id: 'default', label: 'Base', players: players, ballPath: ballPath }],
    isPass: isPassStyle(), noMotion: !S.opts.motion, noBoot: !S.opts.boot, noDirection: !S.opts.flip,
    playStyle: S.style, reads: S.reads.map(function (id) { return P(id).id; }), readTarget: S.target,
    origin: 'studio', author: S.author || '', createdAt: S.createdAt, updatedAt: Date.now(),
  };
  if (S.fakeTo != null) play.fakeTo = P(S.fakeTo).id;
  if (S.opts.boot && S.boot && S.boot.verts.length > 1) {
    play.bootRoute = chain(S.boot.verts, S.boot.style).map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y) }; });
  }
  return play;
}
// What the app will draw for one side: straight from PlayBuilderMirror, the
// same calls js/playbuilder/legacy-adapter.js makes.
function resolveSide(side) {
  var play = buildPlay(), f = S.formation, players = play.variants[0].players, out = { pos: {}, pts: {}, kind: {} };
  f.positions.forEach(function (p) {
    var a = M.resolveAnchor(f, p.id, { wingSide: side, direction: side });
    out.pos[String(p.id)] = { x: a.x, y: a.y };
    var r = null;
    try { r = M.resolveRoute(f, players, p.id, { wingSide: side, direction: side }); } catch (e) { r = null; }
    if (r) out.pts[String(p.id)] = r.map(copyPt);
    var asg = players.find(function (q) { return q.player === p.id; });
    if (asg) out.kind[String(p.id)] = asg.endType === 'block' ? 'block' : 'run';
  });
  return out;
}

// ---------------------------------------------------------------- persistence
function snapshot() {
  return {
    v: 1, id: S.id, name: S.name, style: S.style, formationId: S.formationId, formation: S.formation, baseFormation: S.baseFormation,
    moved: S.moved, routes: S.routes, carrier: S.carrier, carryHow: S.carryHow, fakeTo: S.fakeTo, reads: S.reads, target: S.target,
    opts: S.opts, boot: S.boot, author: S.author, publishedAs: S.publishedAs, createdAt: S.createdAt, updatedAt: Date.now(),
    step: S.mode === 'boot' ? 5 : S.step,
  };
}
function restore(snap) {
  var s = fresh();
  ['id', 'name', 'style', 'formationId', 'formation', 'baseFormation', 'moved', 'routes', 'carrier', 'carryHow', 'fakeTo', 'reads', 'target', 'opts', 'boot', 'author', 'publishedAs', 'createdAt'].forEach(function (k) {
    if (snap[k] !== undefined) s[k] = clone(snap[k]);
  });
  s.author = s.author || localStorage.getItem(LS_AUTHOR) || '';
  s.step = typeof snap.step === 'number' && snap.step >= 1 ? snap.step : (s.style ? (Object.keys(s.routes).length ? 3 : 2) : (s.formationId ? 1 : 0));
  return s;
}
function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
var saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () { if (hasContent()) lsSet(LS_CUR, snapshot()); else try { localStorage.removeItem(LS_CUR); } catch (e) {} }, 250);
}
function stashDraft() {
  if (!hasContent()) return;
  var list = lsGet(LS_DRAFTS, []).filter(function (d) { return d.id !== S.id; });
  list.unshift(snapshot());
  lsSet(LS_DRAFTS, list.slice(0, 40));
}
function b64enc(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
function shareUrl() { return location.origin + location.pathname + '#d=' + b64enc(JSON.stringify(snapshot())); }

function gateKind() { var s = lsGet('bengalsGateSession', null); return s && s.kind; }
// The app opens this page with ?admin=1 for the Play Builder admin and the
// page remembers it, so a bookmarked or home-screen copy keeps working. This
// only decides which buttons show; the database rules are the real gate.
var isAdmin = (function () {
  try {
    if (/[?&]admin=1\b/.test(location.search)) localStorage.setItem('playStudio.admin', '1');
    return localStorage.getItem('playStudio.admin') === '1' || /[?&]testpublish\b/.test(location.search);
  } catch (e) { return /[?&]testpublish\b/.test(location.search); }
})();
function canPublish() { return isAdmin && (gateKind() === 'coach' || /[?&]testpublish\b/.test(location.search)); }
async function cloudFetch(path, opts) {
  if (typeof window.firebaseAuthed !== 'function') throw new Error('not signed in');
  var url = await window.firebaseAuthed(DB + '/dev2PlayData/' + path + '.json');
  var res = await fetch(url, Object.assign({ cache: 'no-store' }, opts || {}));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function sendToInbox() {
  var snap = snapshot(); snap.sharedAt = Date.now();
  await cloudFetch('playDrafts/' + S.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap) });
}
async function loadTeamDrafts() {
  try {
    var all = await cloudFetch('playDrafts');
    teamDrafts = all ? Object.keys(all).map(function (k) { return all[k]; }).sort(function (a, b) { return (b.sharedAt || 0) - (a.sharedAt || 0); }) : [];
  } catch (e) { teamDrafts = null; }
  if (S.step === 0) renderScreens();
}

// ---------------------------------------------------------------- world
function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
async function loadWorld() {
  var seeds = window.PlayBuilderSeeds;
  W.formations = clone(seeds.formations); W.defense = clone(seeds.defenseLooks[0]); W.viewBox = seeds.viewBox; W.topPad = seeds.topPad;
  try {
    var all = await withTimeout(window.PlayBuilderStore.loadAll(), 6000);
    if (all.formations && all.formations.length) W.formations = all.formations;
    if (all.defenseLooks && all.defenseLooks.length) W.defense = all.defenseLooks.find(function (d) { return d.id === all.activeDefenseLookId; }) || all.defenseLooks[0];
    if (all.viewBox) W.viewBox = all.viewBox; if (all.topPad != null) W.topPad = all.topPad;
  } catch (e) { W.offline = true; }
}

// ---------------------------------------------------------------- DOM helpers
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
  });
  (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
  return e;
}
function sv(tag, attrs, parent) {
  var e = document.createElementNS(NS, tag);
  Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (parent) parent.appendChild(e);
  return e;
}
var toastTimer = null;
function toast(msg, ms) {
  var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, ms || 2800);
}

// ---------------------------------------------------------------- viewport
function fitVB() {
  var rect = els.field.getBoundingClientRect(), cw = Math.max(rect.width, 200), ch = Math.max(rect.height, 200);
  var xs = [], ys = [];
  if (S.formation) S.formation.positions.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
  var minX = xs.length ? Math.min.apply(null, xs) - 150 : 120, maxX = xs.length ? Math.max.apply(null, xs) + 150 : 1480;
  minX = Math.min(minX, 420); maxX = Math.max(maxX, 1180);
  var wide = cw / ch > 1.3, top = wide ? -330 : -430, bottom = wide ? 520 : 560, w = maxX - minX, hh = bottom - top, aspect = cw / ch;
  if (w / hh > aspect) { var nh = w / aspect; top = bottom - nh; hh = nh; } else { var nw = hh * aspect; minX -= (nw - w) / 2; w = nw; }
  VB = { x: minX, y: top, w: w, h: hh };
  applyVB();
}
function applyVB() { els.field.setAttribute('viewBox', [VB.x, VB.y, VB.w, VB.h].map(function (n) { return n.toFixed(1); }).join(' ')); }
function zoomAt(cx, cy, factor) {
  var nw = Math.max(380, Math.min(2600, VB.w * factor)), k = nw / VB.w;
  VB = { x: cx - (cx - VB.x) * k, y: cy - (cy - VB.y) * k, w: nw, h: VB.h * k };
  applyVB();
}
function toField(clientX, clientY) {
  var pt = els.field.createSVGPoint(); pt.x = clientX; pt.y = clientY;
  var m = els.field.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}
function scaleNow() { var m = els.field.getScreenCTM(); return m ? m.a : 0.4; }
function hitPlayer(fp) {
  var radius = Math.max(60, 30 / scaleNow()), best = null, bd = radius;
  S.formation.positions.forEach(function (p) {
    var q = curPos(p), d = Math.hypot(q.x - fp.x, q.y - fp.y);
    if (d < bd) { bd = d; best = p; }
  });
  return best;
}
function curPos(p) { return flipSide === 'left' && S.step === 6 && anim === null && reviewResolved ? (reviewResolved.pos[String(p.id)] || p) : p; }

// ---------------------------------------------------------------- field rendering
var reviewResolved = null;
function renderField() {
  var svg = els.field;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!S.formation) return;
  var review = S.step === 6;
  sv('rect', { class: 'turf', x: -1500, y: -1500, width: 4600, height: 4000 }, svg);
  for (var k = -6; k <= 6; k++) sv('line', { class: 'yard', x1: -1500, x2: 3100, y1: LOS_Y - k * 190, y2: LOS_Y - k * 190 }, svg);
  sv('line', { class: 'los', x1: -1500, x2: 3100, y1: LOS_Y, y2: LOS_Y }, svg);
  if (S.defense && W.defense) {
    var dg = sv('g', { opacity: S.step <= 2 ? 0.55 : 0.4 }, svg);
    W.defense.positions.forEach(function (d) {
      sv('circle', { class: 'dfn', cx: d.x, cy: d.y, r: 30 }, dg);
      var t = sv('text', { class: 'dfnT', x: d.x, y: d.y }, dg); t.textContent = d.label;
    });
  }
  reviewResolved = review ? resolveSide(flipSide) : null;
  var bootMode = S.mode === 'boot';

  var rg = sv('g', {}, svg);
  if (review) {
    S.formation.positions.forEach(function (p) {
      var pts = reviewResolved.pts[String(p.id)]; if (!pts) return;
      drawRoute(rg, pts, reviewResolved.kind[String(p.id)], false);
    });
  } else {
    Object.keys(S.routes).forEach(function (key) {
      var r = S.routes[key]; if (r.verts.length < 2) return;
      drawRoute(rg, pointsOf(r), r.kind, bootMode);
    });
    if (S.boot && S.boot.verts.length > 1 && (bootMode || S.step === 5)) {
      var bg = drawRoute(rg, chain(S.boot.verts, S.boot.style), 'run', false);
      bg.querySelector('path').setAttribute('stroke-dasharray', '26 18');
    }
  }
  // vertex handles for the player being edited
  if (S.step === 3 && S.sel != null && S.routes[String(S.sel)]) {
    var r = S.routes[String(S.sel)];
    r.verts.forEach(function (v, i) { if (i) sv('circle', { class: 'hnd', cx: v.x, cy: v.y, r: Math.max(20, 9 / scaleNow()), 'data-v': i }, rg); });
  }
  if (bootMode && S.boot) S.boot.verts.forEach(function (v, i) { if (i) sv('circle', { class: 'hnd', cx: v.x, cy: v.y, r: Math.max(20, 9 / scaleNow()), 'data-v': i }, rg); });
  if (gesture && gesture.type === 'draw' && gesture.live) {
    sv('polyline', { class: 'live', points: gesture.live.map(function (q) { return q.x + ',' + q.y; }).join(' ') }, rg);
  }

  var pg = sv('g', { id: 'players' }, svg);
  S.formation.positions.forEach(function (p) {
    var q = curPos(p), faded = bootMode && String(p.id) !== '1';
    var g = sv('g', { class: 'pl ' + (isLine(p) ? 'ol' : 'sk') + (faded ? ' faded' : ''), transform: 'translate(' + q.x + ' ' + q.y + ')' }, pg);
    if ((S.step === 3 && S.sel != null && String(S.sel) === String(p.id)) || (bootMode && String(p.id) === '1')) sv('circle', { class: 'ring', r: 56 }, g);
    sv('circle', { class: 'body', r: 40 }, g);
    var t = sv('text', { x: 0, y: 2 }, g); t.textContent = label(p);
  });
  // badges: reads, carrier, fake
  var bg2 = sv('g', {}, svg);
  function badge(p, text, cls, dx) {
    var q = curPos(p), g = sv('g', { class: 'bdg ' + (cls || ''), transform: 'translate(' + (q.x + 40 + (dx || 0)) + ' ' + (q.y - 46) + ')' }, bg2);
    sv('circle', { r: 24 }, g); var t = sv('text', { x: 0, y: 2 }, g); t.textContent = text;
  }
  if (S.step >= 4) {
    if (isPassStyle()) S.reads.forEach(function (id, i) { var p = P(id); if (p) badge(p, String(i + 1), '', 0); });
    else if (S.carrier != null && P(S.carrier)) badge(P(S.carrier), '⚑', '', 0);
    if (S.fakeTo != null && P(S.fakeTo)) badge(P(S.fakeTo), 'F', 'fake', -6);
  }
  els.playersGroup = pg;
}
function drawRoute(parent, points, kind, ghost) {
  var g = sv('g', {}, parent);
  var d = curvedPathD(points);
  sv('path', { class: 'rt ' + kind + (ghost ? ' ghost' : ''), d: d }, g);
  var pl = poly(points), n = pl.pts.length;
  if (n >= 2) {
    var end = pl.pts[n - 1], j = n - 2;
    while (j > 0 && Math.hypot(end.x - pl.pts[j].x, end.y - pl.pts[j].y) < 20) j--;
    var from = pl.pts[j], ang = Math.atan2(end.y - from.y, end.x - from.x), ux = Math.cos(ang), uy = Math.sin(ang);
    if (kind === 'block') {
      sv('line', { class: 'cap block' + (ghost ? ' ghost' : ''), x1: end.x - uy * 34, y1: end.y + ux * 34, x2: end.x + uy * 34, y2: end.y - ux * 34 }, g);
    } else {
      var s = 40, bx = end.x - ux * s, by = end.y - uy * s;
      sv('polygon', { class: 'cap run' + (ghost ? ' ghost' : ''), points: end.x + ',' + end.y + ' ' + (bx - uy * s * 0.62) + ',' + (by + ux * s * 0.62) + ' ' + (bx + uy * s * 0.62) + ',' + (by - ux * s * 0.62), fill: ghost ? 'var(--ghost)' : '' }, g);
    }
  }
  return g;
}

// ---------------------------------------------------------------- pointer handling
function onDown(ev) {
  if (anim) stopAnim();
  try { els.field.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic or already-gone pointer: drawing still works without capture */ }
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) { startPinch(); return; }
  if (pointers.size > 2) return;
  var fp = toField(ev.clientX, ev.clientY), hit = hitPlayer(fp), step = S.step;
  gesture = { type: 'tap', sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, hit: hit, fp: fp, moved: false };
  if (step === 3 || S.mode === 'boot') {
    // grabbing a corner handle of the selected route
    var vi = handleAt(fp);
    if (vi != null) { gesture.type = 'vertex'; gesture.vi = vi; return; }
  }
  if (step === 2 && hit) { gesture.type = 'move'; gesture.id = hit.id; gesture.origin = { x: hit.x, y: hit.y }; gesture.off = { x: hit.x - fp.x, y: hit.y - fp.y }; selectNothing(); return; }
  if (S.mode === 'boot') { gesture.type = hit && String(hit.id) === '1' ? 'draw' : 'pan'; if (gesture.type === 'draw') { gesture.id = 1; gesture.live = [copyPt(P(1))]; } return; }
  if (step === 3 && hit) { gesture.type = 'draw'; gesture.id = hit.id; gesture.live = [copyPt(hit)]; return; }
  gesture.type = hit ? 'tap' : 'pan';
}
function handleAt(fp) {
  var route = S.mode === 'boot' ? S.boot : (S.sel != null ? S.routes[String(S.sel)] : null);
  if (!route) return null;
  var radius = Math.max(40, 26 / scaleNow());
  for (var i = route.verts.length - 1; i >= 1; i--) if (Math.hypot(route.verts[i].x - fp.x, route.verts[i].y - fp.y) < radius) return i;
  return null;
}
function onMove(ev) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) { pinchMove(); return; }
  if (!gesture) return;
  var dxs = ev.clientX - gesture.sx, dys = ev.clientY - gesture.sy;
  if (!gesture.moved && Math.hypot(dxs, dys) > 8) gesture.moved = true;
  var fp = toField(ev.clientX, ev.clientY);
  if (gesture.type === 'pan' && gesture.moved) {
    var sc = scaleNow(); VB.x -= (ev.clientX - gesture.lx) / sc; VB.y -= (ev.clientY - gesture.ly) / sc; applyVB();
  } else if (gesture.type === 'move') {
    var p = P(gesture.id), nx = Math.round(fp.x + gesture.off.x), ny = Math.round(fp.y + gesture.off.y);
    // Soft-snap onto the rows/columns the other players already stand on, so
    // "on the line" stays on the line without a coach having to be precise.
    S.formation.positions.forEach(function (o) {
      if (o === p) return;
      if (Math.abs(o.y - ny) < 14) ny = o.y;
      if (Math.abs(o.x - nx) < 10) nx = o.x;
    });
    p.x = nx; p.y = ny; renderField();
  } else if (gesture.type === 'draw' && gesture.moved) {
    var last = gesture.live[gesture.live.length - 1];
    if (Math.hypot(fp.x - last.x, fp.y - last.y) > 10 / scaleNow() * 0.6) { gesture.live.push(copyPt(fp)); renderField(); }
  } else if (gesture.type === 'vertex') {
    var route = S.mode === 'boot' ? S.boot : S.routes[String(S.sel)];
    route.verts[gesture.vi] = { x: Math.round(fp.x), y: Math.round(fp.y) }; renderField();
  }
  gesture.lx = ev.clientX; gesture.ly = ev.clientY;
}
function onUp(ev) {
  var had = pointers.delete(ev.pointerId);
  if (!had) return;
  if (pointers.size > 0) { gesture = null; return; }
  var g = gesture; gesture = null;
  if (!g) return;
  if (g.type === 'move') {
    var p = P(g.id), dx = p.x - g.origin.x, dy = p.y - g.origin.y;
    if (dx || dy) {
      S.moved = true;
      var r = S.routes[String(p.id)];
      if (r) r.verts = r.verts.map(function (v) { return { x: v.x + dx, y: v.y + dy }; });
    }
    changed(); return;
  }
  if (g.type === 'draw' && g.moved) { finishStroke(g); return; }
  if (g.type === 'vertex') { changed(); return; }
  if (g.type === 'tap' || g.type === 'draw') {
    if (g.moved) { renderAll(); return; }
    tapPlayer(g.hit);
  }
  renderAll();
}
function finishStroke(g) {
  var id = g.id, p = P(id), pts = g.live.slice();
  pts[0] = copyPt(p);
  var verts = rdp(pts, 34 / Math.max(0.5, scaleNow() * 2.4));
  if (verts.length < 2 || routeLength(verts) < 60) { toast('Drag a little farther to draw the line'); renderAll(); return; }
  verts = verts.map(function (v, i) { return i === 0 ? copyPt(p) : { x: Math.round(v.x), y: Math.round(v.y) }; });
  if (S.mode === 'boot') { S.boot = { verts: verts, style: S.boot ? S.boot.style : 'curve' }; changed(); return; }
  var prev = S.routes[String(id)];
  S.routes[String(id)] = { kind: S.drawKind && String(S.sel) === String(id) ? S.drawKind : (prev ? prev.kind : defaultKind(p)), style: prev ? prev.style : 'straight', verts: verts };
  S.sel = id; S.drawKind = S.routes[String(id)].kind;
  changed();
}
function selectNothing() { S.sel = null; }
function tapPlayer(p) {
  if (!p) { if (S.step === 3) { S.sel = null; S.drawKind = null; } return; }
  var id = p.id;
  if (S.step === 3) {
    S.sel = id; S.drawKind = S.routes[String(id)] ? S.routes[String(id)].kind : defaultKind(p);
  } else if (S.step === 4) {
    ballTap(p);
  }
  changed();
}
function ballTap(p) {
  var key = String(p.id);
  if (isPassStyle()) {
    if (S.ballMode === 'fake') {
      if (isLine(p) || key === '1') return toast('Pick a back or receiver for the fake');
      S.fakeTo = S.fakeTo != null && String(S.fakeTo) === key ? null : p.id;
      if (S.fakeTo != null && !S.routes[key]) toast('#' + label(p) + ' has no path yet — go back to Draw to add the fake run');
      return;
    }
    if (!eligible(p)) return toast('Tap a receiver or back');
    var i = S.reads.findIndex(function (r) { return String(r) === key; });
    if (i !== -1) { S.reads.splice(i, 1); S.target = Math.min(S.target, Math.max(0, S.reads.length - 1)); }
    else {
      if (S.fakeTo != null && String(S.fakeTo) === key) S.fakeTo = null;
      S.reads.push(p.id);
      if (!S.routes[key]) toast('#' + label(p) + ' has no route yet — go back to Draw');
    }
  } else {
    if (isLine(p)) return toast('Tap a back or the QB');
    S.carrier = S.carrier != null && String(S.carrier) === key ? null : p.id;
    if (S.carrier != null && key !== '1' && !S.routes[key]) toast('#' + label(p) + ' has no path yet — go back to Draw');
  }
}

// pinch / wheel zoom
function startPinch() {
  gesture = null;
  var pts = Array.from(pointers.values());
  els.pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
}
function pinchMove() {
  var pts = Array.from(pointers.values()), pi = els.pinch; if (!pi) return;
  var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
  if (pi.d > 0) { var f = toField(cx, cy); zoomAt(f.x, f.y, pi.d / d); }
  var sc = scaleNow(); VB.x -= (cx - pi.cx) / sc; VB.y -= (cy - pi.cy) / sc; applyVB();
  els.pinch = { d: d, cx: cx, cy: cy };
}

// ---------------------------------------------------------------- changes
function changed() { autosave(); renderAll(); }
function renderAll() { renderScreens(); renderField(); renderDock(); renderSteps(); }
function setStep(n) {
  stopAnim();
  S.step = Math.max(0, Math.min(6, n)); S.mode = null;
  if (S.step === 3 && S.sel == null) S.sel = null;
  if (S.step === 4) S.ballMode = isPassStyle() ? (S.ballMode === 'fake' ? 'fake' : 'reads') : 'carry';
  if (S.step === 6) { flipSide = 'right'; }
  renderAll();
  if (S.step >= 2 && S.step !== 5) { requestAnimationFrame(function () { fitVB(); renderField(); if (S.step === 6) startAnim(); }); }
  autosave();
}

// ---------------------------------------------------------------- screens
function renderSteps() {
  var nav = document.getElementById('steps'); nav.innerHTML = '';
  STEPS.forEach(function (st, i) {
    nav.appendChild(h('div', { class: 'dot ' + (i < S.step ? 'done' : (i === S.step ? 'now' : '')) }, [h('i'), h('span', { text: st.t })]));
  });
  document.getElementById('title').textContent = S.name || (S.formation ? S.formation.label + (S.style ? ' · ' + styleOf().t : '') : 'Play Studio');
}
function miniFormation(f) {
  var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '120 -60 1360 560');
  f.positions.forEach(function (p) {
    var line = typeof p.id === 'string', qb = String(p.id) === '1';
    sv('circle', { cx: p.x, cy: p.y, r: 44, style: 'fill:' + (line ? 'var(--ol-fill)' : 'var(--sk-fill)') + ';stroke:' + (qb ? 'var(--accent)' : (line ? 'var(--ol-fill)' : 'var(--sk-stroke)')) + ';stroke-width:9' }, svg);
  });
  sv('line', { x1: 120, x2: 1480, y1: 157, y2: 157, stroke: '#e0570a', 'stroke-width': 6, 'stroke-dasharray': '24 14', opacity: 0.8 }, svg);
  return svg;
}
function draftRow(d, opts) {
  var f = d.formation && d.formation.label ? d.formation.label : d.formationId;
  var sub = [styleLabel(d.style), f, d.author ? 'by ' + d.author : ''].filter(Boolean).join(' · ');
  return h('div', { class: 'row' }, [
    h('div', { class: 'grow' }, [h('b', { text: d.name || 'Untitled play' }), h('small', { text: sub + (d.publishedAs ? ' · in playbook' : '') })]),
    h('button', { text: opts.label || 'Open', onclick: function () { openDraft(d); } }),
  ]);
}
function styleLabel(k) { var s = STYLES.find(function (x) { return x.k === k; }); return s ? s.t : ''; }
function openDraft(d) {
  stashDraft();
  S = restore(d); flipSide = 'right';
  if (!S.formation) { S.formation = clone(W.formations.find(function (f) { return f.id === S.formationId; }) || W.formations[0]); }
  setStep(S.step);
}
function renderScreens() {
  var scr = { 0: document.getElementById('scrFormation'), 1: document.getElementById('scrType'), 5: document.getElementById('scrOptions') };
  Object.keys(scr).forEach(function (k) { scr[k].classList.toggle('on', Number(k) === S.step); });
  els.wrap.classList.toggle('on', S.step !== 0 && S.step !== 1 && S.step !== 5);
  document.getElementById('exit').style.visibility = 'visible';
  if (S.step === 0) {
    var el = scr[0]; el.innerHTML = '';
    el.appendChild(h('h2', { text: 'Pick a formation' }));
    el.appendChild(h('p', { class: 'sub', text: 'Where does everyone line up to start?' }));
    var cards = h('div', { class: 'cards' });
    W.formations.forEach(function (f) {
      var c = h('div', { class: 'card' + (S.formationId === f.id ? ' sel' : ''), onclick: function () { chooseFormation(f); } }, [miniFormation(f), h('b', { text: f.label })]);
      cards.appendChild(c);
    });
    el.appendChild(cards);
    if (W.offline) el.appendChild(h('p', { class: 'sub', style: 'margin-top:14px', text: 'Offline — showing the built-in formations.' }));
    var cur = lsGet(LS_CUR, null), drafts = lsGet(LS_DRAFTS, []).filter(function (d) { return !cur || d.id !== cur.id; });
    if (cur && cur.id !== S.id) {
      var sh0 = h('div', { class: 'shelf' }, [h('h3', { text: 'Keep going' })]); sh0.appendChild(draftRow(cur, { label: 'Continue' })); el.appendChild(sh0);
    }
    if (drafts.length) {
      var sh = h('div', { class: 'shelf' }, [h('h3', { text: 'Drafts on this phone' })]);
      drafts.slice(0, 8).forEach(function (d) { sh.appendChild(draftRow(d, {})); }); el.appendChild(sh);
    }
    if (teamDrafts && teamDrafts.length) {
      var sh2 = h('div', { class: 'shelf' }, [h('h3', { text: 'Team inbox' })]);
      teamDrafts.slice(0, 20).forEach(function (d) { sh2.appendChild(draftRow(d, {})); }); el.appendChild(sh2);
    }
  } else if (S.step === 1) {
    var e1 = scr[1]; e1.innerHTML = '';
    e1.appendChild(h('h2', { text: 'What kind of play?' }));
    e1.appendChild(h('p', { class: 'sub', text: 'This tells the app how to show it.' }));
    var cs = h('div', { class: 'cards', style: 'grid-template-columns:1fr' });
    STYLES.forEach(function (st) {
      cs.appendChild(h('div', { class: 'card big' + (S.style === st.k ? ' sel' : ''), onclick: function () { chooseStyle(st.k); } }, [h('b', { text: st.t }), h('small', { text: st.d })]));
    });
    e1.appendChild(cs);
  } else if (S.step === 5) {
    renderOptions(scr[5]);
  }
}
function chooseFormation(f) {
  if (S.formationId !== f.id) {
    var keep = { author: S.author };
    S = fresh(); S.author = keep.author;
    S.formationId = f.id; S.baseFormation = clone(f); S.formation = clone(f);
  }
  setStep(1);
}
function chooseStyle(k) { S.style = k; S.ballMode = null; if (k === 'screen' || k === 'pass' || k === 'playaction') S.carrier = null; else { S.reads = []; S.fakeTo = null; } setStep(2); }

function seg(opts, value, onPick) {
  var d = h('div', { class: 'seg' });
  opts.forEach(function (o) { d.appendChild(h('button', { class: value === o.v ? 'on' : '', text: o.t, onclick: function () { onPick(o.v); } })); });
  return d;
}
function renderOptions(el) {
  el.innerHTML = '';
  el.appendChild(h('h2', { text: 'A few quick choices' }));
  el.appendChild(h('p', { class: 'sub', text: 'These decide which switches the app shows on this play.' }));
  var nameIn = h('input', { type: 'text', placeholder: 'Name it (like “Slant Flat”)', value: S.name, maxlength: '40', autocapitalize: 'words' });
  nameIn.addEventListener('input', function () { S.name = nameIn.value; renderSteps(); renderDock(); autosave(); });
  el.appendChild(h('div', { class: 'opt' }, [h('label', { class: 'q', text: 'Play name' }), nameIn]));
  var au = h('input', { type: 'text', placeholder: 'Your name (so others know who drew it)', value: S.author, maxlength: '30' });
  au.addEventListener('input', function () { S.author = au.value; try { localStorage.setItem(LS_AUTHOR, au.value); } catch (e) {} autosave(); });
  el.appendChild(h('div', { class: 'opt' }, [h('label', { class: 'q', text: 'Drawn by' }), au]));
  el.appendChild(h('div', { class: 'opt' }, [h('label', { class: 'q', text: 'Can it be flipped left and right?' }),
    h('div', { class: 'why', text: 'Yes = the app lets coaches run it either way. No = it only works as drawn.' }),
    seg([{ v: true, t: 'Yes, flip it' }, { v: false, t: 'No, as drawn' }], S.opts.flip, function (v) { S.opts.flip = v; changed(); })]));
  el.appendChild(h('div', { class: 'opt' }, [h('label', { class: 'q', text: 'Can a player go in motion?' }),
    h('div', { class: 'why', text: 'Shows the Motion switch on this play.' }),
    seg([{ v: true, t: 'Yes' }, { v: false, t: 'No' }], S.opts.motion, function (v) { S.opts.motion = v; changed(); })]));
  var bootBox = h('div', { class: 'opt' }, [h('label', { class: 'q', text: 'Is there a QB boot?' }),
    h('div', { class: 'why', text: 'The QB fakes it and runs the other way on his own.' }),
    seg([{ v: true, t: 'Yes' }, { v: false, t: 'No' }], S.opts.boot, function (v) { S.opts.boot = v; if (v && !S.boot) S.boot = null; changed(); })]);
  if (S.opts.boot) {
    bootBox.appendChild(h('button', { class: 'link', text: S.boot && S.boot.verts.length > 1 ? '✓ Boot drawn — redraw it' : '→ Draw where the QB goes', onclick: function () { S.mode = 'boot'; S.step = 3; renderAll(); requestAnimationFrame(function () { fitVB(); renderField(); }); } }));
  }
  el.appendChild(bootBox);
}

// ---------------------------------------------------------------- dock
function chip(text, on, fn, cls) { return h('button', { class: 'chip' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), text: text, onclick: fn }); }
function can(step) {
  if (step === 0) return !!S.formationId;
  if (step === 1) return !!S.style;
  if (step === 3) return Object.keys(S.routes).length > 0;
  if (step === 4) return isPassStyle() ? S.reads.length > 0 : S.carrier != null;
  if (step === 5) return !!S.name.trim() && (!S.opts.boot || (S.boot && S.boot.verts.length > 1));
  return true;
}
function dockHint() {
  switch (S.step) {
    case 0: return 'Tap the formation you want to start from.';
    case 1: return 'Pick one.';
    case 2: return 'Drag any player to move him. Happy with the spots? Tap Next.';
    case 3: if (S.mode === 'boot') return 'Drag from the QB to draw where he goes on the boot.';
      if (S.sel == null) return 'Tap a player, then drag to draw his route. Pinch to zoom.';
      return '#' + label(P(S.sel)) + ' — drag from him to redraw, or drag a white corner to adjust.';
    case 4:
      if (isPassStyle()) return S.ballMode === 'fake' ? 'Tap the back who takes the fake handoff.' : 'Tap your receivers in the order you read them: 1st, 2nd, 3rd…';
      return 'Tap the player who gets the ball.';
    case 5: return !S.name.trim() ? 'Give the play a name to continue.' : ((S.opts.boot && !(S.boot && S.boot.verts.length > 1)) ? 'Draw where the QB goes on the boot to continue.' : '');
    case 6: return 'This is how the app will show it.';
  }
  return '';
}
function bubbleText() {
  if (S.step === 3 && S.mode === 'boot') return 'QB boot path';
  if (S.step === 2) return 'Set your players';
  if (S.step === 3) return S.sel == null ? 'Tap a player to draw' : 'Drawing #' + label(P(S.sel));
  if (S.step === 4) return isPassStyle() ? (S.ballMode === 'fake' ? 'Who gets the fake?' : 'Pick the reads in order') : 'Who gets the ball?';
  if (S.step === 6) return flipSide === 'left' ? 'Flipped left' : 'As drawn';
  return '';
}
function renderDock() {
  var prompt = document.getElementById('prompt'), chips = document.getElementById('chips'), nav = document.getElementById('nav');
  prompt.textContent = dockHint(); chips.innerHTML = ''; chips.style.display = 'flex';
  document.getElementById('bubbleTxt').textContent = bubbleText();
  document.getElementById('bubble').style.display = bubbleText() ? 'flex' : 'none';
  var left = document.getElementById('leftCtl'); left.innerHTML = '';
  if (S.step >= 2 && S.step !== 5) left.appendChild(h('button', { class: S.defense ? 'on' : '', text: S.defense ? 'Defense: on' : 'Defense: off', onclick: function () { S.defense = !S.defense; renderField(); renderDock(); } }));
  nav.innerHTML = '';
  var back = h('button', { id: 'back', text: 'Back', onclick: onBack }), next = h('button', { id: 'next', text: 'Next', onclick: onNext });
  next.disabled = !can(S.step);
  nav.appendChild(back); nav.appendChild(next);
  if (S.step === 0 || S.step === 1) { chips.style.display = 'none'; next.style.display = 'none'; back.style.flex = '1'; }
  if (S.step === 0) nav.style.display = 'none'; else nav.style.display = '';
  if (S.step === 2) {
    chips.appendChild(chip('Reset spots', false, function () { S.formation = clone(S.baseFormation); S.moved = false; Object.keys(S.routes).forEach(function (k) { delete S.routes[k]; }); changed(); }));
  }
  if (S.step === 3 && S.mode === 'boot') {
    chips.appendChild(chip('Straight', S.boot && S.boot.style === 'straight', function () { if (S.boot) { S.boot.style = 'straight'; changed(); } }));
    chips.appendChild(chip('Curved', !S.boot || S.boot.style === 'curve', function () { if (S.boot) { S.boot.style = 'curve'; changed(); } }));
    chips.appendChild(chip('Clear', false, function () { S.boot = null; changed(); }, 'danger'));
    nav.innerHTML = '';
    nav.appendChild(h('button', { class: 'go', text: 'Done', onclick: function () { S.mode = null; setStep(5); } }));
  } else if (S.step === 3) {
    var r = S.sel != null ? S.routes[String(S.sel)] : null, p = S.sel != null ? P(S.sel) : null;
    if (p) {
      var kind = r ? r.kind : (S.drawKind || defaultKind(p));
      chips.appendChild(chip('Route →', kind === 'run', function () { setKind('run'); }));
      chips.appendChild(chip('Block ┤', kind === 'block', function () { setKind('block'); }));
      if (r) {
        chips.appendChild(chip('Straight', r.style === 'straight', function () { r.style = 'straight'; changed(); }));
        chips.appendChild(chip('Curved', r.style === 'curve', function () { r.style = 'curve'; changed(); }));
        chips.appendChild(chip('Clear', false, function () { delete S.routes[String(S.sel)]; changed(); }, 'danger'));
      }
    }
    chips.appendChild(chip('Blocks for the line', false, autoBlock));
    if (!p && Object.keys(S.routes).length) chips.appendChild(chip('Clear all', false, function () { S.routes = {}; S.sel = null; changed(); }, 'danger'));
  }
  if (S.step === 4) {
    if (isPassStyle()) {
      if (S.style === 'playaction') {
        chips.appendChild(chip('① Fake', S.ballMode === 'fake', function () { S.ballMode = 'fake'; changed(); }));
        chips.appendChild(chip('② Reads', S.ballMode !== 'fake', function () { S.ballMode = 'reads'; changed(); }));
      }
      if (S.ballMode !== 'fake') {
        if (S.reads.length > 1) S.reads.forEach(function (id, i) { chips.appendChild(chip('Throw to ' + (i + 1), S.target === i, function () { S.target = i; changed(); })); });
        if (S.reads.length) chips.appendChild(chip('Undo last', false, function () { S.reads.pop(); S.target = Math.min(S.target, Math.max(0, S.reads.length - 1)); changed(); }));
      } else if (S.fakeTo != null) chips.appendChild(chip('No fake', false, function () { S.fakeTo = null; changed(); }));
    } else {
      [{ v: 'handoff', t: 'Handoff' }, { v: 'pitch', t: 'Pitch' }].forEach(function (o) {
        var qbCarry = S.carrier != null && String(S.carrier) === '1';
        var b = chip(o.t, !qbCarry && S.carryHow === o.v, function () { S.carryHow = o.v; changed(); }); b.disabled = qbCarry; chips.appendChild(b);
      });
      chips.appendChild(chip('QB keeps', S.carrier != null && String(S.carrier) === '1', function () { S.carrier = 1; changed(); }));
    }
    if (isPassStyle() && S.reads.length === 0) { /* hint shown above */ }
  }
  if (S.step === 6) {
    chips.appendChild(chip('▶ Replay', false, function () { startAnim(); }));
    chips.appendChild(chip('⇄ Flip it', flipSide === 'left', function () { flipSide = flipSide === 'left' ? 'right' : 'left'; if (!S.opts.flip) toast('You turned flipping off, so the app will not offer this.'); renderField(); renderDock(); startAnim(); }));
    nav.innerHTML = '';
    nav.appendChild(h('button', { class: 'sec', text: 'Back', onclick: onBack }));
    nav.appendChild(h('button', { class: 'sec', text: 'Save & share', onclick: onShare }));
    if (isAdmin) nav.appendChild(h('button', { class: 'go', text: S.publishedAs ? 'Update in playbook' : 'Add to playbook', onclick: onPublish }));
    else nav.lastChild.className = 'go';
    prompt.textContent = summary();
  }
}
function setKind(k) { if (S.sel == null) return; S.drawKind = k; var r = S.routes[String(S.sel)]; if (r) r.kind = k; changed(); }
function autoBlock() {
  var n = 0;
  S.formation.positions.forEach(function (p) {
    if (!isLine(p) || S.routes[String(p.id)]) return;
    var len = isPassStyle() ? 40 : 90;
    S.routes[String(p.id)] = { kind: 'block', style: 'straight', verts: [copyPt(p), { x: p.x, y: p.y - len }] }; n++;
  });
  toast(n ? 'Added blocks for the line — tap any lineman to change his' : 'The line already has blocks');
  changed();
}
function summary() {
  var bits = [styleLabel(S.style), S.formation.label];
  if (isPassStyle() && S.reads.length) bits.push('Reads ' + S.reads.map(function (id) { return '#' + label(P(id)); }).join(' → '));
  if (!isPassStyle() && S.carrier != null) bits.push('Ball to #' + label(P(S.carrier)));
  bits.push(S.opts.flip ? 'Flips' : 'One way'); if (S.opts.motion) bits.push('Motion'); if (S.opts.boot) bits.push('Boot');
  return bits.join(' · ');
}
function onBack() {
  if (S.mode === 'boot') { S.mode = null; setStep(5); return; }
  setStep(S.step - 1);
}
function onNext() {
  if (!can(S.step)) return;
  if (S.step === 3 && !Object.keys(S.routes).some(function (k) { return S.routes[k].kind === 'block'; }) && !S._askedBlocks) { S._askedBlocks = true; toast('Tip: “Blocks for the line” adds the linemen in one tap', 3500); }
  S.sel = null;
  setStep(S.step + 1);
}

// ---------------------------------------------------------------- animation
function stopAnim() { if (anim && anim.raf) cancelAnimationFrame(anim.raf); anim = null; var g = document.getElementById('animLayer'); if (g) g.remove(); var pg = document.getElementById('players'); if (pg) pg.style.display = ''; }
function startAnim() {
  stopAnim();
  if (S.step !== 6) return;
  var res = resolveSide(flipSide), play = buildPlay(), svg = els.field, pg = document.getElementById('players');
  var layer = sv('g', { id: 'animLayer' }, svg), tracks = {}, dots = {};
  S.formation.positions.forEach(function (p) {
    var key = String(p.id), pts = res.pts[key], start = res.pos[key];
    tracks[key] = pts ? poly(pts) : { pts: [start], cum: [0], total: 0 };
    var g = sv('g', { class: 'pl ' + (isLine(p) ? 'ol' : 'sk') }, layer);
    sv('circle', { class: 'body', r: 40 }, g); var t = sv('text', { x: 0, y: 2 }, g); t.textContent = label(p);
    dots[key] = g;
  });
  if (pg) pg.style.display = 'none';
  var legs = (play.variants[0].ballPath || []).map(function (leg, i) {
    var info = ballInfo().legs[i], f = i === 0 ? 0 : Math.max(0.12, info.frac);
    return { key: String(leg.player), t: f * ANIM_MS, how: i === 0 ? 'snap' : leg.how };
  });
  for (var j = 1; j < legs.length; j++) if (legs[j].t <= legs[j - 1].t) legs[j].t = legs[j - 1].t + 300;
  var ball = sv('ellipse', { class: 'ball', rx: 22, ry: 14 }, layer);
  var holder0 = legs.length ? legs[0].key : (ballInfo().carrierId != null ? String(ballInfo().carrierId) : '1');
  var t0 = performance.now();
  anim = { raf: 0 };
  function posAt(key, ms) { var tr = tracks[key]; return atFrac(tr, Math.min(1, ms / ANIM_MS)); }
  function frame(now) {
    var ms = now - t0, done = ms > ANIM_MS + 600;
    Object.keys(dots).forEach(function (key) { var q = posAt(key, ms); dots[key].setAttribute('transform', 'translate(' + q.x + ' ' + q.y + ')'); });
    var holder = holder0, prev = null, next = null;
    for (var i = 0; i < legs.length; i++) { if (ms >= legs[i].t) { holder = legs[i].key; prev = legs[i]; } else if (!next) next = legs[i]; }
    var bp = posAt(holder, ms);
    if (next && next.how === 'pass' && ms > next.t - 380) {
      var u = (ms - (next.t - 380)) / 380, tgt = posAt(next.key, next.t), from = posAt(holder, ms);
      bp = { x: from.x + (tgt.x - from.x) * u, y: from.y + (tgt.y - from.y) * u - Math.sin(u * Math.PI) * 60 };
    } else if (prev && prev.how !== 'snap' && prev.how !== 'pass' && ms - prev.t < 160) {
      /* instant exchange for hand-offs and pitches */
    }
    ball.setAttribute('cx', bp.x + 22); ball.setAttribute('cy', bp.y - 18);
    if (!done) anim.raf = requestAnimationFrame(frame);
    else stopAnim();
  }
  anim.raf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- save / share / publish
async function onShare() {
  stashDraft(); lsSet(LS_CUR, snapshot());
  var url = shareUrl(), title = (S.name || 'New play') + ' — Bengals play', inbox = '';
  try { await sendToInbox(); inbox = ' Sent to the team inbox.'; } catch (e) { inbox = ' (Team inbox unavailable right now.)'; }
  if (navigator.share) {
    try { await navigator.share({ title: title, text: title + ' (' + summary() + ')', url: url }); toast('Shared.' + inbox); return; } catch (e) { if (e && e.name === 'AbortError') { toast('Saved on this phone.' + inbox); return; } }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied — paste it in a text.' + inbox, 4000); }
  catch (e) { window.prompt('Copy this link to share the play:', url); }
}
async function ensureCurated(formationId) {
  if (!window.AssignmentStore) return;
  var key = formationId === 'shotgun' ? 'wing' : formationId;
  try {
    var all = await window.AssignmentStore.loadFormationPlays(), cur = all[key] || [];
    if (cur.indexOf(S.id) !== -1) return;
    if (!cur.length && (key === 'wing' || key === 'split')) return; // built-in formations already show every play
    await window.AssignmentStore.saveFormationPlays(key, cur.concat([S.id]));
  } catch (e) { console.error('[play-studio] could not add play to the formation list (continuing):', e); }
}
async function onPublish() {
  if (!can(5)) { toast('Name it and finish the Options first'); return; }
  if (S.formationId === 'split') { stashDraft(); toast('Split plays can’t go into the app yet — your draft is saved and shareable.', 4500); return; }
  if (!canPublish()) { stashDraft(); toast('Adding to the playbook needs a signed-in coach account. Your draft is saved.', 4500); return; }
  var btn = document.querySelector('#nav .go'); if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    var formationId = S.formationId;
    if (S.moved) {
      var copyId = S.publishedFormationId || ('studio_f_' + rid());
      var nf = clone(S.formation); nf.id = copyId; nf.label = (S.baseFormation.label || 'Formation') + ' · ' + S.name;
      await window.PlayBuilderStore.saveFormation(nf); S.publishedFormationId = copyId; formationId = copyId;
    }
    var play = buildPlay(formationId);
    await window.PlayBuilderStore.savePlay(play);
    await ensureCurated(formationId);
    S.publishedAs = play.id; stashDraft(); lsSet(LS_CUR, snapshot());
    toast('Added to the playbook' + (S.moved ? ' with its own formation' : '') + '.', 4000);
  } catch (e) {
    console.error('[play-studio] publish failed:', e);
    stashDraft(); toast('Could not reach the playbook (' + (e && e.message || 'error') + '). Draft saved on this phone.', 5000);
  }
  renderAll();
}

// ---------------------------------------------------------------- boot
function newPlay() { stashDraft(); try { localStorage.removeItem(LS_CUR); } catch (e) {} var a = S.author; S = fresh(); S.author = a; flipSide = 'right'; setStep(0); }
function importFromHash() {
  var m = /^#d=(.+)$/.exec(location.hash || ''); if (!m) return false;
  try {
    var snap = JSON.parse(b64dec(m[1]));
    if (snap && snap.v === 1 && snap.formation) {
      stashDraft(); snap.id = snap.id || ('studio_' + rid());
      var existing = lsGet(LS_DRAFTS, []).find(function (d) { return d.id === snap.id; });
      S = restore(snap); S.step = Object.keys(S.routes).length ? 6 : 2;
      history.replaceState(null, '', location.pathname + location.search);
      toast((existing ? 'Updated “' : 'Opened “') + (S.name || 'a play') + '”' + (snap.author ? ' from ' + snap.author : ''), 3500);
      return true;
    }
  } catch (e) { toast('That link didn’t open'); }
  return false;
}
function init() {
  els.field = document.getElementById('field'); els.wrap = document.getElementById('canvasWrap');
  els.field.addEventListener('pointerdown', onDown); els.field.addEventListener('pointermove', onMove);
  els.field.addEventListener('pointerup', onUp); els.field.addEventListener('pointercancel', onUp);
  els.field.addEventListener('wheel', function (ev) { ev.preventDefault(); var f = toField(ev.clientX, ev.clientY); zoomAt(f.x, f.y, ev.deltaY > 0 ? 1.12 : 0.89); renderField(); }, { passive: false });
  document.getElementById('zIn').onclick = function () { zoomAt(VB.x + VB.w / 2, VB.y + VB.h / 2, 0.8); renderField(); };
  document.getElementById('zOut').onclick = function () { zoomAt(VB.x + VB.w / 2, VB.y + VB.h / 2, 1.25); renderField(); };
  document.getElementById('zFit').onclick = function () { fitVB(); renderField(); };
  document.getElementById('newBtn').onclick = newPlay;
  document.getElementById('rotateX').onclick = function () { document.getElementById('rotateHint').classList.remove('show'); };
  window.addEventListener('resize', function () { if (S.step >= 2 && S.step !== 5) { fitVB(); renderField(); } });
  S.author = localStorage.getItem(LS_AUTHOR) || '';
  loadWorld().then(function () {
    var imported = importFromHash();
    // An unfinished play from last time is offered under "Keep going" on the
    // formation screen rather than reopened silently -- a coach starting a
    // new play should not land inside an old one.
    renderAll(); fitVB(); renderField();
    if (S.step >= 2) setStep(S.step);
    loadTeamDrafts();
  });
}
window.PlayStudio = {
  get state() { return S; }, buildPlay: buildPlay, resolveSide: resolveSide, chain: chain, poly: poly, atFrac: atFrac,
  setStep: setStep, restore: function (snap) { S = restore(snap); renderAll(); }, world: W, publish: onPublish, shareUrl: shareUrl,
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
