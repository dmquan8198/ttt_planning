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

// migrations/001_init.sql seeds this as an admin — using it as the default
// actor for these CRUD tests keeps them focused on task behavior rather
// than on the separate permissions feature (see tests/routes/permissions.test.js).
const ADMIN = 'quan.dang1';
const ADMIN_EMAIL = 'dmquan8198@gmail.com'; // role lookup is by email now
function asAdmin(req) {
  return req
    .set('X-Actor-Name', encodeURIComponent(ADMIN))
    .set('X-Actor-Email', encodeURIComponent(ADMIN_EMAIL));
}

test('POST /api/tasks rejects a task missing required fields', async () => {
  const app = createApp(makeTestPool());
  const res = await asAdmin(request(app).post('/api/tasks')).send({ name: 'Only a name' });
  assert.equal(res.status, 400);
});

test('POST /api/tasks rejects an invalid status', async () => {
  const app = createApp(makeTestPool());
  const res = await asAdmin(request(app).post('/api/tasks'))
    .send({ name: 'Task A', category: 'Product Foundation', platform: 'Web', status: 'not-a-status' });
  assert.equal(res.status, 400);
});

test('POST /api/tasks rejects a task missing start_date/due_date', async () => {
  const app = createApp(makeTestPool());
  const res = await asAdmin(request(app).post('/api/tasks'))
    .send({ name: 'Task A', category: 'Product Foundation', platform: 'Web' });
  assert.equal(res.status, 400);
});

test('full CRUD lifecycle: create, list, update, delete', async () => {
  const app = createApp(makeTestPool());

  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Sửa thông tin TCPH', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const listed = await request(app).get('/api/tasks');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);

  const updated = await asAdmin(request(app).put(`/api/tasks/${id}`))
    .send({
      name: 'Sửa thông tin TCPH', category: 'Product Foundation', platform: 'Web', status: '4.done',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, '4.done');

  const deleted = await asAdmin(request(app).delete(`/api/tasks/${id}`));
  assert.equal(deleted.status, 204);

  const listedAfter = await request(app).get('/api/tasks');
  assert.equal(listedAfter.body.length, 0);
});

test('why is optional on create and defaults to null when omitted', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.why, null);
});

test('why is persisted on create and update', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', why: 'Yêu cầu từ VCB',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.why, 'Yêu cầu từ VCB');

  const updated = await asAdmin(request(app).put(`/api/tasks/${created.body.id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '0.backlog', why: 'Đổi lý do',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.why, 'Đổi lý do');

  // a PUT that omits why clears it, same full-replace contract as every
  // other field — every frontend mutation call site must pass it through.
  const cleared = await asAdmin(request(app).put(`/api/tasks/${created.body.id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '0.backlog',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(cleared.body.why, null);
});

test('PUT persists stt when given (Timeline drag-to-reorder relies on this) — full-replace, so every caller must pass the task\'s current stt or it clears', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', stt: 5,
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  const id = created.body.id;
  assert.equal(created.body.stt, 5);

  const movedTo9 = await asAdmin(request(app).put(`/api/tasks/${id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '0.backlog', stt: 9,
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(movedTo9.body.stt, 9);

  // documents the full-replace contract: a PUT that omits stt clears it,
  // same as every other field here — this is exactly why every frontend
  // mutation call site must pass the task's current stt through explicitly
  const statusOnlyChange = await asAdmin(request(app).put(`/api/tasks/${id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(statusOnlyChange.body.stt, null);
});

test('PUT on a non-existent task returns 404', async () => {
  const app = createApp(makeTestPool());
  const res = await asAdmin(request(app).put('/api/tasks/999'))
    .send({
      name: 'X', category: 'Product Foundation', platform: 'Web', status: '0.backlog',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(res.status, 404);
});

test('PUT /api/tasks/:id rejects a request missing required fields', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  const res = await asAdmin(request(app).put(`/api/tasks/${created.body.id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web',
      start_date: '2026-08-05', due_date: '2026-08-10'
    }); // no status
  assert.equal(res.status, 400);
});

test('PUT /api/tasks/:id rejects a request missing start_date/due_date', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  const res = await asAdmin(request(app).put(`/api/tasks/${created.body.id}`))
    .send({ name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '0.backlog' }); // no dates
  assert.equal(res.status, 400);
});

test('PUT /api/tasks/:id with a non-numeric id returns 400', async () => {
  const app = createApp(makeTestPool());
  const res = await asAdmin(request(app).put('/api/tasks/abc'))
    .send({
      name: 'X', category: 'Product Foundation', platform: 'Web', status: '0.backlog',
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(res.status, 400);
});

test('POST /api/tasks with a non-existent phase_id returns 400, not 500', async () => {
  const app = createApp(makeTestPool());
  const res = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'X', category: 'Product Foundation', platform: 'Web', phase_id: 9999,
      start_date: '2026-08-05', due_date: '2026-08-10'
    });
  assert.equal(res.status, 400);
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

test('PUT that changes start_date/due_date auto-records an activity log entry', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-07-06', due_date: '2026-07-17'
    });
  const id = created.body.id;

  await asAdmin(request(app).put(`/api/tasks/${id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-07-15', due_date: '2026-07-26', date_overridden: true
    });

  const logs = await request(app).get(`/api/tasks/${id}/logs`);
  assert.equal(logs.body.length, 1);
  assert.equal(logs.body[0].note, 'Dịch ngày (quan.dang1): 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)');
});

test('PUT with an X-Actor-Name header attributes the date-change log entry to that name', async () => {
  const pool = makeTestPool();
  // this test's whole point is the diacritic-encoding round-trip, so it
  // deliberately uses a name outside the seeded fixed-list — give it an
  // editor role locally so the new permission gate doesn't block the PUT.
  await pool.query("INSERT INTO users (email, name, role) VALUES ('quan-test@example.com', 'Quân', 'editor')");
  const app = createApp(pool);
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-07-06', due_date: '2026-07-17'
    });
  const id = created.body.id;

  // real callers send this percent-encoded (see public/app.js's authFetch) —
  // Node decodes raw headers as latin1, which mangles UTF-8 diacritics if
  // sent as-is, so the test must encode the same way a real client would.
  await request(app)
    .put(`/api/tasks/${id}`)
    .set('X-Actor-Name', encodeURIComponent('Quân'))
    .set('X-Actor-Email', encodeURIComponent('quan-test@example.com'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-07-15', due_date: '2026-07-26', date_overridden: true
    });

  const logs = await request(app).get(`/api/tasks/${id}/logs`);
  assert.equal(logs.body[0].note, 'Dịch ngày (Quân): 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)');
});

test('PUT that leaves dates unchanged does not record an activity log entry', async () => {
  const app = createApp(makeTestPool());
  const created = await asAdmin(request(app).post('/api/tasks'))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '1.ready_for_dev',
      start_date: '2026-07-06', due_date: '2026-07-17'
    });
  const id = created.body.id;

  await asAdmin(request(app).put(`/api/tasks/${id}`))
    .send({
      name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '2.in_test',
      start_date: '2026-07-06', due_date: '2026-07-17'
    });

  const logs = await request(app).get(`/api/tasks/${id}/logs`);
  assert.equal(logs.body.length, 0);
});
