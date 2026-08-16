// ---------------------------------------------------------------------------
// What's New -- Nathan: "within the whats new, it would be good to show new
// plays added to the playbook." Reads the whatsNew.json log that
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

  function getLastSeen() {
    try { return localStorage.getItem(LAST_SEEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setLastSeen(iso) {
    try { localStorage.setItem(LAST_SEEN_KEY, iso); } catch (e) { /* unavailable -- badge just won't persist */ }
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
  };

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
})();
