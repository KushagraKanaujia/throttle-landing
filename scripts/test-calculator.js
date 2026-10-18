#!/usr/bin/env node
// Sanity checks for the /calculator math:  node scripts/test-calculator.js
'use strict';
const assert = require('assert');
const C = require('../assets/js/calculator.js');

let n = 0;
function sane(name, input) {
  const r = C.compute(input);
  for (const k of ['bill', 'idle', 'idleSave', 'overSave', 'monthly', 'yearly', 'after', 'share', 'minGpus', 'weightsGB']) {
    assert.ok(Number.isFinite(r[k]), `${name}: ${k} is not finite (${r[k]})`);
    assert.ok(r[k] >= 0, `${name}: ${k} is negative (${r[k]})`);
  }
  assert.ok(r.monthly <= r.bill + 1e-6, `${name}: savings exceed bill`);
  assert.ok(r.idleSave <= r.idle + 1e-6, `${name}: reclaimed more idle than exists`);
  assert.ok(r.share <= 1, `${name}: share > 1`);
  assert.ok(Math.abs(r.yearly - 12 * r.monthly) < 1e-6, `${name}: yearly != 12 x monthly`);
  if (r.perM !== null) assert.ok(Number.isFinite(r.perM) && r.perM > 0 && r.perMAfter <= r.perM, `${name}: bad $/M`);
  n++;
  return r;
}

// Defaults: 8x H100 at $3.99, 70B BF16, 40% busy.
const def = sane('defaults', C.DEFAULTS);
assert.strictEqual(Math.round(def.bill), 23302);              // 8 * 3.99 * 730
assert.strictEqual(def.minGpus, 4);                            // 140 GB / (80 * 0.8) = 2.19 -> 4
assert.ok(def.over);
assert.ok(def.yearly > 50000 && def.yearly < 250000, 'defaults should be meaningful but believable: ' + def.yearly);
assert.ok(def.share > 0.2 && def.share < 0.7, 'default share ' + def.share);
console.log('defaults: bill $%s/mo, idle $%s, reclaim $%s, over $%s, total $%s/mo = $%s/yr (%s%% of bill)',
  def.bill.toFixed(0), def.idle.toFixed(0), def.idleSave.toFixed(0), def.overSave.toFixed(0),
  def.monthly.toFixed(0), def.yearly.toFixed(0), (def.share * 100).toFixed(1));

// Already busy and minimal: zero savings, never negative.
const lean = sane('lean', { gpu: 'h100', n: 4, params: 70, prec: 'fp16', util: 85 });
assert.strictEqual(lean.monthly, 0);
assert.ok(!lean.over);

// Exactly at target utilization.
assert.strictEqual(sane('at-target', { gpu: 'a100', n: 2, params: 70, prec: 'fp8', util: 70 }).idleSave, 0);

// Too few GPUs for the model: no over-provisioning claim, no negatives.
const tight = sane('doesnt-fit', { gpu: 'l40s', n: 1, params: 405, prec: 'fp16', util: 30 });
assert.ok(!tight.fits && tight.overSave === 0);

// Small model on a big node: one doubling applied once (22% of post-idle cost), not compounded.
const small = sane('7b-on-8', { gpu: 'h100', n: 8, params: 7, prec: 'fp16', util: 70 });
assert.strictEqual(small.minGpus, 1);
assert.ok(Math.abs(small.overSave / small.bill - (1 - C.CONSOLIDATE_FACTOR)) < 1e-9);

// Between 1x and 2x the minimum: no over-provisioning claim.
assert.ok(!sane('6-of-4', { gpu: 'h100', n: 6, params: 70, prec: 'fp16', util: 50 }).over);

// Multi-node: 405B BF16 on H100 needs 16.
assert.strictEqual(sane('405b', { gpu: 'h100', n: 32, params: 405, prec: 'fp16', util: 40 }).minGpus, 16);

// MI300X: 72B fits on one GPU (our measured case).
assert.strictEqual(sane('mi300x', { gpu: 'mi300x', n: 2, params: 72, prec: 'fp16', util: 40 }).minGpus, 1);

// Tokens per day gives $/M.
const tok = sane('tokens', { gpu: 'h100', n: 8, params: 70, prec: 'fp16', util: 40, tpd: 500e6 });
assert.ok(tok.perM > 1 && tok.perM < 100, 'perM ' + tok.perM);

// Garbage input falls back to sane values.
for (const bad of [{}, null, { n: -5, price: -3, util: 0, params: 'abc' }, { n: 'NaN', util: 1e9, price: 'x', tpd: -1 },
                   { gpu: 'nope', prec: 'fp3', mem: 0 }, { price: 0 }, { util: 1 }, { util: 100, n: 1 }]) {
  sane('bad ' + JSON.stringify(bad), bad);
}

// Sweep.
for (const gpu of Object.keys(C.GPUS))
  for (const nG of [1, 2, 3, 4, 8, 16, 64])
    for (const params of [7, 8, 14, 27, 32, 70, 72, 120, 235, 405])
      for (const prec of ['fp16', 'fp8', 'int4'])
        for (const util of [1, 10, 40, 69, 70, 100])
          sane(`${gpu}/${nG}/${params}/${prec}/${util}`, { gpu, n: nG, params, prec, util, tpd: nG * 1e7 });

console.log(`ok: ${n} cases`);
