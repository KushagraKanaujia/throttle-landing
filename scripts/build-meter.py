#!/usr/bin/env python3
"""Build "The Meter" pages (index.html, pricing.html).

- Syncs the shared nav and footer from scripts/partials/ into each page.
- Renders the hero meter and the printed receipt from assets/data/demo-report.json, so every
  sample number on the site comes from real `throttle demo` output (made-up traffic, labelled).
- Bumps ?v= on meter.css / meter.js so browsers fetch fresh files.

Run after editing a partial, the CSS/JS, or the demo report:

    python3 scripts/build-meter.py
"""
import hashlib, html, json, math, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PART = ROOT / "scripts/partials"
DATA = json.loads((ROOT / "assets/data/demo-report.json").read_text())
PAGES = {"index.html": "how", "pricing.html": "pricing"}

GH = ('<path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>')

# verdict -> (state, receipt word, plain reason)
STATE = {
    "MOVE": ("own", "MOVED"),
    "NEEDS FINETUNE": ("test", "TESTING"),
    "NEEDS MORE DATA": ("test", "TESTING"),
    "INSUFFICIENT DATA": ("test", "TESTING"),
    "KEEP ON API": ("api", "STAYED"),
}
SHORT = {"extraction": "extract", "classification": "classify", "summarization": "summary"}


def money(x, cents=True):
    return f"${x:,.2f}" if cents else f"${x:,.0f}"


def pct(x):
    return f"{round(x * 100):d}%"


def reason(w):
    q, v = w["quality"], w["verdict"]
    same = q["win"] + q["tie"]
    if v == "MOVE":
        return f"Same or better on {pct(same)} of tests. Runs on your model now."
    if v == "KEEP ON API":
        return f"Worse on {pct(q['loss'])} of tests. Stays on the API."
    if v == "NEEDS FINETUNE":
        return f"Worse on {pct(q['loss'])} of tests. Training on its misses."
    return "Not enough traffic yet. Still watching."


def ci(w):
    lo, hi = w["quality"]["net_ci"]
    f = lambda x: f"{x * 100:+.1f}".replace("-", "−")
    return f"{f(lo)} to {f(hi)} pts"


T = DATA["totals"]
api_bill, moved, saved = T["monthly_api_usd"], T["movable_usd"], T["projected_savings_usd"]
gpus = round(moved - saved, 2)
share = moved / api_bill
gen = DATA.get("generated_at", "")[:10]
jobs = DATA["workloads"]


def wheel(d, cls=""):
    cells = "".join(f"<span>{n % 10}</span>" for n in range(30))
    return f'<span class="wheel{cls}" style="--i:{20 + int(d)}" data-d="{d}"><span class="strip">{cells}</span></span>'


