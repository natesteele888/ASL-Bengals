// Defense tab (Nathan, 2026-11-03): "add another tab to the kids 11U app that
// says defense and in that tab will be the formation diagrams and then all of
// the plays. This needs to be called out as soon as each kid opens the app so
// they can go to it and study."
//
// WHAT IT SHOWS
// Every Scout Diagrams pack a coach has imported (Coach Tools > Opponent Film >
// Scout Diagrams; js/scout-diagrams.js draws them): Formations first, then
// Runs, then Passes. The packs live in the opponentFilm document behind
// sign-in, never in git, so this file holds no diagram data at all.
//
// HOW IT IS CALLED OUT (three quiet places, no popup -- js/launch-screen.js
// switched launch popups off on purpose, and a new one would undo that)
//   1. a red NEW pill on the Defense tab (#defenseNewBadge)
//   2. a tappable card under the ticker on the home screen (#defenseBanner)
//   3. the lead item in the scrolling ticker (js/study-quiz.js asks
//      getDefenseSummary() for it)
// 1 and 2 stay up until this device has opened the Defense tab once; a coach
// importing a new pack changes the signature, so they come back. 3 stays
// whenever a pack exists, worded differently once it has been seen.
//
// Nothing here runs for a parent session (Schedule is their whole app).
(function () {
  'use strict';

  var SEEN_KEY = 'aslBengalsDefenseSeen';
  var TTL_MS = 3 * 60 * 1000; // same cadence as the ticker's own refresh

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
    var b = document.getElementById('defenseNewBadge');
    if (b) b.style.display = on ? '' : 'none';
  }

  function hideBanner() {
    var host = document.getElementById('defenseBanner');
    if (host) { host.style.display = 'none'; host.innerHTML = ''; host.onclick = null; }
  }

  function renderBanner(s) {
    var host = document.getElementById('defenseBanner');
    if (!host) return;
    if (!s.isNew || activeSection() !== 'play') { hideBanner(); return; }
    host.innerHTML =
      '<span class="dbIcon">🛡️</span>' +
      '<span class="dbText">' +
        '<span class="dbKicker">NEW · DEFENSE</span>' +
        '<span class="dbMain">Study ' + s.formations + ' formation' + (s.formations === 1 ? '' : 's') + ' + ' + s.plays + ' plays</span>' +
        '<span class="dbSub">Learn what the offense runs against us</span>' +
      '</span>' +
      '<span class="dbArrow">›</span>';
    host.onclick = function () { if (typeof window.setSection === 'function') window.setSection('defense'); };
    host.style.display = '';
  }

  // For the ticker (js/study-quiz.js). Null for a parent.
  window.getDefenseSummary = function () {
    if (window.isParentSession) return Promise.resolve(null);
    return getPacks().then(summarize);
  };

  // Called once a session is known (player-identity.js's gate()) and again
  // every time someone lands back on the Play home screen.
  window.refreshDefenseCallout = function () {
    if (window.isParentSession) { setBadge(false); hideBanner(); return Promise.resolve(); }
    return getPacks().then(function (packs) {
      var s = summarize(packs);
      setBadge(s.isNew);
      renderBanner(s);
    }).catch(function () { /* nice-to-have -- never worth breaking the app over */ });
  };
  window.hideDefenseBanner = hideBanner;

  // The tab itself.
  window.initDefenseNav = function () {
    var host = document.getElementById('defensePanel');
    if (!host) return;
    host.innerHTML = '<div class="lbEmpty">Loading the defense diagrams…</div>';
    getPacks(true).then(function (packs) {
      if (!host.isConnected) return;
      if (!packs.length) {
        var coachLine = window.isCoachSession
          ? '<div class="hint" style="text-align:center;margin-top:8px;">Coaches: import the diagram file in Coach Tools › Opponent Film › Scout Diagrams.</div>'
          : '';
        host.innerHTML = lastFailed
          ? '<div class="lbEmpty">Could not load the diagrams. Check your connection and try again.</div>' +
            '<div style="text-align:center;margin-top:8px;"><button type="button" class="navBtn" id="defenseRetryBtn">Try again</button></div>'
          : '<div class="lbEmpty">The defense diagrams are not up yet. Check back soon!</div>' + coachLine;
        var retry = host.querySelector('#defenseRetryBtn');
        if (retry) retry.addEventListener('click', window.initDefenseNav);
        return;
      }
      host.innerHTML =
        '<div class="lbHeroHeader"><div class="lbHeroTrophy">🛡️</div><h3>Know the Defense</h3></div>' +
        '<div class="hint" style="text-align:center;margin-bottom:6px;">Study the formations first, so you can see how they line up. Then learn the plays they run from them.</div>' +
        '<div id="defenseBrowser"></div>';
      window.ScoutDiagrams.browse(host.querySelector('#defenseBrowser'), packs, {
        title: function (p) { return '📋 ' + p.scoutTeam + ' Offense'; },
      });
      // They are looking at it now -- clear the call-outs on this device.
      markSeen(summarize(packs).signature);
      setBadge(false);
      hideBanner();
    });
  };
})();
