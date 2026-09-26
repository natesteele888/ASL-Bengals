// ---------------------------------------------------------------------------
// Coach Tools > Signal Cards -- self-serve "add a new signal" tool.
//
// Nathan: "in the future, if I need to add more signals, is there a path to
// do that?" -- then, once told the real path still needed a Claude session
// plus an eventual git deploy for the photo file itself: "yes build that.
// But allow to add to a particular category of play signals and create a
// new category if needed."
//
// The old path (this session, adding card #33): save a photo to
// assets/cards/<id>.png, hand-add its metadata to data/cards.json, get a
// push script, run it -- then the photo ITSELF still isn't live anywhere
// until it's committed and deployed. This tool removes both gaps at once:
// the photo is stored as a data: URI directly IN the card's own Firebase
// record (dev2PlayData/cards.json), not a separate static file, so there is
// nothing to commit or deploy -- saving here IS going live, immediately,
// everywhere, the same way every other real-time save in this app works.
//
// "Category" here is Signals' own `group` field (js/signals.js's RECIPES,
// the study guide's own section headers -- "LOCATION / DIRECTION",
// "#4 IDENTITY", etc. -- are exactly these group values). `cat` is set to
// the same value as `group` -- every real card already does this except a
// handful of older "Play Call" cards with cat:'' , not a real second axis
// worth exposing here.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  var CARDS_URL = 'https://aslbengals-default-rtdb.firebaseio.com/dev2PlayData/cards.json';
  var built = false;
  var photoDataUri = null;

  function el(id) { return document.getElementById(id); }

  function build() {
    var body = el('coachSignalsAdminBody');
    if (!body) return;
    body.innerHTML =
      '<div class="coachToolsSubPanel" style="max-width:480px;margin:0 auto">' +
      '  <div class="build-panel">' +
      '    <div class="build-panel-label">Category</div>' +
      '    <select id="saCategorySelect" style="width:100%;padding:9px;margin-bottom:8px"></select>' +
      '    <input type="text" id="saNewCategoryInput" placeholder="New category name" style="width:100%;padding:9px;display:none">' +
      '  </div>' +
      '  <div class="build-panel">' +
      '    <div class="build-panel-label">Meaning</div>' +
      '    <input type="text" id="saMeaningInput" placeholder="e.g. I-FORMATION" style="width:100%;padding:9px">' +
      '  </div>' +
      '  <div class="build-panel">' +
      '    <div class="build-panel-label">Photo</div>' +
      '    <input type="file" id="saPhotoInput" accept="image/*" style="width:100%">' +
      '    <div style="display:flex;align-items:center;gap:10px;margin-top:10px">' +
      '      <canvas id="saPreviewCanvas" width="277" height="339" style="width:83px;height:auto;border-radius:5px;border:1px solid var(--line);background:#fff;display:none"></canvas>' +
      '      <span class="hint" id="saPhotoHint" style="margin:0">No photo chosen yet.</span>' +
      '    </div>' +
      '  </div>' +
      '  <button class="navBtn" id="saAddBtn" style="display:block;width:100%;margin-top:8px">Add Signal</button>' +
      '  <div class="hint" id="saStatus" style="min-height:1.4em;margin-top:8px;text-align:center"></div>' +
      '</div>';

    el('saCategorySelect').addEventListener('change', function () {
      var isNew = el('saCategorySelect').value === '__new__';
      el('saNewCategoryInput').style.display = isNew ? '' : 'none';
      if (isNew) el('saNewCategoryInput').focus();
    });
    el('saPhotoInput').addEventListener('change', onPhotoChosen);
    el('saAddBtn').addEventListener('click', onAddSignal);

    populateCategories();
  }

  async function fetchLiveCards() {
    var url = await window.firebaseAuthed(CARDS_URL);
    var res = await fetch(url);
    if (!res.ok) throw new Error('Could not load the live signal deck (HTTP ' + res.status + ').');
    var cards = await res.json();
    return Array.isArray(cards) ? cards : [];
  }

  async function populateCategories() {
    var sel = el('saCategorySelect');
    sel.innerHTML = '<option value="">Loading…</option>';
    try {
      var cards = await fetchLiveCards();
      var groups = [];
      cards.forEach(function (c) {
        if (c && c.group && groups.indexOf(c.group) === -1) groups.push(c.group);
      });
      groups.sort();
      sel.innerHTML = groups.map(function (g) {
        return '<option value="' + g.replace(/"/g, '&quot;') + '">' + g + '</option>';
      }).join('') + '<option value="__new__">+ New category…</option>';
    } catch (err) {
      sel.innerHTML = '<option value="__new__">+ New category…</option>';
      el('saStatus').textContent = 'Could not load existing categories (' + err.message + ') -- you can still create a new one.';
    }
  }

  // Downscales onto the same 277x339 box the real cards/placeholder cards
  // already use (js/signals.js's placeholderSrc comment), then exports as
  // a compressed JPEG data: URI -- small enough to live directly in the
  // Firebase record (typically tens of KB, not the multi-MB a raw phone
  // photo would be), with zero separate file/upload/deploy step.
  function onPhotoChosen() {
    var file = el('saPhotoInput').files[0];
    if (!file) return;
    var img = new Image();
    var reader = new FileReader();
    reader.onload = function () {
      img.onload = function () {
        var canvas = el('saPreviewCanvas');
        var ctx = canvas.getContext('2d');
        var boxW = canvas.width, boxH = canvas.height;
        // Cover-fit: fill the whole card box, cropping any overhang,
        // rather than letterboxing -- matches how the real photographed
        // cards fill their frame.
        var scale = Math.max(boxW / img.width, boxH / img.height);
        var drawW = img.width * scale, drawH = img.height * scale;
        ctx.clearRect(0, 0, boxW, boxH);
        ctx.drawImage(img, (boxW - drawW) / 2, (boxH - drawH) / 2, drawW, drawH);
        photoDataUri = canvas.toDataURL('image/jpeg', 0.82);
        canvas.style.display = '';
        el('saPhotoHint').textContent = 'Photo ready (' + Math.round(photoDataUri.length / 1024) + ' KB).';
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function onAddSignal() {
    var sel = el('saCategorySelect');
    var category = sel.value === '__new__' ? el('saNewCategoryInput').value.trim() : sel.value;
    var meaning = el('saMeaningInput').value.trim().toUpperCase();
    var status = el('saStatus');

    if (!category) { status.textContent = 'Pick a category, or name a new one.'; return; }
    if (!meaning) { status.textContent = 'Type what this signal means.'; return; }
    if (!photoDataUri) { status.textContent = 'Choose a photo first.'; return; }

    el('saAddBtn').disabled = true;
    status.textContent = 'Saving…';
    try {
      // Re-fetch right before writing (not the copy from page-load) --
      // the id this signal gets has to be based on whatever's ACTUALLY
      // live right now, not stale-by-however-long-the-coach-was-typing.
      var cards = await fetchLiveCards();
      var nextId = cards.reduce(function (max, c) { return c && typeof c.id === 'number' ? Math.max(max, c.id) : max; }, 0) + 1;
      var newCard = { id: nextId, group: category, cat: category, meaning: meaning, img: photoDataUri };
      var updated = cards.concat([newCard]);

      var url = await window.firebaseAuthed(CARDS_URL);
      var res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error('Save failed (HTTP ' + res.status + ').');

      // Live immediately in THIS session too, not just on next reload --
      // same registry every other real card already goes through.
      window.ALL_CARDS = updated;
      if (window.Signals) window.Signals.load(updated);

      status.textContent = 'Added signal #' + nextId + ' (' + meaning + ', ' + category + '). Live now for every coach.';
      el('saMeaningInput').value = '';
      el('saPhotoInput').value = '';
      el('saPreviewCanvas').style.display = 'none';
      el('saPhotoHint').textContent = 'No photo chosen yet.';
      photoDataUri = null;
      if (sel.value === '__new__') { el('saNewCategoryInput').value = ''; }
      populateCategories();
    } catch (err) {
      status.textContent = 'Could not save: ' + err.message;
      console.error('[coachtools-signals-admin]', err);
    }
    el('saAddBtn').disabled = false;
  }

  window.initCoachSignalsAdmin = function () {
    if (built) return;
    built = true;
    build();
  };
})();
