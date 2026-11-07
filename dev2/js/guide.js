// How-To Guide -- Nathan (2026-11-07): "not everybody knows all the
// features that are available, where they are, and how to use them...
// screenshots within the program showing all of the different things that
// can be done with a real tutorial and how-to on all the key features."
//
// Opens from the "?" button (it used to open the one-screen tips list,
// which is still linked at the bottom). Three tabs -- Players, Parents,
// Coaches -- each a list of topics. A topic is one or more real screenshots
// with numbered callouts, the matching numbered steps, a "Take me there"
// button, and a Share button that sends a link straight to that topic
// (#how=<id>), so a coach can drop "here's how the Film Room works" in the
// team chat.
//
// The screenshots in assets/guide/ were taken from the real app running on
// a made-up team (made-up names, teams and notes) -- this repo is public, so
// no real player or team data is in them. To retake them, see the capture
// rig in tools/guide-capture/.
(function () {
  'use strict';

  var SEEN_KEY = 'aslGuideSeen';      // JSON array of topic ids opened
  var OPENED_KEY = 'aslGuideOpened';  // '1' once the guide has been opened
  var IMG = 'assets/guide/';

  // ---------- content ----------
  // co: [x%, y%, w%, h%] of the thing on the screenshot (w/h optional).
  // steps[i] goes with co[i]; extra steps past the callouts get no number.
  var T = {};
  T.around = { icon: '🧭', title: 'Find your way around', blurb: 'Where everything lives.',
    shots: [{ img: 'nav', co: [[50, 24.7, 99, 6.2], [50, 30.4, 99, 5.2], [83.7, 5.3, 25, 2.8], [83.3, 2.4, 5.5, 2.6], [94.6, 2.4, 5.5, 2.6]],
      steps: ['<b>Top row</b> is the big areas: Play, Opp. Offense, Film Room, This Week, Schedule, Standings.',
        '<b>Second row</b> is the tools inside Play: Signals, Plays, Quiz, Timed, Play Quiz, 2 Min Drill.',
        '<b>Your name</b>: My Stats, your position, What\'s New and sign out.',
        '<b>Trophy</b>: the team leaderboard.',
        '<b>?</b>: this guide, any time.'] }] };
  T.plays = { icon: '📋', title: 'Learn your plays', blurb: 'Every play, every variation, your job glowing.',
    go: { section: 'play', mode: 'playcalls' },
    shots: [{ img: 'plays', cap: 'Pick a formation, then a play', co: [[25.6, 29.9, 47, 14.6], [13.8, 17.4, 24, 4]],
      steps: ['Tap a play to open it.', '<b>← Formations</b> takes you back to all of them.'] },
    { img: 'playcard', cap: 'Inside a play', co: [[50, 56.2, 90, 11.5], [50.6, 86.6, 6, 3], [12.1, 94, 10, 5]],
      steps: ['Flip the switches (Wing, Direction, Motion, Boot...) and watch the call and the drawing change.',
        'Your number glows orange. Set your position once from your name menu.',
        '<b>▶</b> runs the play so you can watch everyone move.'] }] };
  T.signals = { icon: '🎓', title: 'Learn the signals', blurb: 'Study them, then quiz yourself.',
    go: { section: 'play', mode: 'study' },
    shots: [{ img: 'signals', cap: 'Signals', co: [[45, 36, 92, 4.5], [25, 55, 46, 32]],
      steps: ['Tap a group to open or close it.', 'Each card shows the hand signal and what it means.'] },
    { img: 'quiz', cap: 'Quiz', co: [[50, 62, 80, 45], [50, 90.5, 96, 7]],
      steps: ['See a signal...', '...tap what it means. Build a streak and get on the leaderboard.'] },
    { img: 'timed', cap: 'Timed', co: [[50, 66, 40, 5]],
      steps: ['Race the clock through every signal. A miss just goes to the back of the line.'] }] };
  T.playquiz = { icon: '🧠', title: 'Play Quiz & 2 Minute Drill', blurb: 'Put the signals and plays together.',
    go: { section: 'play', mode: 'playcallsquiz' },
    shots: [{ img: 'playquiz', cap: 'Play Quiz', co: [[50, 49.6, 26, 5]],
      steps: ['Watch the signals, then set up the call you saw. Easy first, harder every round.'] },
    { img: 'twomin', cap: '2 Min Drill (the 2 Min Drill tab)', co: [[25, 55.5, 44, 7], [75, 55.5, 44, 7]],
      steps: ['Read the defense, pick the right play, drive for the score before time runs out.',
        'The best drives make the 2 Min leaderboard.'] }] };
  T.opp = { icon: '📋', title: 'Study the other team', blurb: 'Their formations, runs and passes, plus 4 quick quizzes.',
    go: { section: 'oppoffense' },
    shots: [{ img: 'opp', co: [[50, 56.5, 96, 34], [50, 81.5, 70, 4], [88, 86.5, 22, 3]],
      steps: ['Four quick quizzes on the team we play next: Coverage Call, Where\'s the Ball?, Run or Pass?, Where Do Receivers Go?',
        'Flip through their formations, runs and passes.',
        'The pill is our call against that look: <b>Cover 2</b> or <b>Nightmare</b>.'] }] };
  T.film = { icon: '🎬', title: 'Film Room', blurb: 'Watch film, post what you see, earn points.',
    go: { section: 'film' },
    shots: [{ img: 'film', cap: 'The Film Room', co: [[50, 24.6, 96, 7.2], [23.4, 41.8, 35, 4.6], [50, 56.1, 96, 12.4]],
      steps: ['What\'s new since your last visit.',
        'The team goal for the week and your points. <b>Leaderboard</b> shows the top film students.',
        'The <b>scouting report</b> pulls every note on the next opponent together, coach\'s picks first.'] },
    { img: 'filmopen', cap: 'Watch and post a note', co: [[50, 36.3, 96, 25], [65, 57.3, 29, 5], [36, 67, 60, 9], [50, 77.3, 90, 9.5], [78.4, 85.6, 31, 4.6]],
      steps: ['Tap any film and it plays right here.',
        'Type the time from the video\'s clock, like 4:12.',
        'Pick what it\'s about.',
        'Write what you see. "#22 looks to the sideline before a sweep."',
        '<b>Post note</b>. That\'s +5 points.'] },
    { img: 'c_filmopen', cap: 'Team notes', co: [[13.5, 47, 17, 3.2], [21.5, 57.8, 28, 3.2], [43, 57.8, 16, 3.2], [63.5, 57.8, 18, 3.2]],
      steps: ['Tap a time to jump the video to that moment.',
        'Agree? Tap <b>I see it too</b>.',
        '<b>Reply</b> to add on.',
        'A ⭐ means a coach picked it.'],
      tip: 'Points: note 5 · reply 2 · "I see it too" 1 · coach\'s pick 10 · watching a film 1.' }] };
  T.thisweek = { icon: '🎯', title: 'This Week', blurb: 'Everything for the next game in one place.',
    go: { section: 'thisweek' },
    shots: [{ img: 'thisweek', co: [[50, 25, 92, 12], [50, 48, 90, 10], [50, 82, 92, 30]],
      steps: ['The coaches\' write-up for the week.', 'Watch the next opponent\'s film.', 'Their formations, runs and passes.'] }] };
  T.schedule = { icon: '📅', title: 'Schedule & Standings', blurb: 'Games, practices, scores and the league table.',
    go: { section: 'schedule' },
    shots: [{ img: 'schedule', cap: 'Schedule', co: [[50, 16.7, 96, 5], [50, 30.5, 96, 15], [50, 82, 96, 15]],
      steps: ['Games, Practices, or the Full Schedule.',
        'Tap a game for the score, the recap and the game film.',
        'The next game: day, time and where.'] },
    { img: 'standings', cap: 'Standings', co: [[50, 35, 96, 9], [50, 63, 98, 40]],
      steps: ['Playoff Picture, Playoff Probabilities, Final Week Scenarios and every Bengals team.', 'Where we stand in the league.'] }] };
  T.board = { icon: '🏆', title: 'Leaderboard & My Stats', blurb: 'See where you rank.',
    go: { fn: function () { var b = document.getElementById('openLeaderboardBtn'); if (b) b.click(); } },
    shots: [{ img: 'board', cap: 'Tap the trophy', co: [[50, 40.6, 90, 3.6], [50, 58, 90, 17]],
      steps: ['Overall, Timed, Quiz, Play Quiz and 2 Min boards.', 'You get points for where you place on each board.'] },
    { img: 'menu', cap: 'Tap your name', co: [[75, 23.6, 34, 3.4], [75, 27.6, 34, 3.4]],
      steps: ['<b>My Stats</b>: your best scores and your rank.', '<b>My Position</b>: makes your number glow in every play.'] }] };
  T.home = { icon: '📱', title: 'Put it on your home screen', blurb: 'Open it like a real app, one tap.',
    shots: [], text: '<div class="gdH">iPhone (Safari)</div><ol><li>Open the app in <b>Safari</b>.</li><li>Tap <b>Share</b> (the square with the arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>' +
      '<div class="gdH">Android (Chrome)</div><ol><li>Open the app in <b>Chrome</b>.</li><li>Tap <b>⋮</b> at the top right.</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>' +
      '<p class="gdTip">Look for the Bengals icon. It opens straight into the app and stays signed in.</p>' };

  // Parents
  T.p_game = { icon: '📅', title: 'Game day info', blurb: 'Times, places, film and the recap.',
    go: { section: 'schedule' },
    shots: [{ img: 'schedule', cap: 'Schedule', co: [[50, 16.7, 96, 5], [50, 82, 96, 15]],
      steps: ['Games or Practices. <b>Full Schedule</b> shows the whole season.', 'Tap a game to open it.'] },
    { img: 'p_game', cap: 'A game', co: [[50, 37, 96, 25], [50, 59, 96, 11], [50, 77, 96, 22], [50, 94, 28, 2.6]],
      steps: ['Arrive time, kickoff and the record of both teams.',
        'Film of the other team, if you want to scout too.',
        'The game preview before, the recap after.',
        '<b>Add to Calendar</b> puts it on your phone. Map is right below.'] }] };
  T.p_learn = { icon: '🏈', title: 'Learn with your player', blurb: 'Signals, plays and the 2 Min Drill are open to you too.',
    go: { section: 'play', mode: 'playcalls' },
    shots: [{ img: 'playcard', cap: 'Plays', co: [[50, 56.2, 90, 11.5], [12.1, 94, 10, 5]],
      steps: ['Flip the switches to see how a play changes.', '<b>▶</b> runs the play.'] },
    { img: 'signals', cap: 'Signals', co: [[25, 55, 46, 32]],
      steps: ['Quiz your player on the hand signals at dinner.'] }] };
  T.p_child = { icon: '👪', title: 'Your player & notifications', blurb: 'Link your child and turn on alerts.',
    shots: [], text: '<ol><li>Tap <b>your name</b> at the top right.</li><li><b>My Child</b>: pick your player (more than one is fine).</li><li><b>Notifications</b>: allow them to hear about new plays, changes and cancellations.</li><li><b>What\'s New</b>: everything the coaches added lately.</li></ol>' };

  // Coaches
  T.c_tools = { icon: '🛠️', title: 'Coach Tools map', blurb: 'Every coach tool, in five groups.',
    go: { section: 'coachtools' },
    shots: [{ img: 'c_tools', co: [[50, 17.2, 96, 4.6], [50, 25, 96, 7.5], [50, 35, 90, 9]],
      steps: ['Search any tool by name.', 'Five groups: Game Day, Team, Data & Stats, Play Design, Library.', 'Tap a tool to open it.'] }] };
  T.c_gamefilm = { icon: '🎥', title: 'Add our game film', blurb: 'Every game\'s film, one tap for every family.',
    go: { section: 'schedule' },
    shots: [{ img: 'c_game', cap: 'Schedule › a game › Edit This Game', co: [[50, 77.4, 96, 4.4], [47, 82.2, 90, 4.4], [16, 86.5, 27, 2.6], [36, 95, 68, 5]],
      steps: ['Under <b>Game Footage</b>, name the clip: Full Game, Q1...',
        'Paste the Google Drive, Hudl or YouTube link. In Drive, share it as "Anyone with the link".',
        '<b>+ Add Footage Link</b> for each quarter.',
        '<b>Save Game</b>. It shows on the game page and in the Film Room.'] }] };
  T.c_oppfilm = { icon: '🔭', title: 'Opponent film & scout diagrams', blurb: 'Scout the next team, then let the kids quiz on it.',
    go: { fn: function () { if (window.openCoachToolsTab) { setSec('coachtools'); window.openCoachToolsTab('opponentfilm'); } } },
    shots: [{ img: 'c_scout', cap: 'Coach Tools › Library › Opponent Film', co: [[50, 21.7, 96, 4.4], [50, 37.2, 96, 4.4], [50, 42.6, 96, 4.4], [50, 85, 96, 4.6], [50, 93.4, 96, 4.6]],
      steps: ['Tap both teams in the film (it helps scout either one).',
        'Add a title and paste the link.',
        '<b>+ Add Film</b>. Players see it on This Week and in the Film Room.',
        '<b>Scout Diagrams</b>: type the team and choose the diagram file...',
        '...then <b>Import Diagrams</b>. Players get that team\'s formations and four quizzes.'] }] };
  T.c_filmroom = { icon: '⭐', title: 'Coach the Film Room', blurb: 'Your picks steer what the kids look for.',
    go: { section: 'film' },
    shots: [{ img: 'c_filmopen', co: [[63.5, 57.8, 18, 3.2], [13.5, 47, 17, 3.2]],
      steps: ['Tap <b>Coach\'s pick</b> on the best notes. The player gets 10 points and the note goes to the top of the scouting report.',
        'Post your own notes with a time, so kids jump right to the moment.'] },
    { img: 'film', co: [[50, 37, 96, 13]],
      steps: ['The team goal is 30 notes a week. Call it out at practice.'] }] };
  T.c_schedule = { icon: '📆', title: 'Import the schedule', blurb: 'Paste it once, every game fills in.',
    go: { fn: function () { if (window.openCoachToolsTab) { setSec('coachtools'); window.openCoachToolsTab('scheduleimport'); } } },
    shots: [{ img: 'c_import', cap: 'Coach Tools › Data & Stats › Schedule Import', co: [[50, 74, 92, 33], [50, 92.5, 92, 4.5]],
      steps: ['Copy the whole schedule page from the league site and paste it here.', '<b>Import Into Schedule</b>. Games, times and places fill in.'] }] };
  T.c_thisweek = { icon: '🎯', title: 'This Week: keys & plays', blurb: 'What every player sees for the next game.',
    go: { section: 'thisweek' },
    shots: [{ img: 'thisweek', cap: 'What players see', co: [[50, 25, 92, 12]],
      steps: ['The write-up builds itself from the Schedule.'] }],
    text: '<ol><li>Open <b>This Week</b> and scroll to <b>Coach editing</b>.</li><li>Pick the game.</li><li>Add your <b>3 Keys</b> and the featured plays. Players see them right away.</li></ol>' };
  T.c_vault = { icon: '🎞️', title: 'Film Vault (practice film)', blurb: 'Practice clips, sorted by play.',
    go: { fn: function () { if (window.openCoachToolsTab) { setSec('coachtools'); window.openCoachToolsTab('filmvault'); } } },
    shots: [{ img: 'c_vault', cap: 'Coach Tools › Library › Film Vault', co: [[50, 66, 92, 4.4], [50, 72, 92, 4.4], [50, 88, 92, 18]],
      steps: ['Make categories to group clips.', 'Search by play name.', 'Every clip, with comments.'] }] };
  T.c_studio = { icon: '✏️', title: 'Draw a new play', blurb: 'Formation, players, routes, blocks.',
    go: { fn: function () { if (window.openCoachToolsTab) { setSec('coachtools'); window.openCoachToolsTab('playstudio'); } } },
    shots: [{ img: 'c_studio', cap: 'Coach Tools › Play Design › Play Studio', co: [[50, 54.6, 40, 5.5]],
      steps: ['Pick a formation, drag the players, draw the routes and blocks, then send it in for the playbook.'] }] };
  T.c_team = { icon: '👥', title: 'Roster, staff & who\'s using it', blurb: 'Set up the team, then watch it get used.',
    shots: [], text: '<div class="gdH">Coach Tools › Team › Roster</div><ol><li>Add each player (number and position are optional).</li><li>Kids pick their name the first time they sign in.</li><li><b>Coaching Staff</b>: link each coach to the login they use.</li></ol>' +
      '<div class="gdH">Coach Tools › Data & Stats › Dashboard</div><ol><li>Who is signing in, and what they use.</li><li>Quiz, 2 Min Drill and film activity for the whole team.</li></ol>' };
  T.c_share = { icon: '🔗', title: 'Share a how-to with your team', blurb: 'Send families straight to the right page.',
    shots: [], text: '<ol><li>Open any page in this guide.</li><li>Tap <b>🔗 Share this how-to</b> at the bottom.</li><li>Paste it in the team chat. It opens right on that page after they sign in.</li></ol><p class="gdTip">Good first sends: <b>Put it on your home screen</b> for everyone, <b>Game day info</b> for parents, <b>Film Room</b> for players.</p>' };

  var ROLES = [
    { key: 'player', label: '🏈 Players', ids: ['around', 'plays', 'signals', 'playquiz', 'opp', 'film', 'thisweek', 'schedule', 'board', 'home'] },
    { key: 'parent', label: '👪 Parents', ids: ['p_game', 'schedule', 'p_child', 'p_learn', 'home'] },
    { key: 'coach', label: '🛠️ Coaches', ids: ['c_tools', 'c_gamefilm', 'c_oppfilm', 'c_filmroom', 'c_schedule', 'c_thisweek', 'c_vault', 'c_studio', 'c_team', 'c_share'] },
  ];
  Object.keys(T).forEach(function (k) { T[k].id = k; });

  // ---------- helpers ----------
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } }
  function markSeen(id) { try { var s = seen(); if (s.indexOf(id) === -1) { s.push(id); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } } catch (e) { /* no storage */ } }
  function isCoach() { return !!window.isCoachSession || window.userRole === 'coach'; }
  function myRole() { return isCoach() ? 'coach' : window.userRole === 'parent' ? 'parent' : 'player'; }
  function rolesFor() { return isCoach() ? ROLES : ROLES.filter(function (r) { return r.key !== 'coach'; }); }
  function setSec(s) { if (typeof window.setSection === 'function') window.setSection(s); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- styles (inline here, not css/styles.css, so a phone holding
  // an old cached stylesheet still gets a working guide) ----------
  function css() {
    if (document.getElementById('guideCss')) return;
    var s = document.createElement('style');
    s.id = 'guideCss';
    s.textContent = [
      '#guideOverlay{position:fixed;inset:0;z-index:10050;background:#111;color:#f4f4f4;overflow-y:auto;-webkit-overflow-scrolling:touch;display:none;font-family:inherit}',
      '#guideOverlay.show{display:block}',
      '#guideOverlay .gdWrap{max-width:560px;margin:0 auto;padding:14px 16px 60px}',
      '#guideOverlay .gdTop{display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;background:#111;padding:6px 0 10px;z-index:2}',
      '#guideOverlay .gdTitle{font-size:22px;font-weight:900;margin:0}',
      '#guideOverlay .gdX{background:#262626;border:0;color:#fff;width:38px;height:38px;border-radius:50%;font-size:18px;cursor:pointer}',
      '#guideOverlay .gdBack{background:none;border:0;color:#ff7a1a;font-weight:800;font-size:15px;cursor:pointer;padding:6px 0}',
      '#guideOverlay .gdTabs{display:flex;gap:6px;margin:4px 0 12px}',
      '#guideOverlay .gdTab{flex:1;border:2px solid #333;background:#1c1c1c;color:#ddd;border-radius:999px;padding:9px 4px;font-weight:800;font-size:13.5px;cursor:pointer}',
      '#guideOverlay .gdTab.on{background:#ff6a13;border-color:#ff6a13;color:#111}',
      '#guideOverlay .gdProg{font-size:13px;color:#bbb;margin:0 0 6px}',
      '#guideOverlay .gdBar{height:7px;background:#2a2a2a;border-radius:9px;overflow:hidden;margin-bottom:14px}',
      '#guideOverlay .gdBar i{display:block;height:100%;background:linear-gradient(90deg,#ff9a3c,#ff6a13)}',
      '#guideOverlay .gdItem{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#1c1c1c;border:1px solid #2c2c2c;border-radius:14px;padding:12px;margin-bottom:9px;color:inherit;cursor:pointer}',
      '#guideOverlay .gdItem .ic{font-size:26px;width:40px;text-align:center;flex:0 0 auto}',
      '#guideOverlay .gdItem .t{font-weight:800;font-size:15.5px}',
      '#guideOverlay .gdItem .b{font-size:12.5px;color:#aaa;margin-top:2px}',
      '#guideOverlay .gdItem .ck{margin-left:auto;font-size:13px;color:#555;flex:0 0 auto}',
      '#guideOverlay .gdItem .ck.on{color:#2fbf71}',
      '#guideOverlay .gdHead{display:flex;align-items:center;gap:10px;margin:4px 0 4px}',
      '#guideOverlay .gdHead .ic{font-size:30px}',
      '#guideOverlay .gdHead h3{margin:0;font-size:21px;font-weight:900}',
      '#guideOverlay .gdBlurb{color:#bbb;font-size:14px;margin:0 0 14px}',
      '#guideOverlay .gdShot{margin:0 0 22px}',
      '#guideOverlay .gdCap{font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#ff7a1a;margin:0 0 8px;text-align:center}',
      '#guideOverlay .gdPhone{position:relative;width:min(290px,78vw);margin:0 auto;border:3px solid #3a3a3a;border-radius:24px;overflow:hidden;background:#000;box-shadow:0 8px 28px rgba(0,0,0,.5)}',
      '#guideOverlay .gdPhone img{display:block;width:100%;height:auto;aspect-ratio:390/844}',
      '#guideOverlay .gdRing{position:absolute;border:2.5px solid #ff7a1a;border-radius:9px;box-shadow:0 0 0 3px rgba(255,122,26,.25),0 0 14px rgba(255,122,26,.55);pointer-events:none}',
      '#guideOverlay .gdNum{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:#ff6a13;color:#111;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.6);pointer-events:none}',
      '#guideOverlay .gdSteps{list-style:none;margin:12px 0 0;padding:0}',
      '#guideOverlay .gdSteps li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.4;margin-bottom:9px}',
      '#guideOverlay .gdSteps .n{flex:0 0 24px;height:24px;border-radius:50%;background:#ff6a13;color:#111;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center}',
      '#guideOverlay .gdText ol{padding-left:22px;margin:6px 0 12px}',
      '#guideOverlay .gdText li{font-size:14.5px;line-height:1.45;margin-bottom:6px}',
      '#guideOverlay .gdH{font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#ff7a1a;margin:12px 0 2px}',
      '#guideOverlay .gdTip{background:#1f1a12;border:1px solid #4a3418;color:#f3d9b8;border-radius:10px;padding:9px 11px;font-size:13px;margin:8px 0 0}',
      '#guideOverlay .gdBtns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
      '#guideOverlay .gdGo{flex:1 1 160px;background:#ff6a13;color:#111;border:0;border-radius:12px;padding:13px;font-weight:900;font-size:15px;cursor:pointer}',
      '#guideOverlay .gdShare{flex:1 1 160px;background:#262626;color:#fff;border:0;border-radius:12px;padding:13px;font-weight:800;font-size:14px;cursor:pointer}',
      '#guideOverlay .gdNext{display:block;width:100%;margin-top:10px;background:none;border:1px solid #333;color:#ddd;border-radius:12px;padding:12px;font-weight:800;cursor:pointer}',
      '#guideOverlay .gdMsg{font-size:12.5px;color:#9be3b9;text-align:center;margin-top:6px;min-height:16px}',
      '#guideOverlay .gdFoot{text-align:center;margin-top:16px}',
      '#guideOverlay .gdFoot button{background:none;border:0;color:#999;text-decoration:underline;font-size:13px;cursor:pointer}',
      '#helpBtn.gdNew{position:relative;box-shadow:0 0 0 0 rgba(255,106,19,.8);animation:gdPulse 1.8s infinite}',
      '#helpBtn.gdNew::after{content:"NEW";position:absolute;inset:auto;top:-8px;right:-12px;background:#e53935;color:#fff;font-size:8.5px;font-weight:900;padding:1px 4px;border-radius:6px;letter-spacing:.02em}',
      '@keyframes gdPulse{0%{box-shadow:0 0 0 0 rgba(255,106,19,.75)}70%{box-shadow:0 0 0 9px rgba(255,106,19,0)}100%{box-shadow:0 0 0 0 rgba(255,106,19,0)}}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ---------- rendering ----------
  var el = null, curRole = null;
  function ensure() {
    css();
    if (el) return el;
    el = document.createElement('div');
    el.id = 'guideOverlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'How-To Guide');
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    return el;
  }
  function topBar(left) {
    return '<div class="gdTop">' + left + '<button class="gdX" data-gd="close" aria-label="Close">✕</button></div>';
  }
  function home() {
    var roles = rolesFor();
    if (!curRole || !roles.some(function (r) { return r.key === curRole; })) curRole = myRole();
    var role = roles.filter(function (r) { return r.key === curRole; })[0] || roles[0];
    var s = seen();
    var done = role.ids.filter(function (id) { return s.indexOf(id) !== -1; }).length;
    var h = '<div class="gdWrap">' + topBar('<h2 class="gdTitle">📘 How-To Guide</h2>');
    h += '<div class="gdTabs">' + roles.map(function (r) {
      return '<button class="gdTab' + (r.key === role.key ? ' on' : '') + '" data-gd-role="' + r.key + '">' + r.label + '</button>';
    }).join('') + '</div>';
    h += '<div class="gdProg">' + (done === role.ids.length ? '✅ You\'ve seen them all.' : 'You\'ve explored <b>' + done + ' of ' + role.ids.length + '</b>') + '</div>';
    h += '<div class="gdBar"><i style="width:' + Math.round(done / role.ids.length * 100) + '%"></i></div>';
    h += role.ids.map(function (id) {
      var t = T[id], on = s.indexOf(id) !== -1;
      return '<button class="gdItem" data-gd-topic="' + id + '"><span class="ic">' + t.icon + '</span><span><div class="t">' + t.title + '</div><div class="b">' + t.blurb + '</div></span><span class="ck' + (on ? ' on' : '') + '">' + (on ? '✓' : '›') + '</span></button>';
    }).join('');
    h += '<div class="gdFoot"><button data-gd="tips">Quick tips list</button></div></div>';
    el.innerHTML = h;
    el.scrollTop = 0;
  }
  function shotHtml(sh) {
    var h = '<div class="gdShot">' + (sh.cap ? '<div class="gdCap">' + sh.cap + '</div>' : '');
    h += '<div class="gdPhone"><img loading="lazy" alt="' + (sh.cap || 'Screenshot') + '" src="' + IMG + sh.img + '.webp?v=1">';
    (sh.co || []).forEach(function (c, i) {
      var x = c[0], y = c[1], w = c[2], hh = c[3];
      if (w && hh) h += '<div class="gdRing" style="left:' + clamp(x - w / 2, 0.5, 99) + '%;top:' + clamp(y - hh / 2, 0.3, 99) + '%;width:' + Math.min(w, 99) + '%;height:' + hh + '%"></div>';
      var bx = w ? x - w / 2 : x, by = hh ? y - hh / 2 : y;
      h += '<div class="gdNum" style="left:' + clamp(bx, 4.5, 95.5) + '%;top:' + clamp(by, 1.8, 98) + '%">' + (i + 1) + '</div>';
    });
    h += '</div><ol class="gdSteps">' + (sh.steps || []).map(function (st, i) {
      return '<li><span class="n">' + (i < (sh.co || []).length ? i + 1 : '•') + '</span><span>' + st + '</span></li>';
    }).join('') + '</ol>' + (sh.tip ? '<div class="gdTip">' + sh.tip + '</div>' : '') + '</div>';
    return h;
  }
  function topic(id) {
    var t = T[id];
    if (!t) return home();
    markSeen(id);
    // Keep the tab the reader came from if it has this topic; otherwise
    // switch to the first tab that does (a shared link, say).
    var inCur = (rolesFor().filter(function (r) { return r.key === curRole; })[0] || { ids: [] }).ids.indexOf(id) !== -1;
    if (!inCur) {
      var role = rolesFor().filter(function (r) { return r.ids.indexOf(id) !== -1; })[0];
      if (role) curRole = role.key;
    }
    var list = (rolesFor().filter(function (r) { return r.key === curRole; })[0] || ROLES[0]).ids;
    var next = list[list.indexOf(id) + 1];
    var h = '<div class="gdWrap">' + topBar('<button class="gdBack" data-gd="home">‹ All how-tos</button>');
    h += '<div class="gdHead"><span class="ic">' + t.icon + '</span><h3>' + t.title + '</h3></div><p class="gdBlurb">' + t.blurb + '</p>';
    h += (t.shots || []).map(shotHtml).join('');
    if (t.text) h += '<div class="gdText">' + t.text + '</div>';
    h += '<div class="gdBtns">' + (t.go ? '<button class="gdGo" data-gd-go="' + id + '">Take me there ›</button>' : '') +
      '<button class="gdShare" data-gd-share="' + id + '">🔗 Share this how-to</button></div><div class="gdMsg" id="gdMsg"></div>';
    if (next) h += '<button class="gdNext" data-gd-topic="' + next + '">Next: ' + T[next].icon + ' ' + T[next].title + ' ›</button>';
    h += '</div>';
    el.innerHTML = h;
    el.scrollTop = 0;
  }
  // Android's back button closes the guide like any other screen
  // (js/nav-history.js). `pushed` is true while our history entry is live.
  var pushed = false;
  function hide() {
    if (!el) return;
    el.classList.remove('show');
    document.documentElement.style.overflow = '';
    if (/^#how=/.test(location.hash)) try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  function open(id) {
    ensure();
    if (!el.classList.contains('show') && window.NavHistory && !pushed) {
      pushed = true;
      window.NavHistory.push('guide', function () { pushed = false; hide(); });
    }
    el.classList.add('show');
    document.documentElement.style.overflow = 'hidden';
    try { localStorage.setItem(OPENED_KEY, '1'); } catch (e) { /* ignore */ }
    var hb = document.getElementById('helpBtn');
    if (hb) hb.classList.remove('gdNew');
    if (id && T[id]) topic(id); else home();
    if (window.logAnalyticsEvent) try { window.logAnalyticsEvent('guide_open', { topic: id || 'home' }); } catch (e) { /* ignore */ }
  }
  function close() {
    if (pushed && window.NavHistory) { window.NavHistory.goBack(); return; } // its undo hides us
    hide();
  }
  function go(id) {
    var g = T[id] && T[id].go;
    if (!g) return;
    var run = function () {
      if (g.fn) return g.fn();
      if (g.section) setSec(g.section);
      if (g.mode && typeof window.setMode === 'function') window.setMode(g.mode);
      window.scrollTo(0, 0);
    };
    hide();
    if (!(pushed && window.NavHistory)) return run();
    // Drop our history entry without re-running its undo, and only move
    // on once the browser has actually stepped back -- a new screen pushed
    // before that would be the one the step-back pops.
    pushed = false;
    var ran = false;
    var once = function () { if (ran) return; ran = true; window.removeEventListener('popstate', once); setTimeout(run, 0); };
    window.NavHistory.consumeTop();
    window.addEventListener('popstate', once);
    setTimeout(once, 500);
  }
  function share(id) {
    var url = location.origin + location.pathname + '#how=' + id;
    var msg = document.getElementById('gdMsg');
    var text = 'Bengals app how-to: ' + T[id].title;
    if (navigator.share) {
      navigator.share({ title: text, text: text, url: url }).catch(function () { /* cancelled */ });
      return;
    }
    var done = function () { if (msg) msg.textContent = 'Link copied. Paste it in the team chat.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { if (msg) msg.textContent = url; });
    else if (msg) msg.textContent = url;
  }
  function onClick(e) {
    var b = e.target.closest('[data-gd],[data-gd-role],[data-gd-topic],[data-gd-go],[data-gd-share]');
    if (!b) return;
    if (b.dataset.gdRole) { curRole = b.dataset.gdRole; return home(); }
    if (b.dataset.gdTopic) return topic(b.dataset.gdTopic);
    if (b.dataset.gdGo) return go(b.dataset.gdGo);
    if (b.dataset.gdShare) return share(b.dataset.gdShare);
    var a = b.dataset.gd;
    if (a === 'close') return close();
    if (a === 'home') return home();
    if (a === 'tips') { close(); var t = document.getElementById('tipsOverlay'); if (t) t.classList.add('show'); }
  }

  // "?" opens the guide. Capture phase on document runs before the button's
  // own listener (study-quiz.js, which opens the old tips list).
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#helpBtn')) {
      e.stopPropagation();
      e.preventDefault();
      open();
    }
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el && el.classList.contains('show')) close(); });
  window.addEventListener('hashchange', function () {
    var m = /^#how=([a-z_]+)/.exec(location.hash);
    if (m) open(m[1]);
  });

  // Coach Tools › How To gets a button to the full guide at the top.
  function addCoachLink() {
    var p = document.getElementById('coachHowToPanel');
    if (!p || p.querySelector('.gdCoachLink')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'navBtn gdCoachLink';
    b.style.cssText = 'display:block;width:100%;margin:0 0 12px;';
    b.textContent = '📘 Open the How-To Guide (with screenshots)';
    b.addEventListener('click', function () { curRole = 'coach'; open(); });
    p.insertBefore(b, p.firstChild);
  }
  var origHowTo = window.initCoachToolsHowTo;
  if (typeof origHowTo === 'function') {
    window.initCoachToolsHowTo = function () { var r = origHowTo.apply(this, arguments); addCoachLink(); return r; };
  }

  function boot() {
    css();
    try {
      if (localStorage.getItem(OPENED_KEY) !== '1') {
        var hb = document.getElementById('helpBtn');
        if (hb) { hb.classList.add('gdNew'); hb.title = 'How-To Guide'; }
      }
    } catch (e) { /* ignore */ }
    var m = /^#how=([a-z_]+)/.exec(location.hash);
    if (m) setTimeout(function () { open(m[1]); }, 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.HowToGuide = { open: open, close: close, topics: T, roles: ROLES };
})();
