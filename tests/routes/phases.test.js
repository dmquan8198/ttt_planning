const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

const ADMIN = 'quan.dang1';
const EDITOR = 'anh.nguyen80';
// role lookup is by email now (see src/lib/requireRole.js); these match
// migrations/001_init.sql's seed.
const KNOWN_EMAILS = { 'quan.dang1': 'dmquan8198@gmail.com', 'anh.nguyen80': 'anh.nguyen80@gmail.com' };
function asActor(req, name) {
  const email = KNOWN_EMAILS[name] || (name.replace(/\s+/g, '.') + '@example.com');
  return req
    .set('X-Actor-Name', encodeURIComponent(name))
    .set('X-Actor-Email', encodeURIComponent(email));
}

test('GET /api/phases returns rollup per phase', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO phases (code, name, target_date) VALUES ('P1','Lived','2026-08-10'), ('P2','Rollout','2026-09-01')"
  );
  const { rows: [p1] } = await pool.query("SELECT id FROM phases WHERE code='P1'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, status, start_date, due_date)
     VALUES ('Product Foundation','Task A','Web',$1,'4.done','2026-08-05','2026-08-10'),
            ('Product Foundation','Task B','Web',$1,'1.ready_for_dev','2026-08-05','2026-08-10')`,
    [p1.id]
  );
  await pool.query(
    "INSERT INTO tasks (category, name, platform, start_date, due_date) VALUES ('Product Foundation','Unassigned Task','Web','2026-08-05','2026-08-10')"
  );

  const app = createApp(pool);
  const res = await request(app).get('/api/phases');

  assert.equal(res.status, 200);
  const p1Result = res.body.find((p) => p.code === 'P1');
  assert.equal(p1Result.target_date, '2026-08-10');
  assert.equal(p1Result.total, 2);
  assert.equal(p1Result.done_analyst, 2);
  assert.equal(p1Result.done_dev_qc, 1);
  assert.equal(p1Result.golive, 1);
  const p2Result = res.body.find((p) => p.code === 'P2');
  assert.equal(p2Result.total, 0);
  assert.equal(p2Result.pct_complete, null);
});

async function makeAppWithOnePhase() {
  const pool = makeTestPool();
  await pool.query("INSERT INTO phases (code, name, target_date) VALUES ('P1','Lived','2026-08-10')");
  const app = createApp(pool);
  const phase = (await request(app).get('/api/phases')).body[0];
  return { app, phase };
}

test('PUT /api/phases/:id as admin updates the go-live date', async () => {
  const { app, phase } = await makeAppWithOnePhase();

  const res = await asActor(request(app).put(`/api/phases/${phase.id}`), ADMIN)
    .send({ target_date: '2026-08-20', updated_at: phase.updated_at });
  assert.equal(res.status, 200);
  assert.equal(res.body.target_date, '2026-08-20');
  assert.notEqual(res.body.updated_at, phase.updated_at);
});

test('PUT /api/phases/:id as editor is rejected', async () => {
  const { app, phase } = await makeAppWithOnePhase();

  const res = await asActor(request(app).put(`/api/phases/${phase.id}`), EDITOR)
    .send({ target_date: '2026-08-20', updated_at: phase.updated_at });
  assert.equal(res.status, 403);
});

test('PUT /api/phases/:id with a stale updated_at returns 409, not a silent overwrite', async () => {
  const { app, phase } = await makeAppWithOnePhase();

  const first = await asActor(request(app).put(`/api/phases/${phase.id}`), ADMIN)
    .send({ target_date: '2026-08-20', updated_at: phase.updated_at });
  assert.equal(first.status, 200);

  // second edit still carries the ORIGINAL (now stale) updated_at, simulating
  // two admins editing concurrently without reloading in between
  const second = await asActor(request(app).put(`/api/phases/${phase.id}`), ADMIN)
    .send({ target_date: '2026-09-01', updated_at: phase.updated_at });
  assert.equal(second.status, 409);
});

test('PUT /api/phases/:id on a non-existent id returns 404', async () => {
  const { app } = await makeAppWithOnePhase();
  const res = await asActor(request(app).put('/api/phases/9999'), ADMIN)
    .send({ target_date: '2026-08-20', updated_at: new Date().toISOString() });
  assert.equal(res.status, 404);
});

test('PUT /api/phases/:id rejects a missing target_date', async () => {
  const { app, phase } = await makeAppWithOnePhase();

  const res = await asActor(request(app).put(`/api/phases/${phase.id}`), ADMIN)
    .send({ updated_at: phase.updated_at });
  assert.equal(res.status, 400);
});
