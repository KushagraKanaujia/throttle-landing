/* Throttle "The Meter": small, mechanical motion. Every element is already in its final
   state in the HTML; this file only arms it (resets to zero) and then plays it once when it
   scrolls into view. With reduced motion or no IntersectionObserver, it shows the final state. */
(function () {
  'use strict';
  var d = document, w = window;
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in w;
  var $ = function (s, el) { return (el || d).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || d).querySelectorAll(s)); };

  /* play(el, fn): run fn once when el is well inside the viewport */
  function play(el, fn, margin) {
    if (!el) return;
    if (reduce || !hasIO) { fn(el); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(el); } });
    }, { rootMargin: margin || '0px 0px -18% 0px' });
    io.observe(el);
  }
  var on = function (el) { el.classList.add('on'); };

  /* nav: hairline once you scroll */
  var nav = $('[data-nav]');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', w.scrollY > 8); };
    w.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* hero meter: wheels roll, needle swings, channel switches throw one by one */
  var meter = $('[data-meter]');
  if (meter) {
    $$('.wheel', meter).forEach(function (wh, i, all) {
      // right-most wheels travel furthest, like a real odometer
      wh.style.setProperty('--dur', (1.5 + (all.length - i) * 0.12).toFixed(2) + 's');
    });
    var start = function () { requestAnimationFrame(function () { requestAnimationFrame(function () { on(meter); }); }); };
    if (reduce) on(meter); else w.setTimeout(start, 250);
  }

  /* PR comments: tests fill in, then the decision switch throws */
  $$('.bot').forEach(function (b) {
    play(b, function (el) {
      on(el);
      var cnt = $('.cnt', el), to = parseInt(el.getAttribute('data-tests'), 10);
      if (!cnt || reduce || !to) return;
      var n = 0, t0 = performance.now(), dur = 1100;
      cnt.textContent = '0';
      (function tick(now) {
        n = Math.min(to, Math.round(((now - t0) / dur) * to));
        cnt.textContent = String(n);
        if (n < to) requestAnimationFrame(tick);
      })(t0);
    });
  });

  /* how it works: flip the five switches in order */
  var seq = $('[data-seq]');
  if (seq) {
    play(seq, function (el) {
      $$('.st', el).forEach(function (st, i) {
        if (reduce) on(st); else w.setTimeout(function () { on(st); }, 220 + i * 520);
      });
    }, '0px 0px -25% 0px');
  }

  /* receipt prints, log lines appear, pricing bars fill, signature writes */
  play($('[data-receipt]'), on);
  play($('.log'), on);
  play($('.scale'), on);
  play($('.letter'), on, '0px 0px -30% 0px');

  /* free look form: POST /api/assessment, else open a prefilled email so no lead is lost */
  var form = $('[data-assessment]');
  if (form) {
    var msg = $('.form-msg', form), sub = $('button[type="submit"]', form);
    var TO = 'kush@throttle-pro.com';
    var say = function (html, ok) { msg.innerHTML = html; msg.classList.toggle('ok', !!ok); };
    var mailto = function (v) {
      var sel = form.spend;
      var spendTxt = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : 'not given';
      var body = 'Hi Kush,\n\nI would like a free look.\n\nWork email: ' + v.email +
        '\nCompany: ' + (v.company || 'not given') + '\nMonthly AI API spend: ' + spendTxt + '\n';
      return 'mailto:' + TO + '?subject=' + encodeURIComponent('Free look') + '&body=' + encodeURIComponent(body);
    };
    var back = /[?&]assessment=(sent|error)/.exec(location.search);
    if (back) say(back[1] === 'sent' ? 'Thanks. We got it and will email you soon.' : 'That did not go through. Please write to <a href="mailto:' + TO + '">' + TO + '</a>.', back[1] === 'sent');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (form.checkValidity && !form.checkValidity()) { if (form.reportValidity) form.reportValidity(); return; }
      var v = { email: form.email.value.trim(), company: form.company.value.trim(), spend: form.spend.value, website: form.website.value };
      var fallback = function () {
        var href = mailto(v);
        say('Opening your email app with your details filled in. If nothing opens, <a href="' + href + '">click here</a> or write to <a href="mailto:' + TO + '">' + TO + '</a>.');
        sub.disabled = false;
        w.location.href = href;
      };
      sub.disabled = true; say('Sending…');
      fetch(form.getAttribute('action'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(v)
      }).then(function (r) {
        if (r.status === 200) { form.reset(); sub.disabled = false; say('Thanks. We got it and will email you soon.', true); }
        else fallback();
      }, fallback);
    });
  }
})();
