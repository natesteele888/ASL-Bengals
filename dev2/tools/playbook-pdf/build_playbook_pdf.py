#!/usr/bin/env python3
"""
Build a ready-to-print sideline playbook PDF for ASL Bengals 11U, replicating
the exact SVG rendering logic from dev2/js/play-calls.js's renderCardDiagram()
and renderSplitDiagram() (same curved red/blue paths, same colors, same
blocking-line styling) with reportlab -- no browser/HTML-to-PDF pipeline is
available in this sandbox.

Nathan: "make sure the playbook is updated to where if I choose to export the
PDF, it will be all the current renders that are live on the site" -- this is
a rewrite of the old dev/tools/playbook-pdf/build_playbook_pdf.py, which had
fallen out of sync: it was still pointed at the OLD dev/ tree (frozen before
Split formation, Boston, the boot removal, or the CB-flash callout existed),
while the live site has been served from dev2/ for a while now. This version:
  - reads shipped constants (formation/backfield/wing/split/splitRoutes/
    viewBox/topPad) from dev2/data/plays.json instead of dev/data/plays.json.
  - deploys the finished PDF to dev2/playbook/ASL_Bengals_Sideline_Playbook.pdf
    -- the exact path dev2/index.html's "Save Sideline Playbook PDF" admin
    link downloads from.
  - adds a whole new SPLIT FORMATION section (run, pass-protection, and a
    route-call reference for Seattle/Houston/Florida/Boston), since Split
    didn't exist at all when the old script was written.

IMPORTANT: play *data* (paths/defense/flags) is still meant to be pulled from
the LIVE Firebase cloud save (playEdits.json + splitRouteEdits.json), not the
shipped repo file -- Firebase always overrides DATA.playTypes/DATA.splitRoutes
entirely when present, so what's actually live on the site reflects whatever
a coach has edited via Edit Plays (e.g. a coach-added "sweep" play type that
exists ONLY in the cloud save, never in the shipped file). This script reads
that live snapshot from live_playtypes.json / live_splitroutes.json (kept
fresh by the asl-bengals-playbook-pdf-sync scheduled task, which fetches
Firebase directly) -- if those files don't exist yet (e.g. running this by
hand for the first time), it falls back to the shipped defaults and prints a
warning, since a coach's live cloud edits won't be reflected until that sync
task has run at least once against dev2.
"""
import json
import math
import os
import sys
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

# All paths are relative to this script's own location (dev2/tools/playbook-pdf/)
# so it works regardless of where the repo is checked out.
HERE = os.path.dirname(os.path.abspath(__file__))
SHIPPED_DATA_PATH = os.path.join(HERE, "..", "..", "data", "plays.json")
LIVE_PLAYTYPES_PATH = os.path.join(HERE, "live_playtypes.json")
LIVE_SPLITROUTES_PATH = os.path.join(HERE, "live_splitroutes.json")
OUT_PATH = os.path.join(HERE, "output", "ASL_Bengals_Sideline_Playbook.pdf")
os.makedirs(os.path.join(HERE, "output"), exist_ok=True)

# Deploy copy: output/ is gitignored (working scratch), but the live app
# serves everything under dev2/, so the coach's in-app "download playbook"
# link needs a committed copy inside dev2/. This is the file that actually
# ships to GitHub Pages.
DEPLOY_PATH = os.path.join(HERE, "..", "..", "playbook", "ASL_Bengals_Sideline_Playbook.pdf")
os.makedirs(os.path.dirname(DEPLOY_PATH), exist_ok=True)

with open(SHIPPED_DATA_PATH) as f:
    SHIPPED = json.load(f)

if os.path.exists(LIVE_PLAYTYPES_PATH):
    with open(LIVE_PLAYTYPES_PATH) as f:
        LIVE_PLAYTYPES = json.load(f)
else:
    print("WARNING: no live_playtypes.json snapshot found -- falling back to "
          "shipped dev2/data/plays.json playTypes. Any plays a coach has "
          "edited (or added, e.g. a cloud-only 'sweep' play) via Edit Plays "
          "and saved to Firebase will NOT be reflected until the "
          "asl-bengals-playbook-pdf-sync scheduled task has fetched them.",
          file=sys.stderr)
    LIVE_PLAYTYPES = SHIPPED["playTypes"]

