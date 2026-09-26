// ---------------------------------------------------------------------------
// Schedule Import -- Nathan: "I also need to be able to copy all the
// information from the coaches site and extract the game schedule with
// field, kickoff time, arrival time and other details needed... Would be
// great for this to just go into the site without manually extracting out
// the info." Same paste-a-blob-of-text-from-the-league-site pattern as
// Coach Tools > Standings (js/standings.js) -- parses the exact per-game
// block shape that site's locker page renders (Week header, HOME/AWAY vs
// Opponent, a Kickoff date/time line, Recommended arrival, a Field name +
// address link, Host contact, Parking/arrival, Game-day notes) straight
// into games matching js/schedule.js's own game shape, merges them into
// the existing schedule (matched by week number if already tagged, else by
// opponent name, otherwise added as new), and saves. Medical coverage is
// deliberately never captured -- Nathan: "EMT details and things like that
// don't need to be included."
//
// This intentionally does its own fetch/PUT to schedule.json rather than
// reusing schedule.js's private persistGames() (not exposed on window) --
// same "each file PUTs its own shared endpoint directly" pattern already
// used elsewhere (edit-plays.js and play-calls.js both PUT playEdits.json
// independently). window.ensureGamesLoaded()/getGamesCached() give the
// live, shared `games` array by reference, so mutating it here keeps the
// Schedule tab in sync without needing its own reload.
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function genId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeOpponentKey(name) {
    const cleaned = (name || '').replace(/\(.*?\)/g, '').trim();
    const firstWord = cleaned.split(/\s+/).filter(Boolean)[0] || '';
    return firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function to24h(h, m, ampm) {
    h = Number(h); m = Number(m);
    if (/pm/i.test(ampm) && h !== 12) h += 12;
    if (/am/i.test(ampm) && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function to12hDisplay(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function isoDate(monthAbbr, day, year) {
    const mo = MONTHS[monthAbbr];
    if (!mo) return '';
    return `${year}-${String(mo).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  // Default to the current year, but roll to next year if the parsed
  // month is well in the past relative to today -- handles a schedule
  // pasted late in the season that wraps into January.
  function seasonYear(monthAbbr, today) {
    const mo = MONTHS[monthAbbr];
    const curYear = today.getFullYear();
    const curMo = today.getMonth() + 1;
    if (mo - curMo < -4) return curYear + 1;
    return curYear;
  }

  // ---- Parser ----
  // Splits the pasted text into per-game chunks on "Week N ..." header
  // lines, then pulls each field out of its own line within that chunk.
  // Every field is read defensively (missing/unparseable pieces are left
  // blank with a warning) rather than failing the whole game, since host
  // associations don't all fill in the locker page the same way (Week 8
  // below is a real example -- "DETAILS PENDING" with nothing else yet).
  function parseScheduleText(text, today) {
    today = today || new Date();
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim());
    const chunks = [];
    let cur = null;
    lines.forEach(line => {
      if (/^Week\s+\d+\b/i.test(line)) {
        if (cur) chunks.push(cur);
        cur = [line];
      } else if (cur) {
        cur.push(line);
      }
    });
    if (cur) chunks.push(cur);

    const games = [];
    const warnings = [];

    chunks.forEach(rawLines => {
      const chunk = rawLines.filter(l => l !== '');
      const weekMatch = rawLines[0].match(/^Week\s+(\d+)/i);
      const week = weekMatch ? Number(weekMatch[1]) : null;
      const weekLabel = week !== null ? `Week ${week}` : 'A game';

      const haLine = chunk.find(l => /^(HOME|AWAY)\s*·\s*vs\s+/i.test(l));
      if (!haLine) { warnings.push(`${weekLabel}: couldn't find a "HOME/AWAY · vs Opponent" line -- skipped.`); return; }
      const haMatch = haLine.match(/^(HOME|AWAY)\s*·\s*vs\s+(.+)/i);
      const homeAway = /^HOME/i.test(haMatch[1]) ? 'Home' : 'Away';
      const opponent = haMatch[2].split('·')[0].trim();
      if (!opponent) { warnings.push(`${weekLabel}: couldn't read the opponent name -- skipped.`); return; }

      const fullChunkText = chunk.join(' | ');
      const pending = /DETAILS PENDING/i.test(fullChunkText);
      const finalScoreMatch = fullChunkText.match(/FINAL\s*·\s*(\d+)\s*-\s*(\d+)/i);

      const game = {
        week, opponent, homeAway,
        date: '', gameTime: '', arriveTime: '', location: '',
        ourScore: '', oppScore: '', gameDayNotes: '',
      };

      if (pending) {
        warnings.push(`Week ${week} (${opponent}): host hasn't posted kickoff/field details yet -- added with just the matchup, fill the rest in once it's released.`);
        games.push(game);
        return;
      }

      const kickoffIdx = chunk.findIndex(l => /^Kickoff$/i.test(l));
      if (kickoffIdx === -1 || !chunk[kickoffIdx + 1]) {
        warnings.push(`Week ${week} (${opponent}): couldn't find a Kickoff date/time -- left blank, fill in manually.`);
      } else {
        const dtMatch = chunk[kickoffIdx + 1].match(/([A-Za-z]{3}),?\s*([A-Za-z]{3})\s+(\d{1,2})\s*·\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (dtMatch) {
          const [, , mon, day, hh, mm, ampm] = dtMatch;
          game.date = isoDate(mon, day, seasonYear(mon, today));
          game.gameTime = to24h(hh, mm, ampm);
        } else {
          warnings.push(`Week ${week} (${opponent}): couldn't read the Kickoff line "${chunk[kickoffIdx + 1]}" -- left blank.`);
        }
      }

      const arriveLine = chunk.find(l => /^Recommended arrival:/i.test(l));
      if (arriveLine) {
        const am = arriveLine.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (am) game.arriveTime = to24h(am[1], am[2], am[3]);
      }

      const fieldIdx = chunk.findIndex(l => /^Field$/i.test(l));
      if (fieldIdx !== -1 && chunk[fieldIdx + 1]) {
        const fieldName = chunk[fieldIdx + 1];
        const addrMatch = (chunk[fieldIdx + 2] || '').match(/^\[(.+?)\]\(/);
        game.location = addrMatch ? `${fieldName}, ${addrMatch[1]}` : fieldName;
      } else {
        warnings.push(`Week ${week} (${opponent}): couldn't find the Field name/address -- left blank.`);
      }

      // Host contact / Parking / Game-day notes, combined -- Medical
      // coverage is intentionally never read into this.
      const notesParts = [];
      const hostLine = chunk.find(l => /^Host contact:/i.test(l));
      const parkingLine = chunk.find(l => /^Parking\s*\/\s*arrival:/i.test(l));
      const notesLine = chunk.find(l => /^Game-day notes:/i.test(l));
      if (hostLine) notesParts.push(hostLine);
      if (parkingLine) notesParts.push(parkingLine);
      if (notesLine) notesParts.push(notesLine);
      game.gameDayNotes = notesParts.join('\n\n');

      if (finalScoreMatch) {
        const [, s1, s2] = finalScoreMatch;
        // The site always lists the score HOME-AWAY -- map onto us/them by
        // whichever side of that we're actually on this game.
        if (homeAway === 'Home') { game.ourScore = Number(s1); game.oppScore = Number(s2); }
        else { game.ourScore = Number(s2); game.oppScore = Number(s1); }
      }

      games.push(game);
    });

    return { games, warnings };
  }

  // ---- Merge into the existing schedule ----
  // Matches an existing game primarily by week number (once a game's been
  // imported once and carries that tag), falling back to opponent name for
  // the very first import (nothing has a week number yet) -- updates the
  // matched game's schedule-site fields in place (preserving its id, any
  // write-up/scouting/injury-report/stats/footage already on it) rather
  // than replacing the whole object, and appends anything unmatched as a
  // brand new game.
  function mergeGames(existingGames, parsedGames) {
    let updated = 0, added = 0;
    parsedGames.forEach(pg => {
      const pgKey = normalizeOpponentKey(pg.opponent);
      let match = (pg.week !== null) ? existingGames.find(g => g.week === pg.week) : null;
      if (!match) match = existingGames.find(g => normalizeOpponentKey(g.opponent) === pgKey);
      if (match) {
        Object.assign(match, pg);
        updated++;
      } else {
        existingGames.push(Object.assign({
          id: genId(), gameType: 'Regular Season', writeup: '', scouting: '',
          statSheet: window.blankGameStatSheet ? window.blankGameStatSheet() : {},
          updatedAt: null, fieldPhoto: null, infoUrl: '', oppYards: '', ourTurnovers: '',
          oppTurnovers: '', oppFirstDowns: '', injuryReport: [], gameFootage: [],
          gameFootageAnnotations: [], opponentFilmUrl: '', opponentFilmNote: '',
        }, pg));
        added++;
      }
    });
    return { updated, added };
  }

  function saveGames(games, statusEl) {
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(games),
    })).then(r => {
      if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`);
      return true;
    }).catch(err => {
      console.error('Schedule import save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
      return false;
    });
  }

  function renderPreview(wrap, games, warnings) {
    if (!games.length) { wrap.innerHTML = ''; return; }
    const rows = games.map(g => `
      <tr>
        <td style="padding:6px 8px;">${g.week !== null ? 'Wk ' + g.week : ''}</td>
        <td style="padding:6px 8px;">${g.homeAway === 'Home' ? 'HOME' : 'AWAY'}</td>
        <td style="padding:6px 8px;font-weight:700;">${escapeHtml(g.opponent)}</td>
        <td style="padding:6px 8px;">${g.date || '<span class="lbSub" style="margin:0;">TBD</span>'}</td>
        <td style="padding:6px 8px;">${to12hDisplay(g.gameTime) || ''}</td>
        <td style="padding:6px 8px;">${to12hDisplay(g.arriveTime) || ''}</td>
        <td style="padding:6px 8px;">${escapeHtml(g.location || '')}</td>
      </tr>`).join('');
    wrap.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="text-align:left;border-bottom:2px solid #ccc;">
            <th style="padding:6px 8px;">Week</th><th style="padding:6px 8px;">H/A</th>
            <th style="padding:6px 8px;">Opponent</th><th style="padding:6px 8px;">Date</th>
            <th style="padding:6px 8px;">Kickoff</th><th style="padding:6px 8px;">Arrive</th>
            <th style="padding:6px 8px;">Field</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${warnings.length ? `<div class="hint" style="margin-top:10px;">${warnings.map(w => escapeHtml(w)).join('<br>')}</div>` : ''}`;
  }

  window.initCoachToolsScheduleImport = async function () {
    const wrap = document.getElementById('coachScheduleImportWrap');
    if (!wrap) return;
    wrap.innerHTML =
      '<textarea id="scheduleImportPasteBox" placeholder="Paste the full schedule/locker page text here, straight from the coaches\' league site" style="width:100%;min-height:260px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:monospace;white-space:pre;margin-bottom:8px;"></textarea>' +
      '<button type="button" class="navBtn" id="scheduleImportSaveBtn" style="display:block;width:100%;">💾 Import Into Schedule</button>' +
      '<div id="scheduleImportStatus" class="hint" style="text-align:center;margin-top:8px;"></div>' +
      '<div id="scheduleImportPreviewWrap" style="margin-top:16px;"></div>';

    document.getElementById('scheduleImportSaveBtn').addEventListener('click', async () => {
      const text = document.getElementById('scheduleImportPasteBox').value;
      const statusEl = document.getElementById('scheduleImportStatus');
      const previewWrap = document.getElementById('scheduleImportPreviewWrap');
      const { games: parsedGames, warnings } = parseScheduleText(text, new Date());
      if (!parsedGames.length) {
        statusEl.textContent = "Nothing readable in there -- paste the full schedule page text (including the Week headers) and try again.";
        return;
      }
      statusEl.textContent = 'Saving…';
      const existingGames = await window.ensureGamesLoaded();
      const { updated, added } = mergeGames(existingGames, parsedGames);
      const ok = await saveGames(existingGames, statusEl);
      if (ok) {
        statusEl.textContent = `Saved -- ${added} new game${added === 1 ? '' : 's'} added, ${updated} updated.` +
          (warnings.length ? ` (${warnings.length} note${warnings.length === 1 ? '' : 's'} below.)` : '');
        renderPreview(previewWrap, parsedGames, warnings);
        if (window.initSchedule) window.initSchedule();
      }
    });
  };
})();
