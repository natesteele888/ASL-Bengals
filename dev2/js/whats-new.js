// ---------------------------------------------------------------------------
// What's New -- Nathan: "within the whats new, it would be good to show new
// plays added to the playbook." Briefly expanded to also show app feature
// updates, then reverted: "i don't like the whats new section - needs to be
// just new plays." Back to plays only. Reads the whatsNew.json log that
// edit-plays.js writes to whenever a coach actually saves a brand-new play
// (see pendingNewPlays/flushPendingNewPlaysToWhatsNew there) -- this file is
// purely the read/display side, opened from the profile dropdown (visible
// to everyone, players included -- unlike This Week/Schedule/Coach Tools,
// this one's meant as a discovery feed for the whole team).
//
// A small unread badge (dot on the profile pill + count in the dropdown
// button) tracks a per-device "last seen" timestamp in localStorage, same
// idea as the Play Calls tutorial's "seen" flag elsewhere in this app.
// ---------------------------------------------------------------------------
(function () {

  const WHATS_NEW_URL = `${FIREBASE_DB_URL}/whatsNew.json`;
  const LAST_SEEN_KEY = 'aslBengalsWhatsNewLastSeen';
  // Nathan: "how about push notifications... NEW PLAY ADDED." Real
  // background push (works with the app fully closed) needs a Cloud
  // Functions trigger, which needs the Blaze plan -- Nathan opted out of
  // that upgrade. This is the free alternative: fire a real OS
  // notification the moment the app is opened and it notices something
  // new, reusing this exact same data. Deliberately a SEPARATE timestamp
  // from LAST_SEEN_KEY above -- "seen" only advances when someone
  // actually opens the What's New panel, but a notification should only
  // ever fire once per new play, the first time the app opens after it
  // was added, regardless of whether they open the panel or not.
  const LAST_NOTIFIED_KEY = 'aslBengalsWhatsNewLastNotified';

  function getLastSeen() {
    try { return localStorage.getItem(LAST_SEEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setLastSeen(iso) {
    try { localStorage.setItem(LAST_SEEN_KEY, iso); } catch (e) { /* unavailable -- badge just won't persist */ }
  }
  function getLastNotified() {
    try { return localStorage.getItem(LAST_NOTIFIED_KEY) || ''; } catch (e) { return ''; }
  }
  function setLastNotified(iso) {
    try { localStorage.setItem(LAST_NOTIFIED_KEY, iso); } catch (e) { /* unavailable -- may re-notify on a future open, harmless */ }
  }

  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function loadEntries() {
    return window.firebaseAuthed(WHATS_NEW_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => (Array.isArray(data) ? data.filter(e => e && e.id) : []))
      .catch(err => { console.error('Could not load What\'s New:', err); return null; });
  }

  // Called once a name/session is known (player-identity.js's gate()
  // wrapper, same hook point as refreshCoachToolsVisibility) so the badge
  // is already accurate before anyone opens the menu, not just after.
  window.refreshWhatsNewBadge = async function () {
    const dot = document.getElementById('whatsNewDot');
    const countEl = document.getElementById('whatsNewCount');
    const entries = await loadEntries();
    if (!entries) return;
    const lastSeen = getLastSeen();
    const unread = entries.filter(e => e.addedAt && e.addedAt > lastSeen).length;
    if (dot) dot.style.display = unread ? '' : 'none';
    if (countEl) { countEl.textContent = unread ? String(unread) : ''; countEl.style.display = unread ? '' : 'none'; }
    maybeNotifyNewPlays(entries);
  };

  // Shared by anything in this app that wants a real OS notification fired
  // on app-open (see also js/drone-footage.js's drone-clip notifications,
  // which reuses this exact function rather than duplicating the service
  // worker boilerplate). `data` is passed straight through to
  // showNotification -- sw.js's notificationclick handler reads it back
  // to decide where tapping the notification should take you.
  window.showLocalNotification = function (title, body, data) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: 'assets/images/icon-192.png',
        badge: 'assets/images/icon-192.png',
        tag: data && data.tag ? data.tag : 'aslBengalsWhatsNew', // collapses into one if several land close together instead of stacking
        data: data || {},
      });
    }).catch(() => { /* no active service worker yet -- silently skip, badge/feed still work */ });
  };

  // Fires once per newly-added play (or one combined notification for
  // several at once), only the first app-open after each was added -- see
  // LAST_NOTIFIED_KEY above for why this can't just reuse "last seen."
  // No-ops entirely unless the person already opted in via
  // #notifyOptInBtn below (Notification.permission === 'granted').
  function maybeNotifyNewPlays(entries) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // First time this ever runs on a device that's already been using the
    // app (and has plays it's already seen), start from "last seen" so it
    // doesn't blast a notification for the team's entire play history the
    // moment someone opts in.
    const since = getLastNotified() || getLastSeen();
    const fresh = entries.filter(e => e.addedAt && e.addedAt > since).sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
    if (!fresh.length) return;
    const title = fresh.length === 1 ? '🏈 New Play Added' : `🏈 ${fresh.length} New Plays Added`;
    const body = fresh.length === 1
      ? (fresh[0].label || fresh[0].key || 'A new play') + (fresh[0].addedBy ? ` — added by ${fresh[0].addedBy}` : '')
      : fresh.slice(0, 3).map(e => e.label || e.key || 'play').join(', ') + (fresh.length > 3 ? ', and more' : '');
    window.showLocalNotification(title, body, { tag: 'aslBengalsWhatsNew' });
    setLastNotified(fresh[fresh.length - 1].addedAt);
  }

  function refreshNotifyBtn() {
    const btn = document.getElementById('notifyOptInBtn');
    if (!btn || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      btn.style.display = '';
      btn.textContent = '🔔 Notifications On';
      btn.disabled = true;
    } else if (Notification.permission === 'denied') {
      btn.style.display = '';
      btn.textContent = '🔕 Notifications Blocked';
      btn.disabled = true;
    } else {
      btn.style.display = '';
      btn.textContent = '🔔 Enable Notifications';
      btn.disabled = false;
    }
  }
  window.refreshNotifyBtn = refreshNotifyBtn;

  // Renders one play's diagram into a mini <svg> -- reuses play-calls.js's
  // own renderCardDiagram/playCardAnimation completely unmodified (both
  // already read the play they draw off window.DATA.playTypes by key, and
  // nothing else they touch -- DATA.wing/DATA.formation/DATA.viewBox etc.
  // -- is play-specific), by temporarily swapping in just the ONE snapshot
  // play object being shown, rendering, then immediately swapping the real
  // data back. Wing/Left is just a fixed, readable default view -- this is
  // a "here's roughly what changed" glance, not the full toggle-everything
  // Play Calls card (that's still one tap away via "Watch it run" below,
  // no snapshot/swap involved -- see wireWatchButtons).
  function renderSnapshotDiagram(svgEl, playObj, animate) {
    if (!svgEl || !playObj || !window.DATA) return;
    const savedTypes = window.DATA.playTypes;
    window.DATA.playTypes = [playObj];
    try {
      if (animate && window.playCardAnimation) {
        window.playCardAnimation(svgEl, playObj.key, 'Left', 'Left', 1, { value: false }, null, 'base', 'Outside', false, false, 'A', false, false);
      } else if (window.renderCardDiagram) {
        window.renderCardDiagram(svgEl, playObj.key, 'Left', 'Left', null, 'base', 'Outside', false, false, 'A', false, false);
      }
    } catch (e) { /* a snapshot from an older/incompatible data shape shouldn't break the panel -- the mini diagram just stays blank */ }
    window.DATA.playTypes = savedTypes;
  }

  // Nathan: "This gets really lost... I need it to be just the play that
  // was updated. Maybe show the old play and show what changed. Have them
  // acknowledge before going into the app. A visual of the play running."
  // onlyUnseen filters to entries newer than lastSeen (the auto-popup
  // below) instead of the full history (the profile-menu button still
  // shows everything -- a real "browse the whole log" surface has its own
  // place); before/after snapshots (see edit-plays.js's capturePlaySnapshot)
  // get real side-by-side diagrams instead of just a text description when
  // both are present on an entry.
  window.showWhatsNew = async function (opts) {
    const onlyUnseen = !!(opts && opts.onlyUnseen);
    const overlay = document.getElementById('whatsNewOverlay');
    const body = document.getElementById('whatsNewBody');
    if (!overlay || !body) return;
    overlay.classList.add('show');
    body.innerHTML = '<div class="lbEmpty">Loading…</div>';
    const entries = await loadEntries();
    if (entries === null) {
      body.innerHTML = '<div class="lbEmpty">⚠️ Could not reach the team server — check your connection and try again.</div>';
      return;
    }
    const lastSeen = getLastSeen();
    const base = onlyUnseen ? entries.filter(e => e.addedAt && e.addedAt > lastSeen) : entries;
    const sorted = base.slice().sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));

    if (!sorted.length) {
      body.innerHTML = `<div class="lbEmpty">${onlyUnseen ? "Nothing new since you last checked!" : "Nothing in the playbook log yet -- check back later!"}</div>`;
    } else {
      body.innerHTML = sorted.map(e => {
        const hasComparison = e.before && e.after;
        return `<div class="wnEntry" data-entry-id="${escapeHtml(e.id)}">
          <div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted);padding:0;">${fmtWhen(e.addedAt)}</div>
          <div class="lbNameTipTitle wnTitle">🏈 ${escapeHtml(e.label || e.key || 'Play update')}</div>
          ${e.note ? `<div class="lbTip">${escapeHtml(e.note)}</div>` : ''}
          ${e.addedBy ? `<div class="lbTip">Added by ${escapeHtml(e.addedBy)}</div>` : ''}
          ${hasComparison ? `<div class="wnDiagramRow">
              <div class="wnDiagramCol"><div class="lbSub">Before</div><svg class="wnMiniDiagram" data-role="before"></svg></div>
              <div class="wnDiagramCol"><div class="lbSub">After</div><svg class="wnMiniDiagram" data-role="after"></svg></div>
            </div>
            <button type="button" class="navBtn secondary wnWatchBtn" data-watch-key="${escapeHtml(e.id)}">▶ Watch it run</button>`
            : (e.after ? `<svg class="wnMiniDiagram wnMiniDiagramSolo" data-role="after"></svg>
              <button type="button" class="navBtn secondary wnWatchBtn" data-watch-key="${escapeHtml(e.id)}">▶ Watch it run</button>` : '')}
        </div>`;
      }).join('');

      // Draw every snapshot diagram now that its <svg> is actually in the
      // DOM (renderCardDiagram measures/positions against real layout).
      sorted.forEach(e => {
        if (!e.before && !e.after) return;
        const card = body.querySelector(`[data-entry-id="${CSS.escape(e.id)}"]`);
        if (!card) return;
        if (e.before) renderSnapshotDiagram(card.querySelector('svg[data-role="before"]'), e.before, false);
        if (e.after) renderSnapshotDiagram(card.querySelector('svg[data-role="after"]'), e.after, false);
      });
      body.querySelectorAll('.wnWatchBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const entry = sorted.find(e => e.id === btn.dataset.watchKey);
          const svg = btn.closest('.wnEntry').querySelector('svg[data-role="after"]');
          if (entry && entry.after && svg) renderSnapshotDiagram(svg, entry.after, true);
        });
      });
    }

    // Mark everything as seen the moment this is opened -- matches how the
    // rest of the app's "seen" flags behave (e.g. the Play Calls tutorial).
    // Uses the newest entry in the FULL feed (not just what was shown) so
    // opening this while only unseen entries are visible still correctly
    // clears the badge/auto-popup for everything up to right now.
    const newestOverall = entries.reduce((max, e) => (e.addedAt && e.addedAt > max ? e.addedAt : max), '');
    setLastSeen(newestOverall || new Date().toISOString());
    const dot = document.getElementById('whatsNewDot');
    const countEl = document.getElementById('whatsNewCount');
    if (dot) dot.style.display = 'none';
    if (countEl) countEl.style.display = 'none';
    // Nathan: "have them acknowledge before going into the app" -- reads as
    // a real acknowledgment (not just a dismiss) when this is the unseen-
    // only auto-popup specifically; the profile-menu's full-history browse
    // keeps a plain Close.
    const closeBtn = document.getElementById('whatsNewCloseBtn');
    if (closeBtn) closeBtn.textContent = onlyUnseen && sorted.length ? "Got it, I'm ready" : 'Close';
  };

  // Nathan (in-season): "hey this is what is new this week for play calls,
  // pay attention" -- during the season this needs to actually surface on
  // open, not sit behind a profile-menu tap nobody thinks to check. Reuses
  // this exact feed and its "seen" tracking (opening this auto-popup marks
  // the same lastSeen the manual panel above uses, and vice versa) --
  // still plays-only, still nothing else folded in. Called from
  // player-identity.js's gate() in place of the old app-features intro.
  window.maybeAutoShowWhatsNew = async function () {
    try {
      const entries = await loadEntries();
      if (!entries || !entries.length) return;
      const lastSeen = getLastSeen();
      const unseen = entries.some(e => e.addedAt && e.addedAt > lastSeen);
      if (!unseen) return;
      window.showWhatsNew({ onlyUnseen: true });
    } catch (e) { /* best-effort -- a failed check shouldn't block login */ }
  };

  const btn = document.getElementById('whatsNewMenuBtn');
  const closeBtn = document.getElementById('whatsNewCloseBtn');
  const dropdown = document.getElementById('playerMenuDropdown');
  if (btn) btn.addEventListener('click', () => {
    if (dropdown) dropdown.classList.remove('show');
    window.showWhatsNew();
  });
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('whatsNewOverlay').classList.remove('show');
  });

  const notifyBtn = document.getElementById('notifyOptInBtn');
  if (notifyBtn && 'Notification' in window) {
    refreshNotifyBtn();
    notifyBtn.addEventListener('click', () => {
      Notification.requestPermission().then(() => {
        refreshNotifyBtn();
        // Opting in shouldn't immediately fire a notification for
        // whatever's already unread -- start the "notified" clock from
        // right now, same reasoning as the since-fallback in
        // maybeNotifyNewPlays above.
        setLastNotified(new Date().toISOString());
        // Same "don't blast existing history" reasoning applies to drone
        // footage notifications, which share this exact opt-in toggle --
        // see js/drone-footage.js.
        if (window.resetDroneNotifyBaseline) window.resetDroneNotifyBaseline();
      });
    });
  }
})();