if os.path.exists(LIVE_SPLITROUTES_PATH):
    with open(LIVE_SPLITROUTES_PATH) as f:
        LIVE_SPLITROUTES = json.load(f)
else:
    print("WARNING: no live_splitroutes.json snapshot found -- falling back "
          "to shipped dev2/data/plays.json splitRoutes.", file=sys.stderr)
    LIVE_SPLITROUTES = SHIPPED["splitRoutes"]

FORMATION = SHIPPED["formation"]
BACKFIELD = SHIPPED["backfield"]
WING = SHIPPED["wing"]
SPLIT_POS = SHIPPED["split"]
VW, VH = SHIPPED["viewBox"]
TOPPAD = SHIPPED["topPad"]

# Nathan: "boot was added as a play call. needs to be removed -- its just an
# add on option for other plays." Same unconditional strip normalizePlayData
# does in play-calls.js, applied here too in case a stale cloud snapshot
# (fetched before that removal) still has one.
LIVE_PLAYTYPES = [p for p in LIVE_PLAYTYPES if p.get("key") != "boot"]
PLAY_TYPES = {p["key"]: p for p in LIVE_PLAYTYPES}

# ---------------------------------------------------------------------------
# Replicate the app's normalizePlayData() flag-graft: these capability flags
# are code-level decisions, not coach data, so the app always force-
# overwrites a cloud copy with the shipped value regardless of what's in
# Firebase (protects against a coach's save predating a flag being added).
# Only applies to play keys the shipped file actually knows about -- a
# cloud-only play like a coach-added "sweep" keeps whatever it has, same as
# the app's own normalizePlayData does (it only grafts onto matching keys).
# ---------------------------------------------------------------------------
SHIPPED_FLAG_KEYS = ["noBoot", "hasReadToggle", "hasInsideOutside", "directionFixed"]
SHIPPED_PLAY_FLAGS = {p["key"]: {k: p.get(k) for k in SHIPPED_FLAG_KEYS} for p in SHIPPED["playTypes"]}
for key, pt in PLAY_TYPES.items():
    if key in SHIPPED_PLAY_FLAGS:
        pt.update(SHIPPED_PLAY_FLAGS[key])

# Same additive-only merge repairStaleSplitRoutes() does: fill in any route-
# call key missing from the live snapshot with the shipped shape, without
# touching anything actually present (a coach's real edits win).
def repair_split_routes(live):
    shipped = SHIPPED["splitRoutes"]
    out = json.loads(json.dumps(live)) if live else {}
    for side in ("Left", "Right"):
        out.setdefault(side, {})
        shipped_side = shipped.get(side, {})
        for slot in ("wide", "flex"):
            out[side].setdefault(slot, {})
            shipped_slot = shipped_side.get(slot, {})
            out[side][slot].setdefault("player", shipped_slot.get("player"))
            for call, pts in shipped_slot.items():
                if call == "player":
                    continue
                if call not in out[side][slot]:
                    out[side][slot][call] = pts
    return out


SPLIT_ROUTES = repair_split_routes(LIVE_SPLITROUTES)

BALL_COLOR = "#e0201a"
NOBALL_COLOR = "#123a8c"
BLOCK_COLOR = "#e8720c"
DEFENSE_COLOR = "#1a3fae"
READKEY_COLOR = "#e0201a"

# ---- Section (play family) order/colors -- driven by what's actually live ----
FAMILY_META = [
    ("inside_zone", "#1f6f43"),
    ("outside_zone", "#2a5d8f"),
    ("option", "#8a3b12"),
    ("blast", "#5b3a8a"),
    ("double_blast", "#8a2e5c"),
    ("option_pass", "#b8860b"),
    ("sweep", "#0e7c7b"),
]
FAMILIES = [(key, PLAY_TYPES[key]["label"], color) for key, color in FAMILY_META if key in PLAY_TYPES]

