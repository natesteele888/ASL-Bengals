# ASL Bengals App — Recap

This is a plain-language recap of where the ASL Bengals app stands: what it does for players and coaches, and how it's actually built and hosted underneath. It's a progressive web app (PWA) — a mobile-friendly site that can be added to a phone's home screen and opened like a regular app — live at natesteele888.github.io/ASL-Bengals/dev2/, with `dev2` being the current, actively developed version (older prototypes still sit in the repo but aren't linked anywhere).

## Part 1 — What the App Does

### Getting in

Everyone hits the same login screen first and types one of two shared access codes: a team code that any player or parent can use, or a coach code that unlocks additional tools. Right after that, a second short screen asks for a name and a 4-digit PIN — made up on the spot the first time, then reused every time after — so the app can remember who's who on that device without anyone creating a real account. A handful of specific coach names (Coach Nate, Coach Shane, Aaron, CoachMatt, Coach Joe) get a further tier on top of the generic coach code: only they can see and use the most sensitive editing tools, like publishing This Week's keys or editing plays, even though any coach-code holder can browse everything else a coach can see.

### Studying the playbook

The Study section holds the original flashcard-style study/quiz/timed-quiz tools built from the team's signal book, plus a personal study guide that writes out, in plain English, exactly what a given position does on every single play — generated live from the same underlying play data that drives the diagrams, so it can never fall out of sync with a coach's edits.

### Play Calls and Play Quiz

Play Calls is the interactive core of the app: a player picks a play, flips it between Shotgun and Split formation, toggles wing side, direction, motion, boot, or a Split pass route (Seattle, Houston, Florida, Boston), and watches an animated diagram run while the matching hand signal sequence plays alongside it. Tapping your own jersey number highlights just your path, and setting a position once (from the name menu) makes that highlighting automatic every time a play opens. Play Quiz flips it around — it plays a signal sequence and asks the player to reconstruct the call that was signaled, in ten rounds that step up in difficulty.

### Schedule, Practices, and This Week

