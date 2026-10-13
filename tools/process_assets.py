#!/usr/bin/env python3
"""Bereitet die mit OpenArt generierten Rohbilder für das Spiel auf.

Eingabe:  tools/raw/<name>.png        (siehe tools/asset_sources.json)
Ausgabe:  assets/atlas/facade_{color,emis,orm}_{4k,2k}.jpg  + atlas.json
          assets/tex/<name>.jpg       (nahtlose Boden-, Dach- und Laubtexturen)
          assets/ui/keyart.jpg

Fassaden:
- Die Glasscheiben wurden im Prompt als reines Magenta (#FF00FF) angefordert.
  Diese Maske wird durch realistisch gespiegeltes Glas ersetzt und dient
  gleichzeitig als Leuchtmaske für die Fenster bei Nacht.
- Jede Zelle wird so zugeschnitten, dass sie im Spiel ihr Seitenverhältnis
  behält, und an den Rändern nahtlos gemacht (Nachbar-Fassadenfelder).
- Farbvarianten (Putzfarben, Klinker, Glas) entstehen durch Umfärben.

Aufruf:  python3 tools/process_assets.py   (benötigt pillow, numpy, scipy)
Fehlende Rohbilder werden über die URLs in tools/asset_sources.json geladen.
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', 'raw')
OUT = os.path.join(ROOT, 'assets')
CELL = 256
COLS = 16
rng = np.random.default_rng(7)


def download_missing():
    src = json.load(open(os.path.join(ROOT, 'tools', 'asset_sources.json')))
    os.makedirs(RAW, exist_ok=True)
    import urllib.request
    for name, s in src.items():
        if name.startswith('_'):
            continue
        dst = os.path.join(RAW, name + '.png')
        if os.path.exists(dst):
            continue
        print('  lade', name)
        req = urllib.request.Request(s['url'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r, open(dst, 'wb') as f:
            f.write(r.read())


def load(name):
    return np.asarray(Image.open(os.path.join(RAW, name + '.png')).convert('RGB')).astype(np.float32) / 255.0


def save(arr, path, q=88, size=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8))
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(path, quality=q, optimize=True, progressive=True)


def resize(arr, w, h):
    im = Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8))
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def resize_mask(m, w, h):
    im = Image.fromarray(np.clip(m * 255, 0, 255).astype(np.uint8), 'L').resize((w, h), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def magenta_mask(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 0.45) & (b > 0.35) & (g < 0.55 * np.minimum(r, b)) & (np.abs(r - b) < 0.4)
    m = ndimage.binary_opening(m, iterations=1)
    grown = ndimage.binary_dilation(m, iterations=3)
    # only grow into pixels that still carry a magenta tint (anti-aliased edges)
    tint = (np.minimum(r, b) - g) > 0.12
    m = m | (grown & tint)
    return ndimage.gaussian_filter(m.astype(np.float32), 0.7).clip(0, 1)


def make_tileable(a, frac=0.07, ax=True, ay=True):
    """Crop-and-crossfade: blends the tail into the head so the result wraps."""
    if ax:
        W = a.shape[1]; k = max(2, int(W * frac))
        t = np.linspace(0, 1, k, dtype=np.float32)[None, :, None] if a.ndim == 3 else np.linspace(0, 1, k, dtype=np.float32)[None, :]
        head = a[:, :k] * t + a[:, W - k:] * (1 - t)
        a = np.concatenate([head, a[:, k:W - k]], axis=1)
    if ay:
        H = a.shape[0]; k = max(2, int(H * frac))
        t = np.linspace(0, 1, k, dtype=np.float32)[:, None, None] if a.ndim == 3 else np.linspace(0, 1, k, dtype=np.float32)[:, None]
        head = a[:k] * t + a[H - k:] * (1 - t)
        a = np.concatenate([head, a[k:H - k]], axis=0)
    return a


def crop(a, box):
    H, W = a.shape[:2]
    x0, y0, x1, y1 = box
    return a[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]


def centre_box(a, aspect, cx=None, y0=0.0, y1=1.0):
    """box of the given width/height aspect (in pixels) spanning y0..y1 around centre x."""
    H, W = a.shape[:2]
    h = (y1 - y0) * H
    w = min(W, h * aspect)
    if cx is None:
        cx = W / 2
    x0 = max(0, min(W - w, cx - w / 2))
    return (x0 / W, y0, (x0 + w) / W, y1)


def content_cx(a):
    """horizontal centre of anything that differs from the wall at the image border."""
    border = np.concatenate([a[:, :24].reshape(-1, 3), a[:, -24:].reshape(-1, 3)])
    base = np.median(border, axis=0)
    d = np.abs(a - base).sum(axis=2) > 0.18
    d = ndimage.binary_opening(d, iterations=2)
    xs = np.nonzero(d.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2 if len(xs) else a.shape[1] / 2


GLASS_TINTS = {
    'warm': ([0.80, 0.86, 0.90], [0.30, 0.37, 0.44]),
    'blue': ([0.66, 0.80, 0.92], [0.13, 0.25, 0.38]),
    'teal': ([0.66, 0.86, 0.84], [0.10, 0.30, 0.31]),
    'dark': ([0.52, 0.60, 0.70], [0.06, 0.09, 0.14]),
    'silver': ([0.88, 0.92, 0.95], [0.40, 0.46, 0.52]),
}


def fill_glass(a, m, tint='warm', curtain=False):
    """replace the chroma mask by a sky reflection with a soft diagonal sheen."""
    H, W = m.shape
    ys, xs = np.nonzero(m > 0.5)
    if not len(ys):
        return a
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = np.clip((yy - y0) / max(1, y1 - y0), 0, 1)
    top, bot = (np.array(c, np.float32) for c in GLASS_TINTS[tint])
    g = top[None, None] * (1 - t[..., None]) ** 1.3 + bot[None, None] * (1 - (1 - t[..., None]) ** 1.3)
    u = (xx - x0) / max(1, x1 - x0)
    sheen = np.exp(-((u + t * 0.6 - 0.55) / 0.12) ** 2) * 0.18 + np.exp(-((u + t * 0.6 - 0.85) / 0.05) ** 2) * 0.08
    g = g + sheen[..., None]
    g = g + (rng.random((H, W, 1)).astype(np.float32) - 0.5) * 0.02
    if curtain:
        c = (np.abs(u - 0.5) > 0.36).astype(np.float32)[..., None]
        g = g * (1 - c * 0.5) + np.array([0.93, 0.9, 0.84], np.float32) * c * 0.5
    # inner reveal shadow along the top of each pane
    shade = ndimage.uniform_filter((m > 0.5).astype(np.float32), size=(9, 1))
    g = g * (0.8 + 0.2 * shade[..., None])
    mm = m[..., None]
    return a * (1 - mm) + g * mm


def recolor(a, target, tol=0.16, base=None):
    """multiplicative tint of the wall colour (estimated at the image border)."""
    if base is None:
        border = np.concatenate([a[:, :20].reshape(-1, 3), a[:, -20:].reshape(-1, 3), a[:20].reshape(-1, 3)])
        base = np.median(border, axis=0)
    L = lum(a)[..., None] + 1e-4
    chroma = a / L
    bch = base / (lum(base[None, None])[..., None][0, 0] + 1e-4)
    d = np.abs(chroma - bch).sum(axis=2)
    lr = lum(a) / (lum(base[None, None])[0, 0] + 1e-4)
    m = np.clip(1 - (d - tol) / 0.12, 0, 1) * np.clip((lr - 0.45) / 0.2, 0, 1) * np.clip((1.25 - lr) / 0.15, 0, 1)
    m = ndimage.gaussian_filter(m, 1.2)
    tgt = np.array(target, np.float32)
    tinted = a * (tgt / np.maximum(base, 1e-3))[None, None]
    mm = m[..., None]
    return np.clip(a * (1 - mm) + tinted * mm, 0, 1)


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


# ---------------------------------------------------------------- cells
class Cell:
    def __init__(self, color, emis, orm):
        self.color, self.emis, self.orm = color, emis, orm


def build_cell(name, aspect=0.8, box=None, glass='warm', curtain=False, rough=0.92, glass_rough=0.08, glass_metal=0.35,
               emis_color=(1.0, 0.78, 0.45), tile=(True, True), tile_frac=0.05, post=None, emis_fn=None, src=None):
    a = load(src or name)
    m = magenta_mask(a)
    if box is None:
        box = centre_box(a, aspect, cx=content_cx(a))
    a = crop(a, box); m = crop(m, box)
    if m.max() > 0.5:
        a = fill_glass(a, m, glass, curtain)
    if post:
        a = post(a)
    e = np.zeros_like(a)
    if m.max() > 0.5:
        H = m.shape[0]
        grad = np.linspace(1.0, 0.75, H, dtype=np.float32)[:, None]
        e = m[..., None] * np.array(emis_color, np.float32)[None, None] * grad[..., None]
    if emis_fn:
        e = np.maximum(e, emis_fn(a))
    o = np.zeros_like(a)
    o[..., 0] = 1.0
    o[..., 1] = rough * (1 - m) + glass_rough * m
    o[..., 2] = glass_metal * m
    if tile[0] or tile[1]:
        a = make_tileable(a, tile_frac, *tile)
        e = make_tileable(e, tile_frac, *tile)
        o = make_tileable(o, tile_frac, *tile)
    return Cell(resize(a, CELL, CELL), resize(e, CELL, CELL), resize(o, CELL, CELL))


def shop_emis(a):
    """display windows glow at night: bright interior below the fascia."""
    H, W = a.shape[:2]
    yy = np.linspace(0, 1, H)[:, None]
    box = ((yy > 0.16) & (yy < 0.8)).astype(np.float32) * np.ones((1, W), np.float32)
    L = lum(a)
    m = box * np.clip((L - 0.18) / 0.4, 0, 1)
    warm = np.array([1.0, 0.86, 0.62], np.float32)
    return np.clip(a * 1.3 * warm[None, None] * m[..., None] + m[..., None] * 0.15, 0, 1)


def stained_emis(a):
    hsv = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).convert('HSV')).astype(np.float32) / 255
    m = np.clip((hsv[..., 1] - 0.35) / 0.25, 0, 1) * np.clip((hsv[..., 2] - 0.15) / 0.3, 0, 1)
    m = ndimage.gaussian_filter(m, 1.0)
    return np.clip(a * 1.6 * m[..., None], 0, 1)


def clock_emis(a):
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.hypot((xx - W / 2) / W, (yy - H / 2) / H)
    m = (r < 0.36).astype(np.float32) * np.clip((lum(a) - 0.6) / 0.2, 0, 1)
    return np.clip(m[..., None] * np.array([1.0, 0.95, 0.8], np.float32)[None, None], 0, 1)


PLASTER = {
    'cream': '#efe2c3', 'yellow': '#f0c862', 'pink': '#e9a39b', 'salmon': '#e58f6c',
    'mint': '#a7cf9f', 'blue': '#9db8d6', 'white': '#f2efe8', 'sand': '#dbbf96',
}
WHITE_SHUTTERS = {'mint', 'blue', 'pink'}
APT = {'white': '#eeede8', 'grey': '#c6c9c6', 'beige': '#e2d1b4', 'terracotta': '#cf8e6a'}


def darken_brick(a):
    L = lum(a)[..., None]
    return np.clip((a * 0.55 + L * 0.45) * 0.68 * np.array([1.0, 0.9, 0.85], np.float32), 0, 1)


def oxblood(a):
    L = lum(a)
    m = np.clip((0.33 - L) / 0.12, 0, 1)[..., None]
    red = a * np.array([1.35, 0.62, 0.6], np.float32)
    return np.clip(a * (1 - m) + red * m, 0, 1)


def shutters(a, target):
    """recolour green shutters (and door paint) to another colour, keeping the shading."""
    hsv = np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert('HSV')).astype(np.float32) / 255
    h, sat, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = ((h > 0.22) & (h < 0.52) & (sat > 0.18) & (v > 0.08)).astype(np.float32)
    m = ndimage.gaussian_filter(ndimage.binary_opening(m > 0.5, iterations=1).astype(np.float32), 0.8)
    L = lum(a)
    ref = max(1e-3, float((L * m).sum() / max(1.0, m.sum())))
    tgt = np.array(hexrgb(target), np.float32)
    new = tgt[None, None] * (L / ref)[..., None] * 0.9
    mm = m[..., None]
    return np.clip(a * (1 - mm) + new * mm, 0, 1)


def desat(a, k=0.75, tint=(1, 1, 1)):
    L = lum(a)[..., None]
    return np.clip((a * (1 - k) + L * k) * np.array(tint, np.float32), 0, 1)


def build_atlas():
    cells = {}

    def add(n, c):
        cells[n] = c

    # plastered houses: base cells first, then recolour per plaster colour
    base = {
        'win_s_green': build_cell('pl_win_green', 0.8, curtain=True),
        'win_s_white': build_cell('pl_win_white', 0.8, curtain=True),
        'win_p': build_cell('pl_win_plain', 0.8),
        'door': build_cell('pl_door', 0.8, box=None, tile=(True, False)),
        'wall': build_cell('pl_wall', 1.0, tile_frac=0.1),
        'gable': build_cell('pl_gable', 1.0),
    }
    for k, hexc in PLASTER.items():
        tgt = hexrgb(hexc)
        for kind in ('win_s', 'win_p', 'door', 'wall', 'gable'):
            src = base['win_s_white' if (kind == 'win_s' and k in WHITE_SHUTTERS) else ('win_s_green' if kind == 'win_s' else kind)]
            col = src.color if k == 'white' else recolor(src.color, tgt)
            add(f'{kind}_{k}', Cell(col, src.emis, src.orm))
    # more window styles, so that every house can carry its own
    styles = {
        'win_a': (build_cell('pl_win_arch', 0.8, box=centre_box(load('pl_win_arch'), 0.8, cx=content_cx(load('pl_win_arch')), y0=0.04, y1=0.96), curtain=True),
                  ['white', 'cream', 'sand', 'yellow', 'pink']),
        'win_o': (build_cell('pl_win_orn', 0.8, curtain=True), ['white', 'cream', 'blue', 'yellow', 'mint']),
        'win_b': (build_cell('pl_balc', 0.8, curtain=True), ['white', 'cream', 'salmon', 'pink', 'sand']),
    }
    for kind, (c, cols) in styles.items():
        for k in cols:
            add(f'{kind}_{k}', Cell(c.color if k == 'white' else recolor(c.color, hexrgb(PLASTER[k])), c.emis, c.orm))
    green = base['win_s_green']
    for kind, shut, cols in (('win_r', '#7d3226', ['cream', 'white', 'yellow', 'sand']), ('win_g', '#56718a', ['white', 'cream', 'salmon', 'pink'])):
        sc = shutters(green.color, shut)
        for k in cols:
            add(f'{kind}_{k}', Cell(sc if k == 'white' else recolor(sc, hexrgb(PLASTER[k])), green.emis, green.orm))
    # timber, slate and quarry stone houses, north German brick timber framing, modern houses
    add('wood_win', build_cell('wood_win', 0.8, curtain=True, rough=0.9))
    add('wood_wall', build_cell('wood_wall', 1.0, box=(0, 0, 1, 1), tile_frac=0.08, rough=0.9))
    add('slate_win', build_cell('slate_win', 0.8, curtain=True, rough=0.7))
    add('slate_wall', build_cell('slate_wall', 1.0, box=(0, 0, 1, 1), tile_frac=0.08, rough=0.7))
    add('rubble_win', build_cell('rubble_win', 0.85, rough=0.95))
    add('rubble_door', build_cell('rubble_door', 0.85, tile=(True, False), rough=0.95))
    add('bfw_win', build_cell('bfw_win', 1.0, box=(0, 0, 1, 1), curtain=True))
    add('bfw_wall', build_cell('bfw_wall', 1.0, box=(0, 0, 1, 1)))
    add('modern_win', build_cell('modern_win', 0.85, glass='dark', glass_rough=0.05, glass_metal=0.55, rough=0.6))
    add('garage_wood', build_cell('garage_wood', 1.0, box=(0.05, 0.1, 0.95, 1.0), tile=(True, False), rough=0.7))
    # half timbered
    fw = {
        'fw_win': build_cell('fw_win', 1.0, box=(0, 0, 1, 1), curtain=True),
        'fw_wall': build_cell('fw_wall', 1.0, box=(0, 0, 1, 1)),
        'fw_door': build_cell('fw_door', 1.0, box=(0, 0, 1, 1), tile=(True, False)),
        'fw_gable': build_cell('fw_gable', 1.0, box=(0, 0, 1, 1)),
    }
    for k, c in fw.items():
        add(f'{k}_brown', c)
        add(f'{k}_red', Cell(oxblood(c.color), c.emis, c.orm))
    # brick
    br = {
        'br_wall': build_cell('br_wall', 1.0, box=(0, 0, 1, 1), tile_frac=0.06, rough=0.95),
        'br_win': build_cell('br_win', 0.85, rough=0.95),
        'br_ind': build_cell('br_ind', 0.95, rough=0.95, emis_color=(1.0, 0.86, 0.6)),
    }
    for k, c in br.items():
        add(f'{k}_red', c)
        add(f'{k}_dark', Cell(darken_brick(c.color), c.emis, c.orm))
    add('br_door_red', build_cell('br_door', 0.85, tile=(True, False)))
    add('garage_red', build_cell('garage_red', 1.0, box=(0.06, 0.16, 0.94, 1.0), tile=(True, False), rough=0.5))
    add('garage_grey', build_cell('garage_grey', 1.0, box=(0.04, 0.04, 0.96, 1.0), tile=(True, False), rough=0.5))
    # shops: central part of each storefront, glowing interior at night
    for k in ['bakery', 'grocer', 'cafe', 'flowers', 'butcher', 'pharmacy', 'books', 'fashion', 'icecream', 'general']:
        add(f'shop_{k}', build_cell(f'shop_{k}', 0.68, box=centre_box(load(f'shop_{k}'), 0.68, y0=0.04, y1=0.97), tile=(True, False), rough=0.4, emis_fn=shop_emis))
    add('shopdoor', build_cell('shopdoor', 0.7, tile=(True, False), emis_color=(1.0, 0.85, 0.6)))
    # modern apartments
    ab = {
        'apt_win': build_cell('apt_win', 0.82, curtain=True),
        'apt_bal': build_cell('apt_bal', 0.82, curtain=True),
        'apt_wall': build_cell('apt_wall', 1.0, tile_frac=0.1),
        'apt_door': build_cell('apt_door', 0.82, tile=(True, False), emis_color=(1.0, 0.9, 0.7)),
    }
    for k, hexc in APT.items():
        for kind, c in ab.items():
            col = c.color if k == 'white' else recolor(c.color, hexrgb(hexc))
            add(f'{kind}_{k}', Cell(col, c.emis, c.orm))
    # offices
    for g in ['blue', 'teal', 'dark', 'silver']:
        add(f'glass_{g}', build_cell('glass_cw', 0.86, box=(0, 0, 1, 1), glass=g, glass_rough=0.05, glass_metal=0.6, rough=0.35, emis_color=(0.85, 0.9, 1.0)))
    add('glass_door', build_cell('glass_door', 1.0, box=(0, 0, 1, 1), glass='silver', glass_metal=0.5, rough=0.4, tile=(True, False), emis_color=(1.0, 0.93, 0.8)))
    sw = build_cell('stone_win', 0.75, emis_color=(1.0, 0.85, 0.62))
    add('stone_win_beige', sw)
    add('stone_win_grey', Cell(desat(sw.color, 0.7, (0.98, 0.98, 1.0)), sw.emis, sw.orm))
    st = build_cell('stone_wall', 1.0, box=(0, 0, 1, 1), tile_frac=0.06, rough=0.85)
    add('stone_wall_beige', st)
    add('stone_wall_grey', Cell(desat(st.color, 0.7, (0.98, 0.98, 1.0)), st.emis, st.orm))
    add('stone_door', build_cell('stone_door', 1.0, box=(0, 0, 1, 1), tile=(True, False), emis_color=(1.0, 0.9, 0.7)))
    # industry
    mc = build_cell('metal_clad', 1.0, box=(0, 0, 1, 1), rough=0.45, tile_frac=0.06)
    mc.orm[..., 2] = 0.5
    add('metal_grey', mc)
    add('metal_blue', Cell(np.clip(desat(mc.color, 0.6) * np.array([0.55, 0.72, 0.95], np.float32), 0, 1), mc.emis, mc.orm))
    add('metal_white', Cell(np.clip(desat(mc.color, 0.8) * 1.15, 0, 1), mc.emis, mc.orm))
    add('metal_dock', build_cell('metal_dock', 1.0, box=(0, 0, 1, 1), tile=(True, False), rough=0.45))
    # church
    add('ch_wall', build_cell('ch_wall', 1.0, box=(0, 0, 1, 1), tile_frac=0.06, rough=0.88))
    add('ch_win', build_cell('ch_win', 0.5, box=centre_box(load('ch_win'), 0.5, y0=0.02, y1=0.98), rough=0.85, emis_fn=stained_emis, tile=(True, False)))
    add('ch_rose', build_cell('ch_rose', 1.0, box=(0, 0, 1, 1), rough=0.85, emis_fn=stained_emis, tile=(False, False)))
    add('ch_door', build_cell('ch_door', 1.0, box=(0, 0, 1, 1), rough=0.85, tile=(False, False)))
    add('clock', build_cell('clock', 1.0, box=(0.06, 0.06, 0.94, 0.94), rough=0.6, emis_fn=clock_emis, tile=(False, False)))
    add('hospital_win', build_cell('hosp_win', 1.0, box=(0, 0, 1, 1), glass='silver', curtain=True, rough=0.6, emis_color=(0.9, 0.95, 1.0)))
    # raw construction
    add('raw_conc', build_cell('raw_conc', 1.0, box=(0, 0, 1, 1), rough=0.95))
    add('raw_conc_win', build_cell('raw_conc_win', 0.9, rough=0.95))
    add('raw_brick', build_cell('raw_brick', 1.0, box=(0, 0, 1, 1), rough=0.95))
    add('raw_brick_win', build_cell('raw_brick_win', 0.9, rough=0.95))

    names = list(cells.keys())
    assert len(names) <= 12 * COLS, len(names)
    size = CELL * COLS
    color = np.zeros((size, size, 3), np.float32)
    emis = np.zeros((size, size, 3), np.float32)
    orm = np.zeros((size, size, 3), np.float32); orm[..., 0] = 1; orm[..., 1] = 0.9
    manifest = {'cols': COLS, 'cells': {}, 'signStart': 12 * COLS}
    for i, n in enumerate(names):
        cx, cy = i % COLS, i // COLS
        c = cells[n]
        color[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = c.color
        emis[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = c.emis
        orm[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = c.orm
        manifest['cells'][n] = i
    d = os.path.join(OUT, 'atlas')
    save(color, os.path.join(d, 'facade_color_4k.jpg'), 90)
    save(color, os.path.join(d, 'facade_color_2k.jpg'), 90, (size // 2, size // 2))
    save(emis, os.path.join(d, 'facade_emis_2k.jpg'), 85, (size // 2, size // 2))
    save(emis, os.path.join(d, 'facade_emis_1k.jpg'), 85, (size // 4, size // 4))
    save(orm, os.path.join(d, 'facade_orm_2k.jpg'), 85, (size // 2, size // 2))
    save(orm, os.path.join(d, 'facade_orm_1k.jpg'), 85, (size // 4, size // 4))
    json.dump(manifest, open(os.path.join(d, 'atlas.json'), 'w'), indent=0)
    print(f'atlas: {len(names)} cells')


# ---------------------------------------------------------------- tileables
def square(a):
    H, W = a.shape[:2]
    s = min(H, W)
    return a[(H - s) // 2:(H - s) // 2 + s, (W - s) // 2:(W - s) // 2 + s]


def equalize(a, strength=0.6, rad=60):
    """remove large-scale brightness gradients so the repeat is not visible."""
    L = lum(a)
    low = ndimage.gaussian_filter(L, rad)
    k = (L.mean() / np.maximum(low, 1e-3)) ** strength
    return np.clip(a * k[..., None], 0, 1)


def gray_norm(a, mean=0.82):
    L = lum(a)
    L = L / max(1e-3, L.mean()) * mean
    return np.repeat(np.clip(L, 0, 1)[..., None], 3, axis=2)


def tex(name, out, size=1024, frac=0.12, centre=1.0, fn=None, q=86):
    a = square(load(name))
    if centre < 1:
        H = a.shape[0]; s = int(H * centre); o = (H - s) // 2
        a = a[o:o + s, o:o + s]
    a = equalize(a)
    if fn:
        a = fn(a)
    a = make_tileable(a, frac)
    save(resize(a, size, size), os.path.join(OUT, 'tex', out + '.jpg'), q)


def build_textures():
    tex('grass', 'grass', 1024)
    tex('cobble', 'cobble', 1024, frac=0.08)
    tex('asphalt', 'asphalt', 1024)
    tex('dirt', 'dirt', 1024)
    tex('sand', 'sand', 512, centre=0.6)
    if os.path.exists(os.path.join(RAW, 'gravel.png')):
        tex('gravel', 'gravel', 512)
    tex('field', 'field', 512, fn=lambda a: gray_norm(a, 0.8))
    tex('roof_tile', 'roof_tile', 1024, frac=0.06, fn=lambda a: gray_norm(a, 0.86))
    tex('roof_metal', 'roof_metal', 512, frac=0.06, fn=lambda a: gray_norm(a, 0.86))
    tex('roof_slate', 'roof_slate', 1024, frac=0.06, fn=lambda a: gray_norm(a, 0.8))
    tex('roof_pantile', 'roof_pantile', 1024, frac=0.06, fn=lambda a: gray_norm(a, 0.86))
    tex('leaves', 'leaves', 512)
    tex('needles', 'needles', 512)
    k = load('keyart')
    save(k, os.path.join(OUT, 'ui', 'keyart.jpg'), 82, (1600, int(1600 * k.shape[0] / k.shape[1])))
    # app icons: square crop around the church and market square
    H, W = k.shape[:2]
    s = int(H * 0.62)
    ic = k[int(H * 0.16):int(H * 0.16) + s, int(W * 0.30):int(W * 0.30) + s]
    for n in (180, 192, 512):
        im = Image.fromarray((ic * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS)
        im.save(os.path.join(OUT, 'ui', f'icon-{n}.png'), optimize=True)
    print('textures done')


if __name__ == '__main__':
    download_missing()
    build_textures()
    build_atlas()
