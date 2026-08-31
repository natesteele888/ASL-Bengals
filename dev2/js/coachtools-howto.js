// ---------------------------------------------------------------------------
// Coach Tools > How To -- Nathan: "Develop a how to section in the coaching
// tools. It should have some walkthrough explanations of how to do things
// such as add another login to your device, save the app as an app on your
// phone home screen." A plain accordion of common device/account questions
// -- the stuff that isn't really about play calls, but trips people up on a
// shared family phone/tablet or a first-time install. Reuses the exact same
// .accordion-item/.accordion-header/.accordion-body shell Play Calls already
// built (see css/styles.css and play-calls.js's buildGrid()), just with
// plain step lists instead of a field diagram in each body.
//
// Every step below is written against the ACTUAL mechanics already in this
// codebase (long-press-to-switch-profile in player-identity.js, the
// moon/sun + speaker icons in auth.js, etc.) rather than generic PWA
// boilerplate -- if any of those flows change, update the matching entry
// here too so this doesn't quietly go stale.
// ---------------------------------------------------------------------------
(function () {

  const TOPICS = [
    {
      icon: '👤',
      title: 'Add another login (profile) to this device',
      body: `
        <p>Handy when two players on the team share one phone or tablet at home, or a coach wants a player's own profile on their device too.</p>
        <ol>
          <li>In the top-right corner, <strong>press and hold your name</strong> (not just a tap) for about half a second.</li>
          <li>This opens <strong>Switch Profile</strong> -- a list of anyone who's already signed in on this device, plus a <strong>"+ Add Another Profile"</strong> option.</li>
          <li>Tap <strong>"+ Add Another Profile."</strong></li>
          <li>Type the new person's name and pick a 4-digit code for them. This code is just theirs -- it's separate from the team code you both typed to get into the app in the first place.</li>
          <li>Tap <strong>Continue</strong>. The app reloads under the new profile.</li>
        </ol>
        <p style="color:var(--muted);font-size:12.5px;">To switch back later, press and hold your name again, tap the profile you want from the list, and enter that profile's 4-digit code.</p>
      `,
    },
    {
      icon: '📱',
      title: "Save this app to your phone's home screen",
      body: `
        <p>This installs it like a real app -- it opens full-screen with its own icon, no browser address bar. It's free and doesn't go through the App Store or Play Store.</p>
        <div style="font-weight:800;font-size:12.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--bengal-orange-dark);margin:10px 0 4px;">iPhone / iPad (Safari)</div>
        <ol>
          <li>Open this site in <strong>Safari</strong> -- Add to Home Screen only works from Safari on iPhone/iPad, not Chrome.</li>
          <li>Tap the <strong>Share</strong> icon (the square with an arrow pointing up) in the bottom toolbar.</li>
          <li>Scroll down and tap <strong>"Add to Home Screen."</strong></li>
          <li>Tap <strong>"Add"</strong> in the top-right corner.</li>
        </ol>
        <div style="font-weight:800;font-size:12.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--bengal-orange-dark);margin:14px 0 4px;">Android (Chrome)</div>
        <ol>
          <li>Open this site in <strong>Chrome</strong>.</li>
          <li>Tap the <strong>⋮</strong> menu in the top-right corner.</li>
          <li>Tap <strong>"Install app"</strong> (some versions show "Add to Home screen" instead).</li>
          <li>Confirm by tapping <strong>"Install."</strong></li>
        </ol>
        <p style="color:var(--muted);font-size:12.5px;">Either way, look for the Bengals icon on your home screen afterward -- tapping it opens straight into this app.</p>
      `,
    },
    {
      icon: '🔄',
      title: 'Switch back to your own profile, or sign out',
      body: `
        <ol>
          <li><strong>Switch to a different profile already on this device:</strong> press and hold your name (top-right), tap the profile you want from the list, then enter that profile's 4-digit code.</li>
          <li><strong>Sign out completely:</strong> tap your name -- a normal tap this time, not press-and-hold -- to open the menu, then tap <strong>"Sign Out."</strong></li>
        </ol>
      `,
    },
    {
      icon: '🌙',
      title: 'Turn on Dark Mode',
      body: `
        <p>Tap the moon icon (🌙) in the top toolbar to switch to Dark Mode; tap the sun icon (☀️) to switch back to light. This is remembered on this device, so you only have to set it once.</p>
      `,
    },
    {
      icon: '🔇',
      title: 'Mute or unmute the background music',
      body: `
        <p>Tap the speaker icon (🔊 / 🔇) in the top toolbar to toggle the background music. Also remembered per device.</p>
      `,
    },
    {
      icon: '🖨️',
      title: 'Print the Sideline Playbook or Play Call Chart',
      body: `
        <ol>
          <li>Go to <strong>Coach Tools → Resources</strong>.</li>
          <li>Tap <strong>"Print Playbook"</strong> for the full diagram booklet, or <strong>"Print Play Sheet"</strong> for the landscape quick-reference chart.</li>
        </ol>
        <p style="color:var(--muted);font-size:12.5px;">Both are generated fresh from whatever's live in Play Calls right now, so they always match the current toggles -- Motion, Boot, Counter, In/Out and all.</p>
      `,
    },
  ];

  let built = false;
  let openItem = null;

  function buildHowToList() {
    const wrap = document.getElementById('coachHowToList');
    if (!wrap) return;
    wrap.innerHTML = '';
    const list = document.createElement('div');
    // Same layout .play-grid uses (column of accordion items with gaps),
    // just given its own name here since this isn't actually a play grid.
    list.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    TOPICS.forEach(topic => {
      const item = document.createElement('div');
      item.className = 'accordion-item';

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'accordion-header';
      header.innerHTML = `<span>${topic.icon} ${topic.title}</span><span class="accordion-chevron">&#9660;</span>`;

      const body = document.createElement('div');
      body.className = 'accordion-body';
      body.innerHTML = `<div style="font-size:13.5px;line-height:1.55;color:var(--ink);">${topic.body}</div>`;

      header.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        if (openItem && openItem !== item) openItem.classList.remove('open');
        if (isOpen) {
          item.classList.remove('open');
          openItem = null;
        } else {
          item.classList.add('open');
          openItem = item;
        }
      });

      item.appendChild(header);
      item.appendChild(body);
      list.appendChild(item);
    });

    wrap.appendChild(list);
  }

  // Built once, left alone after that -- re-running this every time the How
  // To tab is opened (same as some of the data-driven Coach Tools tabs do)
  // would wipe out whatever a coach already had expanded.
  window.initCoachToolsHowTo = function () {
    if (built) return;
    built = true;
    buildHowToList();
  };
})();
