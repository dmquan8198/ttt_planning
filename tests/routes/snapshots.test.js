const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');
const { getTodayVN } = require('../../src/lib/today');

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

async function seedTask(pool, { category, status, sprintId }) {
  await pool.query(
    `INSERT INTO tasks (category, name, platform, status, sprint_id, start_date, due_date)
     VALUES ($1, 'Task', 'Web', $2, $3, '2026-08-05', '2026-08-10')`,
    [category, status, sprintId || null]
  );
}

test('POST /api/snapshots/run with no CRON_SECRET configured returns 500', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await request(app).post('/api/snapshots/run');
  assert.equal(res.status, 500);
});

test('POST /api/snapshots/run rejects a missing or wrong secret', async (t) => {
  process.env.CRON_SECRET = 'test-secret';
  t.after(() => { delete process.env.CRON_SECRET; });

  const pool = makeTestPool();
  const app = createApp(pool);

  const noHeader = await request(app).post('/api/snapshots/run');
  assert.equal(noHeader.status, 401);

  const wrong = await request(app).post('/api/snapshots/run').set('X-Cron-Secret', 'nope');
  assert.equal(wrong.status, 401);
});

test('POST /api/snapshots/run with the right secret computes and stores today\'s aggregate', async (t) => {
  process.env.CRON_SECRET = 'test-secret';
  t.after(() => { delete process.env.CRON_SECRET; });

  const pool = makeTestPool();
  const app = createApp(pool);
  await seedTask(pool, { category: 'A', status: '5.done' });
  await seedTask(pool, { category: 'A', status: '0.backlog' });
  await seedTask(pool, { category: 'B', status: '5.done' });

  const res = await request(app).post('/api/snapshots/run').set('X-Cron-Secret', 'test-secret');
  assert.equal(res.status, 201);
  assert.equal(res.body.snapshot_date, getTodayVN());
  assert.equal(res.body.total_tasks, 3);
  assert.equal(res.body.completed_tasks, 2);
  assert.equal(res.body.completion_rate, 66.67);
  assert.equal(res.body.by_status['5.done'], 2);
  assert.equal(res.body.by_status['1.in_analyst'], 0);
  assert.deepEqual(res.body.by_category, { A: 2, B: 1 });

  const listed = await request(app).get('/api/snapshots');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
});

test('POST /api/snapshots/run twice the same day overwrites instead of duplicating', async (t) => {
  process.env.CRON_SECRET = 'test-secret';
  t.after(() => { delete process.env.CRON_SECRET; });

  const pool = makeTestPool();
  const app = createApp(pool);
  await seedTask(pool, { category: 'A', status: '0.backlog' });

  const first = await request(app).post('/api/snapshots/run').set('X-Cron-Secret', 'test-secret');
  assert.equal(first.body.total_tasks, 1);

  await seedTask(pool, { category: 'A', status: '5.done' });
  const second = await request(app).post('/api/snapshots/run').set('X-Cron-Secret', 'test-secret');
  assert.equal(second.body.total_tasks, 2);

  const listed = await request(app).get('/api/snapshots');
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].total_tasks, 2);
});

test('GET /api/snapshots requires no auth and starts empty', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await request(app).get('/api/snapshots');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});
