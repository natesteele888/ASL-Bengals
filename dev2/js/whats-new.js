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

  window.showWhatsNew = async function () {
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
    const sorted = entries.slice().sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    body.innerHTML = sorted.length
      ? sorted.map(e => `<div class="lbRow">
          <div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(e.addedAt)}</div>
          <div class="lbNameTip"><div class="lbNameTipTitle">🏈 ${escapeHtml(e.label || e.key || 'New play')}</div>${e.addedBy ? `<div class="lbTip">Added by ${escapeHtml(e.addedBy)}</div>` : ''}</div>
        </div>`).join('')
      : '<div class="lbEmpty">No new plays added yet -- check back later!</div>';

    // Mark everything as seen the moment this is opened -- matches how the
    // rest of the app's "seen" flags behave (e.g. the Play Calls tutorial).
    const newestAt = sorted.length ? sorted[0].addedAt : new Date().toISOString();
    setLastSeen(newestAt);
    const dot = document.getElementById('whatsNewDot');
    const countEl = document.getElementById('whatsNewCount');
    if (dot) dot.style.display = 'none';
    if (countEl) countEl.style.display = 'none';
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