# ---------------------------------------------------------------------------
# Sweep only exists as coach-edited cloud data (no shipped "sweep" playType),
# and historically got cloned from Double Blast with an "Inside" variant that
# doesn't match real sweep action -- see the old script's note. Kept as a
# defensive print-only override in case that's still true; harmless no-op if
# the live "sweep" data doesn't have an "Inside" variant at all.
# ---------------------------------------------------------------------------
FORCE_SINGLE_VARIANT = {"sweep": "Outside"}


def hexcolor(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def get_variant(play_type, direction, inside_outside=None, read_position=None):
    v = play_type["directions"][direction]
    if play_type.get("hasInsideOutside"):
        v = v[inside_outside or "Outside"]
    if play_type.get("hasReadToggle"):
        v = v[read_position or "A"]
    return v


def opposite(side):
    return "Right" if side == "Left" else "Left"


def resolve_points(p, direction, wing_side, motion_on):
    p4_side = opposite(wing_side) if motion_on else wing_side
    p4_anchor = WING[p4_side]

    if p.get("optionLine"):
        return p["points"], True

    if p.get("dualSideBlock"):
        same_side = p4_side == direction
        base_key = "sameSidePoints" if same_side else "crossPoints"
        field_key = base_key + "4x4"
        pts = p.get(field_key) or p.get(base_key) or p["points"]
        return pts, False

    if p.get("player") == 4 and not p.get("optionLine"):
        if p.get("wingSeamRelative"):
            same_side = p4_side == direction
            offsets = p["sameSideOffsets"] if same_side else p["crossOffsets"]
            sign = 1 if p4_side == "Left" else -1
            pts = [[p4_anchor[0] + sign * dx, p4_anchor[1] + dy] for dx, dy in offsets]
            return pts, False
        elif p.get("blockRelative"):
            same_side = p4_side == direction
            base_key = "sameSidePoints" if same_side else "crossPoints"
            field_key = base_key + "4x4"
            src = p.get(field_key) or p.get(base_key) or p["points"]
            dx, dy = src[1]
            sign = 1 if p4_side == "Left" else -1
            pts = [list(p4_anchor), [p4_anchor[0] + sign * dx, p4_anchor[1] + dy]]
            return pts, False
        else:
            pts = [list(p4_anchor)] + [list(pt) for pt in p["points"][1:]]
            return pts, False

    pts = p["points4x4"] if (p.get("isBlocking") and p.get("points4x4")) else p["points"]
    return pts, False


def quad_to_cubic(p0, p1, p2):
    c1 = (p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1]))
    c2 = (p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1]))
    return c1, c2


def draw_path_shape(c, pts_canvas, line_then_curve, color, width, dashed, draw_arrow, tangent_dir):
    c.setStrokeColor(hexcolor(color))
    c.setLineWidth(max(0.6, width))
    c.setLineCap(1)
    c.setDash(3, 2.6) if dashed else c.setDash()

    path = c.beginPath()
    n = len(pts_canvas)
    path.moveTo(*pts_canvas[0])
    if n == 2:
        path.lineTo(*pts_canvas[1])
    elif line_then_curve and n == 4:
        path.lineTo(*pts_canvas[1])
        c1, c2 = quad_to_cubic(pts_canvas[1], pts_canvas[2], pts_canvas[3])
        path.curveTo(c1[0], c1[1], c2[0], c2[1], *pts_canvas[3])
    elif n == 5:
        c1, c2 = quad_to_cubic(pts_canvas[0], pts_canvas[1], pts_canvas[2])
        path.curveTo(c1[0], c1[1], c2[0], c2[1], *pts_canvas[2])
        c3, c4 = quad_to_cubic(pts_canvas[2], pts_canvas[3], pts_canvas[4])
        path.curveTo(c3[0], c3[1], c4[0], c4[1], *pts_canvas[4])
    else:
        c1, c2 = quad_to_cubic(pts_canvas[0], pts_canvas[1], pts_canvas[2])
        path.curveTo(c1[0], c1[1], c2[0], c2[1], *pts_canvas[2])
    c.drawPath(path, stroke=1, fill=0)
    c.setDash()

    if draw_arrow:
        end = pts_canvas[-1]
        ang = math.atan2(tangent_dir[1], tangent_dir[0])
        ARROW_LEN, ARROW_HALF_W = 5.4, 2.5
        tip = (end[0] + ARROW_LEN * math.cos(ang), end[1] + ARROW_LEN * math.sin(ang))
        back = (end[0] - 1.2 * math.cos(ang), end[1] - 1.2 * math.sin(ang))
        perp = (-math.sin(ang), math.cos(ang))
        w1 = (back[0] + ARROW_HALF_W * perp[0], back[1] + ARROW_HALF_W * perp[1])
        w2 = (back[0] - ARROW_HALF_W * perp[0], back[1] - ARROW_HALF_W * perp[1])
        c.setFillColor(hexcolor(color))
        ap = c.beginPath()
        ap.moveTo(*w1); ap.lineTo(*tip); ap.lineTo(*w2); ap.close()
        c.drawPath(ap, stroke=0, fill=1)


