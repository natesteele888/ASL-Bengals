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
  window.logFilmView = async function (gameId) {
    if (!gameId) return;
    try {
      const { name } = (typeof currentPlayerTag === 'function') ? currentPlayerTag() : {};
      if (!name) return; // no identified session -- nothing to attribute the view to
      const isCoach = !!window.isCoachSession || (typeof isCoachEntryName === 'function' && isCoachEntryName(name));
      const url = await window.firebaseAuthed(`${FILM_VIEWS_URL}/${encodeURIComponent(gameId)}/${slug(name)}.json`);
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isCoach, ts: Date.now() }),
      });
    } catch (e) { /* nice-to-have, never worth surfacing to the viewer */ }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-film-game-id]');
    if (el) window.logFilmView(el.dataset.filmGameId);
  });

  // Returns { [gameId]: [{name, isCoach, ts}, ...] } sorted most-recent-view
  // first within each game -- exactly the shape Coach Tools' Film Views
  // sub-tab wants, so it doesn't need to know about the raw Firebase object
  // shape (keyed by slug, which the caller has no use for).
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
        viewers.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        out[gameId] = viewers;
      });
      return out;
    } catch (e) {
      return {};
    }
  };
})();
