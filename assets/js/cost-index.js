/* The Throttle Index: filters, sorting and row details. The table works without JS. */
(function () {
  var body = document.getElementById('ix-body');
  if (!body) return;
  var gpuSel = document.getElementById('ix-gpu');
  var verdict = 'all';

  function pairs() {
    return Array.prototype.map.call(body.querySelectorAll('tr.ix-row'), function (row) {
      return { row: row, detail: row.nextElementSibling };
    });
  }

  function applyFilters() {
    var gpu = gpuSel ? gpuSel.value : 'all';
    var shown = 0;
    pairs().forEach(function (p) {
      var ok = (verdict === 'all' || p.row.dataset.verdict === verdict) &&
               (gpu === 'all' || p.row.dataset.gpu === gpu);
      p.row.hidden = !ok;
      p.detail.hidden = !ok;
      if (ok) shown++;
    });
    var empty = body.querySelector('.ix-empty');
    if (!shown && !empty) {
      empty = document.createElement('tr');
      empty.className = 'ix-empty';
      empty.innerHTML = '<td colspan="8">No rows match these filters yet.</td>';
      body.appendChild(empty);
    }
    if (empty) empty.hidden = shown > 0;
  }

  Array.prototype.forEach.call(document.querySelectorAll('.ix-chip'), function (chip) {
    chip.addEventListener('click', function () {
      verdict = chip.dataset.filter;
      Array.prototype.forEach.call(document.querySelectorAll('.ix-chip'), function (c) {
        c.classList.toggle('is-on', c === chip);
      });
      applyFilters();
    });
  });
  if (gpuSel) gpuSel.addEventListener('change', applyFilters);

  Array.prototype.forEach.call(document.querySelectorAll('.ix-sort'), function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.key;
      var dir = btn.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      Array.prototype.forEach.call(document.querySelectorAll('.ix-sort'), function (b) { b.removeAttribute('aria-sort'); });
      btn.setAttribute('aria-sort', dir);
      var list = pairs();
      list.sort(function (a, b) {
        var d = parseFloat(a.row.dataset[key]) - parseFloat(b.row.dataset[key]);
        return dir === 'ascending' ? d : -d;
      });
      list.forEach(function (p) { body.appendChild(p.row); body.appendChild(p.detail); });
      var empty = body.querySelector('.ix-empty');
      if (empty) body.appendChild(empty);
    });
  });

  body.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.ix-more');
    if (!btn) return;
    var detail = document.getElementById(btn.getAttribute('aria-controls'));
    var open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Hide' : 'Details';
    detail.classList.toggle('is-open', open);
  });
})();