def tangent_for(pts, line_then_curve):
    n = len(pts)
    if n == 2:
        return (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    if line_then_curve and n == 4:
        return (pts[3][0] - pts[2][0], pts[3][1] - pts[2][1])
    if n == 5:
        return (pts[4][0] - pts[3][0], pts[4][1] - pts[3][1])
    return (pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])


CIRCLE_R_PT = 6.6
OL_CIRCLE_R_PT = 6.0


def draw_circle(c, cx, cy, label, stroke_hex, r, fontsize):
    c.setLineWidth(1.1)
    c.setStrokeColor(hexcolor(stroke_hex))
    c.setFillColor((1, 1, 1))
    c.circle(cx, cy, r, stroke=1, fill=1)
    c.setFillColor(hexcolor(stroke_hex))
    c.setFont("Helvetica-Bold", fontsize)
    tw = stringWidth(label, "Helvetica-Bold", fontsize)
    c.drawString(cx - tw / 2, cy - fontsize * 0.36, label)


def draw_diagram(c, x0, y0, w, h, play_type, direction, inside_outside, read_position, boot_on, motion_on):
    variant = get_variant(play_type, direction, inside_outside, read_position)
    scale = w / VW
    wing_side = direction

    def tx(pt):
        x = pt[0]
        y = pt[1] + TOPPAD
        return (x0 + x * scale, y0 + h - y * scale)

    c.setStrokeColor((0.8, 0.8, 0.8))
    c.setLineWidth(0.6)
    c.rect(x0, y0, w, h, stroke=1, fill=0)

    defense = variant.get("defense4x4") or variant.get("defense") or []
    read_key_id = variant.get("readKeyId")
    for d in defense:
        cx, cy = tx(d["pos"])
        stroke = READKEY_COLOR if (read_key_id and d["id"] == read_key_id) else DEFENSE_COLOR
        draw_circle(c, cx, cy, d["label"], stroke, CIRCLE_R_PT, 5.8)

    for k in ["5", "LT", "LG", "C", "RG", "RT", "6"]:
        cx, cy = tx(FORMATION[k])
        r = CIRCLE_R_PT if k in ("5", "6") else OL_CIRCLE_R_PT
        fs = 6.1 if k in ("5", "6") else 5.0
        draw_circle(c, cx, cy, k, "#111111", r, fs)

    p4_side = opposite(wing_side) if motion_on else wing_side
    p4_anchor = WING[p4_side]
    if motion_on:
        wing_from = WING[wing_side]
        mid_raw = [(wing_from[0] + p4_anchor[0]) / 2, max(wing_from[1], p4_anchor[1]) + 90]
        p0 = tx(wing_from)
        p1 = tx(mid_raw)
        p2 = tx(p4_anchor)
        c.setStrokeColor((0.15, 0.15, 0.15))
        c.setLineWidth(1.0)
        c.setDash(2, 4.5)
        mpath = c.beginPath()
        mpath.moveTo(*p0)
        c1, c2 = quad_to_cubic(p0, p1, p2)
        mpath.curveTo(c1[0], c1[1], c2[0], c2[1], *p2)
        c.drawPath(mpath, stroke=1, fill=0)
        c.setDash()
    wx, wy = tx(p4_anchor)
    draw_circle(c, wx, wy, "4", "#111111", CIRCLE_R_PT, 6.1)

    for num in ["3", "1", "2"]:
        cx, cy = tx(BACKFIELD[num])
        draw_circle(c, cx, cy, num, "#111111", CIRCLE_R_PT, 6.1)

    real_ball_path = None
    qb_path = None
    if boot_on:
        for p in variant.get("paths", []):
            if p.get("ball") and not p.get("optionLine"):
                real_ball_path = p
            if p.get("player") == 1 and not p.get("optionLine") and not p.get("ball"):
                qb_path = p

    for p in variant.get("paths", []):
        pts, is_option_line = resolve_points(p, direction, wing_side, motion_on)
        pts_canvas = [tx(pt) for pt in pts]
        if is_option_line:
            draw_path_shape(c, pts_canvas, False, "#555555", 1.1, True, False, (0, 0))
            continue
        effective_ball = p.get("ball", False)
        if boot_on and real_ball_path is not None and qb_path is not None:
            if p is real_ball_path:
                effective_ball = False
            elif p is qb_path:
                effective_ball = True
        color = BLOCK_COLOR if p.get("isBlocking") else (BALL_COLOR if effective_ball else NOBALL_COLOR)
        width = 0.9 if p.get("isBlocking") else 1.5
        fake = bool(p.get("fake"))
        line_then_curve = bool(p.get("lineThenCurve"))
        tangent = tangent_for(pts, line_then_curve)
        tangent_canvas = (tangent[0], -tangent[1])
        draw_path_shape(c, pts_canvas, line_then_curve, color, width, fake, not fake, tangent_canvas)


