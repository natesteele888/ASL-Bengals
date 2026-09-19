// "Personal Study Guide" -- Nathan: "...either that position is called out
// on the plays or there is a study guide setup for that player that goes
// through tendencies of the playbook for them specifically and what they
// should know based on their role." The "called out on the plays" half
// shipped first (play-calls.js auto-highlights the signed-in player's
// position on every card -- see defaultHighlightForSignedInPlayer there).
// This is the "study guide" half: a focused reference screen that lists every
// play and what specifically THIS player does on it.
//
// Every sentence is derived from the same DATA.playTypes fields that drive the
// live diagrams, so it cannot drift as plays get edited.
//
// ---------------------------------------------------------------------------
// WHY THIS WAS REWRITTEN -- Nathan: "so it's not all geared towards the
// running backs."
//
// The first version was not merely thin for linemen, it was WRONG, and
// confidently so. Measured against the real playbook, six of ten lineman rows
// named the wrong defender and three of six plays never appeared at all:
//
//   inside_zone   LT  said "the defensive end"     -- actually blocks a LB
//   inside_zone   C   said "the defensive tackle"  -- actually blocks a LB
//   inside_zone   RT  said "the defensive end"     -- actually blocks a LB
//   double_blast  LT/C/RT  same three errors again
//   outside_zone, blast, option  -- dropped silently, never shown
//
// Three causes, all the same shape: this file re-implemented logic that
// play-calls.js already owned, and the copies fell behind.
//
//   1. It walked the variant tree two levels (insideOutside, read) when the
//      walk is four and varies per play. Any hasCounter play resolved to an
//      interior node with no `paths`, and the play was skipped without a word.
//   2. It read `variant.defense` and `path.points` -- the 4x3 data. The app is
//      pinned to 4x4 (defenseMode in buildCard), which has FOUR linebackers at
//      different spots than 4x3's three, and 190 authored blocking paths carry
//      a separate points4x4. So the nearest-defender lookup ran against a
//      defense the kid is not looking at, using an endpoint he never sees.
//   3. It read sameSidePoints/crossPoints as absolute coordinates. On a
//      blockRelative path, index [1] is a DELTA from player 4's anchor, so
//      that lookup was measuring from a point on no part of the field.
//
// The fix for all three is the same: ask play-calls.js instead of guessing.
// resolvePlayVariant / renderedPointsFor / renderedDefenseFor are exported
// there precisely so this file describes what is actually drawn.
//
// TELLING AN ELEVEN-YEAR-OLD "the linebacker" IS NOT A KEY.
// The 4x4 front has four of them (LB1..LB4) and two of everything else. A
// label alone cannot identify a man. Every assignment below is therefore
// stated as a defender PLUS where he is relative to that player's own stance,
// which is how the block is actually found pre-snap.

const STUDY_GUIDE_DEFENDER_LABELS = {
  DE: 'defensive end', DT: 'defensive tackle', LB: 'linebacker',
  CB: 'cornerback', S: 'safety',
};

// Down linemen are found by looking straight across; linebackers are found by
// looking through them. Worth saying, because it is the difference between a
// lineman firing out and a lineman climbing.
const STUDY_GUIDE_LEVEL = { DE: 'front', DT: 'front', LB: 'second level', CB: 'deep', S: 'deep' };

function studyGuideDefenderName(d) {
  return STUDY_GUIDE_DEFENDER_LABELS[d.label] || String(d.label || 'defender').toLowerCase();
}

function studyGuideNearest(defense, point) {
  if (!Array.isArray(defense) || !defense.length || !point) return null;
  let best = null, bestDist = Infinity;
  defense.forEach((d) => {
    if (!d || !d.pos) return;
    const dx = d.pos[0] - point[0], dy = d.pos[1] - point[1];
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = d; }
  });
  return best;
}

// Where a defender sits relative to where this player LINES UP -- the only way
// "the linebacker" identifies one man out of four. The threshold is roughly
// half the gap between adjacent linemen, so "straight ahead" means genuinely
// head-up rather than merely nearest.
function studyGuideSideOf(defender, fromPoint) {
  if (!defender || !fromPoint) return '';
  const dx = defender.pos[0] - fromPoint[0];
  if (Math.abs(dx) < 55) return ' straight ahead of you';
  return dx < 0 ? ' to your left' : ' to your right';
}

