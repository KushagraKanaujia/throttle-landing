// Vercel serverless function: POST /api/assessment
// Takes a free-savings-assessment request from the landing page and emails it to Kush via Resend.
// No dependencies. Env vars: RESEND_API_KEY, ASSESSMENT_FROM (a sender on a domain verified in Resend,
// e.g. "Throttle <assessment@throttle-pro.com>"). If either is missing it returns 503 {fallback:"mailto"}
// and the page opens a prefilled email instead, so no lead is lost.
'use strict';

const TO = 'kush@throttle-pro.com';
const SPEND = {
  'lt5k': 'Under $5k a month',
  '5k-50k': '$5k to $50k a month',
  '50k-500k': '$50k to $500k a month',
  '500k+': '$500k+ a month',
};
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MAX_BODY = 8 * 1024;

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
    return body ? JSON.parse(body) : {};
  }
  return body && typeof body === 'object' ? body : {};
}

function clean(s, max) {
  return typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '';
}

function validate(b) {
  const email = clean(b.email, 254);
  const company = clean(b.company, 200);
  const spend = clean(b.spend, 20);
  if (!email || !EMAIL_RE.test(email)) return { error: 'Please enter a valid work email.' };
  if (spend && !SPEND[spend]) return { error: 'Unknown spend range.' };
  return { email, company, spend };
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
  const wantsHtml = String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

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
    'New free savings assessment request from throttle-pro.com',
    '',
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
        subject: 'Assessment request: ' + (v.company || v.email),
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