# ---------------------------------------------------------------------------
# SPLIT formation -- new. Replicates getSplitBlockingPaths /
# getSplitPassProtectionPaths / getSplitRoutePaths / getSplitDefense /
# renderSplitDiagram from dev2/js/play-calls.js.
# ---------------------------------------------------------------------------
def get_split_defense():
    return [
        {"id": "DE_L", "label": "DE", "pos": [436, 110]},
        {"id": "DT_L", "label": "DT", "pos": [662, 110]},
        {"id": "DT_R", "label": "DT", "pos": [949, 110]},
        {"id": "DE_R", "label": "DE", "pos": [1183, 110]},
        {"id": "LB1", "label": "LB", "pos": [500, -20]},
        {"id": "LB2", "label": "LB", "pos": [700, -20]},
        {"id": "LB3", "label": "LB", "pos": [900, -20]},
        {"id": "LB4", "label": "LB", "pos": [1100, -20]},
        {"id": "CB_L", "label": "CB", "pos": [150, 90]},
        {"id": "CB_R", "label": "CB", "pos": [1460, 90]},
        {"id": "FS", "label": "S", "pos": [805, -190]},
    ]


def get_split_blocking_paths(play_type, split_side, inside_outside, read_position):
    variant = get_variant(play_type, split_side, inside_outside, read_position)
    wide_num = 6 if split_side == "Right" else 5
    flex_back_num = 2 if split_side == "Right" else 3
    excluded = {wide_num, flex_back_num, 4}
    out = []
    for p in variant.get("paths", []):
        if p.get("optionLine") or p.get("dualSideBlock"):
            continue
        if p.get("player") is None or p.get("player") not in excluded:
            out.append(p)
    return out


