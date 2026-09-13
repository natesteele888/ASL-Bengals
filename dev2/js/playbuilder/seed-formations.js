// ============================================================
// Play Builder v2 -- starter Formation/DefenseLook presets.
//
// Pulled directly from dev2's existing global constants (js/shipped-
// defaults.js's formation/backfield/wing/split), so the new editor starts
// from the exact same field you already trust, not reinvented numbers.
// These are seed data for a first save, not hardcoded forever -- once
// saved to Firestore/RTDB a coach edits them like any other formation.
// ============================================================

const SHOTGUN_FORMATION = {
  id: 'shotgun',
  label: 'Shotgun',
  type: 'shotgun',
  wingPositionIds: [4],
  positions: [
    { id: 'LT', label: 'LT', x: 577, y: 204 },
    { id: 'LG', label: 'LG', x: 692, y: 204 },
    { id: 'C', label: 'C', x: 806, y: 204 },
    { id: 'RG', label: 'RG', x: 921, y: 204 },
    { id: 'RT', label: 'RT', x: 1035, y: 204 },
    { id: 5, label: '5', x: 462, y: 204 },
    { id: 6, label: '6', x: 1149, y: 204 },
    { id: 1, label: '1', x: 809, y: 438 },
    { id: 2, label: '2', x: 985, y: 438 },
    { id: 3, label: '3', x: 638, y: 438 },
    // Canonical wing spot -- "right". Mirrored to 360,269 (dev2's existing
    // DATA.wing.Left, near-exact match) when wingSide is 'left'.
    { id: 4, label: '4', x: 1251, y: 269 },
  ],
};

// dev2's existing DATA.split.Right, used as the canonical (wing-right)
// Split formation the same way Shotgun uses DATA.wing.Right.
const SPLIT_FORMATION = {
  id: 'split',
  label: 'Split',
  type: 'split',
  wingPositionIds: [4],
  positions: [
    { id: 'LT', label: 'LT', x: 577, y: 204 },
    { id: 'LG', label: 'LG', x: 692, y: 204 },
    { id: 'C', label: 'C', x: 806, y: 204 },
    { id: 'RG', label: 'RG', x: 921, y: 204 },
    { id: 'RT', label: 'RT', x: 1035, y: 204 },
    { id: 1, label: '1', x: 809, y: 438 },
    { id: 2, label: '2', x: 985, y: 438 },
    { id: 3, label: '3', x: 1364, y: 270 },
    { id: 4, label: '4', x: 428, y: 206 },
    { id: 5, label: '5', x: 1142, y: 203 },
    { id: 6, label: '6', x: 1520, y: 271 },
  ],
};

// dev2's existing defense4x4 array (identical across every current play --
// "4x3 removed as an option... everything is 4x4 now").
const DEFAULT_DEFENSE_LOOK = {
  id: 'base_4x4',
  label: 'Base 4-4',
  positions: [
    { id: 'DE_L', label: 'DE', x: 436, y: 110 },
    { id: 'DT_L', label: 'DT', x: 662, y: 110 },
    { id: 'DT_R', label: 'DT', x: 949, y: 110 },
    { id: 'DE_R', label: 'DE', x: 1183, y: 110 },
    { id: 'LB1', label: 'LB', x: 500, y: -20 },
    { id: 'LB2', label: 'LB', x: 700, y: -20 },
    { id: 'LB3', label: 'LB', x: 900, y: -20 },
    { id: 'LB4', label: 'LB', x: 1100, y: -20 },
    { id: 'CB_L', label: 'CB', x: 150, y: 90 },
    { id: 'CB_R', label: 'CB', x: 1460, y: 90 },
    { id: 'FS', label: 'S', x: 805, y: -190 },
  ],
};

window.PlayBuilderSeeds = {
  formations: [SHOTGUN_FORMATION, SPLIT_FORMATION],
  defenseLooks: [DEFAULT_DEFENSE_LOOK],
  viewBox: [1600, 1030],
  topPad: 400,
};
