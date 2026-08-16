// ---------------------------------------------------------------------------
// Practices / Film Nights -- Nathan: "I also wants to add in practices to
// the app to - not sure they should all be together in the same list. They
// need date, time and location with map function. Once season starts,
// there will be a film night instead of practice so we need an option for
// that."
//
// A separate list from Schedule's games (a practice has no
// score/opponent/stat sheet, so the game scoreboard card doesn't fit it),
// but living under the same Schedule top-level section, switched with a
// Games/Practices CTA pair (js/study-quiz.js wires the two sub-nav buttons
// in #scheduleSubNav to show/hide #scheduleGamesPanel vs
// #schedulePracticesPanel). Practice and Film Night are the same shape --
// date, time, location, notes -- just tagged by `type`, since a film night
// literally replaces a practice slot once the season starts rather than
// being a different kind of event to schedule around.
//
// Same whole-array PUT pattern, same "read-only for everyone, edit gated to
// window.isApprovedCoachProfile()" pattern, and the same no-key Google Maps
// pin as Schedule's games -- reimplemented locally (small, pure) rather
// than reaching into schedule.js's IIFE-private helpers.
// ---------------------------------------------------------------------------
(function () {

  const PRACTICES_URL = `${FIREBASE_DB_URL}/practices.json`;
  const TYPES = [
    { key: 'practice', label: '🏃 Practice' },
    { key: 'film', label: '🎬 Film Night' },
  ];

  let items = [];     // [{id, type, date, time, location, notes, updatedAt}]
  let current = null; // item open in the detail view, or null (list view)
  let loaded = false;

  function genId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function fmtDate(dateStr) {
    if (!dateStr) return 'Date TBD';
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function mapUrl(address) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  }
  function mapSearchUrl(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  function typeInfo(type) {
    return TYPES.find(t => t.key === type) || TYPES[0];
  }

  // ---- Cloud load/save ----
  function loadItems() {
    const statusEl = document.getElementById('practicesCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading…';
    return window.firebaseAuthed(PRACTICES_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        items = Array.isArray(data) ? data.filter(p => p && p.id) : [];
        if (statusEl) statusEl.textContent = '';
        renderList();
      })
      .catch(err => {
        console.error('Could not load practices:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing nothing saved yet.';
      });
  }

  function persistItems(afterOk) {
    const statusEl = document.getElementById('practicesDetailStatus') || document.getElementById('practicesCloudStatus');
    window.firebaseAuthed(PRACTICES_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (statusEl) statusEl.textContent = `Save failed (HTTP ${r.status}).`;
    }).catch(err => {
      console.error('Practice save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
    });
  }

  // ---- List view ----
  function renderList() {
    const listEl = document.getElementById('practicesList');
    const addWrap = document.getElementById('practicesAddWrap');
    if (!listEl) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    if (addWrap) addWrap.style.display = approved ? '' : 'none';

    listEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = approved ? 'No practices or film nights scheduled yet -- add one below.' : 'No practices or film nights scheduled yet.';
      listEl.appendChild(empty);
      return;
    }
    items.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || '')).forEach(p => {
      const info = typeInfo(p.type);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'practiceRow';
      row.innerHTML = `
        <span class="practiceTypeBadge ${p.type === 'film' ? 'film' : 'practice'}">${info.label}</span>
        <span class="practiceRowDateTime">${fmtDate(p.date)}${p.time ? ' • ' + escapeHtml(p.time) : ''}</span>
        ${p.location ? `<span class="practiceRowLoc">📍 ${escapeHtml(p.location)}</span>` : ''}
        ${p.notes ? `<span class="practiceRowNotes">${escapeHtml(p.notes)}</span>` : ''}`;
      row.addEventListener('click', () => openDetail(p.id));
      listEl.appendChild(row);
    });
  }

  // ---- Detail view ----
  function openDetail(id) {
    if (id) {
      const existing = items.find(p => p.id === id);
      current = existing ? { ...existing } : null;
    }
    if (!current) {
      current = { id: genId(), type: 'practice', date: '', time: '', location: '', notes: '', updatedAt: null };
    }
    document.getElementById('practicesListWrap').style.display = 'none';
    document.getElementById('practicesDetail').style.display = '';
    renderDetail();
  }

  function closeDetail() {
    current = null;
    document.getElementById('practicesDetail').style.display = 'none';
    document.getElementById('practicesListWrap').style.display = '';
    renderList();
  }

  function renderDetail() {
    const body = document.getElementById('practicesDetailBody');
    const editControls = document.getElementById('practicesDetailEditControls');
    const deleteBtn = document.getElementById('practicesDeleteBtn');
    if (!body || !current) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    editControls.style.display = approved ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = items.some(p => p.id === current.id) ? '' : 'none';

    const info = typeInfo(current.type);

    if (!approved) {
      // ---- Read-only view ----
      body.innerHTML = `
        <div style="text-align:center;margin-bottom:10px;"><span class="practiceTypeBadge ${current.type === 'film' ? 'film' : 'practice'}">${info.label}</span></div>
        <div class="lbSectionHeader" style="text-align:center;">${fmtDate(current.date)}${current.time ? ' • ' + escapeHtml(current.time) : ''}</div>
        <div class="lbSub" style="margin:4px 0 10px;text-align:center;">${escapeHtml(current.location || 'Location TBD')}</div>
        ${current.location ? `<div style="text-align:center;"><a href="${mapSearchUrl(current.location)}" target="_blank" rel="noopener" class="lbLinkBtn">📍 View on Map</a></div><iframe src="${mapUrl(current.location)}" style="width:100%;height:140px;border:0;border-radius:8px;margin-top:6px;" loading="lazy"></iframe>` : ''}
        ${current.notes ? `<div class="lbSectionHeader" style="margin-top:16px;">📝 Notes</div><div class="scheduleWriteup">${escapeHtml(current.notes).replace(/\n/g, '<br>')}</div>` : ''}`;
      return;
    }

    // ---- Coach edit view ----
    body.innerHTML = `
      <div class="gameplanPickerGrid" id="practiceTypeGrid" style="margin-bottom:12px;"></div>
      <input type="date" id="practiceDate" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <input type="text" id="practiceTime" placeholder="Time (e.g. 6:00 PM)" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <input type="text" id="practiceLocation" placeholder="Address (e.g. Fuller Field, Clinton MA)" style="flex:1;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <a id="practiceMapLink" href="#" target="_blank" rel="noopener" class="lbLinkBtn" style="white-space:nowrap;align-self:center;">📍 View on Map</a>
      </div>
      <div id="practiceMapPreviewWrap" style="margin-bottom:8px;"></div>
      <div class="lbSectionHeader" style="margin-top:6px;">📝 Notes</div>
      <textarea id="practiceNotes" placeholder="e.g. &quot;Bring cleats and water, meet at the fieldhouse&quot;" style="width:100%;min-height:70px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"></textarea>`;

    document.getElementById('practiceDate').value = current.date || '';
    document.getElementById('practiceTime').value = current.time || '';
    document.getElementById('practiceLocation').value = current.location || '';
    document.getElementById('practiceNotes').value = current.notes || '';

    const typeGrid = document.getElementById('practiceTypeGrid');
    TYPES.forEach(t => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (current.type === t.key ? ' active' : '');
      chip.textContent = t.label;
      chip.addEventListener('click', () => { current.type = t.key; renderDetail(); });
      typeGrid.appendChild(chip);
    });

    function refreshMapPreview() {
      const loc = document.getElementById('practiceLocation').value.trim();
      const link = document.getElementById('practiceMapLink');
      const previewWrap = document.getElementById('practiceMapPreviewWrap');
      if (loc) {
        link.href = mapSearchUrl(loc);
        link.style.opacity = '1'; link.style.pointerEvents = '';
        previewWrap.innerHTML = `<iframe src="${mapUrl(loc)}" style="width:100%;height:140px;border:0;border-radius:8px;" loading="lazy"></iframe>`;
      } else {
        link.href = '#'; link.style.opacity = '.4'; link.style.pointerEvents = 'none';
        previewWrap.innerHTML = '';
      }
    }
    document.getElementById('practiceLocation').addEventListener('input', refreshMapPreview);
    refreshMapPreview();
  }

  function saveCurrent() {
    if (!current) return;
    current.date = document.getElementById('practiceDate').value;
    current.time = document.getElementById('practiceTime').value.trim();
    current.location = document.getElementById('practiceLocation').value.trim();
    current.notes = document.getElementById('practiceNotes').value.trim();
    if (!current.date) {
      const statusEl = document.getElementById('practicesDetailStatus');
      if (statusEl) statusEl.textContent = 'Give it a date first.';
      return;
    }
    current.updatedAt = new Date().toISOString();
    const idx = items.findIndex(p => p.id === current.id);
    if (idx >= 0) items[idx] = current; else items.push(current);
    persistItems(() => closeDetail());
  }

  function deleteCurrent() {
    if (!current) return;
    if (!confirm(`Delete this ${typeInfo(current.type).label.replace(/^\S+\s/, '').toLowerCase()}? This can't be undone.`)) return;
    items = items.filter(p => p.id !== current.id);
    persistItems(() => closeDetail());
  }

  let controlsWired = false;
  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    document.getElementById('practicesNewBtn').addEventListener('click', () => { current = null; openDetail(null); });
    document.getElementById('practicesBackBtn').addEventListener('click', closeDetail);
    document.getElementById('practicesSaveBtn').addEventListener('click', saveCurrent);
    document.getElementById('practicesDeleteBtn').addEventListener('click', deleteCurrent);
  }

  window.initPractices = function () {
    wireControls();
    if (!loaded) {
      loaded = true;
      loadItems();
    } else {
      document.getElementById('practicesDetail').style.display = 'none';
      document.getElementById('practicesListWrap').style.display = '';
      renderList();
    }
  };
})();
