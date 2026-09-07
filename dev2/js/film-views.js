// ---------------------------------------------------------------------------
// Film view tracking -- Nathan: "On coaching Tools stats, let me know who is
// watching film." Three separate places link out to a game's opponent film
// (This Week's CTA in index.html/thisweek.js, Schedule's game-detail button
// in schedule.js, and the Opponent Page in standings.js) -- rather than each
// one wiring its own logging call, every one of those anchors just carries a
// data-film-game-id attribute (see those three files), and a single
// document-level delegated click listener here catches all of them. Views
// are stored at filmViews/{gameId}/{slugOfName}.json -- keyed by name so the
// same person opening the same game's film twice updates one record instead
// of piling up duplicates, same spirit as a "last seen" timestamp.
// Coach Tools > Stats' new "Film Views" sub-tab (js/coachtools-stats.js)
// reads this back and shows who's watched what.
// ---------------------------------------------------------------------------
(function () {

  const FILM_VIEWS_URL = `${FIREBASE_DB_URL}/filmViews`;

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'anon';
  }

  // Fire-and-forget, same reasoning as every other usage counter in this app
  // (study-quiz.js's quiz-start logger, etc.) -- a failed write here should
  // never surface an error to whoever's just trying to watch some film.
  // Nathan (follow-up): "should show who has watched what film and how many
  // times - not just a single piece of film and when they did it." This
  // used to be a plain PUT every time, overwriting the same record with a
  // fresh timestamp -- watching the same film five times looked identical
  // to watching it once. Reads the existing record first and increments a
  // real count instead. Small window for a race if the same person opens
  // the same film from two devices in the same instant; an acceptable
  // tradeoff here, same as every other casual fire-and-forget counter in
  // this app already accepts.
  window.logFilmView = async function (gameId) {
    if (!gameId) return;
    try {
      const { name } = (typeof currentPlayerTag === 'function') ? currentPlayerTag() : {};
      if (!name) return; // no identified session -- nothing to attribute the view to
      const isCoach = !!window.isCoachSession || (typeof isCoachEntryName === 'function' && isCoachEntryName(name));
      const url = await window.firebaseAuthed(`${FILM_VIEWS_URL}/${encodeURIComponent(gameId)}/${slug(name)}.json`);
      let existing = null;
      try { const r = await fetch(url); existing = r.ok ? await r.json() : null; } catch (e2) {}
      const count = (existing && Number(existing.count) > 0) ? Number(existing.count) + 1 : 1;
      const firstTs = (existing && existing.firstTs) ? existing.firstTs : Date.now();
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isCoach, count, firstTs, lastTs: Date.now() }),
      });
    } catch (e) { /* nice-to-have, never worth surfacing to the viewer */ }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-film-game-id]');
    if (el) window.logFilmView(el.dataset.filmGameId);
  });

  // Returns { [gameId]: [{name, isCoach, count, firstTs, lastTs}, ...] }
  // sorted most-views-first within each game (previously sorted by most-
  // recent-view, which made sense when a timestamp was the only signal --
  // "how often" is the thing being asked for now, so count leads).
  window.fetchFilmViews = async function () {
    try {
      const url = await window.firebaseAuthed(`${FILM_VIEWS_URL}.json`);
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = await res.json();
      if (!data) return {};
      const out = {};
      Object.keys(data).forEach((gameId) => {
        const viewers = Object.values(data[gameId] || {}).filter(Boolean);
        viewers.sort((a, b) => (b.count || 0) - (a.count || 0) || (b.lastTs || b.ts || 0) - (a.lastTs || a.ts || 0));
        out[gameId] = viewers;
      });
      return out;
    } catch (e) {
      return {};
    }
  };
})();