// The endpoint the diagram actually draws this path to.
//
// Player 4's relative blocks (blockRelative / motionIndependentBlock) store a
// DELTA rather than a coordinate, which is what the previous version misread.
// They are anchored off a spot this screen does not compute, so rather than
// invent a number, they report no endpoint and get honest wording instead.
function studyGuideEndPoint(path, defenseMode) {
  if (path.blockRelative || path.motionIndependentBlock) return null;
  if (path.dualSideBlock) {
    const pts = path.sameSidePoints4x4 || path.sameSidePoints;
    return pts && pts.length ? pts[pts.length - 1] : null;
  }
  const pts = window.renderedPointsFor ? window.renderedPointsFor(path, defenseMode) : path.points;
  return pts && pts.length ? pts[pts.length - 1] : null;
}

function studyGuideStartPoint(path, defenseMode) {
  const pts = window.renderedPointsFor ? window.renderedPointsFor(path, defenseMode) : path.points;
  return pts && pts.length ? pts[0] : null;
}

// A ball-carrier and a blocker both had real sentences; everyone else fell
// through to "You run your assigned path on this play." For player 2 that was
// eight of his nine plays -- a back opening his own study guide learned
// nothing. The paths are not vague, though: they carry a real shape, so say
// which way it goes and whether it gets past the line.
//
// Coordinate space: the offensive line sits at y ~204 and the defense is at
// smaller y, so DOWNFIELD IS DECREASING y. Easy to invert; worth writing down.
function studyGuideDescribeRoute(path, defenseMode, lineY) {
  const pts = window.renderedPointsFor ? window.renderedPointsFor(path, defenseMode) : path.points;
  if (!pts || pts.length < 2) return 'You run your assigned path on this play.';
  const start = pts[0], end = pts[pts.length - 1];
  const dx = end[0] - start[0];
  const side = Math.abs(dx) < 60 ? '' : (dx < 0 ? ' to your left' : ' to your right');
  const getsUpfield = end[1] < lineY;
  if (getsUpfield) {
    return side
      ? `You run${side} and get upfield past the line.`
      : 'You run straight upfield past the line.';
  }
  if (side) return `You run${side}, staying behind the line.`;
  return 'You run your assigned path on this play.';
}

// If the play has an authored ball path and this player is in it, that is the
// single most important thing he does -- said first, in the coach's own word
// for the exchange. Falls through to the route/block description when the play
// has no ball path, which is every play until one is authored.
function studyGuideBallSentence(pt, position) {
  if (!window.BallPath || !window.BallPath.isValid(pt.ballPath)) return null;
  const legs = window.BallPath.legsFor(pt.ballPath, position);
  if (!legs.length) return null;
  const leg = legs[0];
  const EX = window.BallPath.EXCHANGES;
  const gets = leg.index === 0
    ? 'You take the snap'
    : 'You get the ball on the ' + ((EX[leg.gets] || EX.handoff).label.toLowerCase());
  if (leg.givesTo == null) return gets + ' and you finish with it.';
  return gets + ', then ' + (EX[leg.givesHow] || EX.handoff).verb
    + ' to #' + leg.givesTo + '.';
}

function studyGuideDescribePath(pt, position, path, defense, defenseMode, lineY) {
  const ballSentence = studyGuideBallSentence(pt, position);
  if (ballSentence) return ballSentence;
  const isQB = position === '1' || position === 1;
  if (isQB) {
    if (pt.key === 'option_pass') return 'You fake the run mesh, then throw to your target.';
    if (path.ball) return 'You keep the ball and run it yourself.';
    return 'You hand the ball off and carry out your fake so the defense reads run.';
  }
  if (path.ball) return 'You get the handoff and carry the ball to the point of attack.';
  if (path.fake && !path.isBlocking) return 'You fake taking the handoff to help sell the play.';

  if (path.isBlocking) {
    const start = studyGuideStartPoint(path, defenseMode);
    const end = studyGuideEndPoint(path, defenseMode);
    const lead = path.fake ? 'You fake taking the handoff, then block ' : 'You block ';

    if (!end) {
      // A relative block: the target moves with the wing, so there is no one
      // fixed man to name. Say that, rather than naming the wrong one.
      return lead + 'whoever shows on your side -- your target moves with the wing, so check the diagram for this call.';
    }
    const d = studyGuideNearest(defense, end);
    if (!d) return lead + 'your assigned target.';

    const name = studyGuideDefenderName(d);
    const where = studyGuideSideOf(d, start);
    const level = STUDY_GUIDE_LEVEL[d.label];
    const climb = level === 'second level' ? ' -- climb past the front to get him' : '';
    return `${lead}the ${name}${where}${climb}.`;
  }
  return studyGuideDescribeRoute(path, defenseMode, lineY);
}

