const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

const SECRET = 'test-report-secret';
const binary = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };

async function withSecret(fn) {
  const prev = process.env.REPORT_SECRET;
  process.env.REPORT_SECRET = SECRET;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.REPORT_SECRET; else process.env.REPORT_SECRET = prev;
  }
}

async function seed(pool) {
  await pool.query("INSERT INTO sprints (code, start_date, end_date) VALUES ('S19', '2026-09-28', '2026-10-09'), ('S20', '2026-10-12', '2026-10-23')");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, status, sprint_id, start_date, due_date, date_overridden)
     VALUES ('TTT New - Product Foundation', 'A', 'App', '6.done', 1, '2026-09-28', '2026-10-05', true),
            ('TTT New - Product Foundation', 'B', 'App', '4.in_test_uat', 1, '2026-09-28', '2026-10-07', true),
            ('TTT New - Cross Service Integration', 'C', 'App', '1.in_analyst', 2, '2026-10-12', '2026-10-20', true)`
  );
}

test('GET /api/reports/weekly.pptx is denied when the server has no REPORT_SECRET configured', async () => {
  const prev = process.env.REPORT_SECRET;
  delete process.env.REPORT_SECRET;
  try {
    const res = await request(createApp(makeTestPool())).get('/api/reports/weekly.pptx').set('X-Report-Secret', 'x');
    assert.equal(res.status, 500);
  } finally {
    if (prev !== undefined) process.env.REPORT_SECRET = prev;
  }
});

test('GET /api/reports/weekly.pptx rejects a missing or wrong secret (other secrets do not work)', async () => {
  await withSecret(async () => {
    const app = createApp(makeTestPool());
    assert.equal((await request(app).get('/api/reports/weekly.pptx')).status, 401);
    assert.equal((await request(app).get('/api/reports/weekly.pptx').set('X-Report-Secret', 'nope')).status, 401);
    assert.equal((await request(app).get('/api/reports/weekly.pptx').set('X-Reminder-Secret', SECRET)).status, 401);
  });
});

test('GET /api/reports/weekly.pptx rejects a malformed today', async () => {
  await withSecret(async () => {
    const res = await request(createApp(makeTestPool())).get('/api/reports/weekly.pptx?today=yesterday').set('X-Report-Secret', SECRET);
    assert.equal(res.status, 400);
  });
});

test('GET /api/reports/weekly.pptx returns a 4-slide deck named after the week', async () => {
  await withSecret(async () => {
    const pool = makeTestPool();
    await seed(pool);
    const res = await request(createApp(pool)).get('/api/reports/weekly.pptx?today=2026-10-11')
      .set('X-Report-Secret', SECRET).buffer(true).parse(binary);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /presentationml\.presentation/);
    assert.match(res.headers['content-disposition'], /bao-cao-tuan_2026-10-04_2026-10-11\.pptx/);
    const zip = await JSZip.loadAsync(res.body);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    assert.equal(slides.length, 4);
    const all = (await Promise.all(slides.map((n) => zip.file(n).async('string')))).join('');
    assert.ok(all.includes('Rủi ro'), 'risk slide present');
  });
});

test('the deck still builds on an empty database (no tasks, no sprints)', async () => {
  await withSecret(async () => {
    const res = await request(createApp(makeTestPool())).get('/api/reports/weekly.pptx?today=2026-10-11')
      .set('X-Report-Secret', SECRET).buffer(true).parse(binary);
    assert.equal(res.status, 200);
    const zip = await JSZip.loadAsync(res.body);
    assert.equal(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 4);
  });
});

// ---- POST /api/reports/weekly/send (the web button) ----

const SCRIPT_URL = 'https://script.google.com/macros/s/ABC/exec';
const EDITOR = 'editor@corp.com';

async function withSendConfig(fn) {
  const prev = { u: process.env.APPS_SCRIPT_URL, s: process.env.REPORT_SECRET };
  process.env.APPS_SCRIPT_URL = SCRIPT_URL;
  process.env.REPORT_SECRET = SECRET;
  try { return await fn(); } finally {
    if (prev.u === undefined) delete process.env.APPS_SCRIPT_URL; else process.env.APPS_SCRIPT_URL = prev.u;
    if (prev.s === undefined) delete process.env.REPORT_SECRET; else process.env.REPORT_SECRET = prev.s;
  }
}
async function poolWithUsers() {
  const pool = makeTestPool();
  await pool.query("INSERT INTO users (name, email, role) VALUES ('Ed', $1, 'editor'), ('Vi', 'viewer@corp.com', 'viewer')", [EDITOR]);
  return pool;
}
const okResponse = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj) });

test('POST /weekly/send: a viewer (or anyone not signed in) is refused', async () => {
  await withSendConfig(async () => {
    const app = createApp(await poolWithUsers(), undefined, undefined, undefined, async () => { throw new Error('must not be called'); });
    assert.equal((await request(app).post('/api/reports/weekly/send')).status, 403);
    assert.equal((await request(app).post('/api/reports/weekly/send').set('X-Actor-Email', 'viewer@corp.com')).status, 403);
  });
});

test('POST /weekly/send: 503 until APPS_SCRIPT_URL and REPORT_SECRET are configured', async () => {
  const prev = { u: process.env.APPS_SCRIPT_URL, s: process.env.REPORT_SECRET };
  delete process.env.APPS_SCRIPT_URL; delete process.env.REPORT_SECRET;
  try {
    const app = createApp(await poolWithUsers());
    const res = await request(app).post('/api/reports/weekly/send').set('X-Actor-Email', EDITOR);
    assert.equal(res.status, 503);
  } finally {
    if (prev.u !== undefined) process.env.APPS_SCRIPT_URL = prev.u;
    if (prev.s !== undefined) process.env.REPORT_SECRET = prev.s;
  }
});

test('POST /weekly/send: asks the Apps Script to mail the SIGNED-IN user (never an address from the body) and returns the link', async () => {
  await withSendConfig(async () => {
    const calls = [];
    const fetchFn = async (url, opts) => { calls.push({ url, opts }); return okResponse({ ok: true, url: 'https://docs.google.com/presentation/d/X/edit', title: '[TTT] Báo cáo tuần', shared: true }); };
    const app = createApp(await poolWithUsers(), undefined, undefined, undefined, fetchFn);
    const res = await request(app).post('/api/reports/weekly/send').set('X-Actor-Email', EDITOR).send({ to: 'attacker@evil.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { url: 'https://docs.google.com/presentation/d/X/edit', title: '[TTT] Báo cáo tuần', to: EDITOR, shared: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SCRIPT_URL);
    assert.deepEqual(JSON.parse(calls[0].opts.body), { secret: SECRET, to: EDITOR });
  });
});

test('POST /weekly/send: an Apps Script error, an unreachable script and a non-JSON reply all surface as 502 with a message', async () => {
  await withSendConfig(async () => {
    const pool = await poolWithUsers();
    const send = (fetchFn) => request(createApp(pool, undefined, undefined, undefined, fetchFn)).post('/api/reports/weekly/send').set('X-Actor-Email', EDITOR);
    const a = await send(async () => okResponse({ ok: false, error: 'Không có quyền.' }));
    assert.equal(a.status, 502); assert.match(a.body.error, /Không có quyền/);
    const b = await send(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    assert.equal(b.status, 502); assert.match(b.body.error, /ENOTFOUND/);
    const c = await send(async () => ({ ok: true, status: 200, text: async () => '<html>login</html>' }));
    assert.equal(c.status, 502); assert.match(c.body.error, /không đọc được/);
  });
});

test('POST /weekly/send: a second click while one report is being made gets 409, not a second Slides file', async () => {
  await withSendConfig(async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    let calls = 0;
    const fetchFn = async () => { calls += 1; await gate; return okResponse({ ok: true, url: 'u', title: 't', shared: true }); };
    const app = createApp(await poolWithUsers(), undefined, undefined, undefined, fetchFn);
    const first = request(app).post('/api/reports/weekly/send').set('X-Actor-Email', EDITOR).then((r) => r);
    await new Promise((r) => setTimeout(r, 150));
    const second = await request(app).post('/api/reports/weekly/send').set('X-Actor-Email', EDITOR);
    assert.equal(second.status, 409);
    release();
    assert.equal((await first).status, 200);
    assert.equal(calls, 1);
  });
});
