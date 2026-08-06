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

test('GET /api/sprints lists every sprint ordered by start date', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO sprints (code, start_date, end_date) VALUES ('S16','2026-08-17','2026-08-28'), ('S15','2026-08-03','2026-08-14')"
  );
  const app = createApp(pool);
  const res = await request(app).get('/api/sprints');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((s) => s.code), ['S15', 'S16']);
});

test('GET /api/sprints/current-next returns current sprint tasks and next sprint tasks', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO sprints (code, start_date, end_date) VALUES ('S15','2026-08-03','2026-08-14'), ('S16','2026-08-17','2026-08-28')"
  );
  const { rows: [s15] } = await pool.query("SELECT id FROM sprints WHERE code='S15'");
  await pool.query(
    "INSERT INTO tasks (category, name, platform, sprint_id, status) VALUES ('Product Foundation','Task A','Web',$1,'1.ready_for_dev')",
    [s15.id]
  );

  const app = createApp(pool);
  const res = await request(app).get('/api/sprints/current-next?today=2026-08-06');

  assert.equal(res.status, 200);
  assert.equal(res.body.current.code, 'S15');
  assert.equal(res.body.current.tasks.length, 1);
  assert.equal(res.body.next.code, 'S16');
  assert.equal(res.body.next.tasks.length, 0);
});
