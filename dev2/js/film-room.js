// Film Room -- Nathan (2026-11-07): "some teams don't even do film night, so
// having the videos available for them would be a huge advantage ... an
// expansion of the film room when kids went in to watch it instead of just
// having it on a pop-up player from the Google Drive. It would have some
// interface similar to Huddle where they could make notes or add comments so
// other players and coaches on the team could see their comments ... like,
// hey, this kid is always looking to the left when he runs left ... And
// having some gamification where kids are getting credit or points based on
// their contributions in the app, especially towards the team."
//
// One tab with every film the app already knows about: our own game footage
// (schedule.json gameFootage), each game's opponent scouting film
// (opponentFilms / opponentFilmUrl) and the team-keyed opponent film library
// (js/opponent-film.js). A film opens in the app, full width, with the
// team's notes under it. Every other film button in the app (Schedule, This
// Week, Standings) now opens the film here for players and coaches; parents,
// who don't have this tab, keep the inline player (js/schedule.js).
//
// THE PLAYER depends on where the film lives:
//   - YouTube: the IFrame API, so "Mark this moment" stamps the exact time
//     and tapping a note's time seeks straight to it.
//   - Google Drive (most film today): Drive's embedded player. It neither
//     tells this page where it is nor takes a start time (tested 2026-11-07,
//     and the same finding is noted in js/schedule.js), so a note's time is
//     typed from the player's clock and tapping a note's time shows where to
//     drag to instead of reloading the film from the start.
//   - A Drive folder: Drive's folder view (a list of clips).
//
// NOTES live at filmRoom/notes/{filmKey}/{noteId}, keyed by the Drive file
// or YouTube id so the same film opened from anywhere shares one thread:
//   { t, text, tag, by, byId, at, coach, pick, pickAt,
//     likes:{playerId: isoTime}, replies:{id:{text, by, byId, at, coach}} }
// Names are behind the same sign-in as everything else; nothing is stored in
// this public repo.
//
// If the database ever refuses filmRoom (its rules allowlist top-level
// paths), the tab says so and shows the rule to add:
//   "filmRoom": { ".read": "auth != null", ".write": "auth != null" }
//
// POINTS are worked out from the notes themselves (no second store to drift
// out of sync): post a note +5, reply +2, each teammate "I see it too" on
// your note +1, coach's pick on your note +10, each film you open +1 (from
// the existing filmViews log, js/film-views.js).
(function () {
  'use strict';

  var DB = (typeof FIREBASE_DB_URL !== 'undefined' ? FIREBASE_DB_URL : window.FIREBASE_DB_URL) || 'https://aslbengals-default-rtdb.firebaseio.com';
  var NOTES = DB + '/filmRoom/notes';
  var PTS = { note: 5, reply: 2, like: 1, pick: 10, view: 1 };
  var TEAM_GOAL = 30; // team notes per week (Mon-Sun)
  var TAGS = [
    { k: 'O', label: 'Their offense', color: '#d6359b' },
    { k: 'D', label: 'Their defense', color: '#1f5fd6' },
    { k: 'ST', label: 'Special teams', color: '#0e9a8a' },
    { k: 'US', label: 'Us', color: '#e0570a' },
  ];
  var ORANGE = '#ff6a13';
  var SEEN_KEY = 'aslFilmRoomLastSeen';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function me() {
    var s = (window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession()) || {};
    return { id: s.playerId || null, name: s.name || '', coach: !!window.isCoachSession };
  }
  // Where a film lives, and the id that keys its notes.
  function source(url) {
    url = String(url || '');
    var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/);
    if (m) return { kind: 'youtube', id: m[1], key: 'yt_' + m[1] };
    m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m && /drive\.google\.com/.test(url)) return { kind: 'folder', id: m[1], key: 'fo_' + m[1] };
    m = url.match(/\/d\/([A-Za-z0-9_-]{10,})/) || url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m && /drive\.google\.com/.test(url)) return { kind: 'drive', id: m[1], key: m[1] };
    var h = 0;
    for (var i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
    return { kind: 'link', id: null, key: 'u' + (h >>> 0).toString(36) };
  }
  function keyFor(url) { return source(url).key; }
  function fmt(t) {
    t = Math.max(0, Math.round(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  // "12:34", "1:02:03", "754" -> seconds; '' -> null; garbage -> NaN
  function parseTime(v) {
    v = String(v || '').trim();
    if (!v) return null;
    if (!/^\d+(:\d{1,2}){0,2}$/.test(v)) return NaN;
    return v.split(':').reduce(function (a, p) { return a * 60 + (+p); }, 0);
  }
  function weekStart(d) {
    d = new Date(d || Date.now());
    var day = (d.getDay() + 6) % 7; // Monday = 0
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d.getTime();
  }
  function getSeen() { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch (e) { return 0; } }
  function setSeen(t) { try { localStorage.setItem(SEEN_KEY, String(t)); } catch (e) { /* private mode */ } }
  function tagOf(k) { return TAGS.filter(function (x) { return x.k === k; })[0] || TAGS[0]; }

  // ---- Database (REST, signed like every other call in the app) ----
  var lastError = null;
  function req(path, method, body) {
    return window.firebaseAuthed(path).then(function (u) {
      return fetch(u, method ? { method: method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) } : { cache: 'no-store' });
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) { lastError = 'setup'; throw new Error('setup'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      lastError = null;
      return r.json();
    });
  }
  var allNotes = null; // { filmKey: { noteId: note } }
  function loadAll(force) {
    if (allNotes && !force) return Promise.resolve(allNotes);
    return req(NOTES + '.json').then(function (d) { allNotes = d || {}; return allNotes; });
  }
  function loadViews() {
    return req(DB + '/filmViews.json').then(function (d) { return d || {}; }).catch(function () { return {}; });
  }

  // ---- Films: our game footage + scouting film, from what the app already has ----
  function loadFilms() {
    var sched = req(DB + '/schedule.json').catch(function () { return []; });
    var lib = window.OpponentFilm ? window.OpponentFilm.load().catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([sched, lib]).then(function (r) {
      var games = (Array.isArray(r[0]) ? r[0] : Object.values(r[0] || {})).filter(function (g) { return g && g.date && g.opponent && g.gameType !== 'Bye'; });
      games.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      var today = new Date().toISOString().slice(0, 10), seen = {}, out = [];
      function add(group, game, title, url) {
        if (!url || seen[keyFor(url)]) return;
        seen[keyFor(url)] = 1;
        out.push({ group: group, game: game, title: title, url: url, key: keyFor(url) });
      }
      games.forEach(function (g) {
        var upcoming = String(g.date) >= today;
        var scout = (Array.isArray(g.opponentFilms) ? g.opponentFilms : []).filter(function (c) { return c && c.url; });
        if (g.opponentFilmUrl) scout.unshift({ url: g.opponentFilmUrl, title: g.opponentFilmNote || 'Scouting film' });
        if (window.OpponentFilm) window.OpponentFilm.clipsForTeam(r[1], g.opponent).forEach(function (c) { scout.push(c); });
        scout.forEach(function (c) { add(upcoming ? 'next' : 'scout', g, c.title || c.note || 'Scouting film', c.url); });
        (Array.isArray(g.gameFootage) ? g.gameFootage : []).forEach(function (c) { if (c && c.url) add('ours', g, c.title || 'Game film', c.url); });
      });
      return { films: out, games: games };
    });
  }

  // ---- Points ----
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  function score(notes, views) {
    var by = {};
    function bump(id, name, pts, what) {
      if (!id) return;
      var p = by[id] = by[id] || { id: id, name: name, pts: 0, notes: 0, replies: 0, likes: 0, picks: 0, views: 0 };
      if (name) p.name = name;
      p.pts += pts; p[what]++;
    }
    Object.keys(notes || {}).forEach(function (fk) {
      Object.values(notes[fk] || {}).forEach(function (n) {
        if (!n) return;
        if (!n.coach) {
          bump(n.byId, n.by, PTS.note, 'notes');
          Object.keys(n.likes || {}).forEach(function (lid) { if (lid !== n.byId) bump(n.byId, n.by, PTS.like, 'likes'); });
          if (n.pick) bump(n.byId, n.by, PTS.pick, 'picks');
        }
        Object.values(n.replies || {}).forEach(function (rp) { if (rp && !rp.coach) bump(rp.byId, rp.by, PTS.reply, 'replies'); });
      });
    });
    // Film views are keyed by name (js/film-views.js); they only add to a
    // player already on the board, so a view alone never puts a name up there.
    var byName = {};
    Object.values(by).forEach(function (p) { byName[slug(p.name)] = p; });
    Object.values(views || {}).forEach(function (film) {
      Object.values(film || {}).forEach(function (v) {
        if (!v || v.isCoach) return;
        var p = byName[slug(v.name)];
        if (p) { var c = Math.max(1, v.count || 1); p.pts += c * PTS.view; p.views += c; }
      });
    });
    return Object.values(by).sort(function (a, b) { return b.pts - a.pts || a.name.localeCompare(b.name); });
  }
  function badges(p) {
    var b = [];
    if (p.notes >= 1) b.push('🔎 Scout');
    if (p.notes >= 10) b.push('🎬 Film Rat');
    if (p.picks >= 1) b.push('⭐ Coach\'s Pick');
    if (p.picks >= 3) b.push('🦅 Eagle Eye');
    if (p.replies >= 5) b.push('🤝 Teammate');
    return b;
  }
  function teamWeek(notes) {
    var since = weekStart(), n = 0;
    Object.values(notes || {}).forEach(function (f) {
      Object.values(f || {}).forEach(function (x) { if (x && !x.coach && Date.parse(x.at) >= since) n++; });
    });
    return n;
  }
  // What happened since this device last opened the Film Room.
  function news(notes, since) {
    var mine = me(), out = { notes: 0, picks: 0, likes: 0, replies: 0 };
    Object.values(notes || {}).forEach(function (f) {
      Object.values(f || {}).forEach(function (n) {
        if (!n) return;
        if (n.byId !== mine.id && Date.parse(n.at) > since) out.notes++;
        if (n.byId === mine.id && mine.id) {
          if (n.pick && Date.parse(n.pickAt) > since) out.picks++;
          Object.keys(n.likes || {}).forEach(function (k) { var v = n.likes[k]; if (k !== mine.id && typeof v === 'string' && Date.parse(v) > since) out.likes++; });
          Object.values(n.replies || {}).forEach(function (r) { if (r && r.byId !== mine.id && Date.parse(r.at) > since) out.replies++; });
        }
      });
    });
    return out;
  }

  // ---- NEW badge on the tab: teammates' notes since this device last looked ----
  function setBadge(n) {
    var btn = document.getElementById('filmSectionBtn');
    if (!btn) return;
    var b = document.getElementById('filmNewBadge');
    if (!b) {
      b = document.createElement('span');
      b.id = 'filmNewBadge';
      b.className = 'modeNewBadge';
      btn.appendChild(b);
    }
    b.textContent = n > 9 ? '9+' : String(n);
    b.style.display = n > 0 ? '' : 'none';
  }
  function refreshBadge() {
    if (!me().id) return;
    if (!getSeen()) setSeen(Date.now()); // first visit: start counting from now
    loadAll(true).then(function (notes) {
      var n = news(notes, getSeen());
      setBadge(n.notes + n.picks + n.likes + n.replies);
    }).catch(function () { /* tab still works; badge is best-effort */ });
  }

  // ---- Look ----
  var CSS = '<style>' +
    '.frWrap{max-width:900px;margin:0 auto}' +
    '.frHead{display:flex;align-items:center;gap:10px;margin:4px 2px 10px}' +
    '.frHead h3{margin:0;font-size:22px;font-weight:900}' +
    '.frCard{background:var(--card,#fff);border:2px solid var(--line,#e6e2da);border-radius:12px;padding:12px;margin:10px 0}' +
    '.frBar{height:10px;background:#eee;border-radius:5px;overflow:hidden;margin-top:6px}.frBar i{display:block;height:100%;background:' + ORANGE + '}' +
    '.frGroupT{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;opacity:.65;margin:16px 2px 6px}' +
    '.frFilm{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--card,#fff);border:2px solid var(--line,#e6e2da);border-radius:12px;padding:10px 12px;margin:6px 0;cursor:pointer;font:inherit;color:inherit}' +
    '.frFilm b{display:block;font-size:15px}.frFilm small{opacity:.7;font-size:12px}' +
    '.frFilm .frCount{margin-left:auto;flex:none;font-size:12px;font-weight:900;padding:3px 9px;border-radius:999px;background:#fff1e8;color:#c24a00}' +
    '.frReport{border-color:' + ORANGE + '}' +
    '.frPlayer{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden}.frPlayer iframe,.frPlayer > div{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '.frPlayer.folder{aspect-ratio:auto;height:min(60vh,520px);background:#fff}' +
    '.frBtn{border:0;border-radius:10px;padding:10px 14px;font-weight:900;font-size:14px;cursor:pointer;background:#111;color:#fff}' +
    '.frBtn.lite{background:#eee;color:#111}.frBtn.org{background:' + ORANGE + ';color:#000}' +
    '.frChip{border:2px solid transparent;border-radius:999px;padding:5px 11px;font-size:13px;font-weight:900;cursor:pointer;background:#f1f1f1;color:#333}' +
    '.frTime{font-variant-numeric:tabular-nums;font-weight:900;border:0;border-radius:8px;padding:4px 8px;background:#111;color:#fff;cursor:pointer;font-size:13px}' +
    '.frNote{border-top:1px solid var(--line,#e6e2da);padding:10px 0}' +
    '.frNote.hl{background:#fff4e8}' +
    '.frNote .frMeta{font-size:12px;opacity:.7;margin-top:4px}' +
    '.frAct{border:0;background:none;font-weight:800;font-size:13px;cursor:pointer;padding:4px 6px;color:#555}' +
    '.frAct.on{color:' + ORANGE + '}' +
    '.frReply{margin:6px 0 0 14px;padding-left:10px;border-left:3px solid #eee;font-size:14px}' +
    '.frIn{width:100%;box-sizing:border-box;border:2px solid #ccc;border-radius:10px;padding:10px;font:inherit;font-size:15px}' +
    '.frRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
    '.frMsg{padding:10px 12px;border-radius:10px;background:#fff4e8;border:2px solid ' + ORANGE + ';font-size:14px;margin:8px 0;color:#1b1b1b}' +
    '.frDrag{display:none;margin:8px 0 0;padding:10px 12px;border-radius:10px;background:#111;color:#fff;font-weight:900;font-size:15px;text-align:center}' +
    '.frNews{padding:10px 12px;border-radius:10px;background:#fff8d6;border:2px solid #f2c200;font-size:14px;margin:8px 0;color:#1b1b1b}' +
    '.frLb{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line,#e6e2da)}' +
    '.frLb .r{width:28px;text-align:center;font-weight:900}.frLb .n{flex:1;min-width:0}.frLb .p{font-weight:900}' +
    '.frBadge{display:inline-block;font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;background:#f3f3f3;color:#333;margin:2px 4px 0 0}' +
    '</style>';

  function setupMsg() {
    return '<div class="frMsg"><b>Film notes need a one-time setup.</b> ' +
      (me().coach ? 'In the Firebase Console › Realtime Database › Rules, add <code>"filmRoom": { ".read": "auth != null", ".write": "auth != null" }</code> next to the other paths, then reload.'
        : 'Ask a coach to turn on Film Room notes.') + '</div>';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  // ---- Screens ----
  var host = null, state = { films: [], games: [] }, pending = null, ytPlayer = null;

  function home() {
    ytPlayer = null;
    host.innerHTML = CSS + '<div class="frWrap"><div class="lbEmpty">Loading the film room…</div></div>';
    Promise.all([loadFilms(), loadAll(true).catch(function () { return null; }), loadViews()]).then(function (r) {
      if (!host.isConnected) return;
      state = r[0];
      if (pending) {
        var p = pending; pending = null;
        var found = state.films.filter(function (x) { return x.key === keyFor(p.url); })[0];
        return openFilm(found || { group: 'other', game: { opponent: p.label || 'Film', id: p.gameId }, title: p.title || 'Film', url: p.url, key: keyFor(p.url) }, { skipLog: p.skipLog });
      }
      var notes = r[1], views = r[2], board = notes ? score(notes, views) : [], mine = me();
      var myRank = board.findIndex(function (q) { return q.id === mine.id; }), my = board[myRank];
      var wk = notes ? teamWeek(notes) : 0;
      var since = getSeen(), nw = notes ? news(notes, since) : null;
      setSeen(Date.now());
      setBadge(0);
      var newsBits = [];
      if (nw && nw.picks) newsBits.push('⭐ A coach picked ' + plural(nw.picks, 'of your notes', 'of your notes').replace(/^1 of your notes/, 'your note'));
      if (nw && nw.likes) newsBits.push('👍 ' + plural(nw.likes, 'teammate') + ' said "I see it too" on your notes');
      if (nw && nw.replies) newsBits.push('💬 ' + plural(nw.replies, 'reply', 'replies') + ' on your notes');
      if (nw && nw.notes) newsBits.push('🆕 ' + plural(nw.notes, 'new note') + ' from the team');
      var groups = [
        { k: 'next', t: '🔜 Next opponent' },
        { k: 'ours', t: '🏈 Our games' },
        { k: 'scout', t: '📼 Past scouting film' },
      ];
      var count = function (f) { return notes && notes[f.key] ? Object.keys(notes[f.key]).length : 0; };
      var nextOpp = (state.films.filter(function (f) { return f.group === 'next'; })[0] || {}).game;
      var reportCount = nextOpp ? reportNotes(nextOpp.opponent, notes).length : 0;
      host.innerHTML = CSS + '<div class="frWrap">' +
        '<div class="frHead"><div style="font-size:30px;">🎬</div><h3>Film Room</h3></div>' +
        (notes ? '' : setupMsg()) +
        (newsBits.length ? '<div class="frNews"><b>Since you last looked</b><br>' + newsBits.map(esc).join('<br>') + '</div>' : '') +
        '<div class="frCard"><div class="frRow" style="justify-content:space-between;"><b>Team goal this week</b><span style="font-weight:900;">' + wk + ' / ' + TEAM_GOAL + ' notes</span></div>' +
          '<div class="frBar"><i style="width:' + Math.min(100, Math.round(wk / TEAM_GOAL * 100)) + '%"></i></div>' +
          '<div class="frRow" style="justify-content:space-between;margin-top:10px;">' +
            '<span>' + (mine.coach ? 'Coaches don\'t earn points; your ⭐ picks do.' : my ? 'You: <b>' + my.pts + ' pts</b> · #' + (myRank + 1) + ' on the team' : 'Post a note to get on the board') + '</span>' +
            '<button type="button" class="frBtn lite" data-fr="board">🏆 Leaderboard</button></div></div>' +
        groups.map(function (g) {
          var list = state.films.filter(function (f) { return f.group === g.k; });
          if (!list.length) return '';
          return '<div class="frGroupT">' + g.t + '</div>' +
            (g.k === 'next' && nextOpp ? '<button type="button" class="frFilm frReport" data-fr="report"><span style="font-size:22px;">📋</span><span style="min-width:0;"><b>Team scouting report: ' + esc(nextOpp.opponent) + '</b><small>Every note the team has made on their film, best first</small></span>' +
              (reportCount ? '<span class="frCount">' + plural(reportCount, 'note') + '</span>' : '') + '</button>' : '') +
            list.map(function (f) {
              var i = state.films.indexOf(f), c = count(f), gm = f.game;
              var res = gm.ourScore !== '' && gm.ourScore != null && gm.oppScore !== '' && gm.oppScore != null ? (' · ' + (+gm.ourScore > +gm.oppScore ? 'W' : +gm.ourScore < +gm.oppScore ? 'L' : 'T') + ' ' + gm.ourScore + '-' + gm.oppScore) : '';
              return '<button type="button" class="frFilm" data-film="' + i + '"><span style="font-size:22px;">' + (g.k === 'ours' ? '🎥' : '🔭') + '</span>' +
                '<span style="min-width:0;"><b>' + esc(gm.opponent) + ' · ' + esc(f.title) + '</b><small>' + esc(gm.date) + esc(res) + '</small></span>' +
                (c ? '<span class="frCount">' + plural(c, 'note') + '</span>' : '') + '</button>';
            }).join('');
        }).join('') +
        (!state.films.length ? '<div class="lbEmpty">No film yet. Coaches add game film on the Schedule and scouting film in Coach Tools › Opponent Film.</div>' : '') +
        '<div class="frCard" style="font-size:13px;line-height:1.5;"><b>How points work</b><br>Post a note +' + PTS.note + ' · Reply +' + PTS.reply + ' · Each teammate who taps "I see it too" +' + PTS.like + ' · Coach\'s pick ⭐ +' + PTS.pick + ' · Each film you open +' + PTS.view + '</div>' +
        '</div>';
      host.querySelectorAll('[data-film]').forEach(function (b) { b.onclick = function () { openFilm(state.films[+b.dataset.film]); }; });
      host.querySelector('[data-fr="board"]').onclick = function () { leaderboard(board); };
      var rep = host.querySelector('[data-fr="report"]');
      if (rep) rep.onclick = function () { report(nextOpp.opponent); };
    });
  }

  function leaderboard(board) {
    host.innerHTML = CSS + '<div class="frWrap"><div class="frRow" style="margin:4px 0 8px;"><button type="button" class="frBtn lite" data-fr="back">‹ Film Room</button></div>' +
      '<div class="frCard"><h3 style="margin:0 0 6px;">🏆 Film Room Leaderboard</h3>' +
      (board.length ? board.map(function (p, i) {
        return '<div class="frLb"><div class="r">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</div><div class="n"><b>' + esc(p.name) + '</b><br>' +
          '<small style="opacity:.7;">' + plural(p.notes, 'note') + ' · ' + plural(p.replies, 'reply', 'replies') + ' · ' + p.likes + ' 👍 · ' + p.picks + ' ⭐' + (p.views ? ' · ' + plural(p.views, 'film') : '') + '</small><br>' +
          badges(p).map(function (x) { return '<span class="frBadge">' + esc(x) + '</span>'; }).join('') + '</div><div class="p">' + p.pts + '</div></div>';
      }).join('') : '<div class="lbEmpty">No points yet. Post the first note!</div>') + '</div></div>';
    host.querySelector('[data-fr="back"]').onclick = home;
  }

  // Every note on an opponent's film (scouting film of them, and our games
  // against them), coach's picks first, then the most "I see it too" votes.
  function reportNotes(opponent, notes) {
    var out = [];
    state.films.forEach(function (f) {
      if (!f.game || f.game.opponent !== opponent) return;
      Object.keys((notes || {})[f.key] || {}).forEach(function (id) {
        var n = notes[f.key][id];
        if (n) out.push({ n: n, id: id, film: f });
      });
    });
    return out.sort(function (a, b) {
      return (b.n.pick ? 1 : 0) - (a.n.pick ? 1 : 0) || Object.keys(b.n.likes || {}).length - Object.keys(a.n.likes || {}).length || String(b.n.at).localeCompare(String(a.n.at));
    });
  }
  function report(opponent) {
    host.innerHTML = CSS + '<div class="frWrap"><div class="lbEmpty">Building the report…</div></div>';
    loadAll(true).then(function (notes) {
      var items = reportNotes(opponent, notes);
      host.innerHTML = CSS + '<div class="frWrap"><div class="frRow" style="margin:4px 0 8px;"><button type="button" class="frBtn lite" data-fr="back">‹ Film Room</button></div>' +
        '<div class="frHead"><div style="font-size:28px;">📋</div><h3>Scouting report: ' + esc(opponent) + '</h3></div>' +
        '<div style="font-size:13px;opacity:.75;margin:0 2px 6px;">Built from the team\'s film notes. Coach\'s picks first, then the notes the most teammates agreed with.</div>' +
        (items.length ? TAGS.map(function (t) {
          var list = items.filter(function (x) { return (x.n.tag || 'O') === t.k; });
          if (!list.length) return '';
          return '<div class="frCard"><div style="font-weight:900;color:' + t.color + ';">' + esc(t.label) + ' · ' + list.length + '</div>' + list.map(function (x) {
            var likes = Object.keys(x.n.likes || {}).length;
            return '<div class="frNote"><div style="font-size:15px;line-height:1.35;">' + (x.n.pick ? '⭐ ' : '') + esc(x.n.text) + '</div>' +
              '<div class="frMeta">' + esc(x.n.by || 'Someone') + (likes ? ' · 👍 ' + likes : '') + ' · ' +
              '<button type="button" class="frAct" style="padding:0;" data-goto="' + state.films.indexOf(x.film) + '" data-note-id="' + esc(x.id) + '">' + esc(x.film.title) + (x.n.t != null ? ' at ' + fmt(x.n.t) : '') + ' ›</button></div></div>';
          }).join('') + '</div>';
        }).join('') : '<div class="lbEmpty">No notes on ' + esc(opponent) + '\'s film yet. Open one of their films and point something out.</div>') +
        '</div>';
      host.querySelector('[data-fr="back"]').onclick = home;
      host.querySelectorAll('[data-goto]').forEach(function (b) {
        b.onclick = function () { openFilm(state.films[+b.dataset.goto], { focusNote: b.dataset.noteId }); };
      });
    }).catch(function () { host.innerHTML = CSS + '<div class="frWrap">' + (lastError === 'setup' ? setupMsg() : '<div class="lbEmpty">Could not load notes.</div>') + '</div>'; });
  }

  // ---- The film page ----
  function playerHtml(src) {
    if (src.kind === 'youtube') return '<div class="frPlayer"><div id="frYT"></div></div>';
    if (src.kind === 'drive') return '<div class="frPlayer"><iframe id="frFrame" src="https://drive.google.com/file/d/' + src.id + '/preview" allow="autoplay; fullscreen" allowfullscreen></iframe></div>';
    if (src.kind === 'folder') return '<div class="frPlayer folder"><iframe id="frFrame" src="https://drive.google.com/embeddedfolderview?id=' + src.id + '#list"></iframe></div>';
    return '';
  }
  var ytLoading = null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytLoading) return ytLoading;
    ytLoading = new Promise(function (res) {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
    return ytLoading;
  }
  function currentTime() {
    try { return ytPlayer && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : null; } catch (e) { return null; }
  }

  function openFilm(f, opts) {
    opts = opts || {};
    var src = source(f.url), tag = 'O', mine = me();
    ytPlayer = null;
    if (!opts.skipLog && window.logFilmView && f.game && f.game.id) { try { window.logFilmView(f.game.id); } catch (e) { /* views are best-effort */ } }
    var exact = src.kind === 'youtube';
    host.innerHTML = CSS + '<div class="frWrap">' +
      '<div class="frRow" style="margin:4px 0 8px;justify-content:space-between;"><button type="button" class="frBtn lite" data-fr="back">‹ Film Room</button>' +
        '<a href="' + esc(f.url) + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:800;color:inherit;">Open ' + (src.kind === 'youtube' ? 'in YouTube' : src.kind === 'link' ? 'film' : 'in Drive') + ' ↗</a></div>' +
      '<div style="font-weight:900;font-size:17px;margin:0 2px 6px;">' + esc(f.game.opponent) + ' · ' + esc(f.title) + '</div>' +
      (playerHtml(src) || '<div class="frCard">This film opens outside the app: <a href="' + esc(f.url) + '" target="_blank" rel="noopener">open it</a>, then come back to add notes.</div>') +
      '<div class="frDrag" id="frDrag"></div>' +
      '<div class="frCard"><b>Add a note for the team</b>' +
        '<div class="frRow" style="margin:8px 0;"><label style="font-weight:800;font-size:14px;" for="frT">Time in video</label>' +
          '<input id="frT" class="frIn" style="width:110px;" inputmode="numeric" placeholder="12:34">' +
          (exact ? '<button type="button" class="frBtn lite" id="frMark">📍 Mark this moment</button>' : '<small style="opacity:.7;">from the clock on the player</small>') + '</div>' +
        '<div class="frRow" id="frTags" style="margin-bottom:8px;">' + TAGS.map(function (t) {
          return '<button type="button" class="frChip" data-tag="' + t.k + '" style="' + (t.k === tag ? 'background:#fff;border-color:' + t.color + ';color:' + t.color : '') + '">' + esc(t.label) + '</button>';
        }).join('') + '</div>' +
        '<textarea id="frText" class="frIn" rows="3" maxlength="400" placeholder="What do you see? e.g. #22 looks left right before he runs left"></textarea>' +
        '<div class="frRow" style="justify-content:space-between;margin-top:8px;"><span id="frPostMsg" style="font-size:13px;"></span>' +
          '<button type="button" class="frBtn org" id="frPost">Post note' + (mine.coach ? '' : ' · +' + PTS.note) + '</button></div></div>' +
      '<div class="frCard"><div class="frRow" style="justify-content:space-between;"><b>Team notes</b><span style="font-size:13px;opacity:.7;">in film order</span></div><div id="frNotes"><div class="lbEmpty">Loading notes…</div></div></div>' +
      '</div>';
    if (exact) {
      loadYT().then(function () {
        if (!document.getElementById('frYT')) return;
        ytPlayer = new window.YT.Player('frYT', { videoId: src.id, playerVars: { playsinline: 1, rel: 0, modestbranding: 1 } });
      });
      var mark = host.querySelector('#frMark');
      mark.onclick = function () { var t = currentTime(); if (t != null) host.querySelector('#frT').value = fmt(t); };
    }
    host.querySelector('[data-fr="back"]').onclick = home;
    host.querySelectorAll('[data-tag]').forEach(function (b) {
      b.onclick = function () {
        tag = b.dataset.tag;
        host.querySelectorAll('[data-tag]').forEach(function (x) {
          var t = tagOf(x.dataset.tag);
          x.style.cssText = x.dataset.tag === tag ? 'background:#fff;border-color:' + t.color + ';color:' + t.color : '';
        });
      };
    });
    var post = host.querySelector('#frPost'), msg = host.querySelector('#frPostMsg');
    post.onclick = function () {
      var text = host.querySelector('#frText').value.trim(), tIn = host.querySelector('#frT').value, t = parseTime(tIn);
      if (!mine.id) { msg.textContent = 'Sign in first.'; return; }
      if (!text) { msg.textContent = 'Write what you see first.'; return; }
      if (t !== null && isNaN(t)) { msg.textContent = 'Time looks like 12:34.'; return; }
      if (t === null && exact) { var ct = currentTime(); if (ct) t = Math.round(ct); }
      post.disabled = true; msg.textContent = 'Posting…';
      req(NOTES + '/' + f.key + '.json', 'POST', { t: t, text: text, tag: tag, by: mine.name, byId: mine.id, coach: mine.coach, at: new Date().toISOString() })
        .then(function () {
          host.querySelector('#frText').value = '';
          host.querySelector('#frT').value = '';
          msg.textContent = mine.coach ? 'Posted.' : 'Posted! +' + PTS.note + ' pts';
          post.disabled = false;
          renderNotes(f);
        })
        .catch(function () {
          post.disabled = false;
          msg.textContent = lastError === 'setup' ? '' : 'Could not post. Check your connection.';
          if (lastError === 'setup') host.querySelector('#frNotes').innerHTML = setupMsg();
        });
    };
    renderNotes(f, opts.focusNote);
  }

  function renderNotes(f, focusId) {
    var box = host.querySelector('#frNotes');
    if (!box) return;
    req(NOTES + '/' + f.key + '.json').then(function (d) {
      if (!box.isConnected) return;
      allNotes = allNotes || {};
      allNotes[f.key] = d || {};
      var mine = me();
      var list = Object.keys(d || {}).map(function (id) { var n = d[id]; n.id = id; return n; });
      list.sort(function (a, b) {
        var ta = a.t == null ? Infinity : a.t, tb = b.t == null ? Infinity : b.t;
        return ta - tb || String(a.at).localeCompare(String(b.at));
      });
      if (!list.length) { box.innerHTML = '<div class="lbEmpty">No notes yet. Be the first to point something out.</div>'; return; }
      box.innerHTML = list.map(function (n) {
        var t = tagOf(n.tag);
        var likes = Object.keys(n.likes || {}), liked = mine.id && n.likes && n.likes[mine.id];
        var replies = Object.keys(n.replies || {}).map(function (k) { var r = n.replies[k]; r.id = k; return r; })
          .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
        var canDelete = mine.coach || (mine.id && mine.id === n.byId);
        return '<div class="frNote" data-note="' + esc(n.id) + '">' +
          '<div class="frRow">' + (n.t != null ? '<button type="button" class="frTime" data-jump="' + n.t + '">▶ ' + fmt(n.t) + '</button>' : '') +
            '<span style="font-size:11px;font-weight:900;padding:2px 8px;border-radius:999px;background:' + t.color + '1f;color:' + t.color + ';">' + esc(t.label) + '</span>' +
            (n.pick ? '<span style="font-size:12px;font-weight:900;color:#b8860b;">⭐ Coach\'s pick</span>' : '') + '</div>' +
          '<div style="margin-top:6px;font-size:15px;line-height:1.35;">' + esc(n.text) + '</div>' +
          '<div class="frMeta">' + esc(n.by || 'Someone') + (n.coach ? ' (coach)' : '') + '</div>' +
          '<div class="frRow" style="gap:2px;margin-top:2px;">' +
            '<button type="button" class="frAct' + (liked ? ' on' : '') + '" data-like' + (mine.id && mine.id === n.byId ? ' disabled style="opacity:.5;cursor:default;"' : '') + '>👍 I see it too' + (likes.length ? ' · ' + likes.length : '') + '</button>' +
            '<button type="button" class="frAct" data-reply-open>💬 Reply</button>' +
            (mine.coach ? '<button type="button" class="frAct' + (n.pick ? ' on' : '') + '" data-pick>⭐ ' + (n.pick ? 'Picked' : 'Coach\'s pick') + '</button>' : '') +
            (canDelete ? '<button type="button" class="frAct" data-del style="margin-left:auto;">Delete</button>' : '') + '</div>' +
          replies.map(function (r) {
            return '<div class="frReply">' + esc(r.text) + '<div class="frMeta">' + esc(r.by || 'Someone') + (r.coach ? ' (coach)' : '') +
              ((mine.coach || (mine.id && mine.id === r.byId)) ? ' · <button type="button" class="frAct" style="padding:0;font-size:12px;" data-del-reply="' + esc(r.id) + '">delete</button>' : '') + '</div></div>';
          }).join('') +
          '<div data-reply-box style="display:none;margin-top:6px;"><div class="frRow"><input class="frIn" style="flex:1;min-width:0;" maxlength="300" placeholder="Reply…">' +
            '<button type="button" class="frBtn" data-reply-send>Send' + (mine.coach ? '' : ' · +' + PTS.reply) + '</button></div></div>' +
          '</div>';
      }).join('');
      wireNotes(f, box);
      if (focusId) {
        var el = box.querySelector('[data-note="' + focusId.replace(/"/g, '') + '"]');
        if (el) { el.classList.add('hl'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); var jb = el.querySelector('[data-jump]'); if (jb) jumpTo(f, +jb.dataset.jump, true); }
      }
    }).catch(function () {
      if (box.isConnected) box.innerHTML = lastError === 'setup' ? setupMsg() : '<div class="lbEmpty">Could not load notes. Check your connection.</div>';
    });
  }

  function wireNotes(f, box) {
    var mine = me(), base = NOTES + '/' + f.key + '/';
    box.querySelectorAll('[data-jump]').forEach(function (b) { b.onclick = function () { jumpTo(f, +b.dataset.jump); }; });
    box.querySelectorAll('[data-note]').forEach(function (el) {
      var id = el.dataset.note, n = allNotes[f.key][id];
      var like = el.querySelector('[data-like]');
      like.onclick = function () {
        if (!mine.id || mine.id === n.byId) return; // no voting for your own note
        var on = n.likes && n.likes[mine.id];
        req(base + id + '/likes/' + mine.id + '.json', on ? 'DELETE' : 'PUT', on ? undefined : new Date().toISOString()).then(function () { renderNotes(f); }).catch(function () {});
      };
      var pick = el.querySelector('[data-pick]');
      if (pick) pick.onclick = function () {
        var body = n.pick ? { pick: null, pickAt: null } : { pick: true, pickAt: new Date().toISOString() };
        req(base + id + '.json', 'PATCH', body).then(function () { renderNotes(f); }).catch(function () {});
      };
      var del = el.querySelector('[data-del]');
      if (del) del.onclick = function () {
        if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
        req(base + id + '.json', 'DELETE').then(function () { renderNotes(f); }).catch(function () {});
      };
      el.querySelectorAll('[data-del-reply]').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'tap again'; return; }
          req(base + id + '/replies/' + b.dataset.delReply + '.json', 'DELETE').then(function () { renderNotes(f); }).catch(function () {});
        };
      });
      var rbox = el.querySelector('[data-reply-box]');
      el.querySelector('[data-reply-open]').onclick = function () { rbox.style.display = rbox.style.display === 'none' ? '' : 'none'; if (rbox.style.display === '') rbox.querySelector('input').focus(); };
      el.querySelector('[data-reply-send]').onclick = function () {
        var inp = rbox.querySelector('input'), text = inp.value.trim();
        if (!text || !mine.id) return;
        req(base + id + '/replies.json', 'POST', { text: text, by: mine.name, byId: mine.id, coach: mine.coach, at: new Date().toISOString() })
          .then(function () { renderNotes(f); }).catch(function () {});
      };
    });
  }

  // YouTube seeks exactly. Drive's player can't be told where to go, so it
  // shows the time to drag to, right under the player.
  function jumpTo(f, t, quiet) {
    var drag = host.querySelector('#frDrag');
    if (ytPlayer && ytPlayer.seekTo) {
      try { ytPlayer.seekTo(t, true); ytPlayer.playVideo(); } catch (e) { /* player still loading */ }
      if (drag) drag.style.display = 'none';
    } else if (drag) {
      drag.textContent = 'Drag the player to ' + fmt(t);
      drag.style.display = 'block';
    }
    if (!quiet) {
      var top = host.querySelector('.frPlayer') || drag;
      if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- Every other film button in the app opens here for players and coaches ----
  function filmRoomAvailable() {
    var b = document.getElementById('filmSectionBtn');
    return !!(b && b.style.display !== 'none' && typeof window.setSection === 'function');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-film-url]');
    if (!btn || (host && host.contains(btn)) || !filmRoomAvailable()) return;
    var url = btn.getAttribute('data-film-url');
    if (!url || source(url).kind === 'link') return; // links the app can't play stay as they are
    e.preventDefault();
    e.stopPropagation(); // instead of the inline player (js/schedule.js)
    var gameId = btn.getAttribute('data-film-game-id');
    if (gameId && window.logFilmView) { try { window.logFilmView(gameId); } catch (err) { /* best-effort */ } }
    window.FilmRoom.open(url, { title: (btn.textContent || '').replace(/^\s*🎥\s*/, '').trim(), gameId: gameId, skipLog: true });
  }, true);

  window.initFilmRoomNav = function () {
    host = document.getElementById('filmRoomPanel');
    if (!host) return;
    home();
  };
  window.FilmRoom = {
    open: function (url, o) {
      o = o || {};
      pending = { url: url, title: o.title, label: o.label, gameId: o.gameId, skipLog: o.skipLog };
      window.setSection('film'); // runs initFilmRoomNav -> home(), which opens `pending`
    },
    refreshBadge: refreshBadge,
    _score: score, _parseTime: parseTime, _keyFor: keyFor, _news: news,
  };

  // Count what's new since this device last looked, once the app has loaded
  // (this file loads after sign-in), and again whenever the app comes back.
  setTimeout(refreshBadge, 1500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshBadge(); });
})();
