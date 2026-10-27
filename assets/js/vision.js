/* Throttle spatial site. Plain JS, no build step.
   Pieces: environment light, glass highlights, nav, reveals, hero windows, scroll-lit words,
   the pinned loop (canvas of requests moving from the API to your model), the sample report,
   the reading shelf and the assessment form. Everything has a static fallback. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = w.matchMedia && w.matchMedia('(pointer: fine)').matches;
  var hasIO = 'IntersectionObserver' in w;
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var $ = function (s, el) { return (el || d).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || d).querySelectorAll(s)); };

  var KINDS = [
    { id: 'extraction', c: '#8ec5ff', v: 'MOVE' },
    { id: 'chat', c: '#ffd28a', v: 'MOVE' },
    { id: 'classification', c: '#c3f08e', v: 'MOVE' },
    { id: 'summarization', c: '#f6a6d0', v: 'NEEDS FINETUNE' },
    { id: 'code', c: '#b9a6ff', v: 'NEEDS FINETUNE' },
    { id: 'agent', c: '#ff9f86', v: 'KEEP ON API' }
  ];
  var KIND = {}; KINDS.forEach(function (k) { KIND[k.id] = k; });
  var VTAG = {
    'MOVE': ['t-own', 'MOVE'], 'NEEDS FINETUNE': ['t-test', 'FINE-TUNE'],
    'KEEP ON API': ['t-api', 'KEEP ON API'], 'NEEDS MORE DATA': ['t-keep', 'MORE DATA'], 'INSUFFICIENT DATA': ['t-keep', 'MORE DATA']
  };
  var tag = function (v) { var t = VTAG[v] || ['t-keep', v]; return '<em class="tag ' + t[0] + '"><i></i>' + t[1] + '</em>'; };

  /* ---------- light: the room light follows you, glass catches it ---------- */
  var env = $('.env');
  if (fine && !reduce) {
    var raf = 0, lx = 0, ly = 0;
    d.addEventListener('pointermove', function (e) {
      lx = e.clientX; ly = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (env) { env.style.setProperty('--px', lx + 'px'); env.style.setProperty('--py', ly + 'px'); }
        var g = e.target.closest && e.target.closest('.glass');
        if (g) { var r = g.getBoundingClientRect(); g.style.setProperty('--mx', (lx - r.left) + 'px'); g.style.setProperty('--my', (ly - r.top) + 'px'); }
      });
    }, { passive: true });
  }

  /* ---------- nav ---------- */
  var nav = $('[data-nav]');
  if (nav) {
    var mb = $('.menu', nav);
    if (mb) mb.addEventListener('click', function () { var o = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
    $$('.nav-links a', nav).forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); mb && mb.setAttribute('aria-expanded', 'false'); }); });
  }

  /* ---------- reveals ---------- */
  var ins = $$('[data-in]');
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    ins.forEach(function (el) { io.observe(el); });
  } else ins.forEach(function (el) { el.classList.add('in'); });

  /* ---------- hero: three windows hanging in space ---------- */
  var hero = $('[data-hero]');
  if (hero) {
    requestAnimationFrame(function () { setTimeout(function () { hero.classList.add('on'); }, 250); });
    var sp = $('.space-in', hero);
    if (sp && fine && !reduce) {
      d.addEventListener('pointermove', function (e) {
        sp.style.setProperty('--tx', ((e.clientX / w.innerWidth - 0.5) * 7).toFixed(2));
        sp.style.setProperty('--ty', ((0.5 - e.clientY / w.innerHeight) * 4).toFixed(2));
      }, { passive: true });
    }
    if (sp && !reduce) {
      var onS = function () { sp.style.setProperty('--sp', clamp(w.scrollY / (hero.offsetHeight * 0.8), 0, 1).toFixed(3)); };
      w.addEventListener('scroll', onS, { passive: true }); onS();
    }

    // capture feed: what a request log looks like once personal data is masked
    var feed = $('[data-feed]', hero);
    if (feed) {
      var ROWS = [
        ['extraction', 'invoice from <em>&lt;EMAIL&gt;</em>, pull totals'],
        ['chat', 'where is my order? call <em>&lt;PHONE&gt;</em>'],
        ['classification', 'ticket: refund or bug?'],
        ['summarization', 'summarize call notes for <em>&lt;NAME&gt;</em>'],
        ['code', 'write a SQL query for weekly churn'],
        ['agent', 'plan, search, then book the trip'],
        ['extraction', 'parse resume, card <em>&lt;CARD&gt;</em> removed'],
        ['chat', 'reset password for <em>&lt;EMAIL&gt;</em>'],
        ['classification', 'is this review spam?']
      ];
      var line = function (r) { var k = KIND[r[0]]; return '<div><b style="color:' + k.c + '">' + r[0] + '</b>  ' + r[1] + '</div>'; };
      var fi = 0, fh = '';
      for (var i = 0; i < 8; i++) fh += line(ROWS[(fi++) % ROWS.length]);
      feed.innerHTML = fh;
      if (!reduce) setInterval(function () {
        if (d.hidden) return;
        var div = d.createElement('div'); div.innerHTML = line(ROWS[(fi++) % ROWS.length]);
        var el = div.firstChild; el.style.opacity = '0'; el.style.transition = 'opacity .6s';
        feed.appendChild(el); requestAnimationFrame(function () { el.style.opacity = '1'; });
        if (feed.children.length > 9) feed.removeChild(feed.firstChild);
      }, 1400);
    }

    // routing board: every kind starts in testing, then each gets its verdict
    var rt = $('[data-route]', hero);
    if (rt) {
      var lis = $$('li', rt);
      var settle = function () {
        lis.forEach(function (li, i) {
          setTimeout(function () { li.querySelector('em').outerHTML = tag(KINDS[i].v); }, reduce ? 0 : 700 + i * 380);
        });
      };
      var reset = function () { lis.forEach(function (li) { li.querySelector('em').outerHTML = '<em class="tag t-test"><i></i>TESTING</em>'; }); };
      settle();
      if (!reduce) setInterval(function () { if (d.hidden) return; reset(); setTimeout(settle, 900); }, 11000);
    }
  }

  /* ---------- words light up as you read ---------- */
  var say = $('[data-say] p');
  if (say) {
    if (reduce) $('[data-say]').classList.add('static');
    else {
      var words = [];
      var split = function (node, cls) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var frag = d.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach(function (t) {
              if (!t) return;
              if (/^\s+$/.test(t)) { frag.appendChild(d.createTextNode(t)); return; }
              var s = d.createElement('span'); s.className = 'w' + (cls ? ' ' + cls : ''); s.textContent = t; frag.appendChild(s); words.push(s);
            });
            node.replaceChild(frag, n);
          } else if (n.nodeType === 1) split(n, n.className);
        });
      };
      split(say, '');
      var sayS = function () {
        var r = say.getBoundingClientRect(), vh = w.innerHeight;
        var p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1);
        var n = Math.round(p * words.length);
        words.forEach(function (s, i) { s.classList.toggle('on', i < n); });
      };
      w.addEventListener('scroll', sayS, { passive: true }); sayS();
    }
  }

  /* ---------- the loop: pinned story + canvas of moving requests ---------- */
  var loop = $('[data-loop]');
  if (loop) {
    var steps = $$('.step', loop), ticks = $$('.ticks button', loop), board = $('.board', loop);
    var chip = $('.mask-chip', loop), stage = $('.stage', loop), cv = $('[data-flow]', loop);
    var nOwn = $('.n-own', loop), mLabel = $('[data-model]', loop);
    var step = 0, model = 1;
    board.innerHTML = KINDS.map(function (k) { return '<div style="--k:' + k.c + '"><span>' + k.id + '</span>' + tag(k.v) + '</div>'; }).join('');
    var setStep = function (s) {
      if (s === step && steps[s].classList.contains('on')) return;
      var prev = step; step = s;
      steps.forEach(function (el, i) { el.classList.toggle('on', i === s); });
      board.classList.toggle('on', s === 2);
      chip.classList.toggle('on', s === 0);
      if (s === 4 && prev !== 4) { model = 2; mLabel.textContent = 'NEW OPEN MODEL · v2'; nOwn.classList.remove('pulse'); void nOwn.offsetWidth; nOwn.classList.add('pulse'); }
      if (s < 4 && model !== 1) { model = 1; mLabel.textContent = 'OPEN MODEL · v1'; }
    };
    var loopS = function () {
      var r = loop.getBoundingClientRect(), total = loop.offsetHeight - w.innerHeight;
      var p = clamp(-r.top / total, 0, 0.9999);
      var s = Math.floor(p * 5), f = p * 5 - s;
      ticks.forEach(function (t, i) { t.style.setProperty('--f', i < s ? 1 : i === s ? f.toFixed(3) : 0); });
      setStep(s);
    };
    w.addEventListener('scroll', loopS, { passive: true }); loopS();
    ticks.forEach(function (t, i) {
      t.addEventListener('click', function () {
        var total = loop.offsetHeight - w.innerHeight;
        w.scrollTo({ top: loop.offsetTop + total * (i + 0.5) / 5, behavior: reduce ? 'auto' : 'smooth' });
      });
    });

    var ctx = cv.getContext && cv.getContext('2d');
    if (ctx) {
      var W = 0, H = 0, dpr = 1, P = {}, parts = [], flashes = [], visible = !hasIO, last = 0, acc = 0;
      var center = function (el) {
        var a = el.getBoundingClientRect(), b = stage.getBoundingClientRect();
        return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, w: a.width, h: a.height };
      };
      var size = function () {
        var b = stage.getBoundingClientRect();
        dpr = Math.min(w.devicePixelRatio || 1, 2); W = b.width; H = b.height;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        P.app = center($('.n-app', loop)); P.thr = center($('.n-thr', loop));
        P.api = center($('.n-api', loop)); P.own = center(nOwn);
      };
      var bez = function (a, c, b, t) {
        var u = 1 - t;
        return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
      };
      var ctrl = function (a, b, bend) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + bend }; };
      var edgeOut = function (n) { return { x: n.x + n.w / 2 - 4, y: n.y }; };
      var edgeIn = function (n) { return { x: n.x - n.w / 2 + 4, y: n.y }; };
      var dest = function (k) {
        if (step >= 3 && k.v === 'MOVE') return 'own';
        return 'api';
      };
      var spawn = function () {
        var k = KINDS[(Math.random() * KINDS.length) | 0];
        var lane = (Math.random() - 0.5) * 34;
        var p = { k: k, seg: 0, t: 0, lane: lane, to: dest(k), sp: 0.55 + Math.random() * 0.3, ghost: false, fb: false };
        if (p.to === 'own' && Math.random() < 0.05) p.fb = true;
        parts.push(p);
        var shadowing = step === 1 || step === 2 || (step === 4 && k.v !== 'MOVE' && k.v !== 'KEEP ON API');
        if (shadowing && Math.random() < 0.55) parts.push({ k: k, seg: 0, t: 0, lane: lane, to: 'own', sp: p.sp, ghost: true, fb: false });
      };
      var path = function (p) {
        if (p.seg === 0) { var a = edgeOut(P.app), b = edgeIn(P.thr); a = { x: a.x, y: a.y + p.lane * 0.4 }; return [a, ctrl(a, b, p.lane), b]; }
        if (p.seg === 1) { var s = edgeOut(P.thr), e = edgeIn(P[p.to]); return [s, { x: s.x + (e.x - s.x) * 0.55, y: e.y }, e]; }
        var o = { x: P.own.x, y: P.own.y - P.own.h / 2 }, ap = { x: P.api.x, y: P.api.y + P.api.h / 2 };
        return [o, { x: o.x + 70, y: (o.y + ap.y) / 2 }, ap]; // fallback hop: your model -> API
      };
      var guide = function (a, c, b, col, alpha, dash) {
        ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1.2;
        if (dash) ctx.setLineDash([3, 6]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); ctx.stroke(); ctx.restore();
      };
      var draw = function (dt) {
        ctx.clearRect(0, 0, W, H);
        var a = edgeOut(P.app), b = edgeIn(P.thr), s = edgeOut(P.thr);
        guide(a, ctrl(a, b, 0), b, '#ffffff', 0.12);
        var ea = edgeIn(P.api), eo = edgeIn(P.own);
        guide(s, { x: s.x + (ea.x - s.x) * 0.55, y: ea.y }, ea, '#ffb27d', step >= 3 ? 0.22 : 0.32);
        guide(s, { x: s.x + (eo.x - s.x) * 0.55, y: eo.y }, eo, '#8ef0cf', step >= 3 ? 0.45 : 0.16, step < 3);
        ctx.globalCompositeOperation = 'lighter';
        for (var i = parts.length - 1; i >= 0; i--) {
          var p = parts[i];
          p.t += dt * p.sp * (p.seg === 2 ? 1.4 : 1);
          if (p.t >= 1) {
            if (p.seg === 0) { p.seg = 1; p.t = 0; }
            else if (p.seg === 1 && p.fb) { p.seg = 2; p.t = 0; flashes.push({ x: P.own.x, y: P.own.y, t: 0, c: '#ffb27d' }); }
            else { if (!p.ghost) flashes.push({ x: P[p.seg === 2 ? 'api' : p.to].x, y: P[p.seg === 2 ? 'api' : p.to].y, t: 0, c: p.seg === 2 || p.to === 'api' ? '#ffb27d' : '#8ef0cf', soft: true }); parts.splice(i, 1); continue; }
          }
          if (p.ghost && p.seg === 0) continue; // the shadow copy splits off at Throttle
          var pp = path(p), q = bez(pp[0], pp[1], pp[2], p.t), q2 = bez(pp[0], pp[1], pp[2], Math.max(0, p.t - 0.06));
          var col = p.k.c, masked = step === 0 && p.seg >= 1;
          ctx.globalAlpha = p.ghost ? 0.45 : 0.9;
          var g = ctx.createLinearGradient(q2.x, q2.y, q.x, q.y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, col);
          ctx.strokeStyle = g; ctx.lineWidth = p.ghost ? 1.2 : 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(q2.x, q2.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(q.x, q.y, p.ghost ? 2 : 2.6, 0, 6.283);
          if (p.ghost || masked) { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(); }
          else { ctx.fillStyle = col; ctx.fill(); }
          if (p.seg === 2) { ctx.fillStyle = '#ffb27d'; ctx.fill(); }
        }
        for (var j = flashes.length - 1; j >= 0; j--) {
          var f = flashes[j]; f.t += dt * (f.soft ? 2.2 : 1.4);
          if (f.t >= 1) { flashes.splice(j, 1); continue; }
          ctx.globalAlpha = (1 - f.t) * (f.soft ? 0.12 : 0.5);
          ctx.strokeStyle = f.c; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(f.x, f.y, 18 + f.t * (f.soft ? 26 : 50), 0, 6.283); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      };
      var tick = function (now) {
        if (!visible) { last = 0; return; }
        var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016; last = now;
        acc += dt;
        var rate = W < 520 ? 0.16 : 0.1;
        while (acc > rate) { acc -= rate; spawn(); }
        draw(dt);
        requestAnimationFrame(tick);
      };
      size();
      w.addEventListener('resize', function () { size(); if (reduce) still(); });
      var still = function () { // reduced motion: one calm frame of requests along their paths
        parts = []; for (var i = 0; i < 26; i++) { spawn(); var p = parts[parts.length - 1]; p.seg = i % 2; p.t = Math.random(); }
        draw(0); var dr = $$('.step', loop); void dr;
      };
      if (reduce) { still(); w.addEventListener('scroll', function () { still(); }, { passive: true }); }
      else if (hasIO) new IntersectionObserver(function (es) { var v = es[0].isIntersecting; if (v && !visible) { visible = true; requestAnimationFrame(tick); } visible = v; }).observe(stage);
      else requestAnimationFrame(tick);
    }
  }

  /* ---------- sample report: real `throttle demo` output, labelled as sample ---------- */
  var rep = $('[data-report]');
  if (rep && w.fetch) {
    var isNum = function (x) { return typeof x === 'number' && isFinite(x); };
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var usd = function (x) { return '$' + Math.round(x).toLocaleString('en-US'); };
    var ok = function (r) {
      if (!r || r.placeholder !== false || !r.totals || !Array.isArray(r.workloads) || !r.workloads.length) return false;
      var t = r.totals;
      return isNum(t.monthly_api_usd) && isNum(t.movable_usd) && isNum(t.projected_savings_usd) && r.workloads.every(function (x) {
        var q = x && x.quality; return x && x.type && isNum(x.monthly_api_usd) && isNum(x.projected_owned_usd) && q && isNum(q.win) && isNum(q.tie) && isNum(q.loss);
      });
    };
    var count = function (el, to) {
      if (reduce || !hasIO) { el.textContent = usd(to); return; }
      var t0 = 0, dur = 1600;
      var f = function (now) { if (!t0) t0 = now; var k = clamp((now - t0) / dur, 0, 1); k = 1 - Math.pow(1 - k, 4); el.textContent = usd(to * k); if (k < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    };
    fetch(rep.getAttribute('data-report'), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (r) {
      if (!ok(r)) { rep.querySelector('.stats').innerHTML = '<div class="stat"><span>Sample report</span><b>Soon</b></div>'; return; }
      var max = Math.max.apply(null, r.workloads.map(function (x) { return x.monthly_api_usd; }));
      $('[data-kinds]', rep).innerHTML = r.workloads.map(function (x) {
        var k = KIND[x.type] || { c: '#ccc' }, q = x.quality;
        return '<div class="kind" style="--k:' + k.c + '"><span class="nm">' + esc(x.type) + '</span>' +
          '<div class="cost" title="' + usd(x.monthly_api_usd) + ' on the API vs ' + usd(x.projected_owned_usd) + ' on your model, a month">' +
          '<i data-w="' + (x.monthly_api_usd / max * 100).toFixed(1) + '"></i><i data-w="' + (x.projected_owned_usd / max * 100).toFixed(1) + '"></i></div>' +
          '<div class="wtl" title="better ' + Math.round(q.win * 100) + '%, same ' + Math.round(q.tie * 100) + '%, worse ' + Math.round(q.loss * 100) + '%">' +
          '<i class="w" style="width:' + q.win * 100 + '%"></i><i class="t" style="width:' + q.tie * 100 + '%"></i><i class="l" style="width:' + q.loss * 100 + '%"></i></div>' +
          tag(x.verdict) + '</div>';
      }).join('');
      var go = function () {
        $$('[data-n]', rep).forEach(function (el) { count(el, r.totals[el.getAttribute('data-n')]); });
        $$('.cost i', rep).forEach(function (el, i) { setTimeout(function () { el.style.width = el.getAttribute('data-w') + '%'; }, reduce ? 0 : 120 * (i >> 1)); });
      };
      if (hasIO && !reduce) { var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { o.disconnect(); go(); } }, { threshold: 0.3 }); o.observe(rep); }
      else go();
    }).catch(function () {});
  }

  /* ---------- reading shelf ---------- */
  var track = $('[data-shelf-track]');
  $$('[data-shelf]').forEach(function (b) {
    b.addEventListener('click', function () { track.scrollBy({ left: (+b.getAttribute('data-shelf')) * track.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' }); });
  });

  /* ---------- assessment form ----------
     POSTs JSON to /api/assessment. On 200 it says thanks. On anything else (no API key yet,
     network error, rate limit) it opens a prefilled email to Kush, so no lead is lost. */
  var form = $('[data-assessment]');
  if (form) {
    var msg = $('.form-msg', form), sub = $('button[type="submit"]', form), TO = 'kush@throttle-pro.com';
    var sayMsg = function (html, good) { msg.innerHTML = html; msg.classList.toggle('ok', !!good); };
    var mailto = function (v) {
      var sel = form.querySelector('[name="spend"]');
      var spend = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : 'not given';
      var body = 'Hi Kush,\n\nI would like a free savings assessment.\n\nWork email: ' + v.email + '\nCompany: ' + (v.company || 'not given') + '\nMonthly AI API spend: ' + spend + '\n';
      return 'mailto:' + TO + '?subject=' + encodeURIComponent('Free savings assessment') + '&body=' + encodeURIComponent(body);
    };
    var back = /[?&]assessment=(sent|error)/.exec(location.search);
    if (back) sayMsg(back[1] === 'sent' ? 'Thanks. We got it and will email you soon.' : 'That did not go through. Please write to <a href="mailto:' + TO + '">' + TO + '</a>.', back[1] === 'sent');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (form.checkValidity && !form.checkValidity()) { if (form.reportValidity) form.reportValidity(); return; }
      var v = { email: form.email.value.trim(), company: form.company.value.trim(), spend: form.spend.value, website: form.website.value };
      var fallback = function () {
        var href = mailto(v);
        sayMsg('Opening your email app with your details filled in. If nothing opens, <a href="' + href + '">click here</a> or write to <a href="mailto:' + TO + '">' + TO + '</a>.');
        sub.disabled = false; w.location.href = href;
      };
      sub.disabled = true; sayMsg('Sending…');
      fetch(form.getAttribute('action'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(v) })
        .then(function (r) { if (r.status === 200) { form.reset(); sub.disabled = false; sayMsg('Thanks. We got it and will email you soon.', true); } else fallback(); }, fallback);
    });
  }
})();
