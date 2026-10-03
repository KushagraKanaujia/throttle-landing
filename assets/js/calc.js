// Cost-per-million-tokens calculator for /guides/llm-cost-per-million-tokens.
(function () {
  var form = document.getElementById("calc");
  if (!form) return;
  var money = function (v) {
    if (!isFinite(v)) return "–";
    return "$" + (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v < 1 ? 3 : 2));
  };
  function update() {
    var rate = parseFloat(form.rate.value) || 0;
    var gpus = Math.max(1, parseInt(form.gpus.value, 10) || 1);
    var tps = parseFloat(form.tps.value) || 0;
    var monthly = parseFloat(form.monthly.value) || 0;
    var hourly = rate * gpus;
    var perM = tps > 0 ? hourly / (tps * 3600) * 1e6 : NaN;
    var out = form.querySelector(".calc-out");
    out.innerHTML = tps > 0
      ? "<span class=\"calc-big\">" + money(perM) + "</span> per million output tokens" +
        "<span class=\"calc-sub\">" + money(hourly) + "/hr for " + gpus + " GPU" + (gpus > 1 ? "s" : "") +
        (monthly > 0 ? " · " + money(perM * monthly / 1e6) + " per month at " + (monthly / 1e6).toLocaleString() + "M output tokens, if the GPU is busy all the time" : "") + "</span>"
      : "Enter output tokens per second to see the cost.";
  }
  form.addEventListener("input", update);
  update();
})();
