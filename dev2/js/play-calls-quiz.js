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
  // Plays eligible for the quiz. Option is left out for now -- it's
  // directionFixed and needs a decision on what that should mean for a
  // quiz answer before it's included (see PLAN.md).
  const ELIGIBLE_PLAY_KEYS = ['inside_zone', 'outside_zone', 'blast', 'double_blast', 'option_pass', 'sweep'];
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
  // sameSide: true = direction must match wing side, false = must differ.
  // bootOnly: true = restrict the pool to plays that actually allow Boot.
  const TIERS = [
    { motion: false, boot: false, sameSide: true },
    { motion: false, boot: false, sameSide: true },
    { motion: false, boot: false, sameSide: true },
    { motion: false, boot: false, sameSide: false },
    { motion: false, boot: false, sameSide: false },
    { motion: true, boot: false, sameSide: true },
    { motion: true, boot: false, sameSide: false },
    { motion: false, boot: true, sameSide: true, bootOnly: true },
    { motion: true, boot: true, sameSide: false, bootOnly: true },
    { motion: true, boot: true, sameSide: false, bootOnly: true },
  ];

  function eligiblePlaysForTier(tier){
    let keys = ELIGIBLE_PLAY_KEYS.slice();
    if (tier.bootOnly) keys = keys.filter(k => !playFlags(k).noBoot);
    return keys;
  }
  function randomChoice(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  function generateRounds(){
    const rounds = [];
    const recent = [];
    const playCounts = {};
    // double_blast and option_pass can't Boot, so they're the only plays
    // that never show up in the boot-only tiers (7-9). If general tiers
    // (0-6) picked freely from the full pool, they could exhaust the
    // *boot-eligible* plays' 2-each cap before the boot-only tiers get a
    // turn later, forcing a play to appear a 3rd time. Fix: general tiers
    // preferentially use up double_blast/option_pass's capacity first,
    // which reliably leaves enough headroom in the boot-eligible pool
    // (4 plays x 2 = 8 slots) for the 3 boot-only draws that must come
    // from it -- with only 6 eligible plays and a cap of 2 each (capacity
    // 12) across 10 rounds, that's always enough room either way.
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

  // ---- Quiz state ----
  let rounds = [];
  let roundIndex = 0;
  let usedReplayThisRound = false;
  let seqTimer = null;
  let fullCount = 0, halfCount = 0, wrongCount = 0;

  function currentRound(){ return rounds[roundIndex]; }

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
    showStep();
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
    replayBtn.style.display = 'none';
    nextBtn.style.display = '';
  });

  nextBtn.addEventListener('click', () => {
    roundIndex++;
    if (roundIndex >= rounds.length){ finishQuiz(); return; }
    startRound();
  });

  function finishQuiz(){
    quizArea.style.display = 'none';
    doneScreen.style.display = '';
    const score = fullCount * POINTS_FULL + halfCount * POINTS_HALF;
    const maxScore = rounds.length * POINTS_FULL;
    doneText.textContent = `${score} / ${maxScore} points — ${fullCount} full, ${halfCount} half credit, ${wrongCount} wrong.`;
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
