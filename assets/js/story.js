/* Throttle "Living light": the home page story.
   1. Hero light field + measured number   2. How it works, drawn in light
   3. Closing band light field
   The hero number is a real measurement (see validation/hotaisle-mi300x-20261001). */
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
          return 0.46 * easeOut(clamp((t - 0.6) / 7.5, 0, 1)) + scroll * 0.44;   // how much of the light reaches home
        },
        onFrame: function () {}
      });
    } catch (e) { field = null; }
    if (!field) { root.classList.add("no-gl"); return; }

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
     2. HOW IT WORKS: six strands of light, one gate, two homes
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
     3. CLOSING BAND: the light again, every stream ending at the button
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
