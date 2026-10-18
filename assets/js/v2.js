(function () {
  'use strict';
  var d = document;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };

  /* nav background on scroll */
  var nav = d.querySelector('.nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* reveal on scroll, staggered among siblings */
  var revealEls = $$('[data-reveal], .bars, .vis');
  $$('[data-reveal]').forEach(function (el) {
    var sibs = $$(':scope > [data-reveal]', el.parentNode);
    var i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', (i * 0.08) + 's');
  });
  if (!hasIO || reduce) {
    revealEls.forEach(function (el) { el.classList.add('shown'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
    // safety: never leave content hidden if something stalls
    setTimeout(function () { revealEls.forEach(function (el) { el.classList.add('shown'); }); }, 4000);
  }

  /* copy buttons */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var txt = b.getAttribute('data-copy');
      var done = function () { var o = b.textContent; b.textContent = 'copied'; setTimeout(function () { b.textContent = o; }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
    });
  });

  /* terminal replay */
  var term = d.querySelector('[data-term]');
  if (term) {
    var lines = $$('.ln', term);
    var typed = $$('[data-type]', term);
    var timers = [];
    var clear = function () { timers.forEach(clearTimeout); timers = []; };
    var showAll = function () {
      lines.forEach(function (l) { l.classList.remove('js-hide'); });
      typed.forEach(function (t) { t.textContent = t.getAttribute('data-type'); });
    };
    var play = function () {
      clear();
      lines.forEach(function (l) { l.classList.add('js-hide'); });
      typed.forEach(function (t) { t.textContent = ''; });
      var t = 300;
      lines.forEach(function (l) {
        var ty = l.querySelector('[data-type]');
        var wait = +(l.getAttribute('data-wait') || 70);
        t += wait;
        (function (l, ty, at) {
          timers.push(setTimeout(function () { l.classList.remove('js-hide'); }, at));
          if (ty) {
            var s = ty.getAttribute('data-type');
            for (var i = 1; i <= s.length; i++) {
              (function (i) { timers.push(setTimeout(function () { ty.textContent = s.slice(0, i); }, at + i * 22)); })(i);
            }
          }
        })(l, ty, t);
        if (ty) t += ty.getAttribute('data-type').length * 22 + 250;
      });
    };
    var replay = d.querySelector('[data-replay]');
    if (replay) replay.addEventListener('click', function () { reduce ? showAll() : play(); });
    if (reduce || !hasIO) { showAll(); }
    else {
      lines.forEach(function (l) { l.classList.add('js-hide'); });
      var tio = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { play(); tio.disconnect(); }
      }, { threshold: 0.25 });
      tio.observe(term);
    }
  }

  /* hero canvas: lanes of tokens streaming across, a few lit in the accent */
  var cv = d.querySelector('[data-stream]');
  if (cv && cv.getContext) {
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(devicePixelRatio || 1, 2);
    var toks = [], running = true, raf = 0;
    var size = function () {
      var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var lanes = Math.floor(H / 22), n = Math.min(260, Math.floor(W * lanes / 90));
      toks = [];
      for (var i = 0; i < n; i++) {
        var lane = Math.floor(Math.random() * lanes);
        toks.push({
          x: Math.random() * W, y: lane * 22 + 11,
          w: 3 + Math.random() * 14, v: 0.15 + Math.random() * 0.9,
          a: 0.05 + Math.random() * 0.16, hot: Math.random() < 0.035
        });
      }
    };
    var draw = function () {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (!reduce) { t.x += t.v; if (t.x > W + 20) t.x = -20; }
        ctx.fillStyle = t.hot ? 'rgba(214,255,107,' + (t.a * 3.2) + ')' : 'rgba(240,241,233,' + t.a + ')';
        ctx.fillRect(t.x, t.y, t.w, 2);
      }
      if (running && !reduce) raf = requestAnimationFrame(draw);
    };
    size(); draw();
    var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); if (reduce) draw(); }, 150); });
    if (hasIO && !reduce) {
      new IntersectionObserver(function (es) {
        var vis = es[0].isIntersecting;
        if (vis && !running) { running = true; raf = requestAnimationFrame(draw); }
        if (!vis) { running = false; cancelAnimationFrame(raf); }
      }).observe(cv);
    }
  }
})();
