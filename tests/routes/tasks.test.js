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

test('POST /api/tasks rejects a task missing required fields', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/tasks').send({ name: 'Only a name' });
  assert.equal(res.status, 400);
});

test('POST /api/tasks rejects an invalid status', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app)
    .post('/api/tasks')
    .send({ name: 'Task A', category: 'Product Foundation', platform: 'Web', status: 'not-a-status' });
  assert.equal(res.status, 400);
});

test('full CRUD lifecycle: create, list, update, delete', async () => {
  const app = createApp(makeTestPool());

  const created = await request(app)
    .post('/api/tasks')
    .send({ name: 'Sửa thông tin TCPH', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev' });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const listed = await request(app).get('/api/tasks');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);

  const updated = await request(app)
    .put(`/api/tasks/${id}`)
    .send({ name: 'Sửa thông tin TCPH', category: 'Product Foundation', platform: 'Web', status: '4.done' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, '4.done');

  const deleted = await request(app).delete(`/api/tasks/${id}`);
  assert.equal(deleted.status, 204);

  const listedAfter = await request(app).get('/api/tasks');
  assert.equal(listedAfter.body.length, 0);
});

test('PUT on a non-existent task returns 404', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app)
    .put('/api/tasks/999')
    .send({ name: 'X', category: 'Product Foundation', platform: 'Web', status: '0.backlog' });
  assert.equal(res.status, 404);
});

test('GET /api/tasks normalizes date fields to plain YYYY-MM-DD strings', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO sprints (code, start_date, end_date) VALUES ('S15', '2026-08-03', '2026-08-14')"
  );
  const { rows: [sprint] } = await pool.query("SELECT id FROM sprints WHERE code='S15'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, sprint_id, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', $1, '2026-08-05', '2026-08-06')`,
    [sprint.id]
  );
  const app = createApp(pool);
  const res = await request(app).get('/api/tasks');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].start_date, '2026-08-05');
  assert.equal(res.body[0].due_date, '2026-08-06');
  assert.equal(res.body[0].sprint_start, '2026-08-03');
  assert.equal(res.body[0].sprint_end, '2026-08-14');
});
