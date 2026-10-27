#!/usr/bin/env python3
"""Sync the shared nav and footer (scripts/partials/) into the spatial pages and bump the
asset version so browsers fetch fresh CSS/JS. Run after editing a partial, vision.css or vision.js:

    python3 scripts/build-vision.py
"""
import hashlib, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = {"index.html": None, "pricing.html": "pricing"}
nav = (ROOT / "scripts/partials/nav.html").read_text().strip()
foot = (ROOT / "scripts/partials/foot.html").read_text().strip()
ver = hashlib.sha1((ROOT / "assets/css/vision.css").read_bytes() + (ROOT / "assets/js/vision.js").read_bytes()).hexdigest()[:8]

for name, cur in PAGES.items():
    p = ROOT / name
    html = p.read_text()
    n = nav.replace('{{CUR_PRICING}}', ' aria-current="page"' if cur == "pricing" else "")
    html, a = re.subn(r"<!--nav-->.*?<!--/nav-->", lambda m: "<!--nav-->\n" + n + "\n<!--/nav-->", html, flags=re.S)
    html, b = re.subn(r"<!--foot-->.*?<!--/foot-->", lambda m: "<!--foot-->\n" + foot + "\n<!--/foot-->", html, flags=re.S)
    if a != 1 or b != 1:
        raise SystemExit(f"{name}: expected one nav and one foot marker, found {a} and {b}")
    html = re.sub(r"(/assets/(?:css/vision\.css|js/vision\.js)\?v=)[^\"']+", lambda m: m.group(1) + ver, html)
    html = html.replace("{{V}}", ver)
    p.write_text(html)
    print(f"{name}: synced, v={ver}")
