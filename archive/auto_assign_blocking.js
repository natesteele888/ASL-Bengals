// Regenerates every lineman's blocking assignment to their closest
// available (unclaimed) defender in the 4x4 front, one blocker per
// defender. Only touches isBlocking, non-blockRelative paths (the O-line +
// #5/#6 blockers using points4x4) -- #4's block-relative pass-pro/chip
// logic is a different mechanism and is left untouched.
//
// Mirrors the app's own assignBlockerToDefender() math exactly: end point
// = start + 0.9 * (defenderPos - start), same 90%-of-the-way convention
// already used for manual assignments in the editor.
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node auto_assign_blocking.js <path-to-plays.json>'); process.exit(1); }

const DATA = JSON.parse(fs.readFileSync(path, 'utf8'));
const FRAC = 0.9;
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

let changed = 0, variantsProcessed = 0;

DATA.playTypes.forEach(pt => {
  Object.entries(pt.directions || {}).forEach(([dirName, dirVal]) => {
    const variants = dirVal.paths ? [dirVal] : Object.values(dirVal);
    variants.forEach(variant => {
      if (!variant) return;
      variantsProcessed++;
      const defenders = variant.defense4x4 || [];
      const blockers = (variant.paths || []).filter(p => p.isBlocking && !p.blockRelative);
      if (!blockers.length || !defenders.length) return;

      // every possible (blocker, defender) pair with its distance, using
      // each blocker's actual current start point (their position on the
      // line -- that doesn't change, only who they're aimed at)
      const pairs = [];
      blockers.forEach((p, bi) => {
        const start = (p.points4x4 && p.points4x4[0]) || (p.points && p.points[0]);
        if (!start) return;
        defenders.forEach((d, di) => {
          pairs.push({ bi, di, d: dist(start, d.pos), start });
        });
      });
      pairs.sort((a, b) => a.d - b.d);

      const claimedBlockers = new Set();
      const claimedDefenders = new Set();
      pairs.forEach(({ bi, di, start }) => {
        if (claimedBlockers.has(bi) || claimedDefenders.has(di)) return;
        claimedBlockers.add(bi);
        claimedDefenders.add(di);
        const target = defenders[di].pos;
        const newEnd = [start[0] + FRAC * (target[0] - start[0]), start[1] + FRAC * (target[1] - start[1])];
        const p = blockers[bi];
        p.points4x4 = [start.slice(), newEnd];
        changed++;
      });
    });
  });
});

fs.writeFileSync(path, JSON.stringify(DATA, null, 2));
console.log(`Processed ${variantsProcessed} variants, reassigned ${changed} blocking paths.`);
