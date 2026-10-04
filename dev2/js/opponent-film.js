// Opponent scouting film -- Nathan: "we need the ability to store game
// footage of upcoming opponents. Like we do for our game film, I need to
// add opponent film to a new film section on team pages... The team we
// are playing that week should also have the film visible in the WEEK
// AHEAD section... Make it accessible in the coach tools section to
// upload in library. Choose the team/teams, add the link and upload."
//
// Distinct from this team's OWN game/practice film (Film Vault, js/
// drone-footage.js) -- this is scouting material ABOUT an opponent, keyed
// by TEAM NAME rather than one of our own practices/games, so a coach can
// add it for any team (even one not yet on our Schedule) without needing
// one of our own game records to attach to.
//
// Also distinct from the existing, simpler per-game `opponentFilmUrl`
// single link (js/schedule.js, entered on a specific game's own edit
// form) -- that field stays exactly as it is, untouched; this is an
// additive, richer, MULTI-clip store alongside it. Every place that shows
// opponent film (This Week's Week Ahead, a team's Standings page) shows
// both sources together, so a coach never has to remember which of two
// places a given link lives in.
(function () {

  function filmUrl() { return `${FIREBASE_DB_URL}/opponentFilm.json`; }

  // Same word-token-overlap matching js/standings.js's own
  // matchScheduleOpponent/teamTokens already proves out for exactly this
  // problem (Standings' pasted division names vs. whatever a coach typed
  // into Schedule's own opponent field don't always match byte-for-byte --
  // "Ayer/Shirley/Lunenburg" vs. "Ayer Shirley"). A small, self-contained
  // copy here rather than a cross-file call into standings.js, which is
  // about team PAGES specifically and shouldn't need to be loaded just to
  // resolve a team name -- same "a small, independent copy is fine" call
  // this codebase already makes for numberedRows()-style helpers.
  const IGNORED_TEAM_WORDS = new Set(['tackle', '11u', 'regional', 'youth', 'football', 'high', 'school', 'the', 'jr', 'sr']);
  function teamTokens(s) {
    return String(s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !IGNORED_TEAM_WORDS.has(t));
  }
  // A single shared token isn't enough -- "North Middlesex" and "North
  // County" are two separate, real CMYFCC opponents that share only
  // "north" and nothing else (the exact collision already found and
  // fixed for opponent logos this same session, and for this same
  // token-matching pattern in js/standings.js). Requires every token of
  // the SHORTER name to appear in the longer one instead -- still
  // matches the legitimate "Ayer/Shirley/Lunenburg" vs. "Ayer Shirley"
  // case this function's own comment above describes, but no longer
  // matches two genuinely different teams off one shared word.
  function teamsMatch(a, b) {
    const ta = teamTokens(a), tb = teamTokens(b);
    if (!ta.length || !tb.length) return false;
    const shorter = ta.length <= tb.length ? ta : tb;
    const longer = ta.length <= tb.length ? tb : ta;
    return shorter.every((t) => longer.includes(t));
  }

  function load() {
    return window.firebaseAuthed(filmUrl())
      .then((url) => fetch(url, { cache: 'no-store' }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (Array.isArray(data) ? data : []));
  }

  // Nathan: "upload of video only allows to choose one opponent while
  // there are 2 teams on the film. Need to pick both teams playing in
  // the game." A clip's game film naturally shows TWO teams (whoever
  // played each other), useful scouting for either one -- so a clip
  // carries `teamNames` (an array), not a single `teamName`. No real
  // data existed under the old singular shape yet (confirmed live before
  // making this change), so this is a clean schema change, not a
  // migration -- nothing to carry forward.
  function clipsForTeam(entries, teamName) {
    if (!teamName) return [];
    return (entries || []).filter((e) => e && Array.isArray(e.teamNames) && e.teamNames.some((t) => teamsMatch(t, teamName)));
  }

  // Every real opponent name already on the Schedule, deduplicated --
  // the common-case source for the admin picker's team <select> (a coach
  // is almost always uploading film for a team we actually play). No
  // existing utility does this dedup anywhere in the app (confirmed by
  // search) -- schedule.js's own opponent field is free-typed per game,
  // not drawn from a canonical list.
  function distinctOpponentNames(games) {
    const seen = new Set();
    const names = [];
    (games || []).forEach((g) => {
      const name = (g.opponent || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
    return names.sort((a, b) => a.localeCompare(b));
  }

  // Same single-promise-chain discipline js/gameplan.js's own addEntry
  // already established for this exact class of bug (two coaches/two taps
  // close together both reading the same stale "current" array before
  // either write lands, so the second write silently drops the first
  // addition) -- this document only ever grows one clip or shrinks one
  // clip at a time, never a whole-document replace from a stale read.
  let writeChain = Promise.resolve();
  function withCurrent(mutate) {
    const attempt = writeChain.then(() => window.firebaseAuthed(filmUrl())
      .then((url) => fetch(url, { cache: 'no-store' }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const current = Array.isArray(data) ? data : [];
        const next = mutate(current);
        return window.firebaseAuthed(filmUrl()).then((url) => fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }));
      })
      .then((r) => {
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`);
        return true;
      }));
    writeChain = attempt.catch(() => {});
    return attempt;
  }

  function addClip({ teamNames, title, url }) {
    teamNames = (teamNames || []).map((t) => (t || '').trim()).filter(Boolean);
    url = (url || '').trim();
    if (!teamNames.length) return Promise.reject(new Error('Pick at least one team first.'));
    if (!url) return Promise.reject(new Error('Paste a film link first.'));
    const entry = {
      id: 'of' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      teamNames,
      title: (title || '').trim(),
      url,
      addedAt: new Date().toISOString(),
    };
    return withCurrent((current) => current.concat([entry])).then(() => entry);
  }

  function removeClip(id) {
    return withCurrent((current) => current.filter((e) => e.id !== id));
  }

  window.OpponentFilm = { load, clipsForTeam, distinctOpponentNames, teamsMatch, addClip, removeClip };
})();
