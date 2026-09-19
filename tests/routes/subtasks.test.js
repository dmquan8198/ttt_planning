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

const EDITOR = 'anh.nguyen80';
const VIEWER_NAME = 'no.such.actor'; // not seeded — defaults to viewer
const KNOWN_EMAILS = { 'anh.nguyen80': 'anh.nguyen80@gmail.com' };

function asActor(req, name) {
  const email = KNOWN_EMAILS[name] || (name.replace(/\s+/g, '.') + '@example.com');
  return req
    .set('X-Actor-Name', encodeURIComponent(name))
    .set('X-Actor-Email', encodeURIComponent(email));
}

async function seedTask(pool) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', '0.backlog', '2026-08-05', '2026-08-10')
     RETURNING id`
  );
  return rows[0].id;
}

test('GET /api/tasks/:taskId/subtasks starts empty for a fresh task', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const res = await request(app).get(`/api/tasks/${taskId}/subtasks`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('POST /api/tasks/:taskId/subtasks as editor creates one with just a name; viewer is rejected', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);

  const asViewer = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), VIEWER_NAME).send({ name: 'Viết doc' });
  assert.equal(asViewer.status, 403);

  const res = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'Viết doc' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Viết doc');
  assert.equal(res.body.status, 'todo'); // default
  assert.equal(res.body.start_date, null);
  assert.equal(res.body.due_date, null);
  assert.equal(res.body.pic, null);
  assert.equal(res.body.task_id, taskId);
});

test('POST /api/tasks/:taskId/subtasks accepts status/dates/pic and rejects an empty name or bad status', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);

  const res = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({
    name: 'Review code', status: 'wip', start_date: '2026-08-05', due_date: '2026-08-07', pic: 'Quân'
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'wip');
  assert.equal(res.body.start_date, '2026-08-05');
  assert.equal(res.body.due_date, '2026-08-07');
  assert.equal(res.body.pic, 'Quân');

  const emptyName = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: '  ' });
  assert.equal(emptyName.status, 400);

  const badStatus = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'X', status: 'blocked' });
  assert.equal(badStatus.status, 400);
});

test('POST /api/tasks/:taskId/subtasks on a non-existent task returns 400', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await asActor(request(app).post('/api/tasks/9999/subtasks'), EDITOR).send({ name: 'X' });
  assert.equal(res.status, 400);
});

test('PUT .../subtasks/:id only changes the fields sent, leaving the rest untouched', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const created = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR)
    .send({ name: 'Viết doc', status: 'todo', start_date: '2026-08-05', pic: 'Quân' });
  const subtaskId = created.body.id;

  // change only status — name/start_date/pic must survive untouched
  const res = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/${subtaskId}`), EDITOR).send({ status: 'done' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'done');
  assert.equal(res.body.name, 'Viết doc');
  assert.equal(res.body.start_date, '2026-08-05');
  assert.equal(res.body.pic, 'Quân');
});

test('PUT .../subtasks/:id can explicitly clear a date by sending null', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const created = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR)
    .send({ name: 'X', due_date: '2026-08-10' });
  const subtaskId = created.body.id;

  const res = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/${subtaskId}`), EDITOR).send({ due_date: null });
  assert.equal(res.status, 200);
  assert.equal(res.body.due_date, null);
});

test('PUT .../subtasks/:id rejects an empty name, a bad status, and an empty body', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const created = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'X' });
  const subtaskId = created.body.id;

  const emptyName = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/${subtaskId}`), EDITOR).send({ name: '  ' });
  assert.equal(emptyName.status, 400);

  const badStatus = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/${subtaskId}`), EDITOR).send({ status: 'blocked' });
  assert.equal(badStatus.status, 400);

  const emptyBody = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/${subtaskId}`), EDITOR).send({});
  assert.equal(emptyBody.status, 400);
});

test('PUT .../subtasks/:id as viewer is rejected; on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const created = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'X' });
  const subtaskId = created.body.id;

  const asViewer = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/${subtaskId}`), VIEWER_NAME).send({ name: 'Y' });
  assert.equal(asViewer.status, 403);

  const missing = await asActor(request(app).put(`/api/tasks/${taskId}/subtasks/9999`), EDITOR).send({ name: 'Y' });
  assert.equal(missing.status, 404);
});

test('DELETE .../subtasks/:id as editor removes it; viewer is rejected', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const created = await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'X' });
  const subtaskId = created.body.id;

  const asViewer = await asActor(request(app).delete(`/api/tasks/${taskId}/subtasks/${subtaskId}`), VIEWER_NAME);
  assert.equal(asViewer.status, 403);

  const asEditor = await asActor(request(app).delete(`/api/tasks/${taskId}/subtasks/${subtaskId}`), EDITOR);
  assert.equal(asEditor.status, 204);

  const listed = await request(app).get(`/api/tasks/${taskId}/subtasks`);
  assert.deepEqual(listed.body, []);
});

test('DELETE .../subtasks/:id on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  const res = await asActor(request(app).delete(`/api/tasks/${taskId}/subtasks/9999`), EDITOR);
  assert.equal(res.status, 404);
});

test('deleting the parent task cascades and removes its subtasks', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);
  await asActor(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'X' });

  await pool.query('DELETE FROM tasks WHERE id=$1', [taskId]);
  const remaining = await pool.query('SELECT * FROM subtasks WHERE task_id=$1', [taskId]);
  assert.equal(remaining.rows.length, 0);
});
