// Opponent Offense tab (Nathan, 2026-11-03): "add another tab to the kids 11U app that
// says defense and in that tab will be the formation diagrams and then all of
// the plays. This needs to be called out as soon as each kid opens the app so
// they can go to it and study." Renamed the same night: "it's actually
// opponent offense" -- these are the other team's formations and plays.
//
// WHAT IT SHOWS
// Every Scout Diagrams pack a coach has imported (Coach Tools > Opponent Film >
// Scout Diagrams; js/scout-diagrams.js draws them): Formations first, then
// Runs, then Passes. The packs live in the opponentFilm document behind
// sign-in, never in git, so this file holds no diagram data at all.
//
// HOW IT IS CALLED OUT (three quiet places, no popup -- js/launch-screen.js
// switched launch popups off on purpose, and a new one would undo that)
//   1. a red NEW pill on the Opponent Offense tab (#oppOffenseNewBadge)
//   2. a tappable card under the ticker on the home screen (#oppOffenseBanner)
//   3. the lead item in the scrolling ticker (js/study-quiz.js asks
//      getOppOffenseSummary() for it)
// 1 and 2 stay up until this device has opened the Opponent Offense tab once; a coach
// importing a new pack changes the signature, so they come back. 3 stays
// whenever a pack exists, worded differently once it has been seen.
//
// Nothing here runs for a parent session (Schedule is their whole app).
(function () {
  'use strict';

  var SEEN_KEY = 'aslBengalsOppOffenseSeen';
  var TTL_MS = 3 * 60 * 1000; // same cadence as the ticker's own refresh

  // The note shown under the tab's title.
  var NOTICE = {
    lead: 'We are making changes on defense.',
    rest: 'More changes to come from Coach Joe at practice.',
  };

  var cache = null;
  var cacheAt = 0;
  var inflight = null;
  var lastFailed = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // One fetch shared by the tab, the banner and the ticker, so opening the
  // app doesn't pull the film document three times.
  function getPacks(force) {
    if (!window.OpponentFilm) return Promise.resolve([]);
    if (!force && cache && Date.now() - cacheAt < TTL_MS) return Promise.resolve(cache);
    if (inflight) return inflight;
    inflight = window.OpponentFilm.load().then(function (entries) {
      cache = window.OpponentFilm.scoutPacks(entries).filter(function (p) {
        return p && Array.isArray(p.diagrams) && p.diagrams.length;
      });
      cacheAt = Date.now();
      lastFailed = false;
      return cache;
    }).catch(function () {
      lastFailed = true;
      return cache || [];
    }).then(function (packs) {
      inflight = null;
      return packs;
    });
    return inflight;
  }

  function seen(sig) {
    try { return localStorage.getItem(SEEN_KEY) === sig; } catch (e) { return false; }
  }
  function markSeen(sig) {
    try { localStorage.setItem(SEEN_KEY, sig); } catch (e) { /* storage blocked -- the NEW pill just won't clear */ }
  }

  function summarize(packs) {
    var formations = 0;
    var plays = 0;
    var ids = [];
    packs.forEach(function (p) {
      ids.push(p.id);
      p.diagrams.forEach(function (d) {
        if (d.cat === 'formation') formations++;
        else if (d.cat === 'run' || d.cat === 'pass') plays++;
      });
    });
    var sig = ids.sort().join(',');
    var total = formations + plays;
    return { total: total, formations: formations, plays: plays, signature: sig, isNew: total > 0 && !seen(sig) };
  }

  function activeSection() {
    var b = document.querySelector('#topSections .modeBtn.active');
    return b ? b.dataset.section : 'play';
  }

  function setBadge(on) {
    var b = document.getElementById('oppOffenseNewBadge');
    if (b) b.style.display = on ? '' : 'none';
  }

  function hideBanner() {
    var host = document.getElementById('oppOffenseBanner');
    if (host) { host.style.display = 'none'; host.innerHTML = ''; host.onclick = null; }
  }

  function renderBanner(s) {
    var host = document.getElementById('oppOffenseBanner');
    if (!host) return;
    if (!s.isNew || activeSection() !== 'play') { hideBanner(); return; }
    host.innerHTML =
      '<span class="dbIcon">📋</span>' +
      '<span class="dbText">' +
        '<span class="dbKicker">NEW · OPPONENT OFFENSE</span>' +
        '<span class="dbMain">Study ' + s.formations + ' formation' + (s.formations === 1 ? '' : 's') + ' + ' + s.plays + ' plays</span>' +
        '<span class="dbSub">Learn what the other team runs against us</span>' +
      '</span>' +
      '<span class="dbArrow">›</span>';
    host.onclick = function () { if (typeof window.setSection === 'function') window.setSection('oppoffense'); };
    host.style.display = '';
  }

  // For the ticker (js/study-quiz.js). Null for a parent.
  window.getOppOffenseSummary = function () {
    if (window.isParentSession) return Promise.resolve(null);
    return getPacks().then(summarize);
  };

  // Called once a session is known (player-identity.js's gate()) and again
  // every time someone lands back on the Play home screen.
  window.refreshOppOffenseCallout = function () {
    if (window.isParentSession) { setBadge(false); hideBanner(); return Promise.resolve(); }
    return getPacks().then(function (packs) {
      var s = summarize(packs);
      setBadge(s.isNew);
      renderBanner(s);
    }).catch(function () { /* nice-to-have -- never worth breaking the app over */ });
  };
  window.hideOppOffenseBanner = hideBanner;

  // The tab itself.
  window.initOppOffenseNav = function () {
    var host = document.getElementById('oppOffensePanel');
    if (!host) return;
    host.innerHTML = '<div class="lbEmpty">Loading the opponent offense diagrams…</div>';
    getPacks(true).then(function (packs) {
      if (!host.isConnected) return;
      if (!packs.length) {
        var coachLine = window.isCoachSession
          ? '<div class="hint" style="text-align:center;margin-top:8px;">Coaches: import the diagram file in Coach Tools › Opponent Film › Scout Diagrams.</div>'
          : '';
        host.innerHTML = lastFailed
          ? '<div class="lbEmpty">Could not load the diagrams. Check your connection and try again.</div>' +
            '<div style="text-align:center;margin-top:8px;"><button type="button" class="navBtn" id="oppOffenseRetryBtn">Try again</button></div>'
          : '<div class="lbEmpty">The opponent offense diagrams are not up yet. Check back soon!</div>' + coachLine;
        var retry = host.querySelector('#oppOffenseRetryBtn');
        if (retry) retry.addEventListener('click', window.initOppOffenseNav);
        return;
      }
      host.innerHTML =
        '<div class="lbHeroHeader"><div class="lbHeroTrophy">📋</div><h3>Opponent Offense</h3></div>' +
        // Nathan (2026-11-04): "remove all the wording under the title and add
        // in that we are changing for Defense, more changes to come from coach
        // jello practice." Edit NOTICE below when the message changes.
        '<div style="text-align:center;margin:10px 0 4px;padding:10px 12px;background:var(--card);color:var(--ink);' +
          'border:2px solid var(--bengal-orange);border-radius:10px;font-size:14px;line-height:1.35;">' +
          '<b>' + NOTICE.lead + '</b> ' + NOTICE.rest + '</div>' +
        '<div id="oppOffenseBrowser"></div>';
      window.ScoutDiagrams.browse(host.querySelector('#oppOffenseBrowser'), packs, {
        title: function (p) { return '📋 ' + p.scoutTeam + ' Offense'; },
        hint: false,
      });
      // They are looking at it now -- clear the call-outs on this device.
      markSeen(summarize(packs).signature);
      setBadge(false);
      hideBanner();
    });
  };

  // Catch-up for a remembered session. auth.js runs player-identity.js's
  // gate() the moment window.PlayerIdentity exists, while the ~60 scripts are
  // still loading one after another -- so on a slow load the gate's call to
  // refreshOppOffenseCallout() can fire before this file has even loaded and
  // be skipped, leaving no NEW pill or card. Run it once more now.
  try {
    var sess = window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession();
    if (sess && sess.name) window.refreshOppOffenseCallout();
  } catch (e) { /* the gate's own call covers a fresh sign-in */ }
})();
