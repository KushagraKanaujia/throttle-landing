/* Homepage hero: pick the background loop for the viewport, skip it for reduced motion,
   pause it off screen. The poster image is the fallback in every case. */
(function () {
  var box = document.querySelector('.hh-media');
  var v = box && box.querySelector('video');
  if (!v || !v.canPlayType) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var mobile = window.matchMedia && window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
  var base = 'assets/media/hero/hero-' + (mobile ? 'mobile' : '1080');
  v.poster = base + '-poster.jpg';
  [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (s) {
    var el = document.createElement('source');
    el.src = base + '.' + s[0]; el.type = s[1];
    v.appendChild(el);
  });
  v.muted = true;
  v.load();
  v.addEventListener('playing', function () { box.classList.add('playing'); });
  var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) play(); else v.pause(); });
    }, { threshold: 0.05 }).observe(box);
  } else play();
})();
