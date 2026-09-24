(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var io = 'IntersectionObserver' in window;

  /* ---------- nav border on scroll ---------- */
  var nav = $('.nav');
  var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- count-up numbers ---------- */
  function fmt(v, dec, sep) {
    var s = v.toFixed(dec);
    if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return s;
  }
  function countUp(el) {
    if (el.dataset.done) return; el.dataset.done = '1';
    var to = parseFloat(el.dataset.count), dec = +el.dataset.decimals || 0, sep = !!el.dataset.sep;
    if (reduce) { el.textContent = fmt(to, dec, sep); return; }
    var t0 = null, dur = 1600;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(to * e, dec, sep);
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = fmt(0, dec, sep);
    requestAnimationFrame(step);
  }

  /* ---------- scroll reveals ---------- */
  var reveals = $$('.reveal');
  // stagger siblings that reveal together
  reveals.forEach(function (el) {
    var sibs = $$(':scope > .reveal', el.parentNode);
    var i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', Math.min(i, 6) * 0.07 + 's');
  });
  function show(el) {
    el.classList.add('in');
    $$('[data-count]', el).forEach(countUp);
    if (el.hasAttribute('data-count')) countUp(el);
  }
  if (io && !reduce) {
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); rio.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { rio.observe(el); });
  } else {
    reveals.forEach(show);
  }

  /* ---------- copy buttons ---------- */
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.dataset.copy, state = $('.copy-state', btn);
      var done = function () {
        btn.classList.add('copied'); if (state) state.textContent = 'copied';
        setTimeout(function () { btn.classList.remove('copied'); if (state) state.textContent = 'copy'; }, 1800);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = doc.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0'; doc.body.appendChild(ta); ta.select();
        try { doc.execCommand('copy'); done(); } catch (e) {} doc.body.removeChild(ta);
      }
    });
  });

  /* ---------- cursor glow + magnetic buttons ---------- */
  if (finePointer && !reduce) {
    var glow = $('.glow'), gx = 0, gy = 0, tx = 0, ty = 0, gRaf = 0;
    root.classList.add('has-pointer');
    var glowLoop = function () {
      gx += (tx - gx) * 0.14; gy += (ty - gy) * 0.14;
      glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
      gRaf = (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) ? requestAnimationFrame(glowLoop) : 0;
    };
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY; if (!gRaf) gRaf = requestAnimationFrame(glowLoop);
    }, { passive: true });

    $$('.magnetic').forEach(function (el) {
      var strength = 0.22;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (dx * strength).toFixed(1) + 'px,' + (dy * strength * 1.3).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1), background .2s, box-shadow .3s, border-color .2s';
        el.style.transform = '';
        setTimeout(function () { el.style.transition = ''; }, 500);
      });
    });
  }

  /* ---------- hero token stream canvas ---------- */
  (function stream() {
    var cv = $('#stream'); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, lanes = [], packets = [], running = false, visible = true, raf = 0, last = 0;
    function resize() {
      var r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var gap = W < 600 ? 26 : 22, n = Math.floor(H / gap);
      lanes = []; for (var i = 0; i < n; i++) lanes.push({ y: gap * i + gap / 2, v: 30 + Math.random() * 90 });
      packets = [];
      var count = Math.min(220, Math.round(W * H / 5200));
      for (var k = 0; k < count; k++) packets.push(spawn(Math.random() * W));
      if (!running) draw(0);
    }
    function spawn(x) {
      var l = lanes[(Math.random() * lanes.length) | 0];
      return { x: x, lane: l, w: 4 + Math.random() * Math.random() * 30, s: 0.6 + Math.random() * 0.8 };
    }
    function gateX() { return W < 900 ? W * 0.82 : W * 0.56; }
    function draw(dt) {
      ctx.clearRect(0, 0, W, H);
      var g = gateX();
      // gate
      var grd = ctx.createLinearGradient(g - 60, 0, g + 2, 0);
      grd.addColorStop(0, 'rgba(198,255,52,0)'); grd.addColorStop(1, 'rgba(198,255,52,0.07)');
      ctx.fillStyle = grd; ctx.fillRect(g - 60, 0, 62, H);
      ctx.fillStyle = 'rgba(198,255,52,0.35)'; ctx.fillRect(g, 0, 1, H);
      for (var i = 0; i < packets.length; i++) {
        var p = packets[i];
        p.x += p.lane.v * p.s * dt;
        if (p.x > W + 40) { packets[i] = p = spawn(-40 - Math.random() * 80); }
        var past = p.x > g;
        ctx.fillStyle = past ? 'rgba(198,255,52,' + (0.18 + p.s * 0.22).toFixed(2) + ')' : 'rgba(170,178,190,' + (0.08 + p.s * 0.1).toFixed(2) + ')';
        ctx.fillRect(p.x, p.lane.y - 1.5, p.w, 3);
      }
    }
    function loop(t) {
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
      draw(dt);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (running || reduce) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    resize();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 150); });
    if (io) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible && !doc.hidden ? start() : stop(); }).observe(cv);
    doc.addEventListener('visibilitychange', function () { doc.hidden ? stop() : (visible && start()); });
    start();
  })();

  /* ---------- verdict schematic ---------- */
  (function verdict() {
    var box = $('.verdict'); if (!box) return;
    var labels = { cheaper: 'CHEAPER', expensive: 'MORE EXPENSIVE', none: 'NO WINNER' };
    var order = ['cheaper', 'expensive', 'none'], idx = 0, timer = 0, user = false;
    var out = $('.verdict-v', box), tabs = $$('.verdict-tabs button', box);
    function set(v) {
      box.dataset.state = v; out.textContent = labels[v]; idx = order.indexOf(v);
      tabs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.v === v ? 'true' : 'false'); });
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { user = true; clearInterval(timer); set(b.dataset.v); }); });
    if (reduce) return;
    function run() { if (!user) timer = setInterval(function () { set(order[(idx + 1) % 3]); }, 3200); }
    if (io) new IntersectionObserver(function (e) { clearInterval(timer); if (e[0].isIntersecting) run(); }, { threshold: 0.3 }).observe(box);
    else run();
  })();

  /* ---------- terminal replay ---------- */
  (function terminal() {
    var term = $('#term'), runs = window.THROTTLE_RUNS; if (!term || !runs) return;
    var tabsEl = $('.term-tabs', term), body = $('.term-body code', term), pre = $('.term-body', term), note = $('.term-note', term);
    var current = 0, timers = [], started = false, token = 0;
    runs.forEach(function (r, i) {
      var b = doc.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab');
      b.textContent = r.label; b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { play(i); });
      tabsEl.appendChild(b);
    });
    $('.term-replay', term).addEventListener('click', function () { play(current); });

    function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function classify(kind, text) {
      if (kind === 'cmd') return 'tl-cmd';
      if (kind === 'comment') return 'tl-comment';
      var m = text.match(/^\s*→ ([\d.]+)s$/);
      if (m) return parseFloat(m[1]) < 0.1 ? 'tl-hit' : 'tl-miss';
      if (/^RESULT:|per million tokens|^\s*Total redundant|^\s*Observation: [\d.]+% of prompt|^\[HIGH\]|Estimated savings|"(hits|backend_calls)"/.test(text)) return 'tl-key';
      if (/SIMULATED/.test(text)) return 'tl-sim';
      return '';
    }
    function lineHTML(kind, text) {
      if (kind === 'cmd') return '<span class="ps">❯</span> ' + esc(text);
      return esc(text) || ' ';
    }
    function add(kind, text) {
      var span = doc.createElement('span'); span.className = 'tl ' + classify(kind, text);
      span.innerHTML = lineHTML(kind, text);
      body.appendChild(span);
      pre.scrollTop = pre.scrollHeight;
      return span;
    }
    function clear() { timers.forEach(clearTimeout); timers = []; body.textContent = ''; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function cursor() { var c = doc.createElement('span'); c.className = 'cursor'; return c; }

    function play(i) {
      current = i; token++; var my = token;
      $$('button', tabsEl).forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      var run = runs[i]; note.textContent = run.note; clear();
      if (reduce) { run.lines.forEach(function (l) { add(l[1], l[2]); }); return; }
      var t = 250, prev = run.lines[0][0];
      run.lines.forEach(function (l, n) {
        var gap = l[0] - prev; prev = l[0];
        t += gap > 0 ? Math.min(gap * 380, 1100) : (n ? 28 : 0);
        if (l[1] === 'cmd') {
          var text = l[2], per = Math.max(6, Math.min(26, 1000 / text.length));
          (function (start, text) {
            later(function () {
              if (my !== token) return;
              var span = add('cmd', ''), cur = cursor(), k = 0; span.appendChild(cur);
              (function type() {
                if (my !== token) return;
                k = Math.min(text.length, k + Math.ceil(text.length / 60));
                span.innerHTML = lineHTML('cmd', text.slice(0, k)); span.appendChild(cur);
                if (k < text.length) later(type, per * Math.ceil(text.length / 60)); else later(function () { cur.remove(); }, 260);
              })();
            }, start);
          })(t, text);
          t += per * text.length + 320;
        } else {
          (function (l) { later(function () { if (my === token) add(l[1], l[2]); }, t); })(l);
        }
      });
      later(function () { if (my !== token) return; var s = add('cmd', ''); s.appendChild(cursor()); }, t + 400);
    }
    if (io && !reduce) {
      new IntersectionObserver(function (e, o) {
        if (e[0].isIntersecting && !started) { started = true; play(0); o.disconnect(); }
      }, { threshold: 0.25 }).observe(term);
    } else play(0);
  })();

  /* ---------- calculator ---------- */
  (function calc() {
    var ids = ['rateA', 'tpsA', 'rateB', 'tpsB'], el = {};
    ids.forEach(function (id) { el[id] = $('#' + id); });
    if (!el.rateA) return;
    var out = $('.calc-out');
    function perM(rate, tps) { return (rate / 3600) / tps * 1e6; }
    function money(v) { return isFinite(v) ? '$' + (v >= 100 ? v.toFixed(0) : v.toFixed(2)) : '—'; }
    function update() {
      var rA = parseFloat(el.rateA.value), tA = parseFloat(el.tpsA.value), rB = parseFloat(el.rateB.value), tB = parseFloat(el.tpsB.value);
      var a = (rA >= 0 && tA > 0) ? perM(rA, tA) : NaN, b = (rB >= 0 && tB > 0) ? perM(rB, tB) : NaN;
      $('#outA').textContent = money(a); $('#outB').textContent = money(b);
      var mx = Math.max(a || 0, b || 0) || 1;
      $('#barA').style.width = (isFinite(a) ? a / mx * 100 : 0) + '%';
      $('#barB').style.width = (isFinite(b) ? b / mx * 100 : 0) + '%';
      var d = (b - a) / a * 100, dEl = $('#delta'), lab = $('#deltaLabel');
      if (isFinite(d) && a > 0) {
        dEl.textContent = (d > 0 ? '+' : '') + d.toFixed(1) + '%';
        lab.textContent = d > 0 ? 'after costs more' : (d < 0 ? 'after costs less' : 'no change');
        out.classList.toggle('worse', d > 0);
      } else { dEl.textContent = '—'; lab.textContent = 'enter positive numbers'; }
      var f = function (r, t, v) { return '(<b>' + r + '</b> / 3600) / <b>' + t + '</b> × 1,000,000 = <b>' + money(v) + '</b> per M tokens'; };
      $('#math').innerHTML = 'before: ' + f(el.rateA.value || '?', el.tpsA.value || '?', a) + '<br>after:&nbsp; ' + f(el.rateB.value || '?', el.tpsB.value || '?', b);
    }
    ids.forEach(function (id) { el[id].addEventListener('input', update); });
    update();
  })();

  /* ---------- early-access form (FormSubmit -> founder inbox) ---------- */
  (function form() {
    var f = $('#ea-form'); if (!f || !window.fetch || !window.FormData) return;
    var status = $('.form-status', f), btn = $('button[type=submit]', f), label = $('.btn-label', btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      status.className = 'form-status'; status.textContent = ''; btn.disabled = true; label.textContent = 'Sending…';
      fetch(f.action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          // FormSubmit answers 200 with success "false" (e.g. before the inbox is activated)
          if (!res.ok || String(res.j.success) !== 'true') throw new Error(res.j.message || 'bad');
          var email = ($('#f-email', f) || {}).value || '';
          $$('label, input:not([type=hidden]), textarea, button', f).forEach(function (el) { el.hidden = true; });
          status.className = 'form-status ok done';
          status.textContent = "Request sent. You're on the list at $5/month" + (email ? ' as ' + email : '') + ". You'll hear from the founder directly.";
        })
        .catch(function () {
          status.className = 'form-status err';
          status.textContent = 'Could not send. Please try again, or email kushthrottle@gmail.com.';
          label.textContent = 'Request early access'; btn.disabled = false;
        });
    });
  })();
})();