Schedule covers the season's games: opponent, home or away, arrive/warm-up/kickoff times, an address with a one-tap map link, a game type tag for scrimmages, jamborees, and playoffs, an uploaded opponent logo, a scouting report, and the final score once it's played (which turns into a green W or red L badge and rolls into the Bengals' season record shown right on every card). A separate Practices list covers practices and film nights the same way, with a repeat option for scheduling a whole run of Tuesday/Thursday practices at once, and Full Schedule merges both into one chronological view with a single button to download the whole season as a calendar file for Apple, Google, or Outlook Calendar.

Every game and practice card also carries a live weather forecast (free, no sign-up), pulled automatically from the date and address already on file and simply hidden if the event's too far out or the location can't be matched to a real place. Game pages get an auto-written game preview — a short paragraph built from real data on file (the Bengals' record, the head-to-head series against that opponent, and whichever player is actually leading the team in yards or tackles this season) rather than anything typed by hand. This Week works similarly but zoomed out to the whole week: a short auto-generated write-up covering every game and practice coming up in the next seven days, plus a coach-editable box for three focus keys and a handful of featured plays that can be tied to a specific upcoming game.

Coaches used to be dropped straight into the edit form the moment they opened a game or practice, with no way to see the clean version everyone else sees. That's now flipped: every detail page opens read-only by default, even for a coach, with an Edit button to switch into the form, and a Preview button inside the form to jump back and see exactly what's been typed so far — unsaved changes included — the way a player actually will.

### Stats and player profiles

Coach Tools > Stats is where a coach enters a game's real numbers — rushing, passing, receiving, kickoffs, tackles, and turnovers — off a shared entry form that auto-fills from the team roster instead of retyping names each time. Everything downstream reads from those same saved numbers: a team leaderboard (season leaders, per-game leaders, a bar graph per player), and an ESPN-style player card for every roster spot showing a photo, height/weight/grade, season and career totals, and a log of recent games. A coach can upload that photo and fill in height/weight/grade right on the card itself.

### Coach Tools, the rest

Beyond Stats, Coach Tools bundles three more pieces: Resources, which prints three PDFs generated straight from the live play data — a full illustrated Playbook, a numbered text-only Play Sheet for calling plays by number on the sideline, and a blank Game Stat Sheet for paper tracking; Roster, the single shared list of every player's name, number, and position that Stats and player profiles both read from; and Drive Scripts, where a coach can build and save a named, ordered list of plays ahead of time — an opening script, a red-zone package, a two-minute drill — with a one-tap option to seed four starter scripts pulled from the real playbook.

### Editing the plays themselves

Edit Plays is the coach tool that actually changes what's in the playbook: dragging a play's route points around, duplicating an existing play into a new variant, and toggling how the blocking line displays. Every change saves straight to the shared database, and anything newly added shows up automatically in a What's New feed with an unread badge, so players notice new plays without a coach having to announce them separately.

## Part 2 — How It's Built: Backend, Integrations, and Permissions

There is no traditional backend server here — no Node/Python API running somewhere, nothing to patch or keep online. The app is a fully static site (plain HTML, CSS, and JavaScript files, no build step or compiler involved) that talks directly to two things: Firebase's Realtime Database for all shared data, and a couple of free, keyless third-party APIs for weather and maps.

### Hosting

The site is hosted on GitHub Pages, serving straight out of the `main` branch of the natesteele888/ASL-Bengals repository — there's no separate deploy pipeline or GitHub Action; a push to `main` is a deploy. Because browsers cache JavaScript and CSS aggressively, every real code change bumps a version string (`BUILD_V`) that's appended to every script and data fetch as a `?v=` query parameter, along with a matching bump to the stylesheet's own version tag and to the service worker's internal cache name, so a phone that installed the app weeks ago is guaranteed to pick up the newest files instead of quietly running on stale ones. That service worker (a small background script required for the "Add to Home Screen" install prompt) also caches just enough of the app shell that it still opens if a device loses signal on the sideline, while live data itself always requires a real connection.

### Where the data lives

All shared data — plays and signal cards, the schedule, practices, roster, stats, This Week's keys, the leaderboard, opponent logos, player photos and bios — lives in a single Firebase Realtime Database (a hosted, real-time JSON store from Google, not something Nathan has to run or maintain). The app talks to it with plain `fetch()` calls against Firebase's REST endpoints rather than pulling in Firebase's full JavaScript SDK, which keeps the whole thing a no-build-step static site. Player photos and other private bio fields are stored only in that database behind the login gate — never written into the public GitHub repo, which anyone can browse.

### Who can do what

Access runs in layers. Typing either shared code (team or coach) does two things at once: it's checked locally against a stored cryptographic hash of the correct code (so the real code itself never sits in the shipped files in readable form), and — if it matches — it signs that device into a real Firebase account created specifically for "whoever currently knows this code," using that same hash as the account's password. That real sign-in is what actually unlocks reading and writing the database; a visitor who hasn't typed a correct code yet is signed in anonymously behind the scenes just so the page doesn't error out, but Firebase's server-side security rules (configured in the Firebase console itself, not stored in this repo) refuse anonymous sessions on anything sensitive. On top of that: the coach code alone grants access to coach-facing screens and editing controls in general, but a second, separate allowlist of five specific coach names gates the handful of tools meant only for the actual coaching staff, like publishing This Week or editing the playbook. Five wrong login attempts locks the login screen for 30 seconds.

### Outside services

Three free, no-account, no-API-key services do the heavy lifting outside Firebase. Weather forecasts come from Open-Meteo, a free public weather API that needs no sign-up or key — a natural fit since a static GitHub Pages site has nowhere safe to hide a paid API's credentials. Map links and embedded map previews use a plain, keyless Google Maps URL rather than Google's full Maps JavaScript API, which would require a billing-enabled key. PDF generation (the Playbook, Play Sheet, and Stat Sheet) runs entirely in the browser using jsPDF, a JavaScript library loaded from a public CDN, so there's no server-side PDF pipeline to keep running — a change to a play's diagram shows up in the next PDF print automatically, since both draw from the exact same live data.
