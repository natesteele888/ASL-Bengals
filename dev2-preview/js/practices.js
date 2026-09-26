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
  // Nathan: "We also need to add another type of practice to the schedule
  // which is Walk Through. This is a 1 hour event for the day before a
  // game." See applyWalkthroughDefaults() below for the actual
  // day-before-game / typical-time logic this new type triggers.
  const TYPES = [
    { key: 'practice', label: '🏃 Practice' },
    { key: 'film', label: '🎬 Film Night' },
    { key: 'walkthrough', label: '🚶 Walk Through' },
  ];
  // Nathan: "Cleats, practice jersey, helmet required" -- there's no
  // structured gear-checklist field anywhere in this app (Notes has always
  // been the one free-text spot for "what to bring"), so rather than invent
  // a whole new field/schema just for this, a fresh Walk Through's Notes
  // just gets pre-filled with this text (only when Notes is still empty --
  // see applyWalkthroughDefaults) the same way a coach would type it
  // themselves, and remains fully editable/removable from there.
  const WALKTHROUGH_DEFAULT_NOTES = 'Cleats, practice jersey, and helmet required.';
  // Index matches Date.getDay() (0 = Sunday) -- Nathan: "I need an option
  // to repeat or set practice for multiple days."
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let items = [];     // [{id, type, date, time, endTime, location, notes, updatedAt, droneClips}]
  // droneClips: [{id, title, storagePath, url, durationSec, order,
  //   uploadedBy, uploadedAt, comments: [{id, author, text, at}]}] -- see
  // js/drone-footage.js, which owns everything about rendering/editing
  // this field. Optional/undefined on any practice with no drone footage.
  let current = null; // item open in the detail view, or null (list view)
  let loaded = false;
  // Nathan: "when you go to this week ahead, and you click on a game or
  // practice, it brings me to the edit screen instead of the info screen."
  // Same race as js/schedule.js's gamesReadyPromise fix -- openPracticeDetail
  // (used by This Week's cards) triggers initPractices() synchronously via
  // showSchedulePracticesTab(), which sets `loaded = true` and kicks off
  // loadItems() (async, unawaited), then immediately called openDetail()
  // before `items` was actually populated -- so it couldn't find the
  // practice and forced edit mode. itemsReadyPromise is shared by both so
  // whichever one starts the fetch, the other waits on the real result.
  let itemsReadyPromise = null;
  // Nathan: "when I am logged in as a coach, I cant see it how the players
  // see it. Give me an edit button." Same fix as js/schedule.js -- see the
  // comment there. Existing practices open read-only by default (even for
  // an approved coach), with an Edit button to switch in; brand-new ones
  // still open straight into the edit form since there's nothing to
  // preview yet.
  let editMode = false;
  // Nathan: "I also don't want old practices to be confused with the new
  // practices. Would like maybe a weekly view that updates to the current
  // week." Defaults to This Week (Monday-Sunday, recomputed fresh off
  // today's real date every render -- see currentWeekRange -- so it always
  // tracks the real current week with no stored/stale state); a coach can
  // still flip to All to see the full history/future, same list either way.
  let weekViewFilter = 'week'; // 'week' | 'all'

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
  // CSS badge color class -- one branch per TYPES entry (see
  // .practiceTypeBadge.walkthrough in css/styles.css). Kept as its own
  // lookup rather than inlining a three-way ternary at each of the two call
  // sites below, so a future 4th type only needs one line changed here.
  function badgeClassFor(type) {
    return type === 'film' ? 'film' : type === 'walkthrough' ? 'walkthrough' : 'practice';
  }
  // Nathan: "need an end time for practice too." Both fields are the same
  // native <input type="time"> "HH:MM" shape, so a plain string compare
  // is enough to sanity-check end > start (no am/pm ambiguity possible).
  function timeRangeLabel(start, end) {
    if (!start) return '';
    return end ? `${to12h(start)} - ${to12h(end)}` : to12h(start);
  }
  function minutesBetween(start, end) {
    if (!start || !end) return null;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some(isNaN)) return null;
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins : null;
  }
  // Same fix as js/schedule.js -- see the comment there. Practice Time used
  // to be free text too, which is why it could silently fail to parse and
  // land as an all-day .ics event.
  function to24h(str) {
    if (!str) return '';
    const s = str.trim().toLowerCase();
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!m) return '';
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = m[3];
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  function to12h(str) {
    if (!str) return '';
    const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return str;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${min} ${ap}`;
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

  function persistItems(afterOk, afterFail) {
    const statusEl = document.getElementById('practicesDetailStatus') || document.getElementById('practicesCloudStatus');
    window.firebaseAuthed(PRACTICES_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else {
        if (statusEl) statusEl.textContent = `Save failed (HTTP ${r.status}).`;
        if (afterFail) afterFail(`HTTP ${r.status}`);
      }
    }).catch(err => {
      console.error('Practice save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
      if (afterFail) afterFail(err.message);
    });
  }

  // Nathan: "I also don't want old practices to be confused with the new
  // practices. Would like maybe a weekly view that updates to the current
  // week." Same This Week/All chip-toggle look as the Practice/Film/Walk
  // Through type picker elsewhere in this file.
  function renderWeekToggle() {
    const grid = document.getElementById('practicesWeekToggleGrid');
    if (!grid) return;
    grid.innerHTML = '';
    [['week', 'This Week'], ['all', 'All']].forEach(([key, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (weekViewFilter === key ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => { weekViewFilter = key; renderList(); });
      grid.appendChild(chip);
    });
  }

  // ---- List view ----
  function renderList() {
    const listEl = document.getElementById('practicesList');
    const addWrap = document.getElementById('practicesAddWrap');
    const toggleGrid = document.getElementById('practicesWeekToggleGrid');
    if (!listEl) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    if (addWrap) addWrap.style.display = approved ? '' : 'none';

    listEl.innerHTML = '';
    if (!items.length) {
      if (toggleGrid) toggleGrid.style.display = 'none';
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = approved ? 'No practices or film nights scheduled yet -- add one below.' : 'No practices or film nights scheduled yet.';
      listEl.appendChild(empty);
      return;
    }
    if (toggleGrid) { toggleGrid.style.display = ''; renderWeekToggle(); }

    const range = currentWeekRange();
    const visible = weekViewFilter === 'week' ? items.filter(p => p.date && p.date >= range.start && p.date <= range.end) : items;
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'Nothing scheduled this week -- switch to "All" above to see everything, or add one below.';
      listEl.appendChild(empty);
      return;
    }
    visible.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || '')).forEach(p => {
      const info = typeInfo(p.type);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'practiceRow';
      const weatherId = `practiceRowWeather-${p.id}`;
      // Nathan: "if drone footage is available - it should show a drone
      // icon on the practice bar to indicate it's available. If you
      // haven't clicked to see it, it should have a corner callout." Same
      // approved-or-team-toggle-on gate js/drone-footage.js's own section
      // uses, so this never advertises footage a given viewer wouldn't
      // actually be allowed to open. The dot clears itself the moment this
      // practice's detail view has actually rendered the section (see
      // renderDroneFootageSectionNow) -- not just from being in this list.
      // Nathan (later): "drone icon on the practice card should be in the
      // same spot as the weather - once the practice is done, the weather
      // goes away anyway so it can take it's place" -- moved into the
      // same right-aligned .practiceRowRight slot as the weather chip
      // instead of its own spot earlier in the row.
      const droneAllowed = window.practiceHasDroneFootage && window.practiceHasDroneFootage(p) &&
        (approved || !window.isDroneFootageVisibleCached || window.isDroneFootageVisibleCached());
      const droneUnseen = droneAllowed && window.practiceHasUnseenDroneFootage && window.practiceHasUnseenDroneFootage(p);
      const droneBadgeHtml = droneAllowed
        ? `<span class="practiceDroneBadge" title="Drone footage available">🚁${droneUnseen ? '<span class="whatsNewDot"></span>' : ''}</span>`
        : '';
      row.innerHTML = `
        <div class="practiceRowTop">
          <span class="practiceTypeBadge ${badgeClassFor(p.type)}">${info.label}</span>
          <span class="practiceRowDateTime">${fmtDate(p.date)}${p.time ? ' • ' + escapeHtml(timeRangeLabel(p.time, p.endTime)) : ''}</span>
          <span class="practiceRowRight">
            ${droneBadgeHtml}
            <span class="practiceRowWeather" id="${weatherId}" style="display:none;"></span>
          </span>
        </div>
        ${p.location ? `<span class="practiceRowLoc">📍 ${escapeHtml(p.location)}</span>` : ''}
        ${p.notes ? `<span class="practiceRowNotes">${escapeHtml(p.notes)}</span>` : ''}`;
      row.addEventListener('click', () => openDetail(p.id));
      listEl.appendChild(row);
      // Nathan: "let's add the weather to the right side of the practice
      // cards." Compact chip (icon + temp only, no place/precip text --
      // list rows are tight on space) fired per row after it's in the DOM.
      if (window.loadCompactWeatherInto) {
        window.loadCompactWeatherInto(document.getElementById(weatherId), p.location, p.date, p.time);
      }
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
    editMode = !items.some(p => p.id === current.id); // brand-new -> straight to edit form; existing -> read-only first
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
    const showEditForm = approved && editMode;
    editControls.style.display = showEditForm ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = items.some(p => p.id === current.id) ? '' : 'none';

    const info = typeInfo(current.type);

    if (!showEditForm) {
      // ---- Read-only view (also what an approved coach sees by default
      // now -- see the editMode comment up top) ----
      body.innerHTML = `
        ${approved ? `<div style="text-align:center;margin-bottom:10px;"><button type="button" class="lbLinkBtn" id="practiceEditToggleBtn">✏️ Edit</button></div>` : ''}
        <div style="text-align:center;margin-bottom:10px;"><span class="practiceTypeBadge ${badgeClassFor(current.type)}">${info.label}</span></div>
        <div class="lbSectionHeader" style="text-align:center;">${fmtDate(current.date)}${current.time ? ' • ' + escapeHtml(timeRangeLabel(current.time, current.endTime)) : ''}</div>
        <div class="lbSub" style="margin:4px 0 6px;text-align:center;">${escapeHtml(current.location || 'Location TBD')}</div>
        <div id="practiceCancelSection"></div>
        <div id="practiceWeatherWrap" style="display:none;"></div>
        <div style="text-align:center;margin-bottom:10px;"><button type="button" class="lbLinkBtn" id="practiceAddToCalBtn">📅 Add to Calendar</button></div>
        ${current.location ? `<div style="text-align:center;"><a href="${mapSearchUrl(current.location)}" target="_blank" rel="noopener" class="lbLinkBtn">📍 View on Map</a></div><iframe src="${mapUrl(current.location)}" style="width:100%;height:140px;border:0;border-radius:8px;margin-top:6px;" loading="lazy"></iframe>` : ''}
        ${current.notes ? `<div class="lbSectionHeader" style="margin-top:16px;">📝 Notes</div><div class="scheduleWriteup">${escapeHtml(current.notes).replace(/\n/g, '<br>')}</div>` : ''}`;
      const editToggleBtn = document.getElementById('practiceEditToggleBtn');
      if (editToggleBtn) editToggleBtn.addEventListener('click', () => { editMode = true; renderDetail(); });
      wireAddToCalendar();
      renderWeather();
      if (window.renderDroneFootageSection) window.renderDroneFootageSection(current);
      if (window.renderPracticeCancelSection) window.renderPracticeCancelSection(current);
      return;
    }

    // Repeat is only offered when creating a brand-new entry -- turning it
    // on while editing an already-saved practice would be ambiguous (does
    // it turn the one entry into many, keep the original too?). Creating
    // fresh, "Save" just generates one entry per matching date instead of
    // one entry total -- each still its own independent record afterward
    // (edit or cancel a single Tuesday without touching the rest).
    const isNew = !items.some(p => p.id === current.id);

    // ---- Coach edit view ----
    body.innerHTML = `
      ${!isNew ? `<div style="text-align:center;margin-bottom:10px;"><button type="button" class="lbLinkBtn" id="practicePreviewToggleBtn">👁 Preview (Player View)</button></div>` : ''}
      <div class="gameplanPickerGrid" id="practiceTypeGrid" style="margin-bottom:12px;"></div>
      ${!isNew ? `<div style="text-align:center;margin-bottom:10px;"><button type="button" class="lbLinkBtn" id="practiceAddToCalBtn">📅 Add to Calendar</button> &middot; <button type="button" class="lbLinkBtn" id="practiceDuplicateBtn">⧉ Duplicate</button></div>` : ''}
      <input type="date" id="practiceDate" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div style="flex:1;"><div class="lbSub" style="margin:0 0 3px;">Start Time</div><input type="time" id="practiceTime" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
        <div style="flex:1;"><div class="lbSub" style="margin:0 0 3px;">End Time</div><input type="time" id="practiceEndTime" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <input type="text" id="practiceLocation" placeholder="Address (e.g. Fuller Field, Clinton MA)" style="flex:1;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <a id="practiceMapLink" href="#" target="_blank" rel="noopener" class="lbLinkBtn" style="white-space:nowrap;align-self:center;">📍 View on Map</a>
      </div>
      <div id="practiceMapPreviewWrap" style="margin-bottom:8px;"></div>
      <div id="practiceWeatherWrap" style="display:none;"></div>
      <div id="practiceCancelSection"></div>
      ${isNew ? `
      <div class="lbSectionHeader" style="margin-top:6px;">🔁 Repeat (optional)</div>
      <div class="lbSub" style="margin:2px 0 8px;">Pick the day(s) of the week and an end date to add this on every matching date at once -- each one saves as its own entry, so you can still move or cancel a single day later.</div>
      <div class="gameplanPickerGrid" id="practiceRepeatDaysGrid" style="margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <span class="lbSub" style="margin:0;white-space:nowrap;">Repeat until:</span>
        <input type="date" id="practiceRepeatUntil" style="flex:1;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;">
      </div>` : ''}
      <div class="lbSectionHeader" style="margin-top:6px;">📝 Notes</div>
      <textarea id="practiceNotes" placeholder="e.g. &quot;Bring cleats and water, meet at the fieldhouse&quot;" style="width:100%;min-height:70px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"></textarea>`;

    document.getElementById('practiceDate').value = current.date || '';
    document.getElementById('practiceTime').value = to24h(current.time);
    document.getElementById('practiceEndTime').value = to24h(current.endTime);
    document.getElementById('practiceLocation').value = current.location || '';
    document.getElementById('practiceNotes').value = current.notes || '';

    const typeGrid = document.getElementById('practiceTypeGrid');
    TYPES.forEach(t => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (current.type === t.key ? ' active' : '');
      chip.textContent = t.label;
      chip.addEventListener('click', () => {
        const switchingToWalkthrough = t.key === 'walkthrough' && current.type !== 'walkthrough';
        current.type = t.key;
        if (switchingToWalkthrough) applyWalkthroughDefaults();
        renderDetail();
      });
      typeGrid.appendChild(chip);
    });

    if (isNew) {
      const repeatGrid = document.getElementById('practiceRepeatDaysGrid');
      if (!current._repeatDays) current._repeatDays = [];
      DAY_NAMES.forEach((label, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'gameplanChip' + (current._repeatDays.includes(idx) ? ' active' : '');
        chip.textContent = label;
        chip.addEventListener('click', () => {
          const pos = current._repeatDays.indexOf(idx);
          if (pos >= 0) current._repeatDays.splice(pos, 1); else current._repeatDays.push(idx);
          renderDetail();
        });
        repeatGrid.appendChild(chip);
      });
      const repeatUntilInput = document.getElementById('practiceRepeatUntil');
      if (repeatUntilInput) repeatUntilInput.value = current._repeatUntil || '';
    }

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
    if (!isNew) { wireAddToCalendar(); wireDuplicate(); }
    const previewToggleBtn = document.getElementById('practicePreviewToggleBtn');
    if (previewToggleBtn) {
      previewToggleBtn.addEventListener('click', () => {
        syncFormToCurrent(); // pulls in whatever's typed so far, even if unsaved
        editMode = false;
        renderDetail();
      });
    }
    renderWeather();
    // Nathan: "Drone footage section at the bottom... visible to players
    // and coaches when they click on the practice." Shown in both the
    // read-only and coach-edit views (above), so it's still there while a
    // coach is mid-edit of the date/notes/etc, not just after Save.
    if (window.renderDroneFootageSection) window.renderDroneFootageSection(current);
    // Same idea for the weather-cancellation status/Cancel button (see
    // js/practice-cancel.js) -- available from the edit view too, not just
    // the read-only default, since a coach mid-edit shouldn't have to back
    // out to read-only just to cancel the practice they're already looking at.
    if (window.renderPracticeCancelSection) window.renderPracticeCancelSection(current);
  }

  // Nathan: "add in projected weather for the event when available."
  function renderWeather() {
    const wrap = document.getElementById('practiceWeatherWrap');
    if (!wrap || !current || !window.loadWeatherInto) return;
    window.loadWeatherInto(wrap, current.location, current.date, current.time);
  }

  // Nathan: "Did you give me the option to duplicate a practice?" -- clones
  // the currently-open saved practice (type/time/location/notes carried
  // over, date cleared) into a brand-new unsaved entry, right in place.
  // Reuses the exact same "isNew" branch (repeat picker, no delete/add-to-
  // calendar/duplicate yet) that a fresh "+ Add Practice" already gets --
  // duplicating just pre-fills it instead of starting blank.
  function wireDuplicate() {
    const btn = document.getElementById('practiceDuplicateBtn');
    if (!btn || !current) return;
    btn.addEventListener('click', () => {
      current = { ...current, id: genId(), date: '', updatedAt: null };
      delete current._repeatDays;
      delete current._repeatUntil;
      renderDetail();
      const statusEl = document.getElementById('practicesDetailStatus');
      if (statusEl) statusEl.textContent = 'Duplicated -- pick a new date (and repeat days, if you want) and Save.';
    });
  }

  // Nathan: "give me the option of saving all the events to your device or
  // Google calendars or Apple calendars" -- single-event .ics for whichever
  // practice/film night is open (js/schedule-full.js has the bulk version).
  function wireAddToCalendar() {
    const btn = document.getElementById('practiceAddToCalBtn');
    if (!btn || !current) return;
    btn.addEventListener('click', () => {
      if (!current.date) { alert('Add a date first.'); return; }
      if (!window.buildICS || !window.downloadICS) return;
      // Nathan: "This is a 1 hour event" -- only matters as a fallback when
      // no end time is set at all; minutesBetween(current.time,
      // current.endTime) already reflects the real gap once both are filled
      // (which applyWalkthroughDefaults' 09:00-10:00/5:30-6:30 pairs do).
      const durationFallback = current.type === 'walkthrough' ? 60 : 105;
      const icsTitle = current.type === 'film' ? 'ASL Bengals Film Night' : current.type === 'walkthrough' ? 'ASL Bengals Walk Through' : 'ASL Bengals Practice';
      const icsFileTag = current.type === 'film' ? 'Film_Night' : current.type === 'walkthrough' ? 'Walk_Through' : 'Practice';
      const ics = window.buildICS([{
        uid: current.id, date: current.date, time: current.time || '', durationMinutes: minutesBetween(current.time, current.endTime) || durationFallback,
        title: icsTitle,
        location: current.location || '',
        description: current.notes || '',
      }]);
      window.downloadICS(`ASL_Bengals_${icsFileTag}_${current.date}.ics`, ics);
    });
  }

  // Nathan: "If the game is on Sunday, the walkthrough is Saturday morning
  // at 9am. If the game is Saturday, the walk through is 530-630 on Friday
  // night. We can set that but it's typically the options." Local-date math
  // throughout (no UTC), same care schedule.js's fmtDate/practices.js's
  // datesInRange already take to avoid off-by-one-day timezone shifts.
  function todayLocalDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dayBeforeStr(dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return '';
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Date.getDay(): 0 = Sunday, 6 = Saturday.
  function weekdayOf(dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }
  // Monday-Sunday window containing today -- same "week starts Monday"
  // convention js/thisweek.js's Week Ahead card already uses, reimplemented
  // locally rather than reaching into that file's private function (same
  // house rule this file's header comment already states for schedule.js).
  // Recomputed fresh (off `new Date()`) every call, so "this week" always
  // tracks the real current week with nothing stored/stale.
  function currentWeekRange() {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7; // days since most recent Monday
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(start), end: fmt(end) };
  }

  // Fires whenever a practice's type is switched to Walk Through (new or
  // already-saved entries alike -- see the TYPES chip handler below). Only
  // ever fills fields that are still blank, so flipping an existing
  // practice to Walk Through (or flipping it back and forth while deciding)
  // never clobbers anything a coach already typed. Looks at the *nearest
  // upcoming game* (schedule.js's own games array, shared via
  // window.getGamesCached/ensureGamesLoaded rather than a private copy) to
  // decide which of the two typical patterns applies; anything other than a
  // Sat/Sun game has no "typical" slot, so date/time are left for the coach
  // to set by hand rather than guessing.
  function applyWalkthroughDefaults() {
    if (!current) return;
    if (!current.notes) current.notes = WALKTHROUGH_DEFAULT_NOTES;
    const forId = current.id;
    const applyFromGames = (games) => {
      if (!current || current.id !== forId || current.type !== 'walkthrough') return;
      if (current.date) return; // coach already picked a date -- don't move it
      const today = todayLocalDateStr();
      const upcoming = (games || [])
        .filter(g => g.date && g.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!upcoming) return;
      const wd = weekdayOf(upcoming.date);
      if (wd === 0) { // game Sunday -> walkthrough Saturday 9-10am
        current.date = dayBeforeStr(upcoming.date);
        if (!current.time) { current.time = '09:00'; current.endTime = '10:00'; }
      } else if (wd === 6) { // game Saturday -> walkthrough Friday 5:30-6:30pm
        current.date = dayBeforeStr(upcoming.date);
        if (!current.time) { current.time = '17:30'; current.endTime = '18:30'; }
      }
      if (current.type === 'walkthrough') renderDetail();
    };
    if (window.getGamesCached && window.getGamesCached().length) {
      applyFromGames(window.getGamesCached());
    } else if (window.ensureGamesLoaded) {
      window.ensureGamesLoaded().then(applyFromGames);
    }
  }

  // Every date between start/end (inclusive) whose weekday is in
  // dayIndexes -- local-date math throughout (no UTC), same care
  // schedule.js's fmtDate takes to avoid off-by-one-day timezone shifts.
  function datesInRange(startStr, endStr, dayIndexes) {
    const start = new Date(...startStr.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)));
    const end = new Date(...endStr.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)));
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (dayIndexes.includes(d.getDay())) {
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    }
    return out;
  }

  // Reads the edit form's current field values into `current` without
  // persisting -- shared by saveCurrent() and the "Preview (Player View)"
  // button, same pattern as js/schedule.js's syncFormToCurrent().
  function syncFormToCurrent() {
    if (!current) return;
    current.date = document.getElementById('practiceDate').value;
    current.time = document.getElementById('practiceTime').value.trim();
    current.endTime = document.getElementById('practiceEndTime').value.trim();
    current.location = document.getElementById('practiceLocation').value.trim();
    current.notes = document.getElementById('practiceNotes').value.trim();
  }

  function saveCurrent() {
    if (!current) return;
    syncFormToCurrent();
    if (!current.date) {
      const statusEl = document.getElementById('practicesDetailStatus');
      if (statusEl) statusEl.textContent = 'Give it a date first.';
      return;
    }

    const repeatUntilInput = document.getElementById('practiceRepeatUntil');
    const repeatUntil = repeatUntilInput ? repeatUntilInput.value : '';
    const repeatDays = current._repeatDays || [];

    if (repeatDays.length && repeatUntil) {
      if (repeatUntil < current.date) {
        const statusEl = document.getElementById('practicesDetailStatus');
        if (statusEl) statusEl.textContent = '"Repeat until" has to be on or after the start date.';
        return;
      }
      const dates = datesInRange(current.date, repeatUntil, repeatDays);
      if (!dates.length) {
        const statusEl = document.getElementById('practicesDetailStatus');
        if (statusEl) statusEl.textContent = 'No dates in that range match the selected day(s).';
        return;
      }
      const now = new Date().toISOString();
      dates.forEach(date => {
        items.push({ id: genId(), type: current.type, date, time: current.time, endTime: current.endTime, location: current.location, notes: current.notes, updatedAt: now });
      });
      persistItems(() => closeDetail());
      return;
    }

    delete current._repeatDays;
    delete current._repeatUntil;
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
      itemsReadyPromise = loadItems();
    } else {
      document.getElementById('practicesDetail').style.display = 'none';
      document.getElementById('practicesListWrap').style.display = '';
      renderList();
    }
  };

  // Used by Full Schedule (js/schedule-full.js) to merge practices in with
  // games without needing the Practices tab to have been opened first.
  window.getPracticesCached = () => items;
  // Nathan: "ability to leave a comment... reorder them" -- drone-footage.js
  // needs to persist droneClips (upload/title/order/comment edits) without
  // going through the coach-only edit form's Save button, since a player
  // or parent adding a comment isn't an approved coach. Narrow write path,
  // same shape as roster.js's updateRosterPlayerNum: find the practice by
  // id in this module's own `items` array, set just its droneClips, and
  // persist through the same whole-array PUT everything else here uses.
  // Also keeps `current` in sync if this is the practice currently open,
  // so a re-render doesn't show stale clip data.
  window.saveDroneClips = function (practiceId, droneClips, afterOk, afterFail) {
    const item = items.find(p => p.id === practiceId);
    if (!item) { if (afterFail) afterFail('Practice not found'); return; }
    item.droneClips = droneClips;
    if (current && current.id === practiceId) current.droneClips = droneClips;
    persistItems(afterOk, afterFail);
  };
  window.ensurePracticesLoaded = function () {
    if (loaded) return Promise.resolve(items);
    loaded = true;
    return loadItems().then(() => items);
  };
  // Lets Full Schedule jump straight into a specific practice's detail page.
  window.openPracticeDetail = function (id) {
    if (window.showSchedulePracticesTab) window.showSchedulePracticesTab();
    wireControls();
    function actuallyOpen() {
      document.getElementById('practicesListWrap').style.display = 'none';
      document.getElementById('practicesDetail').style.display = '';
      openDetail(id);
    }
    if (itemsReadyPromise) {
      itemsReadyPromise.then(actuallyOpen);
    } else {
      loaded = true;
      itemsReadyPromise = loadItems();
      itemsReadyPromise.then(actuallyOpen);
    }
  };
})();
