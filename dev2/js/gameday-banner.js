// Big game-day banner -- Nathan (2026-11-08): "Today is the big day, and it
// is Super Bowl. I need a big banner for anybody who opens the app today
// that says, 'Let's go Bengals. Win your battle every play.' D1 Super Bowl
// Bengals versus Milford Hawks."
//
// Not a pop-up (js/launch-screen.js switched those off on purpose): a big
// card right under the header, on every section, for players, parents and
// coaches alike. Each banner in BANNERS has a first and last day, so it goes
// away on its own. A small "–" shrinks it to a slim bar on that phone;
// tapping the bar opens it again.
//
// Nathan (2026-11-08, after the game): "All the kids should be super proud
// of the season... holding their heads high as they go into the off season.
// Runners up for the division one, it's an incredible honor... We're only
// going to get better next year." The Super Bowl card came down the moment
// this one went up.
//
// Arrive/kickoff/place come from today's game on the Schedule when there is
// one, so a time change there shows up here too.
//
// To use it again, add an entry to BANNERS (the first one whose days cover
// today wins). To preview any day, open the app with ?banner=YYYY-MM-DD.
(function () {
  'use strict';

  var BANNERS = [
    {
      id: 'runnerup-2026',
      from: '2026-11-08', to: '2026-11-22',
      kicker: '🥈 2026 D1 Super Bowl Runner-Up',
      title: 'PROUD OF YOU, BENGALS!',
      line: 'Heads high. You played like an amazing team all season.',
      more: "We didn't get the goal we wanted, but we showed who we are. We're only getting better. See you next season. All of us coaches are proud of you.",
      solo: true,
      slim: '🥈 D1 Runner-Up · Proud of you, Bengals!',
    },
    {
      id: 'superbowl-2026',
      from: '2026-11-08', to: '2026-11-08',
      kicker: '🏆 D1 Super Bowl · Game Day',
      title: "LET'S GO BENGALS!",
      line: 'Win your battle every play.',
      us: 'Bengals',
      them: 'Milford Hawks',
      themLogo: 'assets/images/opponents/milford.png',
      showGame: true,
      slim: "🏆 Super Bowl today · Let's go Bengals!",
    },
  ];
  function bannerFor(date) {
    return BANNERS.filter(function (b) { return date >= b.from && date <= b.to; })[0] || null;
  }
  var MIN_KEY = 'aslGameBannerMin'; // id of the banner this phone shrank

  function localDate() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() {
    var m = /[?&]banner=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    return m ? m[1] : localDate();
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function to12h(str) {
    var m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return str || '';
    var h = Number(m[1]), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m[2] + ' ' + ap;
  }
  function isMin(id) { try { return localStorage.getItem(MIN_KEY) === id; } catch (e) { return false; } }
  function setMin(id, on) { try { if (on) localStorage.setItem(MIN_KEY, id); else localStorage.removeItem(MIN_KEY); } catch (e) { /* ignore */ } }

  function css() {
    if (document.getElementById('gameBannerCss')) return;
    var s = document.createElement('style');
    s.id = 'gameBannerCss';
    s.textContent = [
      '#gameBanner{margin:10px 12px 12px;position:relative}',
      '#gameBanner .gbCard{position:relative;overflow:hidden;border-radius:20px;padding:18px 16px 16px;text-align:center;color:#fff;',
      '  background:radial-gradient(120% 80% at 50% 0%,rgba(255,122,26,.55),rgba(255,122,26,0) 60%),repeating-linear-gradient(-35deg,#141414 0 22px,#1d1208 22px 30px),#111;',
      '  border:2px solid #ff6a13;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 10px 30px rgba(255,106,19,.35),inset 0 0 40px rgba(255,106,19,.18)}',
      '#gameBanner .gbKick{display:inline-block;background:#ff6a13;color:#111;font-weight:900;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.5);max-width:calc(100% - 76px);box-sizing:border-box;font-size:clamp(10.5px,3.1vw,12.5px)}',
      '#gameBanner .gbMatch{display:flex;align-items:center;justify-content:center;gap:14px;margin:14px 0 4px}',
      '#gameBanner .gbTeam{flex:1 1 0;max-width:150px;display:flex;flex-direction:column;align-items:center;gap:6px}',
      '#gameBanner .gbTeam img{width:84px;height:84px;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.7))}',
      '#gameBanner .gbTeam span{font-weight:900;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#f4f4f4}',
      '#gameBanner .gbVs{font-weight:900;font-style:italic;font-size:26px;color:#ff7a1a;text-shadow:0 2px 0 #000}',
      '#gameBanner .gbTitle{margin:10px 0 2px;font-weight:900;font-style:italic;font-size:clamp(34px,10.5vw,58px);line-height:1;letter-spacing:-.01em;',
      '  background:linear-gradient(100deg,#fff 0%,#fff 35%,#ffb27a 45%,#ff6a13 55%,#fff 65%,#fff 100%);background-size:250% 100%;',
      '  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;',
      '  filter:drop-shadow(0 3px 0 #000) drop-shadow(0 0 16px rgba(255,106,19,.5));animation:gbShine 3.2s linear infinite}',
      '#gameBanner .gbLine{font-weight:800;font-size:clamp(17px,5vw,24px);color:#ffcf9f;margin:6px 0 0;letter-spacing:.01em}',
      '#gameBanner .gbInfo{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:12px}',
      '#gameBanner .gbInfo span{background:rgba(0,0,0,.55);border:1px solid rgba(255,122,26,.5);border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:800;color:#fff}',
      '#gameBanner .gbSolo{margin:14px 0 2px}',
      '#gameBanner .gbSolo img{width:104px;height:104px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,.7)) drop-shadow(0 0 18px rgba(255,106,19,.45))}',
      '#gameBanner .gbMore{font-size:14.5px;line-height:1.45;color:#e9e9e9;margin:10px auto 0;max-width:420px;font-weight:600}',
      '#gameBanner .gbMin{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:18px;font-weight:900;line-height:1;cursor:pointer;z-index:2}',
      '#gameBanner .gbSlim{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:2px solid #ff6a13;border-radius:14px;padding:10px 12px;',
      '  background:linear-gradient(90deg,#1d1208,#2a1405,#1d1208);color:#fff;font-weight:900;font-size:14.5px;cursor:pointer}',
      '#gameBanner .gbSlim em{color:#ff7a1a;font-style:normal}',
      '@keyframes gbShine{0%{background-position:100% 0}100%{background-position:-150% 0}}',
      '@media (prefers-reduced-motion:reduce){#gameBanner .gbTitle{animation:none}}',
    ].join('\n');
    document.head.appendChild(s);
  }

  var info = null; // today's game from the Schedule, once loaded

  function render() {
    var b = bannerFor(today());
    var el = document.getElementById('gameBanner');
    if (!b) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'gameBanner';
      var header = document.querySelector('header');
      if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
      else document.body.insertBefore(el, document.body.firstChild);
      el.addEventListener('click', function (e) {
        var cur = bannerFor(today());
        if (!cur) return;
        if (e.target.closest('.gbMin')) { setMin(cur.id, true); render(); }
        else if (e.target.closest('.gbSlim')) { setMin(cur.id, false); render(); }
      });
    }
    css();
    el.style.display = '';
    if (isMin(b.id)) {
      el.innerHTML = '<button type="button" class="gbSlim" aria-label="Show the game day banner">' + esc(b.slim) + ' <em>▾</em></button>';
      return;
    }
    var pills = [];
    if (info && b.showGame) {
      if (info.arriveTime) pills.push('Arrive ' + to12h(info.arriveTime));
      if (info.gameTime) pills.push('Kickoff ' + to12h(info.gameTime));
      if (info.location) pills.push('📍 ' + info.location);
    }
    el.innerHTML = '<div class="gbCard" role="banner">' +
      '<button type="button" class="gbMin" aria-label="Make the banner smaller">–</button>' +
      '<div class="gbKick">' + esc(b.kicker) + '</div>' +
      (b.solo
        ? '<div class="gbSolo"><img src="assets/images/header-logo.png" alt="Bengals"></div>'
        : '<div class="gbMatch">' +
            '<div class="gbTeam"><img src="assets/images/header-logo.png" alt=""><span>' + esc(b.us) + '</span></div>' +
            '<div class="gbVs">VS</div>' +
            '<div class="gbTeam"><img src="' + esc(b.themLogo) + '" alt=""><span>' + esc(b.them) + '</span></div>' +
          '</div>') +
      '<div class="gbTitle">' + esc(b.title) + '</div>' +
      '<div class="gbLine">' + esc(b.line) + '</div>' +
      (b.more ? '<div class="gbMore">' + esc(b.more) + '</div>' : '') +
      (pills.length ? '<div class="gbInfo">' + pills.map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('') + '</div>' : '') +
      '</div>';
  }

  function loadGame() {
    var cur = bannerFor(today());
    if (!cur || !cur.showGame || !window.firebaseAuthed || typeof FIREBASE_DB_URL === 'undefined') return;
    window.firebaseAuthed(FIREBASE_DB_URL + '/schedule.json')
      .then(function (url) { return fetch(url, { cache: 'no-store' }); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (games) {
        var list = Array.isArray(games) ? games : (games && typeof games === 'object' ? Object.values(games) : []);
        var d = today();
        info = list.filter(function (g) { return g && g.date === d; })[0] || null;
        if (info) render();
      })
      .catch(function () { /* the banner works without the times */ });
  }

  render();
  loadGame();
  window.GameDayBanner = { render: render, banners: BANNERS };
})();
