// ---------------------------------------------------------------------------
// League Standings -- Nathan: "need a place where I can copy standing from
// the coaches app and drop it directly into a field under Coaching Tools to
// paste in to update the standings. It should show the record for opponents
// and update them as the season goes on." Followed up with the exact paste
// format: a tab-separated table copied straight out of the league site --
// Team (name, then " · Tackle 11U" or similar division tag), Record (W-L or
// W-L-T), PF, PA.
//
// Two surfaces share this one file: the Coach Tools > Standings paste box
// (window.initCoachToolsStandings, gated behind Coach Tools' own
// approvedCoach check same as every other tab there) writes to Firebase;
// the read-only Standings top-level tab (window.initStandingsNav, visible
// to everyone -- see study-quiz.js's refreshCoachToolsVisibility) just
// reads and renders it. Every team in the pasted table shows here,
// including our own upcoming opponents' current records -- that's the
// "record for opponents" Nathan asked for, no separate lookup needed.
// ---------------------------------------------------------------------------
(function () {

  const STANDINGS_URL = `${FIREBASE_DB_URL}/standings.json`;
  let standingsData = null;
  let loaded = false;

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // "1-0" or "1-0-1" (ties) -- youth football box scores don't always carry
  // ties, so the third group is optional.
  function parseRecord(str) {
    const m = String(str || '').trim().match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    return { w: Number(m[1]), l: Number(m[2]), t: m[3] ? Number(m[3]) : 0 };
  }

  // Nathan's paste is tab-separated (straight out of a table); fall back to
  // splitting on 2+ spaces in case whatever copied it collapsed the tabs.
  function splitCols(line) {
    let cols = line.split('\t').map(c => c.trim()).filter(c => c !== '');
    if (cols.length < 4) cols = line.split(/ {2,}/).map(c => c.trim()).filter(c => c !== '');
    return cols;
  }

  function parseStandingsText(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const teams = [];
    const warnings = [];
    lines.forEach((line, i) => {
      // Header row ("Team  Record  PF  PA") -- skip it rather than treat it
      // as a broken data row.
      if (/^team\b/i.test(line) && /record/i.test(line)) return;
      const cols = splitCols(line);
      if (cols.length < 4) {
        warnings.push(`Line ${i + 1}: couldn't read "${line}" -- skipped.`);
        return;
      }
      const [nameRaw, recordRaw, pfRaw, paRaw] = cols;
      const rec = parseRecord(recordRaw);
      if (!rec) {
        warnings.push(`Line ${i + 1}: couldn't read record "${recordRaw}" for "${nameRaw}" -- skipped.`);
        return;
      }
      const pf = Number(pfRaw), pa = Number(paRaw);
      if (Number.isNaN(pf) || Number.isNaN(pa)) {
        warnings.push(`Line ${i + 1}: couldn't read PF/PA for "${nameRaw}" -- skipped.`);
        return;
      }
      // "Ayer/Shirley/Lunenburg · Tackle 11U" -- team name, then a division
      // tag separated by " · ". Keep both, but the tag is cosmetic only.
      const parts = nameRaw.split('·').map(s => s.trim()).filter(Boolean);
      teams.push({
        team: parts[0] || nameRaw,
        division: parts[1] || '',
        wins: rec.w, losses: rec.l, ties: rec.t,
        pf: pf, pa: pa,
      });
    });
    return { teams, warnings };
  }

  // Standard win-pct (ties count half a win/loss each) with point
  // differential as the tiebreaker -- close enough to how any real
  // standings page ranks a one-division league like this.
  function sortedTeams(teams) {
    return teams.slice().sort((a, b) => {
      const gpA = a.wins + a.losses + a.ties, gpB = b.wins + b.losses + b.ties;
      const pctA = gpA ? (a.wins + a.ties * 0.5) / gpA : 0;
      const pctB = gpB ? (b.wins + b.ties * 0.5) / gpB : 0;
      if (pctB !== pctA) return pctB - pctA;
      const diffA = a.pf - a.pa, diffB = b.pf - b.pa;
      if (diffB !== diffA) return diffB - diffA;
      return b.pf - a.pf;
    });
  }

  function recordStr(t) {
    return t.wins + '-' + t.losses + (t.ties ? '-' + t.ties : '');
  }

  function isBengalsRow(t) {
    return /bengal/i.test(t.team || '');
  }

  async function loadStandings(force) {
    if (loaded && !force) return standingsData;
    try {
      const res = await fetch(STANDINGS_URL);
      standingsData = res.ok ? await res.json() : null;
    } catch (e) {
      standingsData = null;
    }
    loaded = true;
    return standingsData;
  }

  async function saveStandings(teams, rawText, statusEl) {
    const payload = { updatedAt: new Date().toISOString(), rawText: rawText || '', teams: teams };
    if (statusEl) statusEl.textContent = 'Saving…';
    try {
      const url = await window.firebaseAuthed(STANDINGS_URL);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      standingsData = payload;
      loaded = true;
      return { ok: true };
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
      return { ok: false };
    }
  }

  function renderTable(container, data) {
    if (!container) return;
    if (!data || !Array.isArray(data.teams) || !data.teams.length) {
      container.innerHTML = '<div class="lbEmpty">No standings posted yet.</div>';
      return;
    }
    const ordered = sortedTeams(data.teams);
    const updated = data.updatedAt
      ? new Date(data.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    let html = '';
    if (updated) html += `<div class="lbSub" style="text-align:center;margin-bottom:10px;">Last updated ${escapeHtml(updated)}</div>`;
    html += '<div class="standingsTableWrap"><table class="standingsTable"><thead><tr>' +
      '<th>#</th><th>Team</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th></tr></thead><tbody>';
    ordered.forEach((t, i) => {
      const diff = t.pf - t.pa;
      const diffStr = (diff > 0 ? '+' : '') + diff;
      html += `<tr class="${isBengalsRow(t) ? 'standingsRowUs' : ''}">` +
        `<td>${i + 1}</td>` +
        `<td>${escapeHtml(t.team)}${t.division ? `<span class="standingsDivTag">${escapeHtml(t.division)}</span>` : ''}</td>` +
        `<td>${escapeHtml(recordStr(t))}</td>` +
        `<td>${t.pf}</td><td>${t.pa}</td><td>${diffStr}</td></tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  // ---- Read-only Standings tab (everyone) ----
  window.initStandingsNav = async function () {
    const container = document.getElementById('standingsTableWrap');
    if (!container) return;
    container.innerHTML = '<div class="hint" style="text-align:center;">Loading standings…</div>';
    const data = await loadStandings();
    renderTable(container, data);
  };

  // ---- Coach Tools paste box ----
  window.initCoachToolsStandings = async function () {
    const wrap = document.getElementById('coachStandingsWrap');
    if (!wrap) return;
    const data = await loadStandings();
    wrap.innerHTML =
      '<textarea id="standingsPasteBox" placeholder="Paste the standings table here -- Team, Record, PF, PA columns" style="width:100%;min-height:220px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:monospace;white-space:pre;margin-bottom:8px;">' +
      escapeHtml((data && data.rawText) || '') +
      '</textarea>' +
      '<button type="button" class="navBtn" id="standingsSaveBtn" style="display:block;width:100%;">💾 Save Standings</button>' +
      '<div id="standingsSaveStatus" class="hint" style="text-align:center;margin-top:8px;"></div>' +
      '<div id="standingsPreviewWrap" style="margin-top:16px;"></div>';
    const previewWrap = document.getElementById('standingsPreviewWrap');
    if (data && Array.isArray(data.teams) && data.teams.length) renderTable(previewWrap, data);
    document.getElementById('standingsSaveBtn').addEventListener('click', async () => {
      const text = document.getElementById('standingsPasteBox').value;
      const statusEl = document.getElementById('standingsSaveStatus');
      const { teams, warnings } = parseStandingsText(text);
      if (!teams.length) {
        statusEl.textContent = "Nothing readable in there -- check the paste (Team, Record, PF, PA columns) and try again.";
        return;
      }
      const result = await saveStandings(teams, text, statusEl);
      if (result.ok) {
        statusEl.textContent = `Saved -- ${teams.length} team${teams.length === 1 ? '' : 's'} now showing on the Standings tab.` +
          (warnings.length ? ` (${warnings.length} line${warnings.length === 1 ? '' : 's'} skipped -- ${warnings[0]})` : '');
        renderTable(previewWrap, { teams: teams, updatedAt: new Date().toISOString() });
      }
    });
  };
})();
