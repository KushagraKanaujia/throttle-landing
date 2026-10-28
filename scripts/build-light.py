#!/usr/bin/env python3
"""Build the "Living light" pages (index.html, pricing.html).

- Syncs the shared nav and footer from scripts/partials-light/ into each page.
- Renders the ledger job rows from assets/data/demo-report.json, so every per-job sample
  number comes from real `throttle demo` output (made-up traffic, labelled as sample).
- Builds FAQPage JSON-LD from the visible FAQ on each page.
- Bumps ?v= on light.css / field.js / light.js / story.js so browsers fetch fresh files.

Run after editing a partial, the CSS/JS, the FAQ, or the demo report:

    python3 scripts/build-light.py
"""
import hashlib, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PART = ROOT / "scripts/partials-light"
DATA = json.loads((ROOT / "assets/data/demo-report.json").read_text())
PAGES = ["index.html", "pricing.html"]

STATE = {
    "MOVE": ("own", "Moved"),
    "NEEDS FINETUNE": ("test", "Testing"),
    "NEEDS MORE DATA": ("test", "Testing"),
    "INSUFFICIENT DATA": ("test", "Testing"),
    "KEEP ON API": ("api", "Stayed"),
}


def pct(x):
    return f"{round(x * 100):d}%"


def pts(x):
    return f"{x * 100:+.1f}".replace("-", "&minus;")


def reason(w):
    q, v = w["quality"], w["verdict"]
    if v == "MOVE":
        return f"Same or better on {pct(q['win'] + q['tie'])} of tests. Runs on your model now."
    if v == "KEEP ON API":
        return f"Worse on {pct(q['loss'])} of tests. Stays on the API."
    if v == "NEEDS FINETUNE":
        return f"Worse on {pct(q['loss'])} of tests. Learning from its misses."
    return "Not enough traffic yet. Still watching."


def jobs():
    order = {"own": 0, "test": 1, "api": 2}
    rows = sorted(DATA["workloads"], key=lambda w: (order[STATE.get(w["verdict"], ("test",))[0]], -w["monthly_api_usd"]))
    out = ['        <ol class="job-list">']
    for w in rows:
        st, word = STATE.get(w["verdict"], ("test", "Testing"))
        q = w["quality"]
        lo, hi = q["net_ci"]
        b, s, l = q["win"] * 100, q["tie"] * 100, q["loss"] * 100
        out.append(f"""          <li class="job" data-s="{st}"><details>
            <summary><span class="j-n">{html.escape(w["type"])}</span><span class="j-amt num">${w["monthly_api_usd"]:,.2f}<small>/mo</small></span><span class="j-st">{word}</span><span class="j-why">{html.escape(reason(w))}</span></summary>
            <div class="j-more">
              <span class="wtl" aria-hidden="true"><i class="w" style="--p:{b:.1f}"></i><i class="t" style="--p:{s:.1f}"></i><i class="l" style="--p:{l:.1f}"></i></span>
              <p class="mono"><span>better {b:.1f}%</span><span>same {s:.1f}%</span><span>worse {l:.1f}%</span></p>
              <p>Net score against the API, with error bars: {pts(lo)} to {pts(hi)} points.</p>
            </div>
          </details></li>""")
    out.append("        </ol>")
    return "\n".join(out)


def faq_ld(page):
    qs = re.findall(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", page, re.S)
    if not qs:
        return ""
    strip = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": strip(q), "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in qs]}
    return '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>"


def put(page, name, content):
    pat = re.compile(rf"(<!--{name}-->).*?(<!--/{name}-->)", re.S)
    if not pat.search(page):
        return page
    return pat.sub(lambda m: m.group(1) + "\n" + content.rstrip("\n") + "\n" + m.group(2), page)


def ver(path):
    return hashlib.sha1((ROOT / path).read_bytes()).hexdigest()[:8]


nav = (PART / "nav.html").read_text()
foot = (PART / "foot.html").read_text()
assets = {p: ver(p) for p in ["assets/css/light.css", "assets/js/field.js", "assets/js/light.js", "assets/js/story.js"]}

for name in PAGES:
    path = ROOT / name
    page = path.read_text()
    page = put(page, "nav", nav)
    page = put(page, "foot", foot)
    page = put(page, "jobs", jobs())
    page = put(page, "faq-ld", faq_ld(page))
    for a, h in assets.items():
        page = re.sub(rf'(/{re.escape(a)})\?v=[\w]+', rf"\1?v={h}", page)
    path.write_text(page)
    print("built", name)
