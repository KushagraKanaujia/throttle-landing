/* Throttle site v3. Small vanilla JS: nav, reveals, copy, terminal replay, hero canvas,
   looping SVG scenes, lazy film, console tabs. Everything degrades to a static final frame. */
(function () {
  'use strict';
  var d = document;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };

  /* ---------- nav ---------- */
  var nav = d.querySelector('.nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- logo mark: play on load and on hover ---------- */
  $$('.brand').forEach(function (b) {
    var m = b.querySelector('.mark'); if (!m || reduce) return;
    var play = function () { m.classList.remove('play'); void m.getBoundingClientRect(); m.classList.add('play'); };
    if (b.closest('.nav')) play();
    b.addEventListener('mouseenter', play);
  });

  /* ---------- reveal ---------- */
  var revealEls = $$('[data-reveal]');
  revealEls.forEach(function (el) {
    var sibs = $$(':scope > [data-reveal]', el.parentNode);
    var i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', (i * 0.09) + 's');
  });
  if (!hasIO || reduce) {
    revealEls.forEach(function (el) { el.classList.add('shown'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    revealEls.forEach(function (el) { io.observe(el); });
    setTimeout(function () { revealEls.forEach(function (el) { el.classList.add('shown'); }); }, 5000);
  }

  /* ---------- copy ---------- */
  $$('[data-copy]').forEach(function (b) {
    var label = b.querySelector('span');
    b.addEventListener('click', function () {
      var txt = b.getAttribute('data-copy');
      var done = function () {
        b.classList.add('ok'); if (label) label.textContent = 'Copied';
        setTimeout(function () { b.classList.remove('ok'); if (label) label.textContent = 'Copy'; }, 1500);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
    });
  });

  /* ---------- scene engine ----------
     Elements inside svg.scene carry data-a (effect), data-at (start, fraction of cycle),
     data-d (duration fraction). Optional data-rep / data-gap repeat an effect.
     Effects: draw, head, fade, out, win, type, count, grow, pop, pulse, flipout, flipin.
     Markup default = final frame, so no-JS and reduced motion both show the finished picture. */
  var EASE = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    io: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    lin: function (t) { return t; },
    back: function (t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };
  var HOLD_END = 0.93, FADE_END = 0.985;

  function Scene(svg) {
    this.svg = svg;
    this.cycle = (+svg.getAttribute('data-cycle') || 10) * 1000;
    this.layer = svg.querySelector('.sc-l') || svg;
    this.t0 = 0; this.elapsed = 0; this.on = false;
    this.items = $$('[data-a]', svg).map(function (el) {
      var it = {
        el: el, a: el.getAttribute('data-a'),
        at: +(el.getAttribute('data-at') || 0), d: +(el.getAttribute('data-d') || 0.06),
        rep: +(el.getAttribute('data-rep') || 1), gap: +(el.getAttribute('data-gap') || 0),
        e: EASE[el.getAttribute('data-e') || 'out'] || EASE.out, last: null
      };
      if (it.a === 'type') it.full = el.textContent;
      if (it.a === 'count') {
        it.from = +(el.getAttribute('data-from') || 0); it.to = +el.getAttribute('data-to');
        it.dec = +(el.getAttribute('data-dec') || 0); it.pre = el.getAttribute('data-pre') || ''; it.suf = el.getAttribute('data-suf') || '';
      }
      if (it.a === 'fade' || it.a === 'pop') it.y = +(el.getAttribute('data-y') || 0);
      return it;
    });
    svg.classList.add('sc-on');
  }
  Scene.prototype.render = function (p) {
    var lo = 1;
    if (p > HOLD_END) lo = 1 - clamp((p - HOLD_END) / (FADE_END - HOLD_END));
    if (this.layer.__lo !== lo) { this.layer.style.opacity = lo; this.layer.__lo = lo; }
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i], q = p - it.at, raw;
      if (it.rep > 1 && it.gap) {
        if (q >= 0 && q < it.rep * it.gap) q = q % it.gap;
        else if (q >= it.rep * it.gap) q = it.d + 1;
      }
      raw = q / it.d;
      var k = it.e(clamp(raw)), el = it.el, s = el.style, key;
      switch (it.a) {
        case 'draw': key = (1 - k).toFixed(4); if (key !== it.last) { s.strokeDashoffset = key; it.last = key; } break;
        case 'head':
          var vis = raw > 0 && raw < 1;
          key = vis ? (0.07 - clamp(raw) * 1.07).toFixed(4) : 'x';
          if (key !== it.last) { s.opacity = vis ? 1 : 0; if (vis) s.strokeDashoffset = key; it.last = key; }
          break;
        case 'fade': case 'pop':
          key = k.toFixed(3);
          if (key !== it.last) {
            s.opacity = clamp(raw).toFixed(3);
            if (it.a === 'pop') s.transform = 'scale(' + (0.4 + 0.6 * k).toFixed(3) + ')';
            else if (it.y) s.transform = 'translateY(' + ((1 - k) * it.y).toFixed(2) + 'px)';
            it.last = key;
          }
          break;
        case 'out': key = (1 - k).toFixed(3); if (key !== it.last) { s.opacity = key; it.last = key; } break;
        case 'win':
          var w = raw < 0 || raw > 1 ? 0 : Math.min(1, raw * 8, (1 - raw) * 8);
          key = w.toFixed(3); if (key !== it.last) { s.opacity = key; it.last = key; } break;
        case 'pulse':
          var v = raw <= 0 || raw >= 1 ? 0 : Math.sin(Math.PI * raw);
          key = v.toFixed(3); if (key !== it.last) { s.opacity = key; it.last = key; } break;
        case 'type':
          var n = Math.round(clamp(raw) * it.full.length);
          if (n !== it.last) { el.textContent = it.full.slice(0, n); it.last = n; } break;
        case 'count':
          key = (it.from + (it.to - it.from) * k).toFixed(it.dec);
          if (key !== it.last) { el.textContent = it.pre + key + it.suf; it.last = key; } break;
        case 'grow':
          key = k.toFixed(4);
          if (key !== it.last) { s.transform = (el.classList.contains('gy') ? 'scaleY(' : 'scaleX(') + key + ')'; it.last = key; } break;
        case 'flipout': key = (1 - k).toFixed(4); if (key !== it.last) { s.transform = 'scaleY(' + key + ')'; it.last = key; } break;
        case 'flipin': key = k.toFixed(4); if (key !== it.last) { s.transform = 'scaleY(' + key + ')'; it.last = key; } break;
      }
    }
  };

  /* Scenes are built lazily as they approach the viewport and only tick while visible.
     Under reduced motion (or without IntersectionObserver) nothing runs: the markup already is the final frame. */
  if (!reduce && hasIO) {
    var scenes = [], raf = 0, live = 0;
    var tick = function (now) {
      for (var i = 0; i < scenes.length; i++) {
        var sc = scenes[i]; if (!sc.on) continue;
        sc.render(((now - sc.t0) % sc.cycle) / sc.cycle);
      }
      raf = live ? requestAnimationFrame(tick) : 0;
    };
    var sio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var sc = e.target.__scene; if (!sc) return;
        if (e.isIntersecting && !sc.on) { sc.on = true; live++; sc.t0 = performance.now() - sc.elapsed; }
        else if (!e.isIntersecting && sc.on) { sc.on = false; live--; sc.elapsed = (performance.now() - sc.t0) % sc.cycle; }
      });
      if (live && !raf) raf = requestAnimationFrame(tick);
    }, { threshold: 0.2 });
    var nio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting || e.target.__scene) return;
        var sc = new Scene(e.target); sc.render(0);
        e.target.__scene = sc; scenes.push(sc); nio.unobserve(e.target); sio.observe(e.target);
      });
    }, { rootMargin: '400px 0px' });
    $$('svg.scene[data-cycle]').forEach(function (s) { nio.observe(s); });
    d.addEventListener('visibilitychange', function () {
      if (d.hidden) { cancelAnimationFrame(raf); raf = 0; scenes.forEach(function (sc) { if (sc.on) sc.elapsed = (performance.now() - sc.t0) % sc.cycle; }); }
      else { scenes.forEach(function (sc) { if (sc.on) sc.t0 = performance.now() - sc.elapsed; }); if (live && !raf) raf = requestAnimationFrame(tick); }
    });
  }

  /* ---------- terminal replay ---------- */
  var term = d.querySelector('[data-term]');
  if (term) {
    var lines = $$('.ln', term), typed = $$('[data-type]', term), timers = [];
    var clearT = function () { timers.forEach(clearTimeout); timers = []; };
    var showAll = function () {
      lines.forEach(function (l) { l.classList.remove('js-hide'); });
      typed.forEach(function (t) { t.textContent = t.getAttribute('data-type'); });
    };
    var play = function () {
      clearT();
      lines.forEach(function (l) { l.classList.add('js-hide'); });
      typed.forEach(function (t) { t.textContent = ''; });
      var t = 300;
      lines.forEach(function (l) {
        var ty = l.querySelector('[data-type]');
        t += +(l.getAttribute('data-wait') || 70);
        (function (l, ty, at) {
          timers.push(setTimeout(function () { l.classList.remove('js-hide'); }, at));
          if (ty) {
            var s = ty.getAttribute('data-type');
            for (var i = 1; i <= s.length; i++) {
              (function (i) { timers.push(setTimeout(function () { ty.textContent = s.slice(0, i); }, at + i * 20)); })(i);
            }
          }
        })(l, ty, t);
        if (ty) t += ty.getAttribute('data-type').length * 20 + 250;
      });
    };
    var replay = d.querySelector('[data-replay]');
    if (replay) replay.addEventListener('click', function () { reduce ? showAll() : play(); });
    if (reduce || !hasIO) showAll();
    else {
      lines.forEach(function (l) { l.classList.add('js-hide'); });
      var tio = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { play(); tio.disconnect(); }
      }, { threshold: 0.3 });
      tio.observe(term);
    }
  }

  /* ---------- hero canvas: quiet lanes of tokens ---------- */
  var cv = d.querySelector('[data-stream]');
  var startCanvas = function () {
  if (cv && cv.getContext) {
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(devicePixelRatio || 1, 1.5);
    var toks = [], running = true, craf = 0;
    var size = function () {
      var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var lanes = Math.floor(H / 24), n = Math.min(W < 700 ? 70 : 180, Math.floor(W * lanes / 120));
      toks = [];
      for (var i = 0; i < n; i++) {
        toks.push({ x: Math.random() * W, y: Math.floor(Math.random() * lanes) * 24 + 12, w: 3 + Math.random() * 14,
          v: 0.12 + Math.random() * 0.7, a: 0.04 + Math.random() * 0.12, hot: Math.random() < 0.03 });
      }
    };
    var draw = function () {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (!reduce) { t.x += t.v; if (t.x > W + 20) t.x = -20; }
        ctx.fillStyle = t.hot ? 'rgba(214,255,107,' + (t.a * 3) + ')' : 'rgba(245,245,240,' + t.a + ')';
        ctx.fillRect(t.x, t.y, t.w, 2);
      }
      if (running && !reduce) craf = requestAnimationFrame(draw);
    };
    size(); draw();
    var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); if (reduce) draw(); }, 150); });
    if (hasIO && !reduce) {
      new IntersectionObserver(function (es) {
        var vis = es[0].isIntersecting;
        if (vis && !running) { running = true; craf = requestAnimationFrame(draw); }
        if (!vis) { running = false; cancelAnimationFrame(craf); }
      }).observe(cv);
    }
  }
  };
  if (cv) {
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };
    if (d.readyState === 'complete') idle(startCanvas, { timeout: 1500 });
    else addEventListener('load', function () { idle(startCanvas, { timeout: 1500 }); });
  }

  /* ---------- film: lazy, muted autoplay in view. Sound toggle only if the file has audio (data-audio). ---------- */
  var film = d.querySelector('[data-film]');
  if (film) {
    var loaded = false, btn = d.querySelector('[data-unmute]'), fs = d.querySelector('[data-fs]');
    var hasAudio = film.hasAttribute('data-audio');
    var lbl = btn && btn.querySelector('span');
    var ICON_SND = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>';
    var ICON_PAUSE = '<path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>';
    var ICON_PLAY = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
    var load = function () {
      if (loaded) return; loaded = true;
      $$('source[data-src]', film).forEach(function (s) { s.src = s.getAttribute('data-src'); });
      film.load();
    };
    var setPoster = function () { var p = film.getAttribute('data-poster'); if (p && !film.poster) film.poster = p; };
    var tryPlay = function () { var p = film.play(); if (p && p.catch) p.catch(function () {}); };
    var sync = function () {
      if (!btn) return;
      var ic = btn.querySelector('svg');
      if (hasAudio) { lbl.textContent = film.muted ? 'Play with sound' : 'Mute'; ic.innerHTML = ICON_SND; }
      else { lbl.textContent = film.paused ? 'Play' : 'Pause'; ic.innerHTML = film.paused ? ICON_PLAY : ICON_PAUSE; }
    };
    var toggle = function () {
      load();
      if (hasAudio) {
        if (film.muted) { film.muted = false; film.currentTime = 0; tryPlay(); } else film.muted = true;
      } else { if (film.paused) tryPlay(); else film.pause(); }
      sync();
    };
    if (btn) btn.addEventListener('click', toggle);
    film.addEventListener('click', toggle);
    film.addEventListener('play', sync); film.addEventListener('pause', sync);
    if (fs) fs.addEventListener('click', function () {
      load(); if (hasAudio) film.muted = false; tryPlay(); sync();
      if (film.requestFullscreen) film.requestFullscreen(); else if (film.webkitEnterFullscreen) film.webkitEnterFullscreen();
    });
    if (hasIO) {
      var pio = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { setPoster(); pio.disconnect(); } }, { rootMargin: '300px 0px' });
      pio.observe(film);
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { load(); if (!reduce) tryPlay(); }
        else if (!film.paused) film.pause();
      }, { threshold: 0.35 }).observe(film);
    }
    else setPoster();
    sync();
  }

  /* ---------- console tabs: auto-advance while in view ---------- */
  var tabs = d.querySelector('[data-tabs]');
  if (tabs) {
    var btns = $$('button', tabs), figs = $$('.shots figure'), caps = $$('.shots-cap p');
    var cur = 0, timer = 0, dur = 6000, inView = false, manual = false;
    tabs.style.setProperty('--tab-dur', dur + 'ms');
    var show = function (i) {
      cur = i;
      btns.forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); var bar = b.querySelector('i'); if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; } });
      figs.forEach(function (f, j) { f.classList.toggle('on', j === i); });
      caps.forEach(function (c, j) { c.classList.toggle('on', j === i); });
      // lazy images beyond the first
      var img = figs[i] && figs[i].querySelector('img[data-src]');
      if (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); }
      schedule();
    };
    var schedule = function () {
      clearTimeout(timer);
      if (!reduce && inView && !manual) timer = setTimeout(function () { show((cur + 1) % btns.length); }, dur);
    };
    btns.forEach(function (b, i) { b.addEventListener('click', function () { manual = true; tabs.classList.add('paused'); show(i); }); });
    if (reduce) tabs.classList.add('paused');
    if (hasIO) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) show(cur); else clearTimeout(timer); }, { threshold: 0.3 }).observe(tabs.parentNode);
  }
})();
