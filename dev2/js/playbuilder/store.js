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

// Nathan: "edits saved in play editor are not showing up on the Plays
// section... it's not going to be possible to keep asking you to change
// things, copy JSON, open the inspect panel and paste changes. This needs
// to be automatic from the coach tools. When you save an update, you
// should be able to reload and see it live on the play cards." Confirmed
// live, the exact mechanism: window.DATA.playTypes only ever gets Play
// Builder V2's data via syncCustomFormationsIntoData(), which only ran at
// page BOOT (index.html) or, narrowly, from inside play-calls.js's own
// loadLiveEditsIntoData() -- itself a one-shot per page load AND only
// re-syncing when the unrelated, legacy playEdits.json overlay also had
// data. A coach who saves a play in Play Builder and switches back to the
// real Play tab in the SAME session (no full browser reload) was seeing
// the STALE pre-save version -- reproduced directly: toggled a real flag
// off, saved, confirmed Firebase had the new value, then confirmed
// window.DATA.playTypes still showed the OLD one after navigating back to
// Play with zero page reload.
//
// Fix: every mutation through this store re-runs the same, already-
// idempotent, merge-by-key sync afterward, so window.DATA.playTypes/
// window.Formations/window.PlayBuilderFormationsById/PlaysById are always
// current the instant a save/delete resolves -- no reload of any kind
// needed. Awaited (not fire-and-forget): the caller's own "Saved!" only
// shows once the real app's view of the data is actually fresh, so there
// is no window where a coach could switch tabs between "saved" and
// "synced" and still see stale data. A refresh failure never breaks the
// save itself, matching this app's established "continuing anyway"
// error-isolation pattern.
function refreshLiveData() {
  if (!window.PlayBuilderSyncCustomFormations) return Promise.resolve();
  return window.PlayBuilderSyncCustomFormations.syncCustomFormationsIntoData()
    .catch((err) => console.error('[playbuilder/store] failed to refresh live app data after save (continuing anyway):', err));
}

async function saveFormation(formation) {
  const res = await authedFetch(`/formations/${formation.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formation),
  });
  await refreshLiveData();
  return res;
}

async function deleteFormation(formationId) {
  const res = await authedFetch(`/formations/${formationId}.json`, { method: 'DELETE' });
  await refreshLiveData();
  return res;
}

async function saveDefenseLook(look) {
  const res = await authedFetch(`/defenseLooks/${look.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(look),
  });
  await refreshLiveData();
  return res;
}

async function deleteDefenseLook(lookId) {
  const res = await authedFetch(`/defenseLooks/${lookId}.json`, { method: 'DELETE' });
  await refreshLiveData();
  return res;
}

// null clears the override (every play falls back to its own default --
// today, always base_4x4). PUT of a raw string, not an object, since this
// is a single scalar value, not a keyed collection like everything else
// in this store.
async function saveActiveDefenseLookId(lookId) {
  const res = await authedFetch('/activeDefenseLookId.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lookId || null),
  });
  await refreshLiveData();
  return res;
}

async function savePlay(play) {
  const res = await authedFetch(`/plays/${play.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(play),
  });
  await refreshLiveData();
  return res;
}

async function deletePlay(playId) {
  const res = await authedFetch(`/plays/${playId}.json`, { method: 'DELETE' });
  await refreshLiveData();
  return res;
}

window.PlayBuilderStore = { loadAll, isEmpty, seedFromDefaults, saveFormation, deleteFormation, saveDefenseLook, deleteDefenseLook, saveActiveDefenseLookId, savePlay, deletePlay };

})();
