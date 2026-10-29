/* Throttle "Living light": the home page story.
   1. Hero light field + savings counter   2. Fig. 1 Where the money goes
   3. How it works, drawn in light          4. See it work (tmux session)
   5. Closing band light field
   All numbers are the sample from `throttle demo` on made-up traffic. */
(function () {
  "use strict";
  var d = document, w = window, root = d.documentElement;
  var reduce = w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, el) { return (el || d).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeIO = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var hasIO = "IntersectionObserver" in w;
  var SAVED = 8882.61;
  function seen(el, fn, opts) {
    if (!el) return;
    if (!hasIO) { fn(true); return; }
    new IntersectionObserver(function (es) { es.forEach(function (e) { fn(e.isIntersecting, e); }); }, opts || {}).observe(el);
  }

  /* =====================================================================
     1. HERO
     ===================================================================== */
  (function hero() {
    var canvas = $("#flow"), stage = $("#stage"), heroEl = $("#hero"), counter = $("#counter");
    if (!canvas || !w.LightField) return;
    var copy = $("#heroCopy"), shift = $("#shift"), tagRent = $("#tagRent");
    var FINAL = counter.innerHTML;
    var fmt = function (v) {
      var dd = Math.floor(v), c = Math.round((v - dd) * 100);
      if (c === 100) { dd += 1; c = 0; }
      return "$" + dd.toLocaleString("en-US") + "<small>." + String(c).padStart(2, "0") + "</small>";
    };
    var field = null;
    try {
      field = w.LightField({
        canvas: canvas, stage: stage, reduce: reduce, count: [5200, 2800], prewarm: 560, stillShare: 0.62, gainM: 1.45, fadeM: 0.975,
        targets: function (W, H, m) {
          var keep = counter.innerHTML; counter.innerHTML = FINAL;
          var c = counter.getBoundingClientRect(), s = stage.getBoundingClientRect(), t = tagRent.getBoundingClientRect();
          counter.innerHTML = keep;
          var x0 = c.left - s.left, cw = c.width;
          return m ? {
            home: { x0: x0 + cw * 0.18, x1: x0 + cw * 0.96, y: c.top - s.top + c.height * 0.58 },
            rent: { x: W + 50, y: t.top - s.top + 8, spread: H * 0.09 },
            emit: { y0: H * 0.5, y1: H * 0.8 },
            capx: [0.40, 0.18, 0.52, 0.12, 0.32, 0.24, 0.46, 0.15, 0.36]
          } : {
            home: { x0: x0 + cw * 0.04, x1: x0 + cw * 0.96, y: c.top - s.top + c.height * 0.62 },
            rent: { x: W + 90, y: t.top - s.top + 10, spread: H * 0.55 },
            emit: { y0: H * 0.40, y1: H * 0.98 }
          };
        },
        share: function (t, scroll) {
          if (reduce) return 0.62;
          return 0.46 * easeOut(clamp((t - 0.6) / 7.5, 0, 1)) + scroll * 0.44;   // 46% = the sample's moved share of spend
        },
        onFrame: function (t) {
          if (t > 9) return;
          counter.innerHTML = fmt(SAVED * easeOut(clamp((t - 1.0) / 7.0, 0, 1)));
        }
      });
    } catch (e) { field = null; }
    if (!field) { root.classList.add("no-gl"); return; }
    if (!reduce) counter.innerHTML = fmt(0);

    var vis = true, covered = false;
    var sync = function () { field.setActive(vis && !covered); };
    seen(stage, function (v) { vis = v; sync(); });
    heroEl.addEventListener("pg:cover", function (e) { covered = e.detail; sync(); });
    sync();

    var onScroll = function () {
      var r = heroEl.getBoundingClientRect(), span = r.height - w.innerHeight;
      var p = clamp(-r.top / span, 0, 1);
      field.setScroll(p);
      if (reduce) return;
      var a = clamp(p / 0.45, 0, 1);
      copy.style.opacity = 1 - a; copy.style.transform = "translateY(" + (-a * 40) + "px)";
      copy.style.visibility = a >= 1 ? "hidden" : "";
      var b = clamp((p - 0.4) / 0.3, 0, 1);
      shift.style.opacity = b; shift.style.transform = "translateY(" + ((1 - b) * 20) + "px)";
    };
    w.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    var rz;
    w.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { field.layout(); }, 160); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { field.retarget(); });
  })();

  /* =====================================================================
     2. FIG. 1  Where the money goes (hairline Sankey; one line ~ $500/mo)
     ===================================================================== */
  (function fig() {
    var svg = $("#sankey");
    if (!svg) return;
    var NS = "http://www.w3.org/2000/svg";
    var gL = $("#skLines"), gT = $("#skLabels");
    // ordered: moved, then testing, then stayed. Line counts follow each job's API spend.
    var JOBS = [
      { n: "Extraction", c: 11, s: "moved" },
      { n: "Chat", c: 9, s: "moved" },
      { n: "Classification", c: 5, s: "moved" },
      { n: "Summarization", c: 14, s: "testing" },
      { n: "Code", c: 4, s: "testing" },
      { n: "Agent", c: 11, s: "stayed" }
    ];
    var MOVED_LINES = 25, share = [11 / 25, 9 / 25, 5 / 25];
    var cw = $("#tw"), cc = $("#tc");
    var setCounter = function (v) { var i = Math.floor(v + 1e-6); cw.textContent = i.toLocaleString("en-US"); cc.textContent = "." + String(Math.round((v - i) * 100)).padStart(2, "0").slice(0, 2); };
    var el = function (t, a, p) { var e = d.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); (p || svg).appendChild(e); return e; };
    var G = null, compact = null;

    function build() {
      compact = svg.parentNode.clientWidth < 560;
      gL.innerHTML = ""; gT.innerHTML = "";
      var L = compact
        ? { W: 520, H: 600, X0: 136, X1: 500, SP: 3.0, GAP: 24, Y0: 128, RY: 62, RSP: 1.5, HY: 470, HSP: 1.9, jl: 19, st: 10, nl: 24, ns: 11, ann: 16 }
        : { W: 760, H: 480, X0: 150, X1: 556, SP: 2.8, GAP: 21, Y0: 76, RY: 24, RSP: 1.55, HY: 378, HSP: 2.1, jl: 16, st: 9, nl: 21, ns: 9.5, ann: 14 };
      svg.setAttribute("viewBox", "0 0 " + L.W + " " + L.H);
      var X0 = L.X0, X1 = L.X1;
      var curve = function (y0, y1) { return "M" + X0 + " " + y0.toFixed(2) + " C" + (X0 + (X1 - X0) * 0.56) + " " + y0.toFixed(2) + " " + (X1 - (X1 - X0) * 0.52) + " " + y1.toFixed(2) + " " + X1 + " " + y1.toFixed(2); };
      var y = L.Y0, ri = 0, hi = 0;
      JOBS.forEach(function (j, ji) {
        j.rent = []; j.home = []; j.test = [];
        var top = y;
        for (var k = 0; k < j.c; k++) {
          var yy = y + k * L.SP;
          j.rent.push(el("path", { d: curve(yy, L.RY + ri * L.RSP), "class": "ln rent" }, gL));
          if (j.s === "moved") { j.home.push(el("path", { d: curve(yy, L.HY + hi * L.HSP), "class": "ln home" }, gL)); hi++; }
          ri++;
        }
        if (j.s === "testing") [1, j.c - 2].forEach(function (k, n) {
          j.test.push(el("path", { d: curve(y + k * L.SP, L.HY + MOVED_LINES * L.HSP + 8 + (ji - 3) * 7 + n * 2.5), "class": "ln test" }, gL));
        });
        var bot = top + (j.c - 1) * L.SP, mid = (top + bot) / 2;
        el("line", { x1: X0 - 7, y1: top, x2: X0 - 7, y2: bot, stroke: "#F3EEE3", "stroke-opacity": 0.5, "stroke-width": 1 }, gT);
        j.label = el("text", { x: X0 - 16, y: mid - 2, "text-anchor": "end", "class": "jl fade", style: "font-size:" + L.jl + "px" }, gT); j.label.textContent = j.n;
        var col = j.s === "moved" ? "#D8B46A" : j.s === "testing" ? "#9DB49A" : "#C9694A";
        j.stat = el("text", { x: X0 - 16, y: mid + L.st + 4, "text-anchor": "end", "class": "st", fill: col, style: "font-size:" + L.st + "px" }, gT);
        j.stat.textContent = j.s === "moved" ? "Moved home" : j.s === "testing" ? "Testing" : "Stayed";
        y += j.c * L.SP + L.GAP;
      });
      var rentBot = L.RY + (ri - 1) * L.RSP, homeBot = L.HY + MOVED_LINES * L.HSP + 22;
      var src = el("text", { x: X0 - 7, y: L.Y0 - 26, "text-anchor": "end", "class": "ns fade", style: "font-size:" + L.ns + "px" }, gT); src.textContent = "Your app";
      var nr = el("line", { x1: X1 + 2, y1: L.RY - 4, x2: X1 + 2, y2: rentBot + 4, stroke: "#F3EEE3", "stroke-width": 1.4, "class": "fade" }, gT);
      var nh = el("line", { x1: X1 + 2, y1: L.HY - 4, x2: X1 + 2, y2: homeBot, stroke: "#D8B46A", "stroke-width": 1.4, "class": "fade" }, gT);
      var t1, t1s, t2, t2s, ann, ax;
      if (!compact) {
        t1 = el("text", { x: X1 + 16, y: L.RY + 22, "class": "nl fade", style: "font-size:" + L.nl + "px" }, gT);
        t1s = el("text", { x: X1 + 17, y: L.RY + 42, "class": "ns fade", style: "font-size:" + L.ns + "px" }, gT);
        t2 = el("text", { x: X1 + 16, y: L.HY + 22, "class": "nl i fade", style: "font-size:" + L.nl + "px" }, gT);
        t2s = el("text", { x: X1 + 17, y: L.HY + 42, "class": "ns fade", style: "font-size:" + L.ns + "px" }, gT);
        ax = X1 + 17;
        ann = el("text", { x: ax, y: L.HY + 72, "class": "ann fade", style: "font-size:" + L.ann + "px" }, gT);
      } else {
        t1 = el("text", { x: X1 + 2, y: L.RY - 34, "text-anchor": "end", "class": "nl fade", style: "font-size:" + L.nl + "px" }, gT);
        t1s = el("text", { x: X1 + 2, y: L.RY - 15, "text-anchor": "end", "class": "ns fade", style: "font-size:" + L.ns + "px" }, gT);
        t2 = el("text", { x: X1 + 2, y: homeBot + 30, "text-anchor": "end", "class": "nl i fade", style: "font-size:" + L.nl + "px" }, gT);
        t2s = el("text", { x: X1 + 2, y: homeBot + 49, "text-anchor": "end", "class": "ns fade", style: "font-size:" + L.ns + "px" }, gT);
        ax = 0;
        ann = el("text", { x: ax, y: homeBot + 30, "class": "ann fade", style: "font-size:" + L.ann + "px" }, gT);
        svg.setAttribute("viewBox", "0 0 " + L.W + " " + (homeBot + 62));
      }
      var tsp = function (txt, cls, parent, attrs) { var s = el("tspan", attrs || {}, parent); if (cls) s.setAttribute("class", cls); s.textContent = txt; return s; };
      tsp("$12,518", "g", ann); tsp(" of work,", "", ann);
      var l2 = tsp("", "", ann, { x: ax, dy: compact ? 20 : 18 }); tsp("run for ", "", l2); tsp("$3,635", "g", l2);
      t1.textContent = "OpenAI / Anthropic"; t1s.textContent = "Renting · $27,215 a month";
      t2.textContent = "Your own model"; t2s.textContent = "Owning · in your cloud";
      var allRent = [], allHome = [];
      JOBS.forEach(function (j) { allRent = allRent.concat(j.rent); allHome = allHome.concat(j.home); });
      allRent.concat(allHome).forEach(function (p) { p._L = p.getTotalLength(); p.style.strokeDasharray = p._L; });
      var beads = [];
      for (var i = 0; i < 12; i++) beads.push({ e: el("circle", { r: 1.7, fill: "#F3DDA6", opacity: 0 }, gL), p: null, t: Math.random(), v: 0.0018 + Math.random() * 0.0014 });
      G = { allRent: allRent, allHome: allHome, beads: beads, fades: [src, nr, t1, t1s], homeFades: [nh, t2, t2s], ann: ann };
    }

    var T_DRAW = 0.2, D_DRAW = 1.5, T_MOVE = [2.0, 3.4, 4.8], D_MOVE = 1.4, T_TEST = 6.2;
    var elT = 0, last = null, running = false, visible = false, done = false;
    function frame(now) {
      if (last !== null) elT += Math.min(now - last, 50) / 1000;
      last = now;
      var t = elT;
      G.allRent.forEach(function (p, i) { var k = easeOut(clamp((t - T_DRAW - i * 0.01) / D_DRAW, 0, 1)); p.style.strokeDashoffset = p._L * (1 - k); });
      if (t > T_DRAW + 0.2) { JOBS.forEach(function (j) { j.label.classList.add("on"); }); G.fades.forEach(function (e) { e.classList.add("on"); }); }
      var saved = 0;
      JOBS.slice(0, 3).forEach(function (j, ji) {
        var t0 = T_MOVE[ji];
        j.home.forEach(function (p, i) { var k = easeIO(clamp((t - t0 - i * 0.05) / D_MOVE, 0, 1)); p.style.strokeDashoffset = p._L * (1 - k); });
        if (t > t0) { j.rent.forEach(function (p) { p.classList.add("gone"); }); j.stat.classList.add("on"); j.label.classList.add("hl"); }
        saved += SAVED * share[ji] * easeIO(clamp((t - t0 - 0.2) / (D_MOVE + 0.3), 0, 1));
        if (ji === 0 && t > t0) G.homeFades.forEach(function (e) { e.classList.add("on"); });
      });
      setCounter(t > T_MOVE[2] + D_MOVE + 0.5 ? SAVED : Math.min(saved, SAVED));
      if (t > T_TEST) {
        JOBS.slice(3, 5).forEach(function (j) { j.stat.classList.add("on"); j.test.forEach(function (p) { p.classList.add("on"); }); });
        JOBS[5].stat.classList.add("on"); JOBS[5].rent.forEach(function (p) { p.classList.add("stay"); });
        G.ann.classList.add("on");
      }
      var moved = [];
      JOBS.slice(0, 3).forEach(function (j, ji) { if (t > T_MOVE[ji] + D_MOVE) moved = moved.concat(j.home); });
      if (moved.length) G.beads.forEach(function (b) {
        if (!b.p || moved.indexOf(b.p) < 0 || b.t >= 1) { b.p = moved[(Math.random() * moved.length) | 0]; b.t = b.t >= 1 ? 0 : Math.random(); }
        b.t += b.v;
        var pt = b.p.getPointAtLength(Math.min(b.t, 1) * b.p._L);
        b.e.setAttribute("cx", pt.x.toFixed(1)); b.e.setAttribute("cy", pt.y.toFixed(1));
        b.e.setAttribute("opacity", (Math.sin(Math.min(b.t, 1) * Math.PI) * 0.95).toFixed(2));
      });
      done = t > T_TEST + 1.5;
      if (visible) requestAnimationFrame(frame); else { running = false; last = null; }
    }
    function reset() {
      elT = 0; last = null; done = false;
      JOBS.forEach(function (j) { j.rent.forEach(function (p) { p.classList.remove("gone", "stay"); }); j.stat.classList.remove("on"); j.label.classList.remove("hl", "on"); j.test.forEach(function (p) { p.classList.remove("on"); }); });
      G.fades.concat(G.homeFades, [G.ann]).forEach(function (e) { e.classList.remove("on"); });
      G.allRent.forEach(function (p) { p.style.strokeDashoffset = p._L; });
      G.allHome.forEach(function (p) { p.style.strokeDashoffset = p._L; });
      G.beads.forEach(function (b) { b.e.setAttribute("opacity", 0); });
      setCounter(0);
    }
    function play() { reset(); if (!running) { running = true; requestAnimationFrame(frame); } }
    function still() {
      G.allRent.forEach(function (p) { p.style.strokeDashoffset = 0; });
      G.allHome.forEach(function (p) { p.style.strokeDashoffset = 0; });
      JOBS.forEach(function (j) {
        if (j.s === "moved") { j.rent.forEach(function (p) { p.classList.add("gone"); }); j.label.classList.add("hl"); }
        if (j.s === "stayed") j.rent.forEach(function (p) { p.classList.add("stay"); });
        j.stat.classList.add("on"); j.test.forEach(function (p) { p.classList.add("on"); });
      });
      $$(".fade", gT).forEach(function (e) { e.classList.add("on"); });
      setCounter(SAVED); done = true;
    }
    var started = false;
    build();
    if (reduce || !hasIO) still();
    else {
      reset();
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible && !started) { started = true; play(); }
          else if (visible && !running && !done) { running = true; last = null; requestAnimationFrame(frame); }
        });
      }, { threshold: 0.35 }).observe(svg);
    }
    var rz;
    w.addEventListener("resize", function () {
      clearTimeout(rz); rz = setTimeout(function () {
        var c = svg.parentNode.clientWidth < 560; if (c === compact) return;
        build(); if (done || reduce || !started) { if (started || reduce) still(); else reset(); } else play();
      }, 150);
    });
    $("#replay").addEventListener("click", function () { if (reduce) return; started = true; visible = true; play(); });
  })();

  /* =====================================================================
     3. HOW IT WORKS: six strands of light, one gate, two homes
     ===================================================================== */
  (function how() {
    var sec = $("#how"), cv = $("#howCanvas"), fig = $(".how-fig"), rail = $("#beats");
    if (!sec || !cv) return;
    var ctx = cv.getContext("2d");
    var beats = $$(".beat", sec);
    var labels = { "new": $(".hf-new", fig), fb: $(".hf-fb", fig), lesson: $(".hf-lesson", fig) };
    var W = 0, H = 0, DPR = 1, mob = false, beat = 0;
    var NS = 6, NEW = 5, FB = 3, LEARN = 4;
    // per-strand live values (eased toward targets)
    var S = [];
    for (var j = 0; j < NS; j++) S.push({ vis: j === NEW ? 0 : 1, b: 0, probe: 0, hot: 0 });
    var gate = 0, fbOn = 0, lessonOn = 0;
    var TARGET = [
      { vis: [1, 1, 1, 1, 1, 0], b: [0, 0, 0, 0, 0, 0], probe: [0, 0, 0, 0, 0, 0], hot: [0, 0, 0, 0, 0, 0], fb: 0, lesson: 0 },
      { vis: [1, 1, 1, 1, 1, 1], b: [0, 0, 0, 0, 0, 0], probe: [0, 0, 0, 0, 0, 0], hot: [0, 0, 0, 0, 0, 1], fb: 0, lesson: 0 },
      { vis: [1, 1, 1, 1, 1, 1], b: [1, 1, 1, 0, 0, 0], probe: [0, 0, 0, 1, 1, 1], hot: [0, 0, 0, 0, 0, 0], fb: 1, lesson: 0 },
      { vis: [1, 1, 1, 1, 1, 1], b: [1, 1, 1, 0, 1, 0], probe: [0, 0, 0, 1, 0, 1], hot: [0, 0, 0, 0, 0, 0], fb: 1, lesson: 1 }
    ];
    // geometry (fractions of the canvas)
    var G = {};
    function geo() {
      G.ax = W * (mob ? 0.05 : 0.13); G.ay = H * 0.5;
      G.gx = W * (mob ? 0.32 : 0.38); G.nx = W * (mob ? 0.93 : 0.92);
      G.apiTop = H * 0.13; G.apiBot = H * 0.29; G.homeTop = H * 0.71; G.homeBot = H * 0.87;
    }
    var gy = function (j) { return H * (0.25 + j * 0.1); };
    var apiY = function (j) { return G.apiTop + (G.apiBot - G.apiTop) * (j + 0.5) / NS; };
    var homeY = function (j) { return G.homeTop + (G.homeBot - G.homeTop) * (j + 0.5) / NS; };
    function bez(p0, c1, c2, p1, t) {
      var u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1;
    }
    var S1 = 0.34;
    function pt(j, u, b, out) {
      var ay = G.ay + (j - 2.5) * H * 0.012, y1 = gy(j);
      if (u < S1) {
        var t = u / S1, mx = G.ax + (G.gx - G.ax) * 0.5;
        out[0] = bez(G.ax, mx, mx, G.gx, t); out[1] = bez(ay, ay, y1, y1, t);
      } else {
        var t2 = (u - S1) / (1 - S1), ey = apiY(j) + (homeY(j) - apiY(j)) * b, mx2 = G.gx + (G.nx - G.gx) * 0.5;
        out[0] = bez(G.gx, mx2, mx2, G.nx, t2); out[1] = bez(y1, y1, ey, ey, t2);
      }
      return out;
    }
    var BRICK = [201, 105, 74], GOLD = [216, 180, 106], GOLDL = [240, 214, 160], IVORY = [243, 238, 227], SAGE = [157, 180, 154];
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a.toFixed(3) + ")"; }
    function strandCol(j) {
      var s = S[j], c = mix(BRICK, GOLD, s.b);
      if (s.hot > 0.01) c = mix(c, IVORY, s.hot * 0.8);
      return c;
    }

    // particles
    var PER = 22, parts = [];
    for (j = 0; j < NS; j++) for (var k = 0; k < PER; k++) parts.push({ j: j, u: Math.random(), v: 0.075 + Math.random() * 0.05, x: 0, y: 0, px: NaN, py: NaN });
    var sparks = [], sparkT = 0, tmp = [0, 0];

    function layout() {
      var r = fig.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height); mob = W < 640;
      DPR = Math.min(w.devicePixelRatio || 1, mob ? 1.5 : 1.75);
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      geo();
      parts.forEach(function (p) { p.px = NaN; });
      placeLabels();
      if (reduce) drawStill();
    }
    function placeLabels() {
      pt(NEW, 0.2, 0, tmp);
      labels["new"].style.left = (tmp[0] / W * 100) + "%"; labels["new"].style.top = ((tmp[1] + (mob ? 18 : 24)) / H * 100) + "%";
      pt(FB, 0.66, 0.42, tmp);
      labels.fb.style.left = (tmp[0] / W * 100) + "%"; labels.fb.style.top = ((tmp[1] - (mob ? 14 : 18)) / H * 100) + "%";
      labels.lesson.style.left = ((G.gx + (G.nx - G.gx) * 0.42) / W * 100) + "%"; labels.lesson.style.top = ((G.homeTop - (mob ? 26 : 34)) / H * 100) + "%";
    }

    function strandPath(j, b) {
      ctx.beginPath();
      for (var i = 0; i <= 48; i++) { pt(j, i / 48, b, tmp); if (i) ctx.lineTo(tmp[0], tmp[1]); else ctx.moveTo(tmp[0], tmp[1]); }
    }
    function probePath(j) {
      var y1 = gy(j), hy = homeY(j), mx = G.gx + (G.nx - G.gx) * 0.5;
      ctx.beginPath(); ctx.moveTo(G.gx, y1); ctx.bezierCurveTo(mx, y1, mx, hy, G.nx, hy);
    }
    function lessonPt(t, out) {
      // a miss travels from the fallback strand's turning point down into your model
      pt(FB, 0.62, 0.42, out); var x0 = out[0], y0 = out[1];
      var x1 = G.nx, y1 = homeY(FB);
      var u = 1 - t;
      out[0] = u * u * x0 + 2 * u * t * (x0 + (x1 - x0) * 0.2) + t * t * x1;
      out[1] = u * u * y0 + 2 * u * t * (y1 + 10) + t * t * y1;
      return out;
    }
    function drawFrame(time, dt, still) {
      // long exposure: fade the last frame toward the page navy, then add light
      if (still) ctx.clearRect(0, 0, W, H);
      else {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.86, dt)).toFixed(3) + ")";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
      }
      // nodes and gate
      ctx.lineCap = "round";
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = rgba(BRICK, 0.85); ctx.beginPath(); ctx.moveTo(G.nx, G.apiTop); ctx.lineTo(G.nx, G.apiBot); ctx.stroke();
      ctx.strokeStyle = rgba(GOLD, 0.95); ctx.beginPath(); ctx.moveTo(G.nx, G.homeTop); ctx.lineTo(G.nx, G.homeBot); ctx.stroke();
      ctx.fillStyle = rgba(IVORY, 0.85); ctx.beginPath(); ctx.arc(G.ax, G.ay, 2.6, 0, 6.283); ctx.fill();
      var gl = H * 0.16 + (H * 0.68) * gate;
      ctx.strokeStyle = rgba(GOLD, 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(G.gx, H * 0.16); ctx.lineTo(G.gx, gl); ctx.stroke();
      ctx.strokeStyle = rgba(GOLD, 0.12); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(G.gx, H * 0.16); ctx.lineTo(G.gx, gl); ctx.stroke();
      // strands as hairlines
      for (var j = 0; j < NS; j++) {
        var s = S[j]; if (s.vis < 0.01) continue;
        var bb = s.b + (j === FB ? fbBend(time) : 0);
        var c = strandCol(j);
        if (j === FB && fbOn > 0.01) c = mix(c, BRICK, 1);
        if (still) {
          // a long exposure, frozen: a soft glow under each strand
          ctx.lineWidth = 5; ctx.strokeStyle = rgba(s.b > 0.5 ? GOLDL : c, 0.08 * s.vis);
          strandPath(j, bb); ctx.stroke();
        }
        ctx.lineWidth = still ? 1.3 : 1;
        ctx.strokeStyle = rgba(s.b > 0.5 && still ? GOLDL : c, (still ? 0.75 : 0.22) * s.vis + s.hot * 0.3);
        strandPath(j, bb); ctx.stroke();
        if (s.probe > 0.01) {
          ctx.setLineDash([2, 5]); ctx.lineDashOffset = still ? 0 : -time * 18;
          ctx.strokeStyle = rgba(SAGE, 0.55 * s.probe); probePath(j); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (still) {
        // the try that fell back, and the lesson it left
        ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(BRICK, 0.7);
        strandPath(FB, 0.42); ctx.stroke();
        ctx.setLineDash([1, 4]); ctx.strokeStyle = rgba(GOLDL, 0.6 * lessonOn); ctx.beginPath();
        for (var i = 0; i <= 30; i++) { lessonPt(i / 30, tmp); if (i) ctx.lineTo(tmp[0], tmp[1]); else ctx.moveTo(tmp[0], tmp[1]); }
        ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      // light: particles along the strands
      ctx.globalCompositeOperation = "lighter";
      for (var n = 0; n < parts.length; n++) {
        var p = parts[n], st = S[p.j];
        p.u += p.v * dt / 60 * (st.hot > 0.5 ? 1.2 : 1);
        if (p.u > 1) { p.u -= 1; p.px = NaN; }
        if (st.vis < 0.02) { p.px = NaN; continue; }
        pt(p.j, p.u, st.b + (p.j === FB ? fbBend(time) : 0), tmp);
        if (p.px === p.px) {
          var col = strandCol(p.j);
          if (p.j === FB && fbOn > 0.01 && p.u > S1) col = mix(col, BRICK, 1);
          var home = st.b > 0.5 && p.u > S1;
          var a = st.vis * (0.55 + 0.45 * Math.sin(p.u * Math.PI)) * (home ? 1 : 0.8);
          if (!(p.j === FB && fbOn > 0.01)) {   // the bending strand stays crisp, or its trail turns to fuzz
            ctx.strokeStyle = rgba(home ? mix(col, GOLDL, 0.35) : col, 0.14 * a); ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(tmp[0], tmp[1]); ctx.stroke();
          }
          ctx.strokeStyle = rgba(home ? GOLDL : col, 0.9 * a); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(tmp[0], tmp[1]); ctx.stroke();
        }
        p.px = tmp[0]; p.py = tmp[1];
      }
      // a new feature gets noticed: a ring where it crosses the gate
      if (S[NEW].hot > 0.05) {
        var rr = (time % 1.6) / 1.6;
        ctx.strokeStyle = rgba(GOLDL, (1 - rr) * 0.8 * S[NEW].hot); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(G.gx, gy(NEW), 4 + rr * 22, 0, 6.283); ctx.stroke();
      }
      // lessons: sparks run from each miss into your model
      if (lessonOn > 0.5) {
        sparkT += dt / 60;
        if (sparkT > 1.1) { sparkT = 0; sparks.push({ t: 0, px: NaN, py: NaN }); }
      }
      for (var q = sparks.length - 1; q >= 0; q--) {
        var sp = sparks[q]; sp.t += dt / 60 / 1.6;
        if (sp.t >= 1) { sparks.splice(q, 1); continue; }
        lessonPt(easeIO(sp.t), tmp);
        if (sp.px === sp.px) {
          ctx.strokeStyle = rgba(GOLDL, 0.95); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sp.px, sp.py); ctx.lineTo(tmp[0], tmp[1]); ctx.stroke();
        }
        sp.px = tmp[0]; sp.py = tmp[1];
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // the miss: strand bends toward home, then snaps back to the API
    function fbBend(time) {
      if (fbOn < 0.01) return 0;
      var c = (time % 3.4) / 3.4, v;
      if (c < 0.4) v = easeIO(c / 0.4); else if (c < 0.55) v = 1; else if (c < 0.75) v = 1 - easeIO((c - 0.55) / 0.2); else v = 0;
      return 0.42 * v * fbOn;
    }
    function approach(dt) {
      var T = TARGET[beat], k = 1 - Math.pow(0.955, dt);
      for (var j = 0; j < NS; j++) {
        var s = S[j];
        s.vis += (T.vis[j] - s.vis) * k; s.b += (T.b[j] - s.b) * k * 0.8;
        s.probe += (T.probe[j] - s.probe) * k; s.hot += (T.hot[j] - s.hot) * k;
      }
      gate += (1 - gate) * k * 0.8; fbOn += (T.fb - fbOn) * k; lessonOn += (T.lesson - lessonOn) * k;
    }
    function drawStill() {
      var T = TARGET[3];
      for (var j = 0; j < NS; j++) { S[j].vis = T.vis[j]; S[j].b = T.b[j]; S[j].probe = T.probe[j]; S[j].hot = 0; }
      gate = 1; fbOn = 0; lessonOn = 1;
      drawFrame(0, 1, true);
    }

    function setBeat(b) {
      if (b === beat && fig.dataset.b) return;
      beat = b; fig.dataset.b = String(b);
      beats.forEach(function (el, i) { el.classList.toggle("is-on", i === b); });
    }
    var vis = false, raf = 0, last = 0, t0 = performance.now();
    function loop(now) {
      raf = 0;
      if (!vis || d.hidden) return;
      var dt = clamp((now - last) / (1000 / 60), 0.25, 3); last = now;
      approach(dt); drawFrame((now - t0) / 1000, dt, false);
      raf = requestAnimationFrame(loop);
    }
    function onScroll() {
      var r = sec.getBoundingClientRect(), span = r.height - w.innerHeight;
      var p = clamp(-r.top / span, 0, 1);
      if (rail) rail.style.setProperty("--p", p.toFixed(3));
      setBeat(Math.min(3, Math.floor(p * 4.0)));
    }

    layout();
    if (reduce) { fig.dataset.b = "3"; return; }
    setBeat(0);
    w.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    seen(sec, function (v) { vis = v; if (vis && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
    d.addEventListener("visibilitychange", function () { if (!d.hidden && vis && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
    var rz, lw = w.innerWidth;
    w.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (w.innerWidth !== lw || !mob) { lw = w.innerWidth; layout(); } }, 150); });
  })();

  /* =====================================================================
     4. SEE IT WORK: a tmux-style session. It opens mid-session (capture,
        workloads and shadow already ran), so the first verdict lands in
        about a second and a half.
     ===================================================================== */
  (function term() {
    var fc = $("#tmFlow"), tscroll = $("#tscroll"), tmux = $("#tmux");
    if (!fc || !tscroll) return;
    var COL = { gold: "#D8B46A", goldHi: "#E9CF95", ivory: "#F3EEE3", brick: "#C9694A", sage: "#9DB49A" };
    var hex = function (h, a) { var n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; };
    var fmt0 = function (v) { return "$" + Math.round(v).toLocaleString("en-US"); };
    var fmt2 = function (v) { return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var JOBS = [
      { id: "chat", api: 4523.51, final: "moved" },
      { id: "classification", api: 2341.91, final: "moved" },
      { id: "extraction", api: 5652.59, final: "moved" },
      { id: "summarization", api: 7235.34, final: "testing" },
      { id: "code", api: 1937.46, final: "testing" },
      { id: "agent", api: 5524.31, final: "stayed" }
    ];
    var API_TOTAL = 27215.12, MOVED_TOTAL = 12518.01, GPU = 3635.40;
    var weights = JOBS.map(function (j) { return j.api / API_TOTAL; });

    /* character grid */
    var G, L, parts = [], spawnAcc = 0;
    function grid(fontPx, lineH) {
      var c = fc.getContext("2d"), dpr = Math.min(2, w.devicePixelRatio || 1);
      c.font = "400 " + fontPx + 'px "JetBrains Mono", monospace';
      var cw = c.measureText("M").width;
      return { ctx: c, dpr: dpr, cw: cw, ch: lineH, fontPx: fontPx,
        size: function (wc, hc) { fc.width = Math.round(wc * dpr); fc.height = Math.round(hc * dpr); fc.style.height = hc + "px";
          c.setTransform(dpr, 0, 0, dpr, 0, 0); c.textBaseline = "middle"; c.textAlign = "center"; c.font = "400 " + fontPx + 'px "JetBrains Mono", monospace'; } };
    }
    function seg(pts) {
      var out = [];
      for (var i = 0; i < pts.length - 1; i++) {
        var x = pts[i][0], y = pts[i][1], x2 = pts[i + 1][0], y2 = pts[i + 1][1];
        var dx = Math.sign(x2 - x), dy = Math.sign(y2 - y);
        if (i === 0) out.push([x, y]);
        while (x !== x2 || y !== y2) { x += dx; y += dy; out.push([x, y]); }
      }
      return out;
    }
    function buildLayout() {
      var wc = fc.clientWidth, fontPx = 12.5, lineH = 16;
      G = grid(fontPx, lineH);
      var Wc = Math.floor(wc / G.cw), narrow = Wc < 92;
      if (narrow) { fontPx = 11; lineH = 14.5; G = grid(fontPx, lineH); Wc = Math.floor(wc / G.cw); }
      var lay = { W: Wc, narrow: narrow, boxes: {} };
      if (!narrow) {
        lay.H = 17;
        var aw = 16, T = aw + 5, nw = 15, nodeR = T + nw, fx = nodeR + 2;
        var bw = Math.max(26, Math.min(34, Math.round(Wc * 0.24)));
        lay.boxes.app = { x: 0, y: 6, w: aw, h: 5, title: "YOUR APP", lines: ["6 AI features"], col: "ivory" };
        lay.boxes.node = { x: T, y: 6, w: nw, h: 5, title: "THROTTLE", lines: ["api"], col: "gold", node: true };
        lay.boxes.api = { x: Wc - bw, y: 0, w: bw, h: 5, title: "OPENAI / ANTHROPIC", lines: ["renting", "sample"], col: "brick" };
        lay.boxes.model = { x: Wc - bw, y: 12, w: bw, h: 5, title: "YOUR MODEL", lines: ["llama-3.3-70b", "idle"], col: "gold" };
        lay.inPath = seg([[aw, 8], [T - 1, 8]]);
        lay.api = seg([[nodeR, 8], [fx, 8], [fx, 2], [Wc - bw - 1, 2]]);
        lay.model = seg([[nodeR, 8], [fx, 8], [fx, 14], [Wc - bw - 1, 14]]);
        var tx = fx + 4;
        lay.table = { x: tx, y: 5, w: Math.min(42, Wc - bw - tx - 4) };
      } else {
        lay.H = 27;
        var cx = Math.floor(Wc / 2), bw2 = Math.floor((Wc - 2) / 2);
        lay.boxes.app = { x: cx - 9, y: 0, w: 18, h: 4, title: "YOUR APP", lines: ["6 AI features"], col: "ivory" };
        lay.boxes.node = { x: cx - 8, y: 6, w: 16, h: 4, title: "THROTTLE", lines: ["api"], col: "gold", node: true };
        lay.boxes.api = { x: 0, y: 14, w: bw2, h: 5, title: "OPENAI/ANTHROPIC", lines: ["renting", "sample"], col: "brick" };
        lay.boxes.model = { x: Wc - bw2, y: 14, w: bw2, h: 5, title: "YOUR MODEL", lines: ["in your cloud", "idle"], col: "gold" };
        var axc = Math.floor(bw2 / 2), mxc = Wc - bw2 + Math.floor(bw2 / 2);
        lay.inPath = seg([[cx, 4], [cx, 5]]);
        lay.api = seg([[cx, 10], [cx, 11], [axc, 11], [axc, 13]]);
        lay.model = seg([[cx, 10], [cx, 11], [mxc, 11], [mxc, 13]]);
        lay.table = { x: 1, y: 20, w: Wc - 2 };
      }
      L = lay;
      G.size(wc, lay.H * G.ch + 2);
      parts = [];
    }
    var BOXCH = { 3: "╰", 5: "│", 6: "╭", 9: "╯", 10: "─", 12: "╮", 7: "├", 13: "┤", 14: "┬", 11: "┴", 15: "┼", 2: "─", 8: "─", 1: "│", 4: "│" };
    var DASHCH = { 5: "┆", 10: "┄", 1: "┆", 4: "┆", 2: "┄", 8: "┄" };
    function laneBits(path, i) {
      var b = 0, x = path[i][0], y = path[i][1];
      var nb = function (p) { if (!p) return; if (p[0] < x) b |= 8; else if (p[0] > x) b |= 2; else if (p[1] < y) b |= 1; else if (p[1] > y) b |= 4; };
      nb(path[i - 1]); nb(path[i + 1]);
      if (i === 0 || i === path.length - 1) { var o = path[i === 0 ? 1 : i - 1]; if (o) { if (o[0] !== x) b |= 10; else if (o[1] !== y) b |= 5; } }
      return b;
    }
    function cell(ch, x, y, color, a) { var c = G.ctx; c.fillStyle = hex(color, a); c.fillText(ch, x * G.cw + G.cw / 2, y * G.ch + G.ch / 2 + 1); }
    function text(s, x, y, color, a) { for (var i = 0; i < s.length; i++) if (s[i] !== " ") cell(s[i], x + i, y, color, a); }

    var F = {};
    function resetFlow() {
      F = { run: false, jobs: JOBS.map(function () { return "api"; }), table: JOBS.map(function () { return "──"; }), lane: "hidden", reveal: 0, shadowReveal: 0,
        saveT: 0, saveS: 0, movedT: 0, movedS: 0, gpuT: 0, gpuS: 0, apiT: API_TOTAL, apiS: API_TOTAL, flashApi: 0, flashModel: 0 };
      parts = []; roCache = "";
    }
    function nMoved() { return F.jobs.filter(function (v) { return v === "moved"; }).length; }
    function drawBox(b) {
      var col = COL[b.col] || COL.ivory, a = 0.55, flash = 0;
      if (b === L.boxes.api) flash = F.flashApi;
      if (b === L.boxes.model) { flash = F.flashModel; a = F.lane === "hidden" ? 0.28 : 0.6; }
      if (b.node) a = 0.85;
      var ba = Math.min(1, a + flash * 0.45), x = b.x, y = b.y, wd = b.w, h = b.h, i;
      cell("╭", x, y, col, ba); cell("╮", x + wd - 1, y, col, ba); cell("╰", x, y + h - 1, col, ba); cell("╯", x + wd - 1, y + h - 1, col, ba);
      for (i = 1; i < wd - 1; i++) { cell("─", x + i, y, col, ba); cell("─", x + i, y + h - 1, col, ba); }
      for (i = 1; i < h - 1; i++) { cell("│", x, y + i, col, ba); cell("│", x + wd - 1, y + i, col, ba); }
      text(b.title, x + 2, y + 1, b.col === "ivory" ? COL.ivory : col, b === L.boxes.model && F.lane === "hidden" ? 0.45 : 0.95);
      var lines = b.lines.slice(), nm = nMoved();
      if (b === L.boxes.api) lines[0] = (L.narrow ? "" : "renting ") + fmt0(F.apiS) + "/mo";
      if (b === L.boxes.model) {
        lines[1] = nm ? (L.narrow ? nm + " of 6 jobs" : "serving " + nm + " of 6 jobs") : (F.lane === "shadow" ? (L.narrow ? "testing" : "testing in shadow") : "idle");
      }
      if (b.node) lines = [nm ? "▼ home ▲ api" : (F.lane === "shadow" ? "▲ api ┆ test" : "▲ api")];
      lines.forEach(function (ln, k) {
        var c = COL.ivory, al = 0.62;
        if (b === L.boxes.api && k === 0) { c = COL.brick; al = 0.95; }
        if (b === L.boxes.api && k === 1) { c = COL.ivory; al = 0.3; }
        if (b === L.boxes.model && k === 1 && nm) { c = COL.goldHi; al = 0.95; }
        if (b.node) { c = COL.gold; al = 0.75; }
        var lx = b.node ? x + Math.max(1, Math.floor((wd - ln.length) / 2)) : x + 2;
        text(ln.slice(0, wd - 2), lx, y + 2 + k, c, al);
      });
    }
    function drawLanes() {
      L.inPath.forEach(function (p, i) { cell(BOXCH[laneBits(L.inPath, i)] || "─", p[0], p[1], COL.ivory, 0.2); });
      var A = L.api, M = L.model, key = function (p) { return p[0] + "," + p[1]; };
      var mSet = {}; M.forEach(function (p, i) { mSet[key(p)] = i; });
      A.forEach(function (p, i) {
        var b = laneBits(A, i), mi = mSet[key(p)];
        if (mi !== undefined && F.lane !== "hidden") b |= laneBits(M, mi);
        cell(BOXCH[b] || "─", p[0], p[1], COL.brick, 0.32);
      });
      var ae = A[A.length - 1]; cell(L.narrow ? "▼" : "▶", ae[0], ae[1], COL.brick, 0.55);
      if (F.lane === "hidden") return;
      var aKeys = {}; A.forEach(function (p) { aKeys[key(p)] = 1; });
      var live = F.lane === "live";
      M.forEach(function (p, i) {
        if (aKeys[key(p)]) return;
        var b = laneBits(M, i), solid = live && i <= F.reveal, sh = i <= F.shadowReveal;
        if (!solid && !sh) return;
        var ch = solid ? (BOXCH[b] || "─") : (DASHCH[b] || BOXCH[b] || "┄");
        var head = live && Math.abs(i - F.reveal) < 1.5;
        cell(ch, p[0], p[1], head ? COL.goldHi : COL.gold, solid ? (head ? 1 : 0.55) : 0.3);
      });
      var me = M[M.length - 1];
      if (live ? F.reveal >= M.length - 1 : F.shadowReveal >= M.length - 1) cell(L.narrow ? "▼" : "▶", me[0], me[1], COL.gold, live ? 0.8 : 0.35);
    }
    function drawLegend() {
      if (L.narrow) return;
      var y = L.H - 3;
      cell("›", 0, y, COL.ivory, 0.8); text("a request", 2, y, COL.ivory, 0.36);
      cell("$", 0, y + 1, COL.brick, 1); text("paid to the API", 2, y + 1, COL.ivory, 0.36);
      cell("$", 0, y + 2, COL.goldHi, 1); text("kept home", 2, y + 2, COL.ivory, 0.36);
    }
    function drawTable() {
      var t = L.table; if (!t || t.w < 23) return;
      text("JOB", t.x, t.y, COL.ivory, 0.36); text("ROUTE", t.x + t.w - 7, t.y, COL.ivory, 0.36);
      JOBS.forEach(function (j, i) {
        var y = t.y + 1 + i, s = F.table[i];
        text(j.id, t.x, y, COL.ivory, 0.72);
        text(new Array(Math.max(1, t.w - 16 - 9) + 1).join("·"), t.x + 16, y, COL.ivory, 0.13);
        var c = COL.ivory, a = 0.35;
        if (s === "MOVED") { c = COL.goldHi; a = 1; } else if (s === "TESTING" || s === "SHADOW") { c = COL.ivory; a = 0.7; }
        else if (s === "PASS") { c = COL.gold; a = 0.85; } else if (s === "STAYED") { c = COL.brick; a = 0.9; }
        text(("       " + s).slice(-7), t.x + t.w - 7, y, c, a);
      });
    }
    var REQ = ["›", "{", "}", "›", "⋯", "»"];
    function spawn() {
      var r = Math.random(), j = 0;
      for (; j < JOBS.length; j++) { r -= weights[j]; if (r <= 0) break; }
      j = Math.min(j, JOBS.length - 1);
      parts.push({ j: j, pos: 0, stage: "in", path: L.inPath, speed: (L.narrow ? 13 : 24) * (0.85 + Math.random() * 0.3), req: REQ[(Math.random() * REQ.length) | 0], kind: "real" });
    }
    function stepParts(dt) {
      var out = [];
      parts.forEach(function (p) {
        p.pos += p.speed * dt;
        if (p.pos >= p.path.length) {
          if (p.stage === "in") {
            var s = F.jobs[p.j];
            if (s === "moved") { p.stage = "model"; p.path = L.model; }
            else { p.stage = "api"; p.path = L.api; if (s === "testing" && F.lane !== "hidden") out.push({ j: p.j, pos: 0, stage: "model", path: L.model, speed: p.speed * 0.92, kind: "shadow" }); }
            p.pos = 0; out.push(p); return;
          }
          if (p.stage === "api") F.flashApi = 1;
          if (p.stage === "model" && p.kind === "real") F.flashModel = 1;
          return;
        }
        out.push(p);
      });
      parts = out;
    }
    function drawParts() {
      var c = G.ctx;
      parts.forEach(function (p) {
        var head = Math.floor(p.pos), P = p.path, col, glyph, a = 1;
        if (p.stage === "in") { col = COL.ivory; glyph = p.req; a = 0.85; }
        else if (p.stage === "api") { col = COL.brick; glyph = "$"; }
        else { col = p.kind === "shadow" ? COL.gold : COL.goldHi; glyph = p.kind === "shadow" ? "·" : "$"; a = p.kind === "shadow" ? 0.55 : 1; }
        if (p.kind !== "shadow") for (var k = 5; k >= 1; k--) {
          var i = head - k, q = P[i]; if (!q) continue;
          c.fillStyle = "#0A1532"; c.fillRect(q[0] * G.cw, q[1] * G.ch + 1, G.cw, G.ch - 2);
          cell(BOXCH[laneBits(P, i)] || "─", q[0], q[1], col, a * (1 - k / 6) * 0.9);
        }
        var h = P[Math.min(head, P.length - 1)];
        c.fillStyle = "#0A1532"; c.fillRect(h[0] * G.cw, h[1] * G.ch + 1, G.cw, G.ch - 2);
        cell(glyph, h[0], h[1], col, a);
      });
    }
    function tick(dt) {
      if (F.run) { spawnAcc += dt * (L.narrow ? 3.2 : 5.2); while (spawnAcc > 1) { spawnAcc -= 1; spawn(); } }
      stepParts(dt);
      if (F.lane !== "hidden") F.shadowReveal = Math.min(L.model.length, F.shadowReveal + dt * 60);
      if (F.lane === "live") F.reveal = Math.min(L.model.length + 2, F.reveal + dt * 26);
      F.flashApi = Math.max(0, F.flashApi - dt * 3); F.flashModel = Math.max(0, F.flashModel - dt * 3);
      var e = (1 - Math.pow(0.0015, dt)) * 0.9;
      F.saveS += (F.saveT - F.saveS) * e; F.apiS += (F.apiT - F.apiS) * e; F.movedS += (F.movedT - F.movedS) * e; F.gpuS += (F.gpuT - F.gpuS) * e;
      if (Math.abs(F.saveT - F.saveS) < 0.01) F.saveS = F.saveT;
    }
    function render() {
      G.ctx.clearRect(0, 0, fc.width, fc.height);
      drawLanes(); drawTable(); drawLegend();
      Object.keys(L.boxes).forEach(function (k) { drawBox(L.boxes[k]); });
      drawParts();
    }
    var ro = { api: $("#roApi"), moved: $("#roMoved"), gpu: $("#roGpu"), save: $("#roSave") }, roCache = "";
    var stSave = $("#stSave"), stStep = $("#stStep");
    function readout() {
      var k = [Math.round(F.apiS), Math.round(F.movedS), Math.round(F.gpuS), F.saveS.toFixed(2)].join("|");
      if (k === roCache) return; roCache = k;
      ro.api.innerHTML = fmt0(F.apiS) + "<small>/mo</small>";
      ro.moved.innerHTML = fmt0(F.movedS) + "<small>/mo</small>";
      ro.gpu.innerHTML = fmt0(F.gpuS) + "<small>/mo</small>";
      ro.save.innerHTML = fmt2(F.saveS) + "<small>/mo</small>";
      stSave.textContent = "saved " + fmt2(F.saveS) + "/mo";
    }
    function money() {
      var moved = JOBS.reduce(function (s, j, i) { return s + (F.jobs[i] === "moved" ? j.api : 0); }, 0);
      F.movedT = moved; F.gpuT = moved > 0 ? GPU : 0;
      F.saveT = moved > 0 ? Math.max(0, moved - GPU) : 0;
      if (Math.abs(moved - MOVED_TOTAL) < 0.01) F.saveT = SAVED;
      F.apiT = API_TOTAL - moved;
    }
    var FX = {
      start: function () { F.run = true; },
      workloads: function () { F.table = JOBS.map(function () { return "API"; }); },
      shadow: function () { F.lane = "shadow"; F.jobs = JOBS.map(function () { return "testing"; }); F.table = JOBS.map(function () { return "SHADOW"; }); },
      eval: function (i) { var f = JOBS[i].final; F.table[i] = f === "moved" ? "PASS" : f === "testing" ? "TESTING" : "STAYED"; if (f === "stayed") F.jobs[i] = "api"; },
      live: function () { F.lane = "live"; F.reveal = 0; },
      route: function (i) { var f = JOBS[i].final; F.jobs[i] = f === "moved" ? "moved" : f === "testing" ? "testing" : "api"; F.table[i] = f === "moved" ? "MOVED" : f === "testing" ? "TESTING" : "STAYED"; money(); }
    };

    /* the session */
    var Sx = function (cls, s) { return '<span class="t-' + cls + '">' + s + "</span>"; };
    var pad = function (s, n) { return s + new Array(Math.max(0, n - s.length) + 1).join(" "); };
    var lpad = function (s, n) { return new Array(Math.max(0, n - s.length) + 1).join(" ") + s; };
    var PROMPT = Sx("p", "❯") + " ";
    var byApi = JOBS.slice().sort(function (a, b) { return b.api - a.api; });
    var HISTORY = [
      { cmd: "throttle capture" },
      { out: Sx("g", "●") + " recording on your machines, redacted" },
      { out: Sx("d", "  sending to  ") + "none " + Sx("d", "(stays in your cloud)") },
      { out: Sx("d", "  found       ") + "6 jobs across your AI calls" },
      { cmd: "throttle workloads" },
      { out: Sx("d", pad("  JOB", 20) + "   API $/MO") }
    ].concat(byApi.map(function (j) { return { out: "  " + pad(j.id, 18) + Sx("w", lpad(fmt0(j.api), 10)) }; })).concat([
      { out: Sx("d", "  ─".concat(new Array(29).join("─"))) },
      { out: "  " + pad("total", 18) + Sx("r", lpad(fmt0(API_TOTAL), 10)) + Sx("d", "  sample") },
      { cmd: "throttle shadow --candidate-model llama-3.3-70b" },
      { out: Sx("g", "┆") + " mirroring a sample of live traffic to your GPUs" },
      { out: Sx("d", "  users still get the API answer meanwhile") }
    ]);
    var LIVE = [
      { cmd: "throttle eval" }
    ].concat([2, 0, 1, 3, 4, 5].map(function (i) {
      var j = JOBS[i], f = j.final;
      var v = f === "moved" ? Sx("g", "✓ pass") : f === "testing" ? Sx("w", "~ needs tuning") : Sx("r", "× stays on the api");
      return { out: "  " + pad(j.id, 18) + v, fx: "eval", arg: i, wait: 300 };
    })).concat([
      { pause: 600 },
      { cmd: "throttle route", fx: "live" }
    ]).concat([2, 0, 1].map(function (i) { return { out: "  " + pad(JOBS[i].id, 18) + Sx("g", "→ your model") + Sx("d", "  fallback: api"), fx: "route", arg: i, wait: 640 }; })).concat([
      { out: "  " + pad("summarization", 18) + Sx("d", "· testing, stays on api"), fx: "route", arg: 3, wait: 260 },
      { out: "  " + pad("code", 18) + Sx("d", "· testing, stays on api"), fx: "route", arg: 4, wait: 200 },
      { out: "  " + pad("agent", 18) + Sx("r", "· stays on api"), fx: "route", arg: 5, wait: 200 },
      { pause: 900 },
      { cmd: "throttle report" },
      { out: "  " + pad("API bill", 16) + Sx("w", pad("$27,215/mo", 14)) + Sx("d", "sample") },
      { out: "  " + pad("moved", 16) + Sx("w", "$12,518/mo"), wait: 120 },
      { out: "  " + pad("your GPUs", 16) + Sx("w", "$3,635/mo"), wait: 120 },
      { out: "  " + pad("saved", 16) + Sx("g", "$8,882.61/mo"), wait: 180 },
      { prompt: true }
    ]);
    var runId = 0;
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    function addLine(html) { var dv = d.createElement("div"); dv.className = "ln"; dv.innerHTML = html; tscroll.appendChild(dv); while (tscroll.children.length > 60) tscroll.firstChild.remove(); return dv; }
    function prefill() {
      tscroll.innerHTML = "";
      HISTORY.forEach(function (st) { if (st.cmd) addLine(PROMPT + Sx("c", st.cmd)); else addLine(st.out); });
      resetFlow(); FX.start(); FX.workloads(); FX.shadow(); F.shadowReveal = 999;
      for (var i = 0; i < 90; i++) tick(1 / 30);   // two seconds of traffic already on the wire
      stStep.textContent = "shadow";
    }
    async function run() {
      var id = ++runId;
      prefill(); readout();
      await sleep(350);
      for (var n = 0; n < LIVE.length; n++) {
        var st = LIVE[n];
        if (id !== runId) return;
        if (st.pause) { await sleep(st.pause); continue; }
        if (st.cmd) {
          var ln = addLine(PROMPT + '<span class="t-c"></span><span class="cur"></span>'), c = ln.querySelector(".t-c");
          await sleep(220);
          for (var i = 0; i < st.cmd.length; i++) {
            if (id !== runId) return;
            c.textContent = st.cmd.slice(0, i + 1);
            await sleep(16 + Math.random() * 30 + (st.cmd[i] === " " ? 30 : 0));
          }
          await sleep(200);
          var cu = ln.querySelector(".cur"); if (cu) cu.remove();
          stStep.textContent = st.cmd.split(" ")[1];
          if (st.fx) FX[st.fx](st.arg);
          continue;
        }
        if (st.prompt) { addLine(PROMPT + '<span class="cur"></span>'); continue; }
        await sleep(st.wait == null ? 140 : st.wait);
        if (id !== runId) return;
        addLine(st.out);
        if (st.fx) FX[st.fx](st.arg);
      }
      // hold the result, then go again if anyone is still watching
      await sleep(9000);
      if (id === runId) { if (visible) run(); else again = true; }
    }
    function finalState() {
      prefill();
      LIVE.forEach(function (st) {
        if (st.cmd) addLine(PROMPT + Sx("c", st.cmd)); else if (st.out) addLine(st.out); else if (st.prompt) addLine(PROMPT + '<span class="cur"></span>');
        if (st.fx) FX[st.fx](st.arg);
      });
      F.reveal = 999; F.saveS = F.saveT; F.apiS = F.apiT; F.movedS = F.movedT; F.gpuS = F.gpuT;
      stStep.textContent = "report";
      // a still frame: a few requests along each live path
      parts = [];
      var put = function (stage, path, n) { for (var k = 0; k < n; k++) parts.push({ j: 0, stage: stage, path: path, pos: Math.floor((k + 0.6) * path.length / n), kind: "real", req: "›" }); };
      put("in", L.inPath, L.narrow ? 1 : 3); put("api", L.api, L.narrow ? 1 : 4); put("model", L.model, L.narrow ? 2 : 6);
      render(); readout();
    }

    var visible = false, started = false, again = false, raf = 0, lastT = 0;
    function frame(t) {
      raf = 0;
      if (!visible || d.hidden) return;
      var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
      tick(dt); render(); readout();
      raf = requestAnimationFrame(frame);
    }
    function boot() {
      buildLayout(); resetFlow();
      if (reduce || !hasIO) { finalState(); return; }
      prefill(); render(); readout();
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible) {
            if (!started || again) { started = true; again = false; run(); }
            if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
          }
        });
      }, { threshold: 0.4 }).observe(tmux);
      $("#tmReplay").addEventListener("click", function () { started = true; run(); });
      var rt, lw = w.innerWidth;
      w.addEventListener("resize", function () {
        clearTimeout(rt); rt = setTimeout(function () {
          if (w.innerWidth === lw) return; lw = w.innerWidth;
          var keep = JSON.parse(JSON.stringify(F)); buildLayout(); F = keep; F.run = keep.run; render();
        }, 150);
      });
    }
    var fontsReady = d.fonts && d.fonts.load ? d.fonts.load('400 13px "JetBrains Mono"').catch(function () {}) : Promise.resolve();
    fontsReady.then(boot);
  })();

  /* =====================================================================
     5. CLOSING BAND: the light again, every stream ending at the button
     ===================================================================== */
  (function close() {
    var stage = $("#closeStage"), canvas = $("#closeFlow"), btn = $("#closeCta");
    if (!stage || !canvas || !w.LightField) return;
    var field = null, vis = false;
    function make() {
      try {
        field = w.LightField({
          canvas: canvas, stage: stage, reduce: reduce, count: [2800, 1800], prewarm: 380, gain: 1.15, gainM: 1.3, fadeM: 0.972, stillShare: 0.8, homeGlow: 1.3, rentGlow: 0.6,
          targets: function (W, H, m) {
            var b = btn.getBoundingClientRect(), s = stage.getBoundingClientRect();
            var bl = b.left - s.left, br = b.right - s.left, by = b.top - s.top + b.height * 0.5;
            if (m) {
              // on a phone the button sits left, so the field runs right to left (mirrored canvas)
              return {
                mirror: true,
                home: { x0: W - br + b.width * 0.12, x1: W - bl - b.width * 0.12, y: by },
                rent: { x: W + 60, y: H * 0.42, spread: H * 0.3 },
                emit: { y0: H * 0.26, y1: H * 0.72 },
                capx: [0.42, 0.22, 0.52, 0.16, 0.36, 0.28, 0.48, 0.20, 0.40]
              };
            }
            return {
              home: { x0: bl + b.width * 0.12, x1: br - b.width * 0.12, y: by },
              rent: { x: W + 80, y: H * 0.14, spread: H * 0.3 },
              emit: { y0: H * 0.12, y1: H * 0.98 },
              capx: [0.30, 0.14, 0.38, 0.10, 0.24, 0.18, 0.34, 0.12, 0.26]
            };
          },
          share: function (t) { return reduce ? 0.8 : 0.35 + 0.45 * easeOut(clamp(t / 4, 0, 1)); }
        });
      } catch (e) { field = null; }
      if (!field) { stage.classList.add("no-gl"); root.classList.add("no-gl-close"); return; }
      field.setActive(vis);
      var rz; w.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { field.layout(); }, 160); });
    }
    if (!hasIO) { make(); return; }
    // build it a little before it scrolls in; run it only while it is on screen
    new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { o.disconnect(); make(); } }, { rootMargin: "100% 0px" }).observe(stage);
    seen(stage, function (v) { vis = v; if (field) field.setActive(v); });
  })();
})();
