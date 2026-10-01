# Seamless 10 s loop: perspective grid floor + flowing token streams. Raw RGB to stdout.
import sys, numpy as np
W, H = int(sys.argv[1]), int(sys.argv[2])
FPS, T = 30, 10.0
N = int(FPS * T)
rng = np.random.default_rng(7)
portrait = H > W
bg = np.array([7, 8, 10], np.float32)
lime = np.array([198, 255, 52], np.float32) / 255
teal = np.array([52, 224, 200], np.float32) / 255

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
# vignette + soft top glow
cx, cy = W / 2, H * (0.42 if not portrait else 0.38)
r = np.sqrt(((xx - cx) / W) ** 2 + ((yy - cy) / H) ** 2)
vign = np.clip(1.15 - r * 1.25, 0, 1)

horizon = H * (0.58 if not portrait else 0.62)
f = W * 0.9

# streams: each a sine path; particles move along x by integer laps per loop
S = 9 if not portrait else 7
streams = []
for i in range(S):
    base = H * (0.14 + 0.40 * i / (S - 1)) if not portrait else H * (0.12 + 0.44 * i / (S - 1))
    amp = H * rng.uniform(0.015, 0.05)
    freq = rng.uniform(0.6, 1.4)
    ph = rng.uniform(0, 1)
    laps = 1 if i % 3 else 2
    n = int((W / 960) * rng.integers(70, 120)) if not portrait else int(rng.integers(45, 80))
    x0 = rng.uniform(0, W, n)
    size = rng.uniform(0.6, 1.0, n)
    col = lime if i % 2 == 0 else teal
    a = rng.uniform(0.25, 0.75, n) * (0.55 + 0.45 * np.cos(np.pi * (i - S / 2) / S))
    streams.append((base, amp, freq, ph, laps, x0, size, col, a))

clouds = [
    (0.30, 0.30, 0.06, 0.04, 0.28, 0.30, lime, 0.05, 0.0),
    (0.72, 0.36, 0.05, 0.05, 0.32, 0.34, teal, 0.085, 0.4),
    (0.50, 0.55, 0.08, 0.02, 0.45, 0.16, teal, 0.05, 0.7),
]
out = sys.stdout.buffer
for k in range(N):
    t = k / N  # 0..1, loop phase
    img = np.zeros((H, W, 3), np.float32)
    # perspective grid floor
    below = yy > horizon + 1
    z = np.where(below, (H * 0.9) / np.maximum(yy - horizon, 1), 0)
    zoff = z * 0.9 + t  # rows move toward viewer, one cell per loop
    rowl = np.abs(((zoff) % 1.0) - 0.5) * 2  # 1 at line
    rowline = np.clip((rowl - 0.93) / 0.07, 0, 1) ** 2
    xw = (xx - W / 2) * z / f * 7.0
    coll = np.abs((xw % 1.0) - 0.5) * 2
    colline = np.clip((coll - 0.94) / 0.06, 0, 1) ** 2
    fade = np.where(below, np.clip((yy - horizon) / (H - horizon), 0, 1) ** 1.2, 0) * np.clip(1.4 - np.abs(xx - W / 2) / (W * 0.62), 0, 1)
    grid = np.maximum(rowline, colline) * fade * 0.30
    img += grid[..., None] * teal[None, None, :] * 0.9
    # soft color clouds on periodic paths (seamless)
    for (bx, by, rx, ry, sx, sy, col, amp, ph) in clouds:
        px = W * (bx + rx * np.cos(2 * np.pi * (t + ph)))
        py = H * (by + ry * np.sin(2 * np.pi * (t + ph)))
        g = np.exp(-(((xx - px) / (W * sx)) ** 2 + ((yy - py) / (H * sy)) ** 2))
        img += (g * amp * (0.8 + 0.2 * np.sin(2 * np.pi * (t * 2 + ph))))[..., None] * col[None, None, :]
    # horizon glow line, breathing
    hg = np.exp(-((yy - horizon) / (H * 0.012)) ** 2) * (0.10 + 0.04 * np.sin(2 * np.pi * t))
    img += (hg * np.clip(1 - np.abs(xx - W / 2) / (W * 0.55), 0, 1))[..., None] * lime[None, None, :]
    # token streams
    for base, amp, freq, ph, laps, x0, size, col, a in streams:
        x = (x0 + laps * W * t) % W
        y = base + amp * np.sin(2 * np.pi * (x / W * freq + ph))
        ix, iy = x.astype(int), y.astype(int)
        ok = (iy >= 1) & (iy < H - 1) & (ix >= 1) & (ix < W - 1)
        edge = np.clip(np.minimum(x, W - x) / (W * 0.12), 0, 1)  # fade at screen edges
        w = (a * edge)[ok]
        for dy, dx, m in ((0, 0, 1.0), (0, 1, 0.3), (0, -1, 0.6), (0, -2, 0.42), (0, -3, 0.3), (0, -4, 0.2), (0, -5, 0.12), (0, -6, 0.06)):
            np.add.at(img, (iy[ok] + dy, ix[ok] + dx), (w * m)[:, None] * col[None, :])
    img = img * vign[..., None]
    rgb = np.clip(bg / 255 + img, 0, 1)
    out.write((rgb * 255).astype(np.uint8).tobytes())
