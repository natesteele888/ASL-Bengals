// ---------------------------------------------------------------------------
// Coach Tools > Updates -- Nathan: "make sure that the notes that were added
// to the What's New can be added at any time by a coach in the Coach Tools
// block." The Houston route note (see cloud-auth.js's
// __addHoustonRouteWhatsNewNote) was a one-off boot migration because there
// was no in-app way to post a note -- this tab is the real, repeatable
// replacement: any approved coach can post a note to whatsNew.json right
// from here, any time, no code change needed.
//
// Reuses the exact same array shape edit-plays.js's
// flushPendingNewPlaysToWhatsNew already writes to this same path
// ({id, label, addedAt, addedBy}) so whats-new.js's read/render side (which
// only ever expected play entries before) doesn't need to know or care
// whether a given row came from a new play or a coach's manual note.
// Coach Tools itself is already hidden from everyone but an approved coach
// (see refreshCoachToolsVisibility in study-quiz.js), so no extra gating
// is needed in here.
// ---------------------------------------------------------------------------
(function () {

  const FIREBASE_URL = 'https://aslbengals-default-rtdb.firebaseio.com';
  const WHATS_NEW_URL = `${FIREBASE_URL}/whatsNew.json`;

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function loadList() {
    const url = await window.firebaseAuthed(WHATS_NEW_URL);
    const res = await fetch(url);
    const data = res.ok ? await res.json() : null;
    return Array.isArray(data) ? data.filter(e => e && e.id) : [];
  }
  async function saveList(list) {
    const url = await window.firebaseAuthed(WHATS_NEW_URL);
    return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list) });
  }

  async function renderList() {
    const wrap = document.getElementById('coachUpdateList');
    if (!wrap) return;
    wrap.innerHTML = '<div class="lbEmpty">Loading…</div>';
    let list;
    try { list = await loadList(); } catch (e) { wrap.innerHTML = '<div class="lbEmpty">⚠️ Could not reach the team server.</div>'; return; }
    const sorted = list.slice().sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    wrap.innerHTML = sorted.length
      ? sorted.map(e => `<div class="lbRow" data-id="${escapeHtml(e.id)}">
          <div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(e.addedAt)}</div>
          <div class="lbNameTip"><div class="lbNameTipTitle wnTitle">🏈 ${escapeHtml(e.label || e.key || 'New play')}</div>${e.addedBy ? `<div class="lbTip">Added by ${escapeHtml(e.addedBy)}</div>` : ''}</div>
          <button type="button" class="lbLinkBtn coachUpdateDeleteBtn" data-id="${escapeHtml(e.id)}" style="flex-shrink:0;color:#c0392b;">Remove</button>
        </div>`).join('')
      : '<div class="lbEmpty">Nothing posted yet.</div>';

    wrap.querySelectorAll('.coachUpdateDeleteBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this from What\'s New?')) return;
        btn.disabled = true;
        try {
          const current = await loadList();
          await saveList(current.filter(e => e.id !== btn.dataset.id));
          renderList();
        } catch (e) {
          alert('Could not remove -- try again.');
          btn.disabled = false;
        }
      });
    });
  }

  function genId() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  window.initCoachToolsUpdates = function () {
    renderList();
    const addBtn = document.getElementById('coachUpdateAddBtn');
    const input = document.getElementById('coachUpdateNoteInput');
    const status = document.getElementById('coachUpdateStatus');
    if (!addBtn || addBtn.dataset.wired) return; // only wire the click listener once; renderList() above still refreshes every tab visit
    addBtn.dataset.wired = '1';
    addBtn.addEventListener('click', async () => {
      const text = (input.value || '').trim();
      if (!text) { input.focus(); return; }
      addBtn.disabled = true;
      addBtn.textContent = 'Posting…';
      try {
        const list = await loadList();
        const session = window.PlayerIdentity && window.PlayerIdentity.getSession ? window.PlayerIdentity.getSession() : null;
        list.push({
          id: genId(),
          label: text.slice(0, 300),
          addedAt: new Date().toISOString(),
          addedBy: (session && session.name) || 'Coach',
        });
        const res = await saveList(list);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        input.value = '';
        status.textContent = 'Posted to What\'s New.';
        renderList();
      } catch (e) {
        status.textContent = 'Could not post -- try again.';
      } finally {
        addBtn.disabled = false;
        addBtn.textContent = '+ Post to What\'s New';
        setTimeout(() => { status.textContent = ''; }, 3000);
      }
    });
  };
})();
