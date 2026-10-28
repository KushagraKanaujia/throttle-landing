/* Throttle "Living light": shared page behaviour. Nav, menu, page turns, reveals, the free-look form.
   Everything is readable without this file; it only adds motion and the form's fetch. */
(function () {
  "use strict";
  var d = document, w = window, root = d.documentElement;
  var reduce = w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, el) { return (el || d).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* current page in the nav */
  var path = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  $$(".links a, .sheet nav a").forEach(function (a) {
    var h = a.getAttribute("href");
    if (h === path || (path !== "/" && h.indexOf(path) === 0 && h.indexOf("#") < 0)) a.setAttribute("aria-current", "page");
  });

  /* nav: clear over the light, solid once you leave it */
  var nav = $("[data-nav]"), hero = $("#hero");
  var navTick = false;
  function navState() {
    navTick = false;
    var lim = hero ? w.innerHeight * 0.55 : 8;
    nav.classList.toggle("solid", w.scrollY > lim);
    // over the ivory letter the nav turns to paper and ink
    var light = false, els = d.elementsFromPoint ? d.elementsFromPoint(w.innerWidth / 2, 30) : [];
    for (var i = 0; i < els.length; i++) {
      if (nav.contains(els[i])) continue;
      light = !!(els[i].closest && els[i].closest("[data-light]"));
      break;
    }
    nav.classList.toggle("on-light", light && nav.classList.contains("solid"));
  }
  if (nav) {
    w.addEventListener("scroll", function () { if (!navTick) { navTick = true; requestAnimationFrame(navState); } }, { passive: true });
    navState();
  }

  /* menu sheet */
  var btn = $("[data-menu]"), sheet = $("#sheet");
  function setMenu(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    sheet.hidden = !open; root.classList.toggle("menu-open", open);
    nav.classList.toggle("solid", open || w.scrollY > 8); if (open) nav.classList.remove("on-light");
    if (open) { var f = $("a", sheet); if (f) f.focus(); } else navState();
  }
  if (btn && sheet) {
    btn.addEventListener("click", function () { setMenu(btn.getAttribute("aria-expanded") !== "true"); });
    sheet.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !sheet.hidden) { setMenu(false); btn.focus(); } });
    w.addEventListener("resize", function () { if (w.innerWidth > 900 && !sheet.hidden) setMenu(false); });
  }

  /* page turns: a .pg section scrolls to its foot, then holds while the next one slides over it */
  var pgs = $$(".pg");
  if (pgs.length && !reduce) {
    root.classList.add("turns");
    var vh = 0, vw = 0, ticking = false;
    var layoutPages = function () {
      if (w.innerWidth === vw && Math.abs(w.innerHeight - vh) < 120) return;   // ignore mobile toolbar wobble
      vw = w.innerWidth; vh = w.innerHeight;
      pgs.forEach(function (p) { p.style.top = Math.min(0, vh - p.offsetHeight) + "px"; });
    };
    var turn = function () {
      ticking = false;
      var h = w.innerHeight;
      pgs.forEach(function (p) {
        var next = p.nextElementSibling;
        if (!next) return;
        var r = next.getBoundingClientRect();
        var k = clamp(1 - r.top / h, 0, 1);
        p.style.setProperty("--shade", (k * 0.62).toFixed(3));
        p.style.transform = k > 0 && k < 1 ? "scale(" + (1 - k * 0.03).toFixed(4) + ")" : "";
        var covered = r.top <= 0.5;
        if (covered !== p.classList.contains("covered")) {
          p.classList.toggle("covered", covered);
          p.dispatchEvent(new CustomEvent("pg:cover", { detail: covered }));
        }
      });
    };
    layoutPages(); turn();
    w.addEventListener("resize", function () { layoutPages(); turn(); });
    w.addEventListener("load", function () { vw = 0; layoutPages(); turn(); });
    w.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(turn); } }, { passive: true });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { vw = 0; layoutPages(); turn(); });
  }

  /* reveals: play once, a little after an element enters */
  var targets = $$(".rv, .log, .split, .scale, .phases");
  if (reduce || !("IntersectionObserver" in w)) targets.forEach(function (e) { e.classList.add("in"); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -14% 0px" });
    targets.forEach(function (e) { io.observe(e); });
    $$(".log-lines li").forEach(function (li, i) { li.style.transitionDelay = (0.15 + i * 0.12).toFixed(2) + "s"; });
  }

  /* free look form: POST /api/assessment, else open a prefilled email so no lead is lost */
  var form = $("[data-assessment]");
  if (form) {
    var msg = $(".form-msg", form), sub = $('button[type="submit"]', form);
    var TO = "kush@throttle-pro.com";
    var say = function (html, ok) { msg.innerHTML = html; msg.classList.toggle("ok", !!ok); };
    var mailto = function (v) {
      var sel = form.spend;
      var spendTxt = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : "not given";
      var body = "Hi Kush,\n\nI would like a free look.\n\nWork email: " + v.email +
        "\nCompany: " + (v.company || "not given") + "\nMonthly AI API spend: " + spendTxt + "\n";
      return "mailto:" + TO + "?subject=" + encodeURIComponent("Free look") + "&body=" + encodeURIComponent(body);
    };
    var back = /[?&]assessment=(sent|error)/.exec(location.search);
    if (back) say(back[1] === "sent" ? "Thanks. We got it and will email you soon." : 'That did not go through. Please write to <a href="mailto:' + TO + '">' + TO + "</a>.", back[1] === "sent");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (form.checkValidity && !form.checkValidity()) { if (form.reportValidity) form.reportValidity(); return; }
      var v = { email: form.email.value.trim(), company: form.company.value.trim(), spend: form.spend.value, website: form.website.value };
      var fallback = function () {
        var href = mailto(v);
        say('Opening your email app with your details filled in. If nothing opens, <a href="' + href + '">click here</a> or write to <a href="mailto:' + TO + '">' + TO + "</a>.");
        sub.disabled = false;
        w.location.href = href;
      };
      sub.disabled = true; say("Sending&hellip;");
      fetch(form.getAttribute("action"), {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(v)
      }).then(function (r) {
        if (r.status === 200) { form.reset(); sub.disabled = false; say("Thanks. We got it and will email you soon.", true); }
        else fallback();
      }, fallback);
    });
  }
})();
