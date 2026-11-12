// Vercel serverless function: POST /api/assessment
// Takes a "start with Throttle" request (plan + contact) from the landing page and emails it to Kush via Resend.
// No dependencies. Env vars: RESEND_API_KEY, ASSESSMENT_FROM (a sender on a domain verified in Resend,
// e.g. "Throttle <assessment@throttle-pro.com>"). If either is missing it returns 503 {fallback:"mailto"}
// and the page opens a prefilled email instead, so no lead is lost.
// Only accepts POSTs from the site itself (Origin or Referer must be throttle-pro.com or localhost),
// with a JSON or form-encoded body.
'use strict';

const TO = 'kush@throttle-pro.com';
const SPEND = {
  'lt5k': 'Under $5k a month',
  '5k-20k': '$5k to $20k a month',
  '20k-100k': '$20k to $100k a month',
  '100k+': '$100k+ a month',
};
const PLANS = {
  'starter': 'Starter, $49.99 a month',
  'team': 'Team, $99.99 a month',
  'custom': 'Custom (large company)',
};
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MAX_BODY = 8 * 1024;
const ALLOWED_ORIGINS = new Set(['https://www.throttle-pro.com', 'https://throttle-pro.com']);
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
const ALLOWED_TYPES = new Set(['application/json', 'application/x-www-form-urlencoded']);

function mediaType(req) {
  return String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

function originAllowed(o) {
  return ALLOWED_ORIGINS.has(o) || LOCAL_ORIGIN_RE.test(o);
}

// The form only ever posts from the site itself. Browsers send Origin on every POST; Referer is the
// fallback for the rare client that drops Origin. A request with neither, or from anywhere else, is refused.
function fromSite(req) {
  const origin = req.headers.origin;
  if (origin !== undefined) return originAllowed(String(origin));
  const ref = req.headers.referer;
  if (ref === undefined) return false;
  try { return originAllowed(new URL(String(ref)).origin); } catch (e) { return false; }
}

// Naive per-IP rate limit. Lives only as long as this function instance stays warm, which is fine
// for stopping a burst from one script. Not a real defence; the honeypot does most of the work.
const hits = new Map();
function limited(ip, now) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return String(req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown');
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Vercel's Node runtime usually pre-parses req.body; fall back to reading the stream ourselves.
async function readBody(req) {
  const type = String(req.headers['content-type'] || '');
  let body = req.body;
  if (body === undefined) body = await readRaw(req);
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(body));
    body = body ? JSON.parse(body) : {};
  }
  // Only a plain JSON object counts; null, numbers and arrays become an empty body (and fail validation).
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function clean(s, max) {
  return typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '';
}

function validate(b) {
  const email = clean(b.email, 254);
  const company = clean(b.company, 200);
  const spend = clean(b.spend, 20);
  const plan = clean(b.plan, 20);
  if (!email || !EMAIL_RE.test(email)) return { error: 'Please enter a valid work email.' };
  // Object.hasOwn, not SPEND[spend]: keys like "toString" or "__proto__" must not pass.
  if (spend && !Object.hasOwn(SPEND, spend)) return { error: 'Unknown spend range.' };
  if (plan && !Object.hasOwn(PLANS, plan)) return { error: 'Unknown plan.' };
  return { email, company, spend, plan };
}

function send(res, status, obj, wantsHtml) {
  // Without JS the browser posts a normal form; send it back to the page instead of raw JSON.
  if (wantsHtml) {
    res.statusCode = 303;
    res.setHeader('Location', status === 200 ? '/?assessment=sent#assessment' : '/?assessment=error#assessment');
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function handler(req, res) {
  const type = mediaType(req);
  const wantsHtml = type === 'application/x-www-form-urlencoded';
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (!ALLOWED_TYPES.has(type)) return send(res, 415, { error: 'Send JSON or a form.' });
  if (!fromSite(req)) return send(res, 403, { error: 'Forbidden.' }, wantsHtml);

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: 'Bad request body.' }, wantsHtml); }

  // Honeypot: real people never see or fill the "website" field. Pretend it worked.
  if (clean(body.website, 200)) return send(res, 200, { ok: true }, wantsHtml);

  if (limited(clientIp(req), Date.now())) return send(res, 429, { error: 'Too many requests.', fallback: 'mailto' }, wantsHtml);

  const v = validate(body);
  if (v.error) return send(res, 400, { error: v.error }, wantsHtml);

  const key = process.env.RESEND_API_KEY;
  const from = process.env.ASSESSMENT_FROM;
  if (!key || !from) return send(res, 503, { fallback: 'mailto' }, wantsHtml);

  const text = [
    'New Throttle sign-up request from throttle-pro.com',
    '',
    'Plan: ' + (v.plan ? PLANS[v.plan] : 'not given'),
    'Work email: ' + v.email,
    'Company: ' + (v.company || 'not given'),
    'Monthly AI API spend: ' + (v.spend ? SPEND[v.spend] : 'not given'),
    '',
    'Reply to this email to answer them directly.',
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [TO],
        reply_to: v.email,
        subject: (v.plan ? PLANS[v.plan].split(',')[0] : 'Sign-up') + ' request: ' + (v.company || v.email),
        text,
      }),
    });
    if (!r.ok) {
      console.error('resend error', r.status, await r.text().catch(() => ''));
      return send(res, 502, { error: 'Email service error.', fallback: 'mailto' }, wantsHtml);
    }
  } catch (e) {
    console.error('resend fetch failed', e && e.message);
    return send(res, 502, { error: 'Email service unreachable.', fallback: 'mailto' }, wantsHtml);
  }
  return send(res, 200, { ok: true }, wantsHtml);
}

module.exports = handler;
module.exports._resetRateLimit = () => hits.clear();