def meter():
    dollars, cents = f"{saved:,.2f}".split(".")
    wheels = []
    for ch in dollars:
        wheels.append('<span class="odo-sep">,</span>' if ch == "," else wheel(ch))
    odo = "".join(wheels) + '<span class="odo-dot">.</span>' + "".join(wheel(c, " sm") for c in cents)

    # gauge: semicircle, centre (120,124), r=96. 0% = left, 100% = right.
    ticks = []
    for p in range(0, 101, 5):
        a = math.radians(180 - p * 1.8)
        major = p % 25 == 0
        r1, r2 = 96, (82 if major else 89)
        x1, y1 = 120 + r1 * math.cos(a), 124 - r1 * math.sin(a)
        x2, y2 = 120 + r2 * math.cos(a), 124 - r2 * math.sin(a)
        ticks.append(f'<line class="{"tk-M" if major else "tk"}" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
        if major:
            xl, yl = 120 + 70 * math.cos(a), 124 - 70 * math.sin(a) + 4
            ticks.append(f'<text class="tk-l" x="{xl:.1f}" y="{yl:.1f}">{p}</text>')
    ang = -90 + share * 180
    gauge = (
        '<svg class="gauge" viewBox="0 0 240 140" aria-hidden="true">'
        '<path class="g-trk" d="M24 124a96 96 0 0 1 192 0" pathLength="100"/>'
        f'<path class="g-own" d="M24 124a96 96 0 0 1 192 0" pathLength="100" style="--p:{share * 100:.1f}"/>'
        + "".join(ticks)
        + f'<g class="needle" style="--a:{ang:.1f}deg"><path d="M120 124 L117.6 118 L120 36 L122.4 118Z"/><circle cx="120" cy="124" r="9"/><circle class="hub-i" cx="120" cy="124" r="3"/></g>'
        "</svg>"
    )

    chans = []
    rank = {"own": 0, "test": 1, "api": 2}
    for w in sorted(jobs, key=lambda w: (rank[STATE.get(w["verdict"], ("test",))[0]], -w["monthly_api_usd"])):
        st, word = STATE.get(w["verdict"], ("test", "TESTING"))
        name = SHORT.get(w["type"], w["type"])
        chans.append(
            f'<li class="ch" data-s="{st}"><i class="led" aria-hidden="true"></i>'
            f'<span class="sw" aria-hidden="true"><b></b></span>'
            f'<span class="ch-n">{html.escape(name)}</span>'
            f'<span class="sr-only">{html.escape(w["type"])}: {word.lower()}</span></li>'
        )
    return f"""<figure class="meter" data-meter aria-labelledby="meter-cap">
  <div class="m-face">
    <i class="screw s1" aria-hidden="true"></i><i class="screw s2" aria-hidden="true"></i><i class="screw s3" aria-hidden="true"></i><i class="screw s4" aria-hidden="true"></i>
    <div class="m-top"><span class="m-brand">Throttle meter</span><span class="m-model">TM&#8209;01</span><span class="m-sample"><i aria-hidden="true"></i>Sample</span></div>
    <div class="m-read">
      <p class="m-lbl" id="m-lbl">Saved this month</p>
      <div class="odo" role="img" aria-label="{money(saved)} saved this month, sample">
        <span class="odo-cur">$</span>{odo}
      </div>
    </div>
    <div class="m-lower">
      <div class="m-gauge">
        {gauge}
        <p class="g-read"><b>{round(share * 100)}%</b><span>of the API bill now on your model</span></p>
      </div>
      <div class="m-bank">
        <div class="bank-scale" aria-hidden="true"><span class="own">Own</span><span class="test">Test</span><span class="api">API</span></div>
        <ul class="chans" aria-label="Where each AI job runs, sample">{"".join(chans)}</ul>
      </div>
    </div>
    <dl class="m-tape">
      <div><dt>API bill</dt><dd>{money(api_bill, False)}<small>/mo</small></dd></div>
      <div><dt>Moved</dt><dd class="own">{money(moved, False)}<small>/mo</small></dd></div>
      <div><dt>Your GPUs</dt><dd>&minus;{money(gpus, False)}<small>/mo</small></dd></div>
    </dl>
  </div>
  <figcaption id="meter-cap"><b>Sample, made-up traffic.</b> Real output of <code>throttle demo</code>, not a customer.</figcaption>
</figure>"""


def receipt():
    order = {"own": 0, "test": 1, "api": 2}
    rows = sorted(jobs, key=lambda w: (order[STATE.get(w["verdict"], ("test",))[0]], -w["monthly_api_usd"]))
    lines = []
    for w in rows:
        st, word = STATE.get(w["verdict"], ("test", "TESTING"))
        q = w["quality"]
        lines.append(f"""<li class="r-job" data-s="{st}"><details>
  <summary><span class="r-name">{html.escape(w["type"])}</span><span class="r-amt">{money(w["monthly_api_usd"])}</span><span class="r-st">{word}</span><span class="r-why">{html.escape(reason(w))}</span></summary>
  <div class="r-proof"><span>Better <b>{pct(q["win"])}</b></span><span>Same <b>{pct(q["tie"])}</b></span><span>Worse <b>{pct(q["loss"])}</b></span><span class="r-ci">95% range of the net score: {ci(w)}</span></div>
</details></li>""")
    return f"""<div class="receipt" data-receipt>
  <div class="r-paper">
    <header class="r-head">
      <svg class="r-logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22a11 11 0 0 1 22 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M16 22 23 12" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><circle cx="16" cy="22" r="2.8" fill="currentColor"/></svg>
      <p class="r-title">THROTTLE METER<br>MONTHLY REPORT</p>
      <p class="r-stamp">SAMPLE &middot; MADE-UP TRAFFIC</p>
      <p class="r-meta"><span>Generated {gen}</span><span>throttle demo</span></p>
    </header>
    <p class="r-cols" aria-hidden="true"><span>AI job</span><span>On API / mo</span></p>
    <ol class="r-jobs">
{chr(10).join(lines)}
    </ol>
    <dl class="r-sum">
      <div><dt>API bill, all jobs</dt><dd>{money(api_bill)}</dd></div>
      <div><dt>Moved to your model</dt><dd>{money(moved)}</dd></div>
      <div><dt>Your GPUs, high estimate</dt><dd>&minus;{money(gpus)}</dd></div>
      <div class="r-total"><dt>Saved this month</dt><dd>{money(saved)}</dd></div>
    </dl>
    <p class="r-foot">Tap any line for its test results.<br>Fallback to the API stays on for every moved job.</p>
    <div class="r-bar" aria-hidden="true"></div>
    <p class="r-thanks">STOP RENTING YOUR AI</p>
  </div>
</div>"""


def tests(passed, of):
    """A row of test cells; the misses are spread out so they read as scattered failures."""
    miss = of - passed
    spots = {round((k + 0.5) * of / miss) + (3 if k % 2 else -4) for k in range(miss)} if miss else set()
    return "".join(f'<i class="{"x" if n in spots else "ok"}" style="--n:{n}"></i>' for n in range(of))


def faq_ld(page):
    """FAQPage JSON-LD built from the visible FAQ, so the two never drift apart."""
    items = []
    for q, a in re.findall(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", page, flags=re.S):
        clean = lambda t: html.unescape(re.sub(r"<[^>]+>", "", t)).strip()
        items.append({"@type": "Question", "name": clean(q), "acceptedAnswer": {"@type": "Answer", "text": clean(a)}})
    return json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": items}, ensure_ascii=False)


def ver():
    h = hashlib.sha1()
    for f in ("assets/css/meter.css", "assets/js/meter.js"):
        h.update((ROOT / f).read_bytes())
    return h.hexdigest()[:8]


def sub(html_, tag, body, name):
    out, n = re.subn(rf"<!--{tag}-->.*?<!--/{tag}-->", lambda m: f"<!--{tag}-->\n{body}\n<!--/{tag}-->", html_, flags=re.S)
    if n > 1:
        raise SystemExit(f"{name}: more than one <!--{tag}--> block")
    return out, n


nav = (PART / "nav.html").read_text().strip().replace("{{GH}}", GH)
foot = (PART / "foot.html").read_text().strip()
v = ver()
blocks = {"meter": meter(), "receipt": receipt()}
for name, cur in PAGES.items():
    p = ROOT / name
    s = p.read_text()
    n_ = nav.replace("{{CUR_PRICING}}", ' aria-current="page"' if cur == "pricing" else "").replace("{{CUR_HOW}}", "")
    s, a = sub(s, "nav", n_, name)
    s, b = sub(s, "foot", foot, name)
    if a != 1 or b != 1:
        raise SystemExit(f"{name}: expected one nav and one foot marker")
    s = re.sub(r'(<div class="tests" data-pass="(\d+)" data-of="(\d+)"[^>]*>).*?(</div>)',
               lambda m: m.group(1) + tests(int(m.group(2)), int(m.group(3))) + m.group(4), s, flags=re.S)
    for tag, body in blocks.items():
        s, _ = sub(s, tag, body, name)
    s = re.sub(r"(/assets/(?:css/meter\.css|js/meter\.js)\?v=)[^\"']+", lambda m: m.group(1) + v, s)
    s = s.replace("{{GH}}", GH)
    s = re.sub(r'(<script type="application/ld\+json" id="faq-ld">).*?(</script>)', lambda m: m.group(1) + faq_ld(s) + m.group(2), s, flags=re.S)
    p.write_text(s)
    print(f"{name}: built, v={v}")
print(f"sample: saved {money(saved)}, moved {money(moved)}, gpus {money(gpus)}, share {share:.1%}")
