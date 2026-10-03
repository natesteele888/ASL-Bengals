// ---------------------------------------------------------------------------
// Real back-button navigation -- Nathan: "when a lot of people open the app
// and go to a spot they didn't mean to, they instinctively hit the back
// button on their phone. That typically closes the app instead of going
// back a step." Confirmed before writing any of this: the app had ZERO
// history.pushState usage anywhere (only a couple of history.replaceState
// calls elsewhere, for URL query-param cleanup) -- with nothing in the
// page's own session history, Android's hardware/gesture back button has
// nowhere to go but "close the app."
//
// Design: an in-memory undo stack, kept in lockstep with real
// history.pushState depth. Opening a screen calls NavHistory.push(label,
// undoFn); closing it -- by ANY means, an on-screen back/close button OR
// the hardware back button -- always goes through NavHistory.goBack(),
// which calls history.back() if the stack isn't empty. That fires a REAL
// popstate event, whose handler (below) pops the stack and runs the
// matching undoFn. One single code path for "how a screen closes,"
// whichever control triggered it -- an on-screen "‹ Back" button and a
// real hardware back press end up running the exact same function.
//
// Scoped to real navigable SCREENS this app has (top-level sections, Play's
// own sub-tabs, Coach Tools' nav, the Schedule/Practices/Standings/Play
// Calls detail drill-downs, and the 2 full-screen overlays) -- not every
// small celebratory/administrative popup (rank-up, badges, leaderboard,
// tips, etc.), which already has its own explicit close button right there
// and isn't something a coach/kid "ends up at by accident" the way a wrong
// tab or drill-down is.
(function () {
  const stack = [];
  let suppressNextPopstate = false;

  function push(label, undo) {
    if (typeof undo !== 'function') return;
    try {
      // Deliberately no URL change (empty second arg, no third arg) --
      // this app has its own query-param conventions elsewhere (?practice=,
      // ?thisweek=1, ?game=, read back by player-identity.js's gate()) that
      // a history entry here must never interfere with.
      history.pushState({ navHistoryDepth: stack.length + 1 }, '');
    } catch (e) {
      // pushState can throw in rare sandboxed/embedded contexts -- the app
      // still works, it just won't have this particular undo step.
    }
    stack.push({ label, undo });
  }

  // Swaps the CURRENT top entry's undo callback instead of growing the
  // stack -- for moving between SIBLING screens at the same level, where
  // back should return to wherever you were before entering this group,
  // not step back through every sibling you happened to flip through.
  // Not currently used (every real call site today treats each switch as
  // its own undo-able step, matching ordinary back-button expectations),
  // kept available for a future screen where that's genuinely wrong.
  function replaceTop(label, undo) {
    if (typeof undo !== 'function') return;
    if (stack.length) stack[stack.length - 1] = { label, undo };
    else push(label, undo);
  }

  // The one correct way an on-screen "‹ Back" / "✕ Close" control should
  // close a pushed screen. Never call an undo callback directly from a
  // click handler -- always route through here, so a tap and a hardware
  // back press are provably the same code path, not two that can drift.
  function goBack() {
    if (stack.length) history.back();
  }

  // For the rare case where a screen is already being closed by some
  // OTHER direct action that must synchronously know whether the close
  // actually happened before doing anything else (e.g. Game Plan
  // Builder's "Open Defense Builder" link, which checks closeBuilder()'s
  // own return value -- false means the coach backed out of a "discard
  // changes?" confirm -- before navigating away). Removes the top entry
  // and brings real browser history back into sync WITHOUT re-running its
  // undo, since the caller already performed the equivalent close itself.
  function consumeTop() {
    if (!stack.length) return;
    stack.pop();
    suppressNextPopstate = true;
    history.back();
  }

  window.addEventListener('popstate', () => {
    if (suppressNextPopstate) { suppressNextPopstate = false; return; }
    const entry = stack.pop();
    if (entry) {
      try { entry.undo(); }
      catch (e) { console.error('[NavHistory] undo failed for "' + entry.label + '":', e); }
    }
    // Stack now empty -- the NEXT real back press has nothing left to
    // unwind in-app, so it correctly falls through to the OS default
    // (closing/backgrounding the app). That's the right behavior once
    // every in-app screen has actually been stepped back through.
  });

  window.NavHistory = { push, replaceTop, goBack, consumeTop, depth: () => stack.length };
})();