// The pre-snap half of a "key": who is actually lined up over you before the
// ball moves. Derived from the same rendered defense, so it matches the
// picture. Only offered to linemen -- for a back, "who's over you" is not the
// read that matters.
function studyGuidePreSnapKey(path, defense, defenseMode) {
  const start = studyGuideStartPoint(path, defenseMode);
  if (!start) return null;
  const front = (defense || []).filter((d) => d && d.pos && (d.label === 'DE' || d.label === 'DT'));
  const d = studyGuideNearest(front, start);
  if (!d) return null;
  const dx = Math.abs(d.pos[0] - start[0]);
  if (dx < 55) return `Pre-snap: a ${studyGuideDefenderName(d)} is head-up on you.`;
  return `Pre-snap: nearest down lineman is the ${studyGuideDefenderName(d)}${studyGuideSideOf(d, start)}.`;
}

// Returns [{ playLabel, text, key }] for a numbered (1-6) or O-line-letter
// position. Shotgun formation. Empty array for no position/Coach.
function buildStudyGuideEntries(position) {
  if (!position || position === 'COACH') return [];
  if (!window.DATA || !Array.isArray(window.DATA.playTypes)) return [];
  const isLine = /^[A-Za-z]+$/.test(String(position));
  const posNum = isLine ? null : Number(position);
  const defenseMode = '4x4'; // what buildCard pins the live diagrams to
  // The line of scrimmage, from the formation registry rather than a literal,
  // so this keeps working if a formation moves the front.
  const wingAlign = window.Formations && window.Formations.positions('wing', 'Right');
  const lineY = (wingAlign && wingAlign.C && wingAlign.C[1]) || 204;
  const entries = [];

  // Every play in the book, in the order Play Calls shows them -- not a
  // hardcoded subset. The previous list named six plays and silently omitted
  // Sweep, Shuffle Pass and Pop Pass on top of the three it dropped by
  // accident.
  window.DATA.playTypes.forEach((pt) => {
    const variant = window.resolvePlayVariant
      ? window.resolvePlayVariant(pt, 'Right', 'Outside', 'A', false, false)
      : null;
    if (!variant || !Array.isArray(variant.paths)) return;
    const path = isLine
      ? variant.paths.find((p) => p.id === position)
      : variant.paths.find((p) => p.player === posNum);
    if (!path) return;
    const defense = window.renderedDefenseFor
      ? window.renderedDefenseFor(variant, defenseMode)
      : variant.defense;
    entries.push({
      playLabel: pt.label,
      text: studyGuideDescribePath(pt, position, path, defense, defenseMode, lineY),
      key: isLine && path.isBlocking ? studyGuidePreSnapKey(path, defense, defenseMode) : null,
    });
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
      body.innerHTML = '<div class="lbEmpty">No plays found for this position yet.</div>';
      return;
    }
    const isLine = /^[A-Za-z]+$/.test(String(position));

    // The defensive front is the same on every play, so a lineman's pre-snap
    // key comes out identical seven times over. Repeating it seven times is
    // noise a kid learns to scroll past, so when every row agrees it is
    // hoisted into one line at the top. Kept per-row only if a play actually
    // lines the front up differently -- then the difference is the point.
    const keys = entries.map((e) => e.key).filter(Boolean);
    const sharedKey = (keys.length === entries.length && keys.length > 1
      && keys.every((k) => k === keys[0])) ? keys[0] : null;

    const rows = entries.map((e) => `
      <div class="sgRow">
        <div class="sgPlay">${e.playLabel}</div>
        <div class="sgText">${e.text}${(e.key && !sharedKey) ? `<div class="sgKey">${e.key}</div>` : ''}</div>
      </div>
    `).join('');
    // A lineman is NOT told his blocking "carries over the same way" in Split.
    // It does not: Split gives all five linemen one identical short kick-slide
    // stub (getSplitPassProtectionPaths), which is not a real per-man
    // assignment. Saying otherwise was the same overclaiming that made the
    // rest of this screen wrong.
    const splitNote = isLine
      ? 'Split formation isn\'t broken out per man yet -- open Play Calls, switch to Split, and your spot is highlighted on the diagram.'
      : 'In Split formation, open Play Calls and switch to Split -- your position is auto-highlighted there too, including any route calls you can be sent on.';
    const who = isLine ? `<strong>${label}</strong>` : `<strong>${label}</strong> (#${position})`;
    body.innerHTML = `
      <div class="lbSub" style="margin-bottom:10px;">Your job as ${who} -- Shotgun, against the 4-4 front you see on the diagrams. Auto-generated from the current playbook: if anything here doesn't match what your coach taught you, ask them.</div>
      ${sharedKey ? `<div class="sgSharedKey">${sharedKey} That's the same on every play below.</div>` : ''}
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
