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

async function seedPhaseAndTask(pool) {
  await pool.query("INSERT INTO phases (code, name, target_date) VALUES ('P1', 'Lived', '2026-09-01')");
  const { rows: [phase] } = await pool.query("SELECT id FROM phases WHERE code='P1'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', $1, '4.done', '2026-07-01', '2026-07-05')`,
    [phase.id]
  );
  return phase;
}

test('GET /api/snapshots/current computes without persisting anything', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  const app = createApp(pool);

  const res = await request(app).get('/api/snapshots/current');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.phases.length, 1);
  assert.equal(res.body.data.phases[0].code, 'P1');

  const list = await request(app).get('/api/snapshots');
  assert.equal(list.body.length, 0); // GET /current must not write a row
});

test('POST /api/snapshots persists a snapshot and attributes the actor', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  const app = createApp(pool);

  const created = await request(app)
    .post('/api/snapshots')
    .set('X-Actor-Name', encodeURIComponent('Quân'))
    .send({});
  assert.equal(created.status, 201);
  assert.equal(created.body.actor_name, 'Quân');
  assert.equal(created.body.data.phases[0].code, 'P1');

  const list = await request(app).get('/api/snapshots');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, created.body.id);
});

test('POST /api/snapshots without an actor header still saves (actor_name null)', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  const app = createApp(pool);

  const created = await request(app).post('/api/snapshots').send({});
  assert.equal(created.status, 201);
  assert.equal(created.body.actor_name, null);
});

test('GET /api/snapshots lists newest first', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  const app = createApp(pool);

  const first = await request(app).post('/api/snapshots').send({});
  const second = await request(app).post('/api/snapshots').send({});

  const list = await request(app).get('/api/snapshots');
  assert.equal(list.body[0].id, second.body.id);
  assert.equal(list.body[1].id, first.body.id);
});

test('DELETE /api/snapshots/:id removes it', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  const app = createApp(pool);

  const created = await request(app).post('/api/snapshots').send({});
  const deleted = await request(app).delete(`/api/snapshots/${created.body.id}`);
  assert.equal(deleted.status, 204);

  const list = await request(app).get('/api/snapshots');
  assert.equal(list.body.length, 0);
});

test('DELETE /api/snapshots/:id on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await request(app).delete('/api/snapshots/999');
  assert.equal(res.status, 404);
});

test('DELETE /api/snapshots/:id with a non-numeric id returns 400', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await request(app).delete('/api/snapshots/abc');
  assert.equal(res.status, 400);
});