def get_split_pass_protection_paths(play_type, split_side, inside_outside, read_position):
    pos = SPLIT_POS[split_side]
    tight_num = "5" if split_side == "Right" else "6"
    companion_num = "3" if split_side == "Right" else "2"
    paths = []

    for k in ["LT", "LG", "C", "RG", "RT"]:
        x, y = FORMATION[k]
        paths.append({"id": k, "isBlocking": True, "width": 7, "points": [[x, y], [x, y + 22]]})

    tx_, ty_ = pos[tight_num]
    paths.append({"player": int(tight_num), "isBlocking": True, "width": 7, "points": [[tx_, ty_], [tx_, ty_ + 22]]})

    cx_, _cy = pos[companion_num]
    variant = get_variant(play_type, split_side, inside_outside, read_position) if play_type else None
    real_ball_path = None
    if variant:
        for p in variant.get("paths", []):
            if p.get("player") == int(companion_num) and p.get("ball") and not p.get("optionLine"):
                real_ball_path = p
                break
    if real_ball_path:
        paths.append({"player": int(companion_num), "ball": False, "fake": True, "width": 9, "points": real_ball_path["points"]})

    qx, qy = pos["1"]
    mesh_sign = 1 if cx_ >= qx else -1
    fake_mesh_spot = [qx + mesh_sign * 40, qy - 15]
    paths.append({"player": 1, "ball": False, "fake": True, "width": 9, "points": [[qx, qy], fake_mesh_spot]})
    drop_spot = [qx, qy + 35]
    paths.append({"player": 1, "ball": True, "width": 9, "points": [fake_mesh_spot, drop_spot]})

    return paths


def reanchor_route(points, new_anchor):
    ax, ay = points[0]
    out = []
    for x, y in points:
        out.append([
            max(20, min(VW - 20, x - ax + new_anchor[0])),
            max(-390, min(600, y - ay + new_anchor[1])),
        ])
    return out


def get_split_route_paths(split_side, left_call, right_call):
    routes = SPLIT_ROUTES
    out = []
    side_data = routes.get(split_side, {})
    side_call = right_call if split_side == "Right" else left_call
    wide = side_data.get("wide")
    if wide and side_call in wide:
        out.append({"points": wide[side_call], "player": wide.get("player"), "width": 7})
    flex = side_data.get("flex")
    if flex and side_call in flex:
        out.append({"points": flex[side_call], "player": flex.get("player"), "width": 7})

    opposite_side = "Left" if split_side == "Right" else "Right"
    opposite_call = left_call if split_side == "Right" else right_call
    opposite_flex = routes.get(opposite_side, {}).get("flex")
    four_pos = SPLIT_POS.get(split_side, {}).get("4")
    if opposite_flex and opposite_call in opposite_flex and four_pos:
        out.append({"points": reanchor_route(opposite_flex[opposite_call], four_pos), "player": 4, "width": 7})
    return out


def draw_split_diagram(c, x0, y0, w, h, play_type, split_side, inside_outside, read_position,
                        pass_on, left_call, right_call):
    scale = w / VW
    pos = SPLIT_POS[split_side]

    def tx(pt):
        x = pt[0]
        y = pt[1] + TOPPAD
        return (x0 + x * scale, y0 + h - y * scale)

    c.setStrokeColor((0.8, 0.8, 0.8))
    c.setLineWidth(0.6)
    c.rect(x0, y0, w, h, stroke=1, fill=0)

    for d in get_split_defense():
        cx, cy = tx(d["pos"])
        draw_circle(c, cx, cy, d["label"], DEFENSE_COLOR, CIRCLE_R_PT, 5.8)

    for k in ["LT", "LG", "C", "RG", "RT"]:
        cx, cy = tx(FORMATION[k])
        draw_circle(c, cx, cy, k, "#111111", OL_CIRCLE_R_PT, 5.0)

    for num in ["5", "6", "3", "4", "1", "2"]:
        cx, cy = tx(pos[num])
        draw_circle(c, cx, cy, num, "#111111", CIRCLE_R_PT, 6.1)

    def draw_p(p):
        pts = p["points"]
        pts_canvas = [tx(pt) for pt in pts]
        color = BLOCK_COLOR if p.get("isBlocking") else (BALL_COLOR if p.get("ball") else NOBALL_COLOR)
        # Match draw_diagram's (Shotgun) print-scale widths, not the raw SVG
        # user-unit p['width'] (7/9) authored for browser rendering -- at
        # 1:1 point scale those would print as huge, circle-covering blobs
        # (this was the actual bug behind the first render: block paths so
        # thick they blotted out the O-line's own letters).
        width = 0.9 if p.get("isBlocking") else 1.5
        fake = bool(p.get("fake"))
        line_then_curve = bool(p.get("lineThenCurve"))
        tangent = tangent_for(pts, line_then_curve)
        tangent_canvas = (tangent[0], -tangent[1])
        draw_path_shape(c, pts_canvas, line_then_curve, color, width, fake, not fake, tangent_canvas)

    if play_type is not None:
        if pass_on:
            for p in get_split_pass_protection_paths(play_type, split_side, inside_outside, read_position):
                draw_p(p)
        else:
            for p in get_split_blocking_paths(play_type, split_side, inside_outside, read_position):
                draw_p(p)
    for p in get_split_route_paths(split_side, left_call, right_call):
        draw_p(p)


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = landscape(letter)
MARGIN = 22
COLS = 4
CELL_GAP = 6
CELL_W = 180
CELL_H = CELL_W * (VH / VW)
LABEL_H = 12
ROW_H = LABEL_H + CELL_H
SECTION_HEADER_H = 14
SECTION_GAP = 5
ROW_GAP = 3
TITLE_H = 34

