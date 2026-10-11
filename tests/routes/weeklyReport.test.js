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

test('GET /api/reports/weekly.pptx returns the report deck named after the week', async () => {
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
    assert.ok(slides.length >= 3, 'timeline, per-milestone page and the item pages');
    const all = (await Promise.all(slides.map((n) => zip.file(n).async('string')))).join('');
    assert.ok(all.includes('BLOCKER'), 'the item pages are present');
  });
});

test('the deck still builds on an empty database (no tasks, no sprints)', async () => {
  await withSecret(async () => {
    const res = await request(createApp(makeTestPool())).get('/api/reports/weekly.pptx?today=2026-10-11')
      .set('X-Report-Secret', SECRET).buffer(true).parse(binary);
    assert.equal(res.status, 200);
    const zip = await JSZip.loadAsync(res.body);
    assert.ok(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length >= 1);
  });
});

test('GET /api/config tells the web button which Apps Script page to open (null when not configured)', async () => {
  const prev = process.env.APPS_SCRIPT_URL;
  try {
    delete process.env.APPS_SCRIPT_URL;
    assert.equal((await request(createApp(makeTestPool())).get('/api/config')).body.weeklyReportUrl, null);
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/a/macros/corp.com/s/ABC/exec';
    assert.equal((await request(createApp(makeTestPool())).get('/api/config')).body.weeklyReportUrl, 'https://script.google.com/a/macros/corp.com/s/ABC/exec');
  } finally {
    if (prev === undefined) delete process.env.APPS_SCRIPT_URL; else process.env.APPS_SCRIPT_URL = prev;
  }
});
