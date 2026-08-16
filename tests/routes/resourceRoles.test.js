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

// migrations/001_init.sql seeds these two by email at admin/editor.
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

async function seedTask(pool, resourceRoles) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', '0.backlog', '2026-08-05', '2026-08-10')
     RETURNING id`
  );
  const taskId = rows[0].id;
  for (const role of (resourceRoles || [])) {
    await pool.query('INSERT INTO task_resource_roles (task_id, role) VALUES ($1, $2)', [taskId, role]);
  }
  return taskId;
}

test('GET /api/resource-roles lists the 6 seeded defaults with task_count', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/resource-roles');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((r) => r.name).sort(), ['App Dev', 'BE Dev', 'Core', 'ITBA', 'PO', 'Web Dev']);
  assert.ok(res.body.every((r) => r.task_count === 0));
});

test('POST /api/resource-roles as editor adds a new team; viewer is rejected', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const asViewer = await asActor(request(app).post('/api/resource-roles'), VIEWER_NAME).send({ name: 'QC' });
  assert.equal(asViewer.status, 403);

  const asEditor = await asActor(request(app).post('/api/resource-roles'), EDITOR).send({ name: 'QC' });
  assert.equal(asEditor.status, 201);
  assert.equal(asEditor.body.name, 'QC');
  assert.equal(asEditor.body.task_count, 0);

  const listed = await request(app).get('/api/resource-roles');
  assert.equal(listed.body.length, 7);
});

test('POST /api/resource-roles rejects a duplicate name', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await asActor(request(app).post('/api/resource-roles'), EDITOR).send({ name: 'PO' });
  assert.equal(res.status, 409);
});

test('POST /api/resource-roles rejects an empty name', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await asActor(request(app).post('/api/resource-roles'), EDITOR).send({ name: '  ' });
  assert.equal(res.status, 400);
});

test('PUT /api/resource-roles/:id renames a team and cascades into every task using it', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedTask(pool, ['Core']);

  const roleRow = (await pool.query("SELECT id FROM resource_roles WHERE name='Core'")).rows[0];
  const res = await asActor(request(app).put(`/api/resource-roles/${roleRow.id}`), EDITOR).send({ name: 'Core Platform' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Core Platform');
  assert.equal(res.body.task_count, 1);

  const taskRoles = await pool.query('SELECT role FROM task_resource_roles WHERE task_id=$1', [taskId]);
  assert.deepEqual(taskRoles.rows.map((r) => r.role), ['Core Platform']);

  const listed = await request(app).get('/api/resource-roles');
  assert.ok(!listed.body.some((r) => r.name === 'Core'));
});

test('PUT /api/resource-roles/:id rejects renaming to a name another team already has', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await seedTask(pool, ['Core', 'PO']); // a task already using both is not this endpoint's problem to solve

  const roleRow = (await pool.query("SELECT id FROM resource_roles WHERE name='Core'")).rows[0];
  const res = await asActor(request(app).put(`/api/resource-roles/${roleRow.id}`), EDITOR).send({ name: 'PO' });
  assert.equal(res.status, 409);

  // both teams, and the task's assignment to each, are untouched
  const listed = await request(app).get('/api/resource-roles');
  assert.ok(listed.body.some((r) => r.name === 'Core') && listed.body.some((r) => r.name === 'PO'));
});

test('PUT /api/resource-roles/:id as viewer is rejected; on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const roleRow = (await pool.query("SELECT id FROM resource_roles WHERE name='PO'")).rows[0];
  const asViewer = await asActor(request(app).put(`/api/resource-roles/${roleRow.id}`), VIEWER_NAME).send({ name: 'X' });
  assert.equal(asViewer.status, 403);

  const missing = await asActor(request(app).put('/api/resource-roles/9999'), EDITOR).send({ name: 'X' });
  assert.equal(missing.status, 404);
});

test('DELETE /api/resource-roles/:id is blocked (409) while a task still uses it', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  await seedTask(pool, ['Core']);

  const roleRow = (await pool.query("SELECT id FROM resource_roles WHERE name='Core'")).rows[0];
  const res = await asActor(request(app).delete(`/api/resource-roles/${roleRow.id}`), ADMIN);
  assert.equal(res.status, 409);

  const listed = await request(app).get('/api/resource-roles');
  assert.ok(listed.body.some((r) => r.name === 'Core')); // not deleted
});

test('DELETE /api/resource-roles/:id succeeds once unused; editor is rejected (admin-only)', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const roleRow = (await pool.query("SELECT id FROM resource_roles WHERE name='Core'")).rows[0];

  const asEditor = await asActor(request(app).delete(`/api/resource-roles/${roleRow.id}`), EDITOR);
  assert.equal(asEditor.status, 403);

  const asAdmin = await asActor(request(app).delete(`/api/resource-roles/${roleRow.id}`), ADMIN);
  assert.equal(asAdmin.status, 204);

  const listed = await request(app).get('/api/resource-roles');
  assert.ok(!listed.body.some((r) => r.name === 'Core'));
});

test('DELETE /api/resource-roles/:id on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const res = await asActor(request(app).delete('/api/resource-roles/9999'), ADMIN);
  assert.equal(res.status, 404);
});