USABLE_W = PAGE_W - 2 * MARGIN
GRID_W = COLS * CELL_W + (COLS - 1) * CELL_GAP
GRID_X0 = MARGIN + (USABLE_W - GRID_W) / 2


def default_subvariant(play_type):
    forced = FORCE_SINGLE_VARIANT.get(play_type["key"])
    io = forced or ("Outside" if play_type.get("hasInsideOutside") else None)
    rp = "A" if play_type.get("hasReadToggle") else None
    return io, rp


def variant_list(play_type):
    """Yields (direction, io, rp, boot_on, motion_on, sublabel) tuples."""
    has_read = play_type.get("hasReadToggle")
    forced_io = FORCE_SINGLE_VARIANT.get(play_type["key"])
    has_io = play_type.get("hasInsideOutside") and not forced_io
    no_boot = bool(play_type.get("noBoot"))

    for direction in ["Left", "Right"]:
        if has_read:
            for rp, rlabel in [("A", "Read A"), ("B", "Read B")]:
                yield direction, None, rp, False, False, f"{direction} • {rlabel}"
        elif has_io:
            for io in ["Inside", "Outside"]:
                yield direction, io, None, False, False, f"{direction} • {io}"
        elif forced_io:
            yield direction, forced_io, None, False, False, direction
        else:
            yield direction, None, None, False, False, direction

    def_io, def_rp = default_subvariant(play_type)
    if not no_boot:
        for direction in ["Left", "Right"]:
            yield direction, def_io, def_rp, True, False, f"{direction} • Boot"
    for direction in ["Left", "Right"]:
        yield direction, def_io, def_rp, False, True, f"{direction} • Motion"


def split_variant_list():
    """Yields (kind, play_key, split_side, io, rp, pass_on, left_call,
    right_call, sublabel) tuples for the whole SPLIT section."""
    for split_side in ["Left", "Right"]:
        for key, label, _color in FAMILIES:
            play_type = PLAY_TYPES[key]
            io, rp = default_subvariant(play_type)
            yield ("run", key, split_side, io, rp, False, "seattle", "seattle", f"{label} • Split {split_side}")
    for split_side in ["Left", "Right"]:
        for key, label, _color in FAMILIES:
            play_type = PLAY_TYPES[key]
            io, rp = default_subvariant(play_type)
            yield ("pass", key, split_side, io, rp, True, "seattle", "seattle", f"{label} • Pass • Split {split_side}")
    call_labels = {"seattle": "Seattle", "houston": "Houston", "florida": "Florida", "boston": "Boston"}
    for split_side in ["Left", "Right"]:
        for call in ["seattle", "houston", "florida", "boston"]:
            yield ("routes", None, split_side, None, None, False, call, call, f"{call_labels[call]} • Split {split_side}")


