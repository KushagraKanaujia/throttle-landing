#!/usr/bin/env python3
"""Build the v3 front end: minify assets/css/v3.css and assets/js/v3.js with esbuild,
inline the minified CSS into each v3 page (between <style id="v3css"> and </style>),
and write assets/js/v3.min.js. Run after editing either source file:

    python3 scripts/build-v3.py
"""
import pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "pricing.html"]

def esbuild(src, out=None):
    cmd = ["npx", "--yes", "esbuild@0.24.0", str(src), "--minify", "--log-level=warning"]
    if src.suffix == ".js":
        cmd.append("--target=es2017")
    res = subprocess.run(cmd, check=True, capture_output=True, text=True)
    if out:
        out.write_text(res.stdout)
    return res.stdout

css = esbuild(ROOT / "assets/css/v3.css").strip()
esbuild(ROOT / "assets/js/v3.js", ROOT / "assets/js/v3.min.js")
for name in PAGES:
    p = ROOT / name
    html = p.read_text()
    new, n = re.subn(r'(<style id="v3css">).*?(</style>)', lambda m: m.group(1) + css + m.group(2), html, flags=re.S)
    if n != 1:
        raise SystemExit(f"{name}: expected one <style id=\"v3css\"> block, found {n}")
    p.write_text(new)
    print(f"{name}: inlined {len(css)} bytes of CSS")
print("assets/js/v3.min.js:", (ROOT / "assets/js/v3.min.js").stat().st_size, "bytes")
