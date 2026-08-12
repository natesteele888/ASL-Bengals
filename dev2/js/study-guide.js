// "Personal Study Guide" -- Nathan: "...either that position is called out
// on the plays or there is a study guide setup for that player that goes
// through tendencies of the playbook for them specifically and what they
// should know based on their role." The "called out on the plays" half
// shipped first (play-calls.js auto-highlights the signed-in player's
// position on every card -- see defaultHighlightForSignedInPlayer there).
// This is the "study guide" half: a focused reference screen, reachable
// from the player menu, that lists every play and a one-line description
// of specifically what THIS player's position does on it.
//
// v1 scope (Nathan picked "Lite: auto-generated from play data"): every
// sentence here is derived straight from the same DATA.playTypes fields
// that already drive the live diagrams (ball/fake/isBlocking flags, plus a
// nearest-labeled-defender lookup for blocking assignments) -- not
// hand-written copy -- so it can't quietly drift out of sync as plays get
// edited, the same reasoning behind sourcing the printable PDF from live
// data. Shotgun formation only for v1: Split's per-position behavior (pass
// protection fakes, route-call assignments) is computed inside play-calls.js's
// own rendering functions rather than living in plain JSON, so reusing it
// safely here would mean either duplicating that logic (a second copy that
// could drift, exactly the bug class this session has repeatedly fixed) or
// a larger refactor to share it -- left as a fast-follow. Split positions
// still get a short pointer to Play Calls, where their diagram already
// auto-highlights them live.
//
// Every play type entry (see data/plays.json) always has a Right-direction
// variant -- direction doesn't change WHAT a position does, only which
// physical side of the field it happens on, so reading "Right" alone is
// enough to describe the role without ever needing to say "left" or
// "right" in the text itself.

const STUDY_GUIDE_PLAY_ORDER = ['inside_zone', 'outside_zone', 'blast', 'double_blast', 'option', 'option_pass'];

const STUDY_GUIDE_DEFENDER_LABELS = {
  DE: 'the defensive end', DT: 'the defensive tackle', LB: 'the linebacker',
  CB: 'the cornerback', S: 'the safety',
};

function studyGuideNearestDefender(defense, point) {
  if (!Array.isArray(defense) || !defense.length || !point) return null;
  let best = null;
  let bestDist = Infinity;
  defense.forEach((d) => {
    if (!d || !d.pos) return;
    const dx = d.pos[0] - point[0];
    const dy = d.pos[1] - point[1];
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = d; }
  });
  if (!best) return null;
  return STUDY_GUIDE_DEFENDER_LABELS[best.label] || `the ${String(best.label || 'defender').toLowerCase()}`;
}

// Picks the default (Right, Outside-if-applicable, Read-A-if-applicable)
// variant for a play type -- same defaulting play-calls.js itself uses
// before the player touches any toggle.
function studyGuideDefaultVariant(pt) {
  let v = pt.directions && pt.directions.Right;
  if (!v) return null;
  if (pt.hasInsideOutside) v = v.Outside;
  if (v && pt.hasReadToggle) v = v.A;
  return v || null;
}

function studyGuideDescribePath(pt, position, path, defense) {
  const isQB = position === '1' || position === 1;
  if (isQB) {
    if (pt.key === 'option_pass') {
      return 'You fake the run mesh, then throw to your target.';
    }
    if (path.ball) return 'You keep the ball and run it yourself.';
    return 'You hand the ball off and carry out your fake so the defense reads run.';
  }
  if (path.ball) return 'You get the handoff and carry the ball to the point of attack.';
  if (path.fake) {
    return path.isBlocking
      ? 'You fake taking the handoff, then block your assignment.'
      : 'You fake taking the handoff to help sell the play.';
  }
  if (path.isBlocking) {
    // Some blockers (e.g. the Wing, player 4) use a dualSideBlock target
    // instead of a plain `points` path -- same-side/cross-side, resolved
    // live based on the play's read (see SHIPPED_DUAL_SIDE_BLOCKS in
    // play-calls.js). No single fixed target to point at, so falling back
    // to the same-side option (the default shown before any toggle) still
    // gives a real, data-grounded defender label instead of a vague one.
    const pts = path.points || path.sameSidePoints || path.crossPoints;
    const defender = studyGuideNearestDefender(defense, pts && pts[pts.length - 1]);
    return defender ? `You block ${defender}.` : 'You block your assigned target.';
  }
  return 'You run your assigned path on this play.';
}

// Returns [{ playLabel, text }] for a numbered (1-6) or O-line-letter
// position, Shotgun formation only. Empty array for no position/Coach.
function buildStudyGuideEntries(position) {
  if (!position || position === 'COACH') return [];
  if (!window.DATA || !Array.isArray(window.DATA.playTypes)) return [];
  const isLine = /^[A-Za-z]+$/.test(String(position));
  const posNum = isLine ? null : Number(position);
  const entries = [];
  STUDY_GUIDE_PLAY_ORDER.forEach((key) => {
    const pt = window.DATA.playTypes.find((p) => p.key === key);
    if (!pt) return;
    const variant = studyGuideDefaultVariant(pt);
    if (!variant || !Array.isArray(variant.paths)) return;
    const path = isLine
      ? variant.paths.find((p) => p.id === position)
      : variant.paths.find((p) => p.player === posNum);
    if (!path) return;
    entries.push({ playLabel: pt.label, text: studyGuideDescribePath(pt, position, path, variant.defense) });
  });
  return entries;
}

(function wireStudyGuide() {
  const overlay = document.getElementById('studyGuideOverlay');
  const body = document.getElementById('studyGuideBody');
  const closeBtn = document.getElementById('studyGuideCloseBtn');
  if (!overlay || !body) return;

  function renderStudyGuide(position) {
    const entries = buildStudyGuideEntries(position);
    const label = (window.PlayerIdentity && window.PlayerIdentity.POSITION_LABELS && window.PlayerIdentity.POSITION_LABELS[position]) || position;
    if (!position || position === 'COACH') {
      body.innerHTML = '<div class="lbEmpty">Set your position from the name menu (My Position) to see your personal study guide.</div>';
      return;
    }
    if (!entries.length) {
      body.innerHTML = '<div class="lbEmpty">No Shotgun plays found for this position yet.</div>';
      return;
    }
    const isLine = /^[A-Za-z]+$/.test(String(position));
    const rows = entries.map((e) => `
      <div class="sgRow">
        <div class="sgPlay">${e.playLabel}</div>
        <div class="sgText">${e.text}</div>
      </div>
    `).join('');
    const splitNote = isLine
      ? 'Your blocking assignments carry over the same way in Split formation.'
      : 'In Split formation, open Play Calls and switch to Split -- your position is auto-highlighted there too, including any route calls you can be sent on.';
    body.innerHTML = `
      <div class="lbSub" style="margin-bottom:10px;">Your role as <strong>${label}</strong> (#${position}) -- Shotgun formation. Auto-generated from the current playbook: if anything here doesn't match what your coach taught you, ask them.</div>
      ${rows}
      <div class="lbSub" style="margin-top:10px;">${splitNote}</div>
    `;
  }

  window.showStudyGuide = async function showStudyGuide() {
    let session = window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession();
    let position = session && session.position;
    if (session && !position && window.PlayerIdentity.getPlayerRecord) {
      const record = await window.PlayerIdentity.getPlayerRecord(session.playerId);
      if (record && record.position) {
        position = record.position;
        session.position = position;
        window.PlayerIdentity.setSession(session);
      }
    }
    renderStudyGuide(position);
    overlay.classList.add('show');
  };

  if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
})();
