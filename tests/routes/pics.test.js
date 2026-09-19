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
const VIEWER_NAME = 'no.such.actor'; // not seeded — defaults to viewer
const KNOWN_EMAILS = { 'quan.dang1': 'dmquan8198@gmail.com', 'anh.nguyen80': 'anh.nguyen80@gmail.com' };

function asActor(req, name) {
  const email = KNOWN_EMAILS[name] || (name.replace(/\s+/g, '.') + '@example.com');
  return req
    .set('X-Actor-Name', encodeURIComponent(name))
    .set('X-Actor-Email', encodeURIComponent(email));
}

async function seedTaskWithSubtask(pool, pic) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', '0.backlog', '2026-08-05', '2026-08-10')
     RETURNING id`
  );
  const taskId = rows[0].id;
  await pool.query('INSERT INTO subtasks (task_id, name, pic) VALUES ($1, $2, $3)', [taskId, 'Sub A', pic]);
  return taskId;
}

test('GET /api/pics starts empty (no seeded defaults — user configures their own)', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/pics');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('POST /api/pics as editor adds a new PIC; viewer is rejected', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const asViewer = await asActor(request(app).post('/api/pics'), VIEWER_NAME).send({ name: 'Quân' });
  assert.equal(asViewer.status, 403);

  const asEditor = await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  assert.equal(asEditor.status, 201);
  assert.equal(asEditor.body.name, 'Quân');
  assert.equal(asEditor.body.subtask_count, 0);

  const listed = await request(app).get('/api/pics');
  assert.equal(listed.body.length, 1);
});

test('POST /api/pics rejects a duplicate name and an empty name', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });

  const dup = await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  assert.equal(dup.status, 409);

  const empty = await asActor(request(app).post('/api/pics'), EDITOR).send({ name: '  ' });
  assert.equal(empty.status, 400);
});

test('PUT /api/pics/:id renames a PIC and cascades into every subtask using it', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  const taskId = await seedTaskWithSubtask(pool, 'Quân');

  const picRow = (await pool.query("SELECT id FROM pics WHERE name='Quân'")).rows[0];
  const res = await asActor(request(app).put(`/api/pics/${picRow.id}`), EDITOR).send({ name: 'Quân Đặng' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Quân Đặng');
  assert.equal(res.body.subtask_count, 1);

  const subtasks = await pool.query('SELECT pic FROM subtasks WHERE task_id=$1', [taskId]);
  assert.deepEqual(subtasks.rows.map((r) => r.pic), ['Quân Đặng']);
});

test('PUT /api/pics/:id rejects renaming to a name another PIC already has', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Nghi' });

  const picRow = (await pool.query("SELECT id FROM pics WHERE name='Quân'")).rows[0];
  const res = await asActor(request(app).put(`/api/pics/${picRow.id}`), EDITOR).send({ name: 'Nghi' });
  assert.equal(res.status, 409);
});

test('PUT /api/pics/:id as viewer is rejected; on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  const picRow = (await pool.query("SELECT id FROM pics WHERE name='Quân'")).rows[0];

  const asViewer = await asActor(request(app).put(`/api/pics/${picRow.id}`), VIEWER_NAME).send({ name: 'X' });
  assert.equal(asViewer.status, 403);

  const missing = await asActor(request(app).put('/api/pics/9999'), EDITOR).send({ name: 'X' });
  assert.equal(missing.status, 404);
});

test('DELETE /api/pics/:id is blocked (409) while a subtask still uses it', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  await seedTaskWithSubtask(pool, 'Quân');

  const picRow = (await pool.query("SELECT id FROM pics WHERE name='Quân'")).rows[0];
  const res = await asActor(request(app).delete(`/api/pics/${picRow.id}`), ADMIN);
  assert.equal(res.status, 409);
});

test('DELETE /api/pics/:id succeeds once unused; editor is rejected (admin-only)', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await asActor(request(app).post('/api/pics'), EDITOR).send({ name: 'Quân' });
  const picRow = (await pool.query("SELECT id FROM pics WHERE name='Quân'")).rows[0];

  const asEditor = await asActor(request(app).delete(`/api/pics/${picRow.id}`), EDITOR);
  assert.equal(asEditor.status, 403);

  const asAdmin = await asActor(request(app).delete(`/api/pics/${picRow.id}`), ADMIN);
  assert.equal(asAdmin.status, 204);

  const listed = await request(app).get('/api/pics');
  assert.equal(listed.body.length, 0);
});

test('DELETE /api/pics/:id on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await asActor(request(app).delete('/api/pics/9999'), ADMIN);
  assert.equal(res.status, 404);
});
