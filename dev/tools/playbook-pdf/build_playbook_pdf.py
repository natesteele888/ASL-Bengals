#!/usr/bin/env python3
"""
Build a ready-to-print sideline playbook PDF for ASL Bengals 11U, replicating
the exact SVG rendering logic from dev/js/play-calls.js's renderCardDiagram()
(same curved red/blue paths, same colors, same blocking-line styling) with
reportlab -- no browser/HTML-to-PDF pipeline is available in this sandbox.

IMPORTANT: play *data* (paths/defense/flags) is pulled from the LIVE Firebase
cloud save (playEdits.json), not the shipped repo file -- Firebase always
overrides DATA.playTypes entirely when present, so what's actually live on
the site reflects whatever a coach has edited via Edit Plays, which can (and
currently does) differ substantially from dev/data/plays.json. Only the
formation/backfield/wing/viewBox/topPad constants (never stored in
playEdits.json) come from the shipped file.

Adds explicit Boot-on and Motion-on example diagrams alongside each play's
base calls, matching the toggles coaches actually use on the sideline.
"""
import json
import math
import os
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

# All paths are relative to this script's own location (dev/tools/playbook-pdf/)
# so it works regardless of where the repo is checked out.
HERE = os.path.dirname(os.path.abspath(__file__))
SHIPPED_DATA_PATH = os.path.join(HERE, "..", "..", "data", "plays.json")
LIVE_PLAYTYPES_PATH = os.path.join(HERE, "live_playtypes.json")
OUT_PATH = os.path.join(HERE, "output", "ASL_Bengals_Sideline_Playbook.pdf")
os.makedirs(os.path.join(HERE, "output"), exist_ok=True)

with open(SHIPPED_DATA_PATH) as f:
    SHIPPED = json.load(f)
with open(LIVE_PLAYTYPES_PATH) as f:
    LIVE_PLAYTYPES = json.load(f)

FORMATION = SHIPPED["formation"]
BACKFIELD = SHIPPED["backfield"]
WING = SHIPPED["wing"]
VW, VH = SHIPPED["viewBox"]
TOPPAD = SHIPPED["topPad"]
PLAY_TYPES = {p["key"]: p for p in LIVE_PLAYTYPES}

# ---------------------------------------------------------------------------
# Replicate the app's normalizePlayData() flag-graft: these 4 capability
# flags are code-level decisions, not coach data, so the app always
# force-overwrites a cloud copy with the shipped value regardless of what's
# in Firebase (this is exactly how it protects against a coach's save
# predating a flag being added -- e.g. this live "option_pass" cloud copy is
# missing noBoot entirely, which would incorrectly show a Boot toggle for it
# without this graft).
# ---------------------------------------------------------------------------
SHIPPED_FLAG_KEYS = ["noBoot", "hasReadToggle", "hasInsideOutside", "directionFixed"]
SHIPPED_PLAY_FLAGS = {p["key"]: {k: p.get(k) for k in SHIPPED_FLAG_KEYS} for p in SHIPPED["playTypes"]}
for key, pt in PLAY_TYPES.items():
    if key in SHIPPED_PLAY_FLAGS:
        pt.update(SHIPPED_PLAY_FLAGS[key])

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
        # Bow the motion indicator down into the backfield (away from the
        # LOS/tackle row) instead of a straight line at wing depth, which
        # visually crossed right through the O-line circles.
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
    io = "Outside" if play_type.get("hasInsideOutside") else None
    rp = "A" if play_type.get("hasReadToggle") else None
    return io, rp


def variant_list(play_type):
    """Yields (direction, io, rp, boot_on, motion_on, sublabel) tuples."""
    has_read = play_type.get("hasReadToggle")
    has_io = play_type.get("hasInsideOutside")
    no_boot = bool(play_type.get("noBoot"))

    # base calls
    for direction in ["Left", "Right"]:
        if has_read:
            for rp, rlabel in [("A", "Read A"), ("B", "Read B")]:
                yield direction, None, rp, False, False, f"{direction} • {rlabel}"
        elif has_io:
            for io in ["Inside", "Outside"]:
                yield direction, io, None, False, False, f"{direction} • {io}"
        else:
            yield direction, None, None, False, False, direction

    def_io, def_rp = default_subvariant(play_type)
    # Boot example (only for plays where the Boot toggle is actually shown)
    if not no_boot:
        for direction in ["Left", "Right"]:
            yield direction, def_io, def_rp, True, False, f"{direction} • Boot"
    # Motion example (universal -- every play has a #4)
    for direction in ["Left", "Right"]:
        yield direction, def_io, def_rp, False, True, f"{direction} • Motion"


def draw_legend(c, x, y):
    c.setFont("Helvetica", 6.6)
    items = [
        (BALL_COLOR, "Ball carrier"),
        (NOBALL_COLOR, "Other back / route"),
        (BLOCK_COLOR, "Blocking assignment"),
        ("#555555", "Option read (dashed)"),
    ]
    cx = x
    for color, label in items:
        c.setFillColor(hexcolor(color))
        c.rect(cx, y - 4.2, 8, 5.5, stroke=0, fill=1)
        c.setFillColor((0.15, 0.15, 0.15))
        c.drawString(cx + 11, y - 3.2, label)
        cx += 11 + stringWidth(label, "Helvetica", 6.6) + 14
    c.setFillColor((0.15, 0.15, 0.15))
    c.drawString(cx, y - 3.2, "- - - fake/decoy    ··· dotted line = Motion move")


def new_page(c):
    c.setFillColor((1, 1, 1))
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    return PAGE_H - MARGIN


c = canvas.Canvas(OUT_PATH, pagesize=(PAGE_W, PAGE_H))
y_cursor = new_page(c)

c.setFillColor((0.1, 0.1, 0.1))
c.setFont("Helvetica-Bold", 14)
c.drawString(MARGIN, y_cursor - 11, "ASL Bengals 11U — Sideline Play Call Reference (live data)")
c.setFont("Helvetica", 6.8)
c.setFillColor((0.35, 0.35, 0.35))
c.drawString(MARGIN, y_cursor - 20, "4x4 front shown · base call, plus Boot/Motion examples where applicable")
draw_legend(c, MARGIN, y_cursor - 29)
y_cursor -= TITLE_H

for fam_key, fam_label, fam_color in FAMILIES:
    play_type = PLAY_TYPES[fam_key]
    variants = list(variant_list(play_type))
    rows = [variants[i:i + COLS] for i in range(0, len(variants), COLS)]
    section_h = SECTION_HEADER_H + len(rows) * ROW_H + (len(rows) - 1) * ROW_GAP

    if y_cursor - section_h < MARGIN:
        c.showPage()
        y_cursor = new_page(c)

    bar_y = y_cursor - SECTION_HEADER_H
    c.setFillColor(hexcolor(fam_color))
    c.rect(MARGIN, bar_y + 2, USABLE_W, SECTION_HEADER_H - 3, stroke=0, fill=1)
    c.setFillColor((1, 1, 1))
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(MARGIN + 6, bar_y + 4.2, fam_label.upper())
    y_cursor -= SECTION_HEADER_H

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

c.showPage()
c.save()
print("done ->", OUT_PATH)
