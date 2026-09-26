/* ============================================================
   PLAY CALLS QUIZ -- Phase 2: the quiz engine itself. Ten rounds,
   easiest to hardest, drawn fresh from a pool each attempt (not a
   fixed list) so it can't just be memorized. Full design/reasoning
   in dev/tools/play-calls-quiz/PLAN.md.

   Reuses buildSignalSequence() (play-calls.js) to generate the exact
   signal-card order for any call -- this is a recognition quiz, so
   the text label that normally goes with each signal is suppressed;
   only the hand-signal images are shown.

   Depends on globals defined earlier in the load order: wireToggle
   and DATA (edit-plays.js), placeToggleThumb and buildSignalSequence
   (play-calls.js) -- this file loads last on purpose.
   ============================================================ */
(function(){
  // Plays eligible for the quiz. Option was originally left out pending a
  // decision on what its "directionFixed" flag should mean for a quiz
  // answer -- turned out that flag is just a one-time migration marker
  // (whether a cloud snapshot has had the old Left/Right swap bug repaired),
  // not a real "direction can't be picked" behavior, so Option answers like
  // any other play: noBoot is already handled generically below.
  // Nathan: new play, signal #23, "Wing Right/Left, Shuffle Pass" -- now
  // has both Left and Right authored (data/plays.json), so it's safe to
  // include in the random pool alongside every other play here.
  const ELIGIBLE_PLAY_KEYS = ['inside_zone', 'outside_zone', 'blast', 'double_blast', 'option_pass', 'sweep', 'option', 'shuffle_pass'];
  const POINTS_FULL = 10, POINTS_HALF = 5;

  function playFlags(key){
    const pt = ((window.DATA && DATA.playTypes) || []).find(p => p.key === key) || {};
    return { noBoot: !!pt.noBoot, hasInsideOutside: !!pt.hasInsideOutside };
  }
  function playLabel(key){
    const pt = ((window.DATA && DATA.playTypes) || []).find(p => p.key === key);
    return pt ? pt.label : key;
  }

  // ---- Difficulty tiers (see PLAN.md for the reasoning behind the order).
  // Rebalanced 2026-08-09 per Nathan's feedback that the quiz "gets hard"
  // too fast -- each new concept (opposite side, Inside/Outside, Motion,
  // Boot) now gets introduced alone before ever stacking with another, and
  // only the very last round combines everything. Previously Motion+Boot
  // were stacked for 2 of the last 3 rounds; now that combo shows up once.
  // sameSide: true = direction must match wing side, false = must differ.
  // pool: which plays are eligible this round (on top of the boot filter).
  // bootOnly: true = further restrict the pool to plays that allow Boot.
  const SIMPLE_KEYS = ['inside_zone', 'outside_zone', 'sweep', 'option_pass', 'option', 'shuffle_pass']; // no Inside/Outside decision
  const IO_KEYS = ['blast', 'double_blast']; // Inside/Outside decision plays
  const TIERS = [
    { pool: SIMPLE_KEYS, motion: false, boot: false, sameSide: true },
    { pool: SIMPLE_KEYS, motion: false, boot: false, sameSide: true },
    { pool: SIMPLE_KEYS, motion: false, boot: false, sameSide: false },
    { pool: IO_KEYS, motion: false, boot: false, sameSide: true },
    { pool: IO_KEYS, motion: false, boot: false, sameSide: false },
    { pool: ELIGIBLE_PLAY_KEYS, motion: true, boot: false, sameSide: true },
    { pool: ELIGIBLE_PLAY_KEYS, motion: true, boot: false, sameSide: false },
    { pool: ELIGIBLE_PLAY_KEYS, motion: false, boot: true, sameSide: true, bootOnly: true },
    { pool: ELIGIBLE_PLAY_KEYS, motion: false, boot: true, sameSide: false, bootOnly: true },
    { pool: ELIGIBLE_PLAY_KEYS, motion: true, boot: true, sameSide: false, bootOnly: true },
  ];

  function eligiblePlaysForTier(tier){
    let keys = tier.pool.slice();
    if (tier.bootOnly) keys = keys.filter(k => !playFlags(k).noBoot);
    return keys;
  }
  function randomChoice(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  function generateRounds(){
    const rounds = [];
    const recent = [];
    const playCounts = {};
    // double_blast, option_pass and option can't Boot, so they're the only
    // plays that never show up in the boot-only tiers (7-9). If earlier
    // tiers picked freely without regard for this, they could exhaust the
    // *boot-eligible* plays' 2-each cap before the boot-only tiers get a
    // turn later, forcing a play to appear a 3rd time. Fix: non-boot-only
    // tiers preferentially use up the no-boot plays' capacity first,
    // reliably leaving enough headroom in the boot-eligible pool for the
    // 3 boot-only draws that must come from it.
    const NON_BOOT_ONLY_KEYS = ELIGIBLE_PLAY_KEYS.filter(k => playFlags(k).noBoot);
    TIERS.forEach(tier => {
      let pool = eligiblePlaysForTier(tier).filter(k => k !== recent[recent.length - 1]);
      if (!pool.length) pool = eligiblePlaysForTier(tier);
      let preferred = pool.filter(k => (playCounts[k] || 0) < 2);
      if (!preferred.length) preferred = pool;
      if (!tier.bootOnly) {
        const nonBootPreferred = preferred.filter(k => NON_BOOT_ONLY_KEYS.includes(k));
        if (nonBootPreferred.length) preferred = nonBootPreferred;
      }
      const playKey = randomChoice(preferred);
      playCounts[playKey] = (playCounts[playKey] || 0) + 1;
      recent.push(playKey);
      if (recent.length > 2) recent.shift();

      const wingSide = randomChoice(['Left', 'Right']);
      const direction = tier.sameSide ? wingSide : (wingSide === 'Left' ? 'Right' : 'Left');

      const flags = playFlags(playKey);
      let insideOutside = null;
      if (flags.hasInsideOutside){
        // Blast: mandatory pick, either is equally likely.
        // Double Blast: Inside is the silent default, Outside is the
        // "extra card" case -- still random per attempt either way.
        insideOutside = Math.random() < 0.5 ? 'Inside' : 'Outside';
      }

      rounds.push({
        playKey: playKey, wingSide: wingSide, direction: direction,
        motionOn: tier.motion, bootOn: tier.boot, insideOutside: insideOutside,
      });
    });
    return rounds;
  }

  // ---- DOM refs ----
  const startBtn = document.getElementById('pcqStartBtn');
  const quizArea = document.getElementById('pcqQuizArea');
  const statsLine = document.getElementById('pcqStatsLine');
  const img = document.getElementById('pcqImg');
  const getReadyEl = document.getElementById('pcqGetReady');
  const progressEl = document.getElementById('pcqProgress');
  const replayBtn = document.getElementById('pcqReplayBtn');
  const answerPanel = document.getElementById('pcqAnswerPanel');
  const playSelect = document.getElementById('pcqPlaySelect');
  const wingToggle = document.getElementById('pcqWingToggle');
  const dirToggle = document.getElementById('pcqDirToggle');
  const motionToggle = document.getElementById('pcqMotionToggle');
  const bootToggle = document.getElementById('pcqBootToggle');
  const ioWrap = document.getElementById('pcqIOWrap');
  const ioToggle = document.getElementById('pcqIOToggle');
  const submitBtn = document.getElementById('pcqSubmitBtn');
  const feedbackEl = document.getElementById('pcqFeedback');
  const nextBtn = document.getElementById('pcqNextBtn');
  const doneScreen = document.getElementById('pcqDoneScreen');
  const doneText = document.getElementById('pcqDoneText');
  const restartBtn = document.getElementById('pcqRestartBtn');
  const bestLineEl = document.getElementById('pcqBestLine');
  const tabBtn = document.getElementById('playCallsQuizTabBtn');

  // If any of these are missing, the markup didn't load as expected --
  // bail quietly rather than throwing on every other script.
  if (!startBtn || !quizArea) return;

  // ---- Answer state (what the player has currently set) ----
  const answer = { playKey: null, wingSide: 'Left', direction: 'Left', motionOn: false, bootOn: false, insideOutside: 'Inside' };

  function populatePlaySelect(){
    playSelect.innerHTML = '<option value="">-- pick a play --</option>';
    ELIGIBLE_PLAY_KEYS.forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = playLabel(key);
      playSelect.appendChild(opt);
    });
  }

  function updateIOVisibility(){
    const showIO = answer.playKey === 'blast' || answer.playKey === 'double_blast';
    ioWrap.style.display = showIO ? '' : 'none';
    if (window.placeToggleThumb) placeToggleThumb(ioToggle);
  }

  playSelect.addEventListener('change', () => {
    answer.playKey = playSelect.value || null;
    updateIOVisibility();
  });

  wireToggle(wingToggle, () => answer.wingSide, v => { answer.wingSide = v; });
  wireToggle(dirToggle, () => answer.direction, v => { answer.direction = v; });
  wireToggle(motionToggle, () => (answer.motionOn ? 'on' : 'off'), v => { answer.motionOn = (v === 'on'); });
  wireToggle(bootToggle, () => (answer.bootOn ? 'on' : 'off'), v => { answer.bootOn = (v === 'on'); });
  wireToggle(ioToggle, () => answer.insideOutside, v => { answer.insideOutside = v; });

  function resetAnswerPanel(){
    answer.playKey = null;
    answer.wingSide = 'Left';
    answer.direction = 'Left';
    answer.motionOn = false;
    answer.bootOn = false;
    answer.insideOutside = 'Inside';
    playSelect.value = '';
    [wingToggle, dirToggle, motionToggle, bootToggle, ioToggle].forEach(group => {
      const buttons = [...group.querySelectorAll('.toggle-btn')];
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false'));
      if (window.placeToggleThumb) placeToggleThumb(group);
    });
    updateIOVisibility();
  }

  // ---- Personal best (per signed-in player, via PlayerIdentity) ----
  async function refreshBestLine(){
    if (!bestLineEl || !window.PlayerIdentity) return;
    const session = window.PlayerIdentity.getSession();
    if (!session) { bestLineEl.style.display = 'none'; return; }
    const record = await window.PlayerIdentity.getPlayerRecord(session.playerId);
    if (record && record.pcqBestScore){
      bestLineEl.textContent = `Your best: ${record.pcqBestScore} / ${record.pcqBestMaxScore} pts`;
      bestLineEl.style.display = '';
    } else {
      bestLineEl.style.display = 'none';
    }
  }
  if (tabBtn) tabBtn.addEventListener('click', refreshBestLine);

  // ---- Quiz state ----
  let rounds = [];
  let roundIndex = 0;
  let usedReplayThisRound = false;
  let seqTimer = null;
  let fullCount = 0, halfCount = 0, wrongCount = 0;

  function currentRound(){ return rounds[roundIndex]; }

  const GET_READY_MS = 1300;

  function playSequence(){
    if (seqTimer) clearTimeout(seqTimer);
    replayBtn.style.display = 'none';
    answerPanel.style.display = 'none';
    submitBtn.style.display = 'none';
    const r = currentRound();
    const io = r.insideOutside || 'Outside';
    const signals = buildSignalSequence(r.playKey, r.wingSide, r.direction, io, r.motionOn, r.bootOn);
    progressEl.innerHTML = '';
    signals.forEach(() => { const d = document.createElement('div'); d.className = 'dot'; progressEl.appendChild(d); });
    const BASE_STEP_MS = 950, EXTRA_MS_PER_SIGNAL = 120, MAX_LOOPS = 2;
    const stepDurationMs = BASE_STEP_MS + Math.max(0, signals.length - 4) * EXTRA_MS_PER_SIGNAL;
    let i = 0, loopCount = 0;
    function showStep(){
      if (i >= signals.length){
        i = 0; loopCount++;
        if (loopCount >= MAX_LOOPS){
          seqTimer = null;
          replayBtn.style.display = 'flex';
          answerPanel.style.display = '';
          submitBtn.style.display = '';
          return;
        }
      }
      img.src = signals[i].src; // no label shown -- that's the whole point
      [...progressEl.children].forEach((d, idx) => d.classList.toggle('done', idx <= i));
      i++;
      seqTimer = setTimeout(showStep, stepDurationMs);
    }
    // Brief warm-up beat before the first card appears -- signals used to
    // start the instant this function ran, with zero warning, which meant
    // the very first card of the sequence was easy to miss. Applies on
    // Replay too, for the same reason and for consistency.
    if (getReadyEl) getReadyEl.style.display = 'flex';
    seqTimer = setTimeout(() => {
      if (getReadyEl) getReadyEl.style.display = 'none';
      showStep();
    }, GET_READY_MS);
  }

  replayBtn.addEventListener('click', () => {
    usedReplayThisRound = true;
    playSequence();
  });

  function startRound(){
    usedReplayThisRound = false;
    feedbackEl.textContent = '';
    feedbackEl.className = 'seq-feedback';
    nextBtn.style.display = 'none';
    submitBtn.disabled = false;
    resetAnswerPanel();
    statsLine.textContent = `Round ${roundIndex + 1} of ${rounds.length}`;
    playSequence();
  }

  function gradeRound(){
    const r = currentRound();
    let correct = answer.playKey === r.playKey
      && answer.wingSide === r.wingSide
      && answer.direction === r.direction
      && answer.motionOn === r.motionOn
      && answer.bootOn === r.bootOn;
    if (correct && r.insideOutside){
      correct = answer.insideOutside === r.insideOutside;
    }
    return correct;
  }

  function describeRound(r){
    const parts = [`Wing ${r.wingSide}`];
    if (r.motionOn) parts.push('Motion');
    if (r.insideOutside) parts.push(r.insideOutside);
    parts.push(playLabel(r.playKey));
    parts.push(r.direction);
    if (r.bootOn) parts.push('Boot');
    return parts.join(' ');
  }

  submitBtn.addEventListener('click', () => {
    if (!answer.playKey){
      feedbackEl.textContent = 'Pick a play first.';
      feedbackEl.className = 'seq-feedback bad';
      return;
    }
    const correct = gradeRound();
    const r = currentRound();
    submitBtn.disabled = true;
    if (correct && !usedReplayThisRound){
      fullCount++;
      feedbackEl.textContent = `✅ Correct! Full points. It was: ${describeRound(r)}`;
      feedbackEl.className = 'seq-feedback good';
    } else if (correct && usedReplayThisRound){
      halfCount++;
      feedbackEl.textContent = `✅ Correct (half credit -- replayed). It was: ${describeRound(r)}`;
      feedbackEl.className = 'seq-feedback good';
    } else {
      wrongCount++;
      feedbackEl.textContent = `❌ Not quite. It was: ${describeRound(r)}`;
      feedbackEl.className = 'seq-feedback bad';
    }
    // Nathan: "keep all record history available... players who are
    // excelling then those who are struggling and what they could do."
    // Per-round log (which play was being called, right or wrong) so the
    // coach dashboard can point at a specific weak spot ("struggles most
    // with Option calls") instead of just a raw score. cloudPush and
    // currentPlayerTag are globals from study-quiz.js, which loads before
    // this file. Same fire-and-forget spirit as everywhere else -- a
    // failed write here should never interrupt the quiz itself.
    if (typeof cloudPush === 'function') {
      cloudPush('analytics/pcqRoundAttempts', Object.assign({
        playKey: r.playKey, correct: correct, date: new Date().toISOString(),
      }, (typeof currentPlayerTag === 'function') ? currentPlayerTag() : {}));
    }
    replayBtn.style.display = 'none';
    nextBtn.style.display = '';
  });

  nextBtn.addEventListener('click', () => {
    roundIndex++;
    if (roundIndex >= rounds.length){ finishQuiz(); return; }
    startRound();
  });

  async function finishQuiz(){
    quizArea.style.display = 'none';
    doneScreen.style.display = '';
    const score = fullCount * POINTS_FULL + halfCount * POINTS_HALF;
    const maxScore = rounds.length * POINTS_FULL;
    doneText.textContent = `${score} / ${maxScore} points — ${fullCount} full, ${halfCount} half credit, ${wrongCount} wrong.`;
    if (window.PlayerIdentity){
      const result = await window.PlayerIdentity.recordQuizResult(score, maxScore);
      if (result){
        doneText.textContent += result.isNewBest
          ? `  🏆 New personal best!`
          : `  Your best: ${result.bestScore} / ${result.bestMaxScore} pts.`;
      }
      refreshBestLine();
      // recordQuizResult() fires its own analytics/pcqResults write
      // fire-and-forget (doesn't await it internally), so give it a beat
      // to actually land before celebrateNewBadges() re-reads that same
      // path to compute badges -- best-effort either way, see there.
      setTimeout(() => { if (window.celebrateNewBadges) window.celebrateNewBadges(); }, 700);
    }
  }

  function startQuiz(){
    populatePlaySelect();
    rounds = generateRounds();
    roundIndex = 0;
    fullCount = 0; halfCount = 0; wrongCount = 0;
    startBtn.style.display = 'none';
    doneScreen.style.display = 'none';
    quizArea.style.display = '';
    startRound();
  }

  startBtn.addEventListener('click', startQuiz);
  restartBtn.addEventListener('click', startQuiz);

  // Exposes the pure logic for automated testing (jsdom smoke tests) --
  // harmless in production, just a debug hook, same spirit as exposing
  // window.sha256Hex/window.firebaseAuthed elsewhere in this app.
  window.__pcqTestHooks = { generateRounds: generateRounds, gradeRound: gradeRound, setAnswer: function(a){ Object.assign(answer, a); }, setRounds: function(r){ rounds = r; }, getRoundIndex: function(){ return roundIndex; } };
})();
