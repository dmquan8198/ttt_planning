const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');

// migrations/001_init.sql seeds these three at admin/editor/editor respectively.
const ADMIN = 'quan.dang1';
const EDITOR = 'anh.nguyen80';
const VIEWER_NAME = 'no.such.actor'; // not seeded — defaults to viewer

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

function asActor(req, name) {
  return req.set('X-Actor-Name', encodeURIComponent(name));
}

async function seedTask(pool) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', '0.backlog', '2026-08-05', '2026-08-10')
     RETURNING id`
  );
  return rows[0].id;
}

const TASK_BODY = {
  name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '0.backlog',
  start_date: '2026-08-05', due_date: '2026-08-10'
};

test('viewer can read tasks but is blocked from create/update/delete', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);

  const get = await asActor(request(app).get('/api/tasks'), VIEWER_NAME);
  assert.equal(get.status, 200);

  const post = await asActor(request(app).post('/api/tasks'), VIEWER_NAME).send(TASK_BODY);
  assert.equal(post.status, 403);

  const put = await asActor(request(app).put(`/api/tasks/${taskId}`), VIEWER_NAME).send(TASK_BODY);
  assert.equal(put.status, 403);

  const del = await asActor(request(app).delete(`/api/tasks/${taskId}`), VIEWER_NAME);
  assert.equal(del.status, 403);
});

test('editor can create/update tasks but is blocked from delete', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const post = await asActor(request(app).post('/api/tasks'), EDITOR).send(TASK_BODY);
  assert.equal(post.status, 201);
  const taskId = post.body.id;

  const put = await asActor(request(app).put(`/api/tasks/${taskId}`), EDITOR).send({ ...TASK_BODY, status: '1.ready_for_dev' });
  assert.equal(put.status, 200);

  const del = await asActor(request(app).delete(`/api/tasks/${taskId}`), EDITOR);
  assert.equal(del.status, 403);
});

test('admin can create, update, and delete tasks', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const post = await asActor(request(app).post('/api/tasks'), ADMIN).send(TASK_BODY);
  assert.equal(post.status, 201);
  const taskId = post.body.id;

  const put = await asActor(request(app).put(`/api/tasks/${taskId}`), ADMIN).send({ ...TASK_BODY, status: '1.ready_for_dev' });
  assert.equal(put.status, 200);

  const del = await asActor(request(app).delete(`/api/tasks/${taskId}`), ADMIN);
  assert.equal(del.status, 204);
});

test('an unrecognized actor name defaults to viewer (deny-by-default), not an error', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await asActor(request(app).post('/api/tasks'), 'someone.not.in.the.list').send(TASK_BODY);
  assert.equal(res.status, 403);
});

test('viewer is blocked from adding a log note; editor is allowed', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool);

  const asViewer = await asActor(request(app).post(`/api/tasks/${taskId}/logs`), VIEWER_NAME).send({ note: 'x' });
  assert.equal(asViewer.status, 403);

  const asEditor = await asActor(request(app).post(`/api/tasks/${taskId}/logs`), EDITOR).send({ note: 'x' });
  assert.equal(asEditor.status, 201);
});

test('editor can capture a snapshot but not delete one; admin can delete', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const asViewerCapture = await asActor(request(app).post('/api/snapshots'), VIEWER_NAME).send({});
  assert.equal(asViewerCapture.status, 403);

  const created = await asActor(request(app).post('/api/snapshots'), EDITOR).send({});
  assert.equal(created.status, 201);

  const editorDelete = await asActor(request(app).delete(`/api/snapshots/${created.body.id}`), EDITOR);
  assert.equal(editorDelete.status, 403);

  const adminDelete = await asActor(request(app).delete(`/api/snapshots/${created.body.id}`), ADMIN);
  assert.equal(adminDelete.status, 204);
});
