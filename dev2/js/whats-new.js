// ---------------------------------------------------------------------------
// What's New -- Nathan: "within the whats new, it would be good to show new
// plays added to the playbook," later expanded to "what's new should
// include plays and new features added." Two sources feed this one list:
//   1. Plays -- the whatsNew.json log that edit-plays.js writes to whenever
//      a coach actually saves a brand-new play (see pendingNewPlays/
//      flushPendingNewPlaysToWhatsNew there).
//   2. App features -- there's no in-app "ship a feature" action (features
//      land via code updates, not something a coach clicks through), so
//      APP_UPDATES below is a hand-maintained changelog: add one entry here
//      each time a new team-facing capability ships. Keep it to things
//      players/parents would actually notice -- skip pure admin/security
//      hardening.
// Both are merged, sorted together by addedAt, and rendered as one feed --
// opened from the profile dropdown, visible to everyone, players included
// (unlike This Week/Schedule/Coach Tools, this one's meant as a discovery
// feed for the whole team).
//
// A small unread badge (dot on the profile pill + count in the dropdown
// button) tracks a per-device "last seen" timestamp in localStorage, same
// idea as the Play Calls tutorial's "seen" flag elsewhere in this app.
// ---------------------------------------------------------------------------
(function () {

  const WHATS_NEW_URL = `${FIREBASE_DB_URL}/whatsNew.json`;

  // Hand-maintained changelog of shipped app features (see header comment).
  // addedAt just needs to sort correctly relative to each other and to real
  // play entries -- exact time-of-day isn't important, only the date/order.
  const APP_UPDATES = [
    { id: 'feat-field-photos', type: 'feature', addedAt: '2026-08-17T12:00:00.000Z',
      label: 'Game listings now show a field photo and a "More Info" link', },
    { id: 'feat-jersey-num', type: 'feature', addedAt: '2026-08-17T12:10:00.000Z',
      label: 'Parents can now update their player\'s jersey # right on the player card', },
    { id: 'feat-thisweek-players', type: 'feature', addedAt: '2026-08-17T12:20:00.000Z',
      label: 'This Week is now visible to players too, not just coaches/parents', },
    { id: 'feat-drone-footage', type: 'feature', addedAt: '2026-08-17T12:30:00.000Z',
      label: 'Drone Footage: practices now have an uploadable video section with comments and ½x slow-motion playback', },
    { id: 'feat-notifications', type: 'feature', addedAt: '2026-08-17T12:40:00.000Z',
      label: 'Optional notifications for new plays and new drone footage -- enable them from this menu', },
    { id: 'feat-switch-profile', type: 'feature', addedAt: '2026-08-17T12:50:00.000Z',
      label: 'Press and hold your name badge to switch between profiles -- handy for families with more than one player', },
  ];
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
      .then(data => {
        const plays = (Array.isArray(data) ? data.filter(e => e && e.id) : []).map(e => (e.type ? e : Object.assign({ type: 'play' }, e)));
        return plays.concat(APP_UPDATES);
      })
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
    maybeNotifyNewItems(entries);
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

  // Fires once per newly-added item -- play or feature -- (or one combined
  // notification for several at once), only the first app-open after each
  // was added -- see LAST_NOTIFIED_KEY above for why this can't just reuse
  // "last seen." No-ops entirely unless the person already opted in via
  // #notifyOptInBtn below (Notification.permission === 'granted').
  function maybeNotifyNewItems(entries) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // First time this ever runs on a device that's already been using the
    // app (and has items it's already seen), start from "last seen" so it
    // doesn't blast a notification for the team's entire history the
    // moment someone opts in.
    const since = getLastNotified() || getLastSeen();
    const fresh = entries.filter(e => e.addedAt && e.addedAt > since).sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
    if (!fresh.length) return;
    const plays = fresh.filter(e => e.type !== 'feature');
    const features = fresh.filter(e => e.type === 'feature');
    let title, body;
    if (plays.length && features.length) {
      title = `🆕 ${fresh.length} New Updates`;
      body = 'New plays and new app features -- check What\'s New';
    } else if (features.length) {
      title = features.length === 1 ? '✨ New Feature' : `✨ ${features.length} New Features`;
      body = features.length === 1
        ? (features[0].label || 'A new app feature')
        : features.slice(0, 3).map(e => e.label || 'feature').join(', ') + (features.length > 3 ? ', and more' : '');
    } else {
      title = plays.length === 1 ? '🏈 New Play Added' : `🏈 ${plays.length} New Plays Added`;
      body = plays.length === 1
        ? (plays[0].label || plays[0].key || 'A new play') + (plays[0].addedBy ? ` — added by ${plays[0].addedBy}` : '')
        : plays.slice(0, 3).map(e => e.label || e.key || 'play').join(', ') + (plays.length > 3 ? ', and more' : '');
    }
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
      ? sorted.map(e => {
          const isFeature = e.type === 'feature';
          const icon = isFeature ? '✨' : '🏈';
          const label = e.label || e.key || (isFeature ? 'App update' : 'New play');
          const sub = isFeature ? '' : (e.addedBy ? `<div class="lbTip">Added by ${escapeHtml(e.addedBy)}</div>` : '');
          return `<div class="lbRow">
          <div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(e.addedAt)}</div>
          <div class="lbNameTip"><div class="lbNameTipTitle">${icon} ${escapeHtml(label)}</div>${sub}</div>
        </div>`;
        }).join('')
      : '<div class="lbEmpty">Nothing new yet -- check back later!</div>';

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
        // maybeNotifyNewItems above.
        setLastNotified(new Date().toISOString());
        // Same "don't blast existing history" reasoning applies to drone
        // footage notifications, which share this exact opt-in toggle --
        // see js/drone-footage.js.
        if (window.resetDroneNotifyBaseline) window.resetDroneNotifyBaseline();
      });
    });
  }
})();
