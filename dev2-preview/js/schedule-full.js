// ---------------------------------------------------------------------------
// Full Schedule -- Nathan: "now that we have Games and Practice schedules,
// give me the option for Full Schedule." A read-only merged view of every
// game and practice/film night, sorted chronologically, plus a one-tap
// "Download Full Schedule" that exports everything as a single .ics file
// (js/calendar-export.js) -- "give me the option of saving all the events
// to your device or Google calendars or Apple calendars."
//
// Pulls from schedule.js and practices.js's already-loaded data via
// window.ensureGamesLoaded()/ensurePracticesLoaded() -- loads either one on
// demand if this is opened before its own tab ever was, so Full Schedule
// works as a first stop, not just a summary of tabs you already visited.
// ---------------------------------------------------------------------------
(function () {

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
  // Same fix as js/schedule.js / js/practices.js -- Game/Practice Time are
  // now native time pickers storing clean 24hr "HH:MM"; this just displays
  // that nicely as "6:00 PM" (and passes any old free-text value through
  // untouched, since it's presumably already human-readable).
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
  // Nathan: "need an end time for practice too" -- prefer the real
  // start/end gap for the bulk .ics export when both are set.
  function minutesBetween(start, end) {
    if (!start || !end) return null;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some(isNaN)) return null;
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins : null;
  }

  function mergedEntries(games, practices) {
    const gameEntries = games.map(g => ({
      kind: 'game', id: g.id, date: g.date || '',
      time: g.gameTime || g.time || '',
      title: `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}`,
      sub: g.gameType && g.gameType !== 'Regular Season' ? g.gameType : 'Game',
      location: g.location || '',
      infoUrl: g.infoUrl || '',
    }));
    // Nathan: "add another type of practice to the schedule which is Walk
    // Through." Same title/sub/badge treatment as Film Night got when it
    // was added -- see practices.js's TYPES/badgeClassFor for the source of
    // truth this mirrors.
    const practiceEntries = practices.map(p => ({
      kind: 'practice', id: p.id, date: p.date || '',
      time: p.time || '',
      title: p.type === 'film' ? '🎬 Film Night' : p.type === 'walkthrough' ? '🚶 Walk Through' : '🏃 Practice',
      sub: p.type === 'film' ? 'Film Night' : p.type === 'walkthrough' ? 'Walk Through' : 'Practice',
      location: p.location || '',
    }));
    return gameEntries.concat(practiceEntries).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
  }

  function toICSEvents(games, practices) {
    const gameEvents = games.filter(g => g.date).map(g => ({
      uid: g.id, date: g.date, time: g.gameTime || g.time || '', durationMinutes: 120,
      title: `ASL Bengals ${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}${g.gameType && g.gameType !== 'Regular Season' ? ' (' + g.gameType + ')' : ''}`,
      location: g.location || '',
      description: [g.arriveTime ? `Arrive by ${to12h(g.arriveTime)}` : '', g.warmupTime ? `Warm-up ${to12h(g.warmupTime)}` : ''].filter(Boolean).join(' • '),
    }));
    const practiceEvents = practices.filter(p => p.date).map(p => ({
      uid: p.id, date: p.date, time: p.time || '', durationMinutes: minutesBetween(p.time, p.endTime) || (p.type === 'walkthrough' ? 60 : 105),
      title: p.type === 'film' ? 'ASL Bengals Film Night' : p.type === 'walkthrough' ? 'ASL Bengals Walk Through' : 'ASL Bengals Practice',
      location: p.location || '',
      description: p.notes || '',
    }));
    return gameEvents.concat(practiceEvents);
  }

  function render() {
    const wrap = document.getElementById('scheduleFullList');
    if (!wrap) return;
    const games = window.getGamesCached ? window.getGamesCached() : [];
    const practices = window.getPracticesCached ? window.getPracticesCached() : [];
    const entries = mergedEntries(games, practices);

    wrap.innerHTML = '';
    if (!entries.length) {
      wrap.innerHTML = '<div class="lbEmpty">Nothing on the schedule yet.</div>';
      return;
    }
    entries.forEach(e => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'practiceRow';
      const badgeClass = e.kind === 'game' ? 'game' : (e.title.indexOf('Film') !== -1 ? 'film' : e.title.indexOf('Walk Through') !== -1 ? 'walkthrough' : 'practice');
      const weatherId = `fullSchedWeather-${e.kind}-${e.id}`;
      row.innerHTML = `
        <span class="practiceTypeBadge ${badgeClass}">${escapeHtml(e.sub)}</span>
        <span class="practiceRowDateTime">${fmtDate(e.date)}${e.time ? ' • ' + escapeHtml(to12h(e.time)) : ''} — ${escapeHtml(e.title)}</span>
        ${e.location ? `<span class="practiceRowLoc">📍 ${escapeHtml(e.location)}</span>` : ''}
        ${e.infoUrl ? `<span title="More info available on this game">🔗</span>` : ''}
        <div class="scheduleRowWeatherCenter" id="${weatherId}" style="display:none;"></div>`;
      row.addEventListener('click', () => {
        if (e.kind === 'game' && window.openScheduleGame) window.openScheduleGame(e.id);
        else if (e.kind === 'practice' && window.openPracticeDetail) window.openPracticeDetail(e.id);
      });
      wrap.appendChild(row);
      // Nathan: "add that little weather icon... at the end of all cards
      // on the full schedule cards." Same compact chip as Games/Practices
      // list rows, fired after the row's in the DOM.
      if (window.loadCompactWeatherInto) {
        window.loadCompactWeatherInto(document.getElementById(weatherId), e.location, e.date, e.time);
      }
    });
  }

  function downloadAll() {
    const games = window.getGamesCached ? window.getGamesCached() : [];
    const practices = window.getPracticesCached ? window.getPracticesCached() : [];
    const ics = window.buildICS(toICSEvents(games, practices));
    window.downloadICS('ASL_Bengals_Full_Schedule.ics', ics);
  }

  let controlsWired = false;
  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    const btn = document.getElementById('scheduleFullDownloadBtn');
    if (btn) btn.addEventListener('click', downloadAll);
  }

  window.initScheduleFull = function () {
    wireControls();
    const wrap = document.getElementById('scheduleFullList');
    if (wrap) wrap.innerHTML = '<div class="lbSub" style="text-align:center;">Loading…</div>';
    Promise.all([
      window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([]),
      window.ensurePracticesLoaded ? window.ensurePracticesLoaded() : Promise.resolve([]),
    ]).then(render);
  };
})();