def new_page(c):
    c.setFillColor((1, 1, 1))
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    return PAGE_H - MARGIN


def draw_section_header(c, y_cursor, label, color):
    bar_y = y_cursor - SECTION_HEADER_H
    c.setFillColor(hexcolor(color))
    c.rect(MARGIN, bar_y + 2, USABLE_W, SECTION_HEADER_H - 3, stroke=0, fill=1)
    c.setFillColor((1, 1, 1))
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(MARGIN + 6, bar_y + 4.2, label.upper())
    return y_cursor - SECTION_HEADER_H


c = canvas.Canvas(OUT_PATH, pagesize=(PAGE_W, PAGE_H))
y_cursor = new_page(c)

for fam_key, fam_label, fam_color in FAMILIES:
    play_type = PLAY_TYPES[fam_key]
    variants = list(variant_list(play_type))
    rows = [variants[i:i + COLS] for i in range(0, len(variants), COLS)]
    section_h = SECTION_HEADER_H + len(rows) * ROW_H + (len(rows) - 1) * ROW_GAP

    if y_cursor - section_h < MARGIN:
        c.showPage()
        y_cursor = new_page(c)

    y_cursor = draw_section_header(c, y_cursor, fam_label, fam_color)

    for row in rows:
        row_top = y_cursor
        diagram_y0 = row_top - LABEL_H - CELL_H
        for i, (direction, io, rp, boot_on, motion_on, sublabel) in enumerate(row):
            cell_x0 = GRID_X0 + i * (CELL_W + CELL_GAP)
            c.setFont("Helvetica-Bold", 7.4)
            c.setFillColor(hexcolor(fam_color))
            tw = stringWidth(sublabel, "Helvetica-Bold", 7.4)
            c.drawString(cell_x0 + (CELL_W - tw) / 2, row_top - LABEL_H + 1.5, sublabel)
            draw_diagram(c, cell_x0, diagram_y0, CELL_W, CELL_H, play_type, direction, io, rp, boot_on, motion_on)
        y_cursor = diagram_y0 - ROW_GAP

    y_cursor -= SECTION_GAP

# ---- SPLIT FORMATION section -- new ----
SPLIT_COLOR = "#1a6b6b"
split_variants = list(split_variant_list())
split_rows = [split_variants[i:i + COLS] for i in range(0, len(split_variants), COLS)]
split_section_h = SECTION_HEADER_H + len(split_rows) * ROW_H + (len(split_rows) - 1) * ROW_GAP
if y_cursor - (SECTION_HEADER_H + ROW_H) < MARGIN:
    c.showPage()
    y_cursor = new_page(c)
y_cursor = draw_section_header(c, y_cursor, "Split Formation", SPLIT_COLOR)

for row in split_rows:
    if y_cursor - ROW_H < MARGIN:
        c.showPage()
        y_cursor = new_page(c)
        y_cursor = draw_section_header(c, y_cursor, "Split Formation (cont.)", SPLIT_COLOR)
    row_top = y_cursor
    diagram_y0 = row_top - LABEL_H - CELL_H
    for i, (kind, play_key, split_side, io, rp, pass_on, left_call, right_call, sublabel) in enumerate(row):
        cell_x0 = GRID_X0 + i * (CELL_W + CELL_GAP)
        c.setFont("Helvetica-Bold", 7.4)
        c.setFillColor(hexcolor(SPLIT_COLOR))
        tw = stringWidth(sublabel, "Helvetica-Bold", 7.4)
        c.drawString(cell_x0 + (CELL_W - tw) / 2, row_top - LABEL_H + 1.5, sublabel)
        play_type = PLAY_TYPES.get(play_key) if play_key else None
        draw_split_diagram(c, cell_x0, diagram_y0, CELL_W, CELL_H, play_type, split_side, io, rp,
                            pass_on, left_call, right_call)
    y_cursor = diagram_y0 - ROW_GAP

c.showPage()
c.save()
print("done ->", OUT_PATH)

import shutil
shutil.copyfile(OUT_PATH, DEPLOY_PATH)
print("deployed ->", DEPLOY_PATH)
