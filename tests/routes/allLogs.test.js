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

test('GET /api/logs lists activity logs across every task, newest first', async () => {
  const pool = makeTestPool();
  const { rows: [taskA] } = await pool.query(
    `INSERT INTO tasks (category, name, platform, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', '2026-08-01', '2026-08-05') RETURNING id`
  );
  const { rows: [taskB] } = await pool.query(
    `INSERT INTO tasks (category, name, platform, start_date, due_date)
     VALUES ('Product Foundation', 'Task B', 'Web', '2026-08-01', '2026-08-05') RETURNING id`
  );
  await pool.query(
    "INSERT INTO activity_logs (task_id, note, created_at) VALUES ($1, 'older note', '2026-08-01T00:00:00Z')",
    [taskA.id]
  );
  await pool.query(
    "INSERT INTO activity_logs (task_id, note, created_at) VALUES ($1, 'newer note', '2026-08-02T00:00:00Z')",
    [taskB.id]
  );

  const app = createApp(pool);
  const res = await request(app).get('/api/logs');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].note, 'newer note');
  assert.equal(res.body[0].task_name, 'Task B');
  assert.equal(res.body[1].note, 'older note');
  assert.equal(res.body[1].task_name, 'Task A');
});

test('GET /api/logs returns an empty array when there are no logs yet', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/logs');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});
