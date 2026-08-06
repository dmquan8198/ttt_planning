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

test('POST then GET activity log entries for a task', async () => {
  const pool = makeTestPool();
  const created = await pool.query(
    "INSERT INTO tasks (category, name, platform) VALUES ('Product Foundation','Task A','Web') RETURNING id"
  );
  const taskId = created.rows[0].id;
  const app = createApp(pool);

  const post = await request(app)
    .post(`/api/tasks/${taskId}/logs`)
    .send({ note: 'Chuyển sang Ready for Dev, giao cho BE.' });
  assert.equal(post.status, 201);

  const list = await request(app).get(`/api/tasks/${taskId}/logs`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].note, 'Chuyển sang Ready for Dev, giao cho BE.');
});

test('POST rejects an empty note', async () => {
  const pool = makeTestPool();
  const created = await pool.query(
    "INSERT INTO tasks (category, name, platform) VALUES ('Product Foundation','Task A','Web') RETURNING id"
  );
  const app = createApp(pool);
  const res = await request(app)
    .post(`/api/tasks/${created.rows[0].id}/logs`)
    .send({ note: '   ' });
  assert.equal(res.status, 400);
});

test('GET logs for a non-numeric taskId returns 400', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/tasks/abc/logs');
  assert.equal(res.status, 400);
});

test('POST a log for a non-existent taskId returns 400 (foreign key violation), not 500', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/tasks/9999/logs').send({ note: 'test' });
  assert.equal(res.status, 400);
});

test('deleting a task cascades to delete its activity logs', async () => {
  const pool = makeTestPool();
  const created = await pool.query(
    "INSERT INTO tasks (category, name, platform) VALUES ('Product Foundation','Task A','Web') RETURNING id"
  );
  const taskId = created.rows[0].id;
  const app = createApp(pool);

  await request(app).post(`/api/tasks/${taskId}/logs`).send({ note: 'A log entry' });
  await request(app).delete(`/api/tasks/${taskId}`);

  const { rows } = await pool.query('SELECT * FROM activity_logs WHERE task_id = $1', [taskId]);
  assert.equal(rows.length, 0);
});
