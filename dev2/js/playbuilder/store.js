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

const FIREBASE_DB_URL = 'https://aslbengals-default-rtdb.firebaseio.com';
const ROOT = `${FIREBASE_DB_URL}/dev2PlayData/playBuilderV2`;

async function authedFetch(path, options) {
  const url = await window.firebaseAuthed(`${ROOT}${path}`);
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Play Builder store request failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

/** @returns {Promise<{formations: object[], defenseLooks: object[], plays: object[], viewBox: number[], topPad: number}>} */
async function loadAll() {
  const res = await authedFetch('.json');
  const data = await res.json();
  return {
    formations: data?.formations ? Object.values(data.formations) : [],
    defenseLooks: data?.defenseLooks ? Object.values(data.defenseLooks) : [],
    plays: data?.plays ? Object.values(data.plays) : [],
    viewBox: data?.viewBox || [1600, 1030],
    topPad: data?.topPad ?? 400,
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

function saveDefenseLook(look) {
  return authedFetch(`/defenseLooks/${look.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(look),
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

window.PlayBuilderStore = { loadAll, isEmpty, seedFromDefaults, saveFormation, saveDefenseLook, savePlay, deletePlay };
