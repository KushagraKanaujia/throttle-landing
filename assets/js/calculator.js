/* Throttle GPU waste calculator (/calculator).
   compute() is pure and exported for scripts/test-calculator.js. Every formula here is
   listed in plain words in the "How we calculate this" section of calculator.html. */
(function (root) {
  'use strict';

  var HOURS_PER_MONTH = 730;          // 24 * 365 / 12
  var UTIL_TARGET = 0.70;             // reclaim idle only down to 70% busy, never to 100%
  var WEIGHT_SHARE = 0.80;            // weights may use at most 80% of GPU memory; the rest is KV cache + activations
  // Measured: Qwen2.5-72B on AMD MI300X, 1 GPU -> 2 GPUs gave 1.56x throughput.
  // So per-token cost on the smaller setup is about 1.56 / 2 = 0.78 of the larger one.
  var SCALE_SPEEDUP = 1.56;
  var CONSOLIDATE_FACTOR = SCALE_SPEEDUP / 2;   // 0.78
  var BYTES = { fp16: 2, fp8: 1, int4: 0.5 };

  // $/GPU-hr defaults: typical on-demand cloud prices (see footnote on the page for sources).
  var GPUS = {
    h100:   { name: 'H100 80GB',     mem: 80,  price: 3.99 },
    h200:   { name: 'H200 141GB',    mem: 141, price: 5.29 },
    a100:   { name: 'A100 80GB',     mem: 80,  price: 1.79 },
    l40s:   { name: 'L40S 48GB',     mem: 48,  price: 1.09 },
    mi300x: { name: 'MI300X 192GB',  mem: 192, price: 2.99 },
    rtx6000:{ name: 'RTX PRO 6000 96GB', mem: 96, price: 2.49 },
    b200:   { name: 'B200 180GB',    mem: 180, price: 6.69 },
    other:  { name: 'Other',         mem: 80,  price: 2.00 }
  };
  var DEFAULTS = { gpu: 'h100', price: 3.99, mem: 80, n: 8, params: 70, prec: 'fp16', util: 40, tpd: 0 };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  // Tensor-parallel splits are 1, 2, 4 or 8 GPUs; past one node, whole 8-GPU nodes.
  function tpRound(g) {
    if (g <= 1) return 1;
    if (g <= 8) { var p = 1; while (p < g) p *= 2; return p; }
    return Math.ceil(g / 8) * 8;
  }

  function sanitize(i) {
    i = i || {};
    var gpu = GPUS[i.gpu] ? i.gpu : DEFAULTS.gpu;
    return {
      gpu: gpu,
      price: clamp(num(i.price, GPUS[gpu].price), 0, 1000),
      mem: clamp(num(i.mem, GPUS[gpu].mem), 1, 2000),
      n: Math.round(clamp(num(i.n, DEFAULTS.n), 1, 100000)),
      params: clamp(num(i.params, DEFAULTS.params), 0.1, 10000),
      prec: BYTES[i.prec] ? i.prec : DEFAULTS.prec,
      util: clamp(num(i.util, DEFAULTS.util), 1, 100),
      tpd: clamp(num(i.tpd, 0), 0, 1e15)
    };
  }

  function compute(raw) {
    var i = sanitize(raw);
    var u = i.util / 100;
    var bill = i.n * i.price * HOURS_PER_MONTH;

    // 2. Paying for idle: the share of paid hours not spent generating.
    var idle = bill * (1 - u);

    // Reclaimable idle: run the same work at a 70% busy target, so you need u / 0.70 of the GPU-hours.
    var keepShare = u >= UTIL_TARGET ? 1 : u / UTIL_TARGET;
    var idleSave = bill * (1 - keepShare);
    var afterIdle = bill - idleSave;

    // 3. Over-provisioning: weights must fit in 70% of the memory of one replica.
    var weightsGB = i.params * BYTES[i.prec];
    var minGpus = tpRound(weightsGB / (i.mem * WEIGHT_SHARE));
    var fits = i.n >= minGpus;
    // Only claim a saving when you could split into at least two replicas of the minimum size,
    // and apply our one measured doubling once, even if you could split further.
    var over = fits && i.n >= 2 * minGpus;
    var overSave = over ? afterIdle * (1 - CONSOLIDATE_FACTOR) : 0;

    var monthly = idleSave + overSave;
    var r = {
      inputs: i, bill: bill, idle: idle, idleSave: idleSave, keepShare: keepShare,
      weightsGB: weightsGB, minGpus: minGpus, fits: fits, over: over, overSave: overSave,
      monthly: monthly, yearly: monthly * 12, after: bill - monthly,
      share: bill > 0 ? monthly / bill : 0,
      perM: null, perMAfter: null
    };
    if (i.tpd > 0) {
      var tokMonth = i.tpd * HOURS_PER_MONTH / 24;
      r.perM = bill / tokMonth * 1e6;
      r.perMAfter = r.after / tokMonth * 1e6;
    }
    return r;
  }

  var api = {
    compute: compute, sanitize: sanitize, tpRound: tpRound, GPUS: GPUS, DEFAULTS: DEFAULTS,
    HOURS_PER_MONTH: HOURS_PER_MONTH, UTIL_TARGET: UTIL_TARGET, WEIGHT_SHARE: WEIGHT_SHARE,
    CONSOLIDATE_FACTOR: CONSOLIDATE_FACTOR, BYTES: BYTES
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.ThrottleCalc = api;

  /* ---------------- UI ---------------- */
  var d = document, form = d.getElementById('wc');
  if (!form) return;
  var $ = function (id) { return d.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var f = form.elements;

  function usd(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function usd2(v) { return '$' + (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2)); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function set(id, txt) { var el = $(id); if (el && el.textContent !== txt) el.textContent = txt; }

  // read URL state
  var q = new URLSearchParams(location.search);
  var init = {};
  ['gpu', 'price', 'mem', 'n', 'params', 'prec', 'util', 'tpd'].forEach(function (k) { if (q.has(k)) init[k] = q.get(k); });
  var s0 = sanitize(Object.assign({}, DEFAULTS, init));
  if (!q.has('price')) s0.price = GPUS[s0.gpu].price;
  if (!q.has('mem')) s0.mem = GPUS[s0.gpu].mem;
  f.gpu.value = s0.gpu; f.price.value = s0.price; f.mem.value = s0.mem; f.n.value = s0.n;
  f.params.value = s0.params; f.prec.value = s0.prec; f.util.value = s0.util;
  f.tpd.value = s0.tpd ? s0.tpd : '';

  function syncPreset() {
    var p = +f.params.value;
    Array.prototype.forEach.call(d.querySelectorAll('[data-params]'), function (b) {
      b.setAttribute('aria-pressed', +b.getAttribute('data-params') === p ? 'true' : 'false');
    });
  }
  function syncOther() { $('wc-mem-row').hidden = f.gpu.value !== 'other'; }

  f.gpu.addEventListener('change', function () {
    var g = GPUS[f.gpu.value];
    f.price.value = g.price; f.mem.value = g.mem; syncOther();
  });
  Array.prototype.forEach.call(d.querySelectorAll('[data-params]'), function (b) {
    b.addEventListener('click', function () { f.params.value = b.getAttribute('data-params'); update(); });
  });

  // count-up
  var shown = 0, target = 0, raf = 0, t0 = 0, from = 0, DUR = 900;
  function tick(t) {
    if (!t0) t0 = t;
    var k = Math.min(1, (t - t0) / DUR), e = 1 - Math.pow(1 - k, 3);
    shown = from + (target - from) * e;
    set('wc-big', usd(shown));
    set('wc-pill-n', usd(shown));
    if (k < 1) raf = requestAnimationFrame(tick); else raf = 0;
  }
  function countTo(v) {
    target = v;
    if (reduce) { shown = v; set('wc-big', usd(v)); set('wc-pill-n', usd(v)); return; }
    from = shown; t0 = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function shareUrl(i) {
    var p = new URLSearchParams();
    p.set('gpu', i.gpu); p.set('n', i.n); p.set('params', i.params); p.set('prec', i.prec); p.set('util', i.util);
    if (i.price !== GPUS[i.gpu].price) p.set('price', i.price);
    if (i.gpu === 'other' || i.mem !== GPUS[i.gpu].mem) p.set('mem', i.mem);
    if (i.tpd > 0) p.set('tpd', i.tpd);
    return location.pathname + '?' + p.toString();
  }

  var first = true;
  function update() {
    var r = compute({
      gpu: f.gpu.value, price: f.price.value, mem: f.mem.value, n: f.n.value,
      params: f.params.value, prec: f.prec.value, util: f.util.value, tpd: f.tpd.value
    });
    var i = r.inputs;
    set('wc-util-out', i.util + '%');
    f.util.style.setProperty('--fill', i.util + '%');
    syncPreset();

    countTo(r.yearly);
    $('wc-big').classList.toggle('zero', r.yearly <= 0);
    set('wc-mo', usd(r.monthly));
    set('wc-share', pct(r.share));
    set('wc-bill', usd(r.bill));
    set('wc-bill-sub', i.n + ' × ' + usd2(i.price) + '/hr × 730 hrs');
    set('wc-idle', usd(r.idle));
    set('wc-idle-sub', pct(1 - i.util / 100) + ' of paid hours not generating');
    set('wc-rec', usd(r.idleSave));
    set('wc-rec-sub', r.idleSave > 0
      ? 'Same work at 70% busy needs ' + pct(r.keepShare) + ' of the GPU-hours'
      : 'Already at or above our 70% busy target. Nice.');
    set('wc-over', usd(r.overSave));
    var w = Math.round(r.weightsGB) + ' GB of weights';
    set('wc-over-sub', !r.fits
      ? w + ' needs about ' + r.minGpus + ' of these GPUs by our rule. Check your setup.'
      : r.over
        ? w + ' fits on ' + r.minGpus + ' GPU' + (r.minGpus > 1 ? 's' : '') + '. You run ' + i.n + '. Estimate: 22% less per token on fewer GPUs.'
        : w + ' on ' + i.n + ' GPU' + (i.n > 1 ? 's' : '') + '. Already lean on GPU count. The levers are idle time and config.');
    $('wc-over-row').classList.toggle('ok', !r.over);
    $('wc-rec-row').classList.toggle('ok', r.idleSave <= 0);

    // bar: needed | idle you could reclaim | over-provisioning
    var b = r.bill || 1;
    $('wc-seg-keep').style.width = (r.after / b * 100).toFixed(2) + '%';
    $('wc-seg-idle').style.width = (r.idleSave / b * 100).toFixed(2) + '%';
    $('wc-seg-over').style.width = (r.overSave / b * 100).toFixed(2) + '%';
    $('wc-busy').style.left = clamp(i.util, 0, 100) + '%';
    set('wc-busy-l', i.util + '% busy');

    var tok = $('wc-tok');
    tok.hidden = !(r.perM > 0);
    if (r.perM > 0) {
      set('wc-perm', usd2(r.perM));
      set('wc-perm-after', usd2(r.perMAfter));
    }

    set('wc-headline-sub', r.monthly > 0
      ? 'a year on the table. That is ' + usd(r.monthly) + ' a month, ' + pct(r.share) + ' of your GPU bill.'
      : 'Your fleet looks lean on these numbers. Throttle still checks engine flags, batching and quantization against your noise.');

    var url = shareUrl(i);
    if (!first || location.search) history.replaceState(null, '', url);
    first = false;
    var abs = location.origin + url;
    var body = 'Hi Kush,\n\nThe Throttle calculator says I have about ' + usd(r.yearly) + ' a year on the table:\n' +
      abs + '\n\nI would like the free 2 month pilot.';
    $('wc-book').href = 'mailto:kush@throttle-pro.com?subject=Throttle%20pilot&body=' + encodeURIComponent(body);
    $('wc-share-btn').setAttribute('data-url', abs);
  }

  $('wc-share-btn').addEventListener('click', function () {
    var b = this, lab = b.querySelector('span'), url = b.getAttribute('data-url');
    var done = function () { lab.textContent = 'Link copied'; setTimeout(function () { lab.textContent = 'Share my number'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
  });

  // mobile: a small pill keeps the number in view while you edit inputs below the result card
  var pill = $('wc-pill');
  if (pill && 'IntersectionObserver' in window) {
    var vis = {};
    var pio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { vis[e.target.id] = e.isIntersecting; });
      var on = vis.wc && !vis['wc-big'] && !vis.pilot;
      pill.classList.toggle('on', !!on);
    });
    ['wc', 'wc-big', 'pilot'].forEach(function (id) { pio.observe($(id)); });
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  syncOther();
  update();
})(this);
