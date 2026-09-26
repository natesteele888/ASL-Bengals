// ============================================================
// Play Builder v2 -- Firebase persistence.
//
// Deliberately a NEW node (dev2PlayData/playBuilderV2), separate from
// dev2PlayData/plays.json (shipped defaults) and playEdits.json (a
// coach's save overlay that silently shadows the former -- the exact
// mechanism that hid every Pop Pass fix for most of a week, see
// edit-plays.js's loadSavedPlaysFromCloud comment for the full story).
// This new editor reads and writes ONLY this one node -- one source of
// truth, no shadow copy to fall out of sync with it.
// ============================================================
//
// IIFE-wrapped -- FIREBASE_DB_URL is ALREADY declared top-level in
// js/study-quiz.js (and, inside its own IIFE, js/cloud-auth.js), which
// this file shares a page with in the real app. A second top-level
// `const FIREBASE_DB_URL` would be a SyntaxError (const redeclaration in
// the same scope), not a silent bug -- confirmed before wrapping.
(function () {

const FIREBASE_DB_URL = 'https://aslbengals-default-rtdb.firebaseio.com';
const ROOT = `${FIREBASE_DB_URL}/dev2PlayData/playBuilderV2`;

async function authedFetch(path, options) {
  const url = await window.firebaseAuthed(`${ROOT}${path}`);
  // no-store -- confirmed live as a real bug: saving a play, then loading
  // this screen fresh, could still show stale data (a coach's own
  // just-saved play silently missing from the real Play tab) because
  // firebaseAuthed's own id-token caching (js/cloud-auth.js's
  // getFirebaseIdToken -- a token is reused for a while, not regenerated
  // per call) means this exact GET URL can repeat within a short window,
  // and the default cache mode is free to serve an earlier response for
  // it instead of hitting the network again. This data is never meant to
  // be cached -- every read needs to be the real, current state.
  const res = await fetch(url, Object.assign({ cache: 'no-store' }, options));
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Play Builder store request failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

/** @returns {Promise<{formations: object[], defenseLooks: object[], plays: object[], viewBox: number[], topPad: number, activeDefenseLookId: (string|null)}>} */
async function loadAll() {
  const res = await authedFetch('.json');
  const data = await res.json();
  return {
    formations: data?.formations ? Object.values(data.formations) : [],
    defenseLooks: data?.defenseLooks ? Object.values(data.defenseLooks) : [],
    plays: data?.plays ? Object.values(data.plays) : [],
    viewBox: data?.viewBox || [1600, 1030],
    topPad: data?.topPad ?? 400,
    // Which DefenseLook every real play renders against this week, if any
    // -- Nathan: "I need to be able to set the defense for the week so
    // all our plays run against that look." A single, global value (not
    // per-play, not per-formation) -- a play's own defenseLookId stays as
    // the fallback default when this is unset. null = no override, use
    // each play's own default (today, always base_4x4).
    activeDefenseLookId: data?.activeDefenseLookId ?? null,
  };
}

/** True the first time this runs against a fresh project -- nothing saved yet at all. */
async function isEmpty() {
  const res = await authedFetch('.json');
  const data = await res.json();
  return !data;
}

/** Writes window.PlayBuilderSeeds as the starting content -- only ever call when isEmpty() is true. */
async function seedFromDefaults() {
  const seeds = window.PlayBuilderSeeds;
  const formations = {};
  seeds.formations.forEach((f) => { formations[f.id] = f; });
  const defenseLooks = {};
  seeds.defenseLooks.forEach((d) => { defenseLooks[d.id] = d; });
  await authedFetch('.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formations, defenseLooks, plays: {}, viewBox: seeds.viewBox, topPad: seeds.topPad }),
  });
}

function saveFormation(formation) {
  return authedFetch(`/formations/${formation.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formation),
  });
}

function deleteFormation(formationId) {
  return authedFetch(`/formations/${formationId}.json`, { method: 'DELETE' });
}

function saveDefenseLook(look) {
  return authedFetch(`/defenseLooks/${look.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(look),
  });
}

function deleteDefenseLook(lookId) {
  return authedFetch(`/defenseLooks/${lookId}.json`, { method: 'DELETE' });
}

// null clears the override (every play falls back to its own default --
// today, always base_4x4). PUT of a raw string, not an object, since this
// is a single scalar value, not a keyed collection like everything else
// in this store.
function saveActiveDefenseLookId(lookId) {
  return authedFetch('/activeDefenseLookId.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lookId || null),
  });
}

function savePlay(play) {
  return authedFetch(`/plays/${play.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(play),
  });
}

function deletePlay(playId) {
  return authedFetch(`/plays/${playId}.json`, { method: 'DELETE' });
}

window.PlayBuilderStore = { loadAll, isEmpty, seedFromDefaults, saveFormation, deleteFormation, saveDefenseLook, deleteDefenseLook, saveActiveDefenseLookId, savePlay, deletePlay };

})();
