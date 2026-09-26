// What, if anything, interrupts a player when the app opens.
//
// Nathan: "Currently there are several popups at the start that need to go
// away. It should only be set from a screen the coaches choose for that week."
//
// TEN separate features had each quietly earned themselves a launch popup,
// added one at a time over months, each individually reasonable. Nobody ever
// saw the stack: a kid opening the app on a game day could be handed a tips
// overlay, a game-day splash, a What's New play feed, a badges intro and a
// getting-started wizard before reaching anything they actually came for.
//
// The point of this file is that "what interrupts a kid at launch" becomes ONE
// decision in ONE place, instead of ten scattered ones that could only be
// counted by reading five files. Adding an eleventh means editing this list --
// and an undeclared name returns false, so a new popup cannot fire without
// being written down here first.
//
// Nine of the ten chained through player-identity.js's post-session block. The
// tenth (welcomeTour) fires at module load in auth.js instead, over the login
// screen, which is exactly why it survived the first sweep -- worth knowing
// before assuming one grep has found them all.
//
// WHAT STAYS ON, AND WHY
// Two kinds survive, and neither is promotional:
//   * safety -- a cancelled practice has to stop a kid from being dropped at
//     a field nobody is at. That is not a popup to be tidied away.
//   * setup  -- the position picker, which is the thing the personalised,
//     position-first experience is being built on, and the duplicate-account
//     merge, which protects a kid's own stats from splitting in two.
// Everything else is off.
//
// Nothing here is deleted. Every screen switched off below is still reachable
// on purpose -- Tips from the Help button, What's New from its own feed,
// badges from the leaderboard -- so this changes when a kid is interrupted,
// never what the app can show them.
//
// NEXT: the coach-chosen weekly screen replaces this list's job entirely.
// When it exists, it becomes the single `true` entry and the rest stay off.

(function () {
  'use strict';

  var INTERRUPTIONS = {
    // --- safety: keep ---
    // A practice cancellation must reach everyone, every time, before they
    // can carry on into the app.
    cancellationPanel: true,

    // --- setup: keep ---
    // Position picker (players) / child picker (parents). This is onboarding,
    // not an announcement, and the whole position-specific experience depends
    // on the answer. Folds into the new position-first flow once that lands.
    rolePrompt: true,
    // Fires only when a kid actually has two sign-ins to reconcile; leaving it
    // on stops their stats silently splitting across two names.
    mergePrompt: true,

    // --- announcements: off ---
    // A 6-step crash course shown over the LOGIN screen -- the first thing a
    // brand-new kid ever saw. It fires at module load in js/auth.js rather
    // than through the post-session chain, which is how it survived the first
    // sweep: it is not a maybeShow* call, so it never reached that block.
    welcomeTour: false,     // still on the Help button
    tipsOverlay: false,     // still on the Help button
    gameDaySplash: false,
    whatsNew: false,        // still in its own feed, with its unread badge
    parentDigest: false,
    badgesIntro: false,     // badges still visible from the leaderboard
    gettingStarted: false,
  };

  window.LaunchScreen = {
    // Guard for a launch-time interruption. Call sites read:
    //   if (LaunchScreen.allows('whatsNew')) { ... }
    // An unknown name returns false deliberately: a new popup has to be
    // declared here to fire, so this list cannot silently fall out of date.
    allows: function (name) {
      return INTERRUPTIONS[name] === true;
    },

    // Run `fn` only if that interruption is enabled. Keeps call sites to one
    // line and makes them greppable.
    gate: function (name, fn) {
      if (this.allows(name) && typeof fn === 'function') return fn();
      return undefined;
    },

    // For a coach-facing settings screen later, and for debugging "why did
    // nothing pop up?" from the console.
    list: function () {
      return Object.keys(INTERRUPTIONS).map(function (k) {
        return { name: k, enabled: INTERRUPTIONS[k] };
      });
    },
  };
})();
