// Run: node scripts/test-assessment.js
// Unit test for api/assessment.js with a fake req/res and a mocked fetch.
const assert = require('assert');
const { Readable } = require('stream');
const handler = require('../api/assessment.js');

function req(body, { method = 'POST', type = 'application/json', ip = '1.2.3.4', preparsed = false } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const r = Readable.from(preparsed ? [] : [Buffer.from(raw)]);
  r.method = method; r.headers = { 'content-type': type, 'x-forwarded-for': ip };
  if (preparsed) r.body = body;
  return r;
}
function res() {
  const o = { statusCode: 200, headers: {}, body: '' };
  o.setHeader = (k, v) => { o.headers[k.toLowerCase()] = v; };
  o.end = (b) => { o.body = b || ''; o.done = true; };
  o.json = () => JSON.parse(o.body);
  return o;
}
async function call(body, opts) { const r = res(); await handler(req(body, opts), r); return r; }

(async () => {
  let sent = [];
  global.fetch = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, text: async () => '' }; };

  // 1. fallback: no RESEND_API_KEY -> 503 {fallback:"mailto"}
  delete process.env.RESEND_API_KEY; delete process.env.ASSESSMENT_FROM;
  let r = await call({ email: 'a@b.co', company: 'Acme', spend: '5k-50k' });
  assert.strictEqual(r.statusCode, 503); assert.deepStrictEqual(r.json(), { fallback: 'mailto' }); assert.strictEqual(sent.length, 0);

  // 2. validation
  handler._resetRateLimit();
  r = await call({ email: 'not-an-email' }); assert.strictEqual(r.statusCode, 400);
  r = await call({ email: 'a@b.co', spend: 'lots' }); assert.strictEqual(r.statusCode, 400);
  r = await call('{bad json'); assert.strictEqual(r.statusCode, 400);
  r = await call({}, { method: 'GET' }); assert.strictEqual(r.statusCode, 405);

  // 3. success: key set -> Resend called with the right payload, 200
  handler._resetRateLimit();
  process.env.RESEND_API_KEY = 're_test'; process.env.ASSESSMENT_FROM = 'Throttle <assessment@throttle-pro.com>';
  r = await call({ email: 'cto@acme.com', company: 'Acme\nInc', spend: '50k-500k' });
  assert.strictEqual(r.statusCode, 200); assert.deepStrictEqual(r.json(), { ok: true });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].url, 'https://api.resend.com/emails');
  assert.strictEqual(sent[0].init.headers.Authorization, 'Bearer re_test');
  const p = JSON.parse(sent[0].init.body);
  assert.deepStrictEqual(p.to, ['kush@throttle-pro.com']); assert.strictEqual(p.reply_to, 'cto@acme.com');
  assert.strictEqual(p.subject, 'Assessment request: Acme Inc');
  assert.ok(p.text.includes('$50k to $500k a month'));

  // 3b. Vercel pre-parsed body works too
  r = await call({ email: 'x@y.io' }, { preparsed: true }); assert.strictEqual(r.statusCode, 200);

  // 4. honeypot: pretend success, send nothing
  sent = [];
  r = await call({ email: 'bot@spam.com', website: 'http://spam' }); assert.strictEqual(r.statusCode, 200); assert.strictEqual(sent.length, 0);

  // 5. Resend failure -> 502 with fallback
  handler._resetRateLimit();
  global.fetch = async () => ({ ok: false, status: 403, text: async () => 'domain not verified' });
  const ce = console.error; console.error = () => {};
  r = await call({ email: 'a@b.co' }); assert.strictEqual(r.statusCode, 502); assert.strictEqual(r.json().fallback, 'mailto');
  console.error = ce;

  // 6. rate limit: 6th request from one IP in the window -> 429
  handler._resetRateLimit();
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
  for (let i = 0; i < 5; i++) assert.strictEqual((await call({ email: 'a@b.co' }, { ip: '9.9.9.9' })).statusCode, 200);
  assert.strictEqual((await call({ email: 'a@b.co' }, { ip: '9.9.9.9' })).statusCode, 429);
  assert.strictEqual((await call({ email: 'a@b.co' }, { ip: '8.8.8.8' })).statusCode, 200);

  // 7. no-JS urlencoded post -> 303 back to the page
  handler._resetRateLimit();
  r = await call('email=a%40b.co&company=Acme', { type: 'application/x-www-form-urlencoded' });
  assert.strictEqual(r.statusCode, 303); assert.strictEqual(r.headers.location, '/?assessment=sent#assessment');

  console.log('all assessment handler tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
