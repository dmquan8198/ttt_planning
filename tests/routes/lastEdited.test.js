const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');

// tasks.last_edited_at / last_edited_by: who changed a task's CONTENT and
// when — what Danh sách nghiệp vụ shows as "Sửa lần cuối" and highlights as
// "vừa cập nhật" for everyone, not just the person who saved.

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

// seeded by the migration: an admin and an editor
const ADMIN = { name: 'quan.dang1', email: 'dmquan8198@gmail.com' };
const EDITOR = { name: 'Anh Nguyễn', email: 'anh.nguyen80@gmail.com' };
function as(req, actor) {
  return req
    .set('X-Actor-Name', encodeURIComponent(actor.name))
    .set('X-Actor-Email', encodeURIComponent(actor.email));
}

const BASE_TASK = {
  name: 'Task A', category: 'Product Foundation', platform: 'Web', status: '2.ready_for_dev',
  start_date: '2026-07-06', due_date: '2026-07-17', stt: 3
};
async function createTask(app, overrides) {
  const res = await as(request(app).post('/api/tasks'), ADMIN).send({ ...BASE_TASK, ...overrides });
  return res.body.id;
}
async function getTask(app, id) {
  const res = await request(app).get('/api/tasks');
  return res.body.find((t) => t.id === id);
}
const putTask = (app, id, body, actor) => as(request(app).put(`/api/tasks/${id}`), actor || EDITOR).send({ ...BASE_TASK, ...body });
const pause = (ms = 15) => new Promise((r) => setTimeout(r, ms));

test('POST /api/tasks stamps who created it and when', async () => {
  const app = createApp(makeTestPool());
  const id = await createTask(app);
  const t = await getTask(app, id);
  assert.ok(t.last_edited_at);
  assert.equal(t.last_edited_by, ADMIN.name);
});

test('PUT that changes real content stamps last_edited_by with that actor', async () => {
  const app = createApp(makeTestPool());
  const id = await createTask(app);
  const before = await getTask(app, id);
  await pause();

  const res = await putTask(app, id, { status: '3.in_test' });
  assert.equal(res.status, 200);
  const after = await getTask(app, id);
  assert.equal(after.last_edited_by, EDITOR.name);
  assert.ok(new Date(after.last_edited_at) > new Date(before.last_edited_at));
});

test('PUT that only changes stt (Timeline reorder) or nothing at all leaves the last-edited stamp alone', async () => {
  const app = createApp(makeTestPool());
  const id = await createTask(app);
  const before = await getTask(app, id);
  await pause();

  await putTask(app, id, { stt: 9 });  // reorder only
  await putTask(app, id, { stt: 9 });  // identical re-save of what's now stored
  const after = await getTask(app, id);
  assert.equal(after.stt, 9, 'the reorder itself still applied');
  assert.equal(after.last_edited_by, ADMIN.name);
  assert.equal(after.last_edited_at, before.last_edited_at);
});

test('every content field counts: why, dates, name, done flags, override flag, resource roles', async () => {
  const app = createApp(makeTestPool());
  const id = await createTask(app);
  let last = (await getTask(app, id)).last_edited_at;
  for (const change of [
    { why: 'Vì sao' }, { due_date: '2026-07-20' }, { start_date: '2026-07-07' }, { name: 'Renamed' },
    { done_dev: true }, { date_overridden: true }, { resource_roles: ['PO'] }
  ]) {
    await pause(10);
    // carry what's already stored forward so this PUT differs from the row only by `change`
    const current = await getTask(app, id);
    const res = await putTask(app, id, {
      name: current.name, why: current.why, start_date: current.start_date, due_date: current.due_date,
      done_dev: current.done_dev, date_overridden: current.date_overridden, resource_roles: current.resource_roles,
      ...change
    });
    assert.equal(res.status, 200);
    const next = (await getTask(app, id)).last_edited_at;
    assert.ok(new Date(next) > new Date(last), `${JSON.stringify(change)} should have bumped the stamp`);
    last = next;
  }
});

test('PUT /api/tasks/:id/resources stamps the task only when the roles actually change', async () => {
  const app = createApp(makeTestPool());
  const id = await createTask(app);
  const first = (await getTask(app, id)).last_edited_at;
  await pause();

  await as(request(app).put(`/api/tasks/${id}/resources`), EDITOR).send({ roles: ['PO', 'Core'] });
  const afterChange = await getTask(app, id);
  assert.equal(afterChange.last_edited_by, EDITOR.name);
  assert.ok(new Date(afterChange.last_edited_at) > new Date(first));

  await pause();
  await as(request(app).put(`/api/tasks/${id}/resources`), ADMIN).send({ roles: ['Core', 'PO'] }); // same set
  const afterSame = await getTask(app, id);
  assert.equal(afterSame.last_edited_by, EDITOR.name);
  assert.equal(afterSame.last_edited_at, afterChange.last_edited_at);
});

test('GET /api/tasks/recent-edits returns the DB clock, and only edits after `since`', async () => {
  const app = createApp(makeTestPool());
  const baseline = await request(app).get('/api/tasks/recent-edits');
  assert.equal(baseline.status, 200);
  assert.deepEqual(baseline.body.edits, []);
  assert.ok(!Number.isNaN(new Date(baseline.body.now).getTime()));

  const id = await createTask(app, { name: 'Edited task' });
  const since = new Date(new Date(baseline.body.now).getTime() - 1000).toISOString();
  const res = await request(app).get('/api/tasks/recent-edits').query({ since });
  assert.equal(res.status, 200);
  assert.equal(res.body.edits.length, 1);
  assert.equal(res.body.edits[0].id, id);
  assert.equal(res.body.edits[0].name, 'Edited task');
  assert.equal(res.body.edits[0].last_edited_by, ADMIN.name);

  const later = await request(app).get('/api/tasks/recent-edits').query({ since: res.body.now });
  assert.deepEqual(later.body.edits, []);
});

test('GET /api/tasks/recent-edits rejects an unparseable since', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/tasks/recent-edits').query({ since: 'not-a-date' });
  assert.equal(res.status, 400);
});

// ---- a subtask change counts as an edit to its parent task ----

async function seedRawTask(pool) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'Raw task', 'Web', '0.backlog', '2026-08-05', '2026-08-10') RETURNING id`
  );
  return rows[0].id;
}
async function stamp(app, taskId) {
  const t = await getTask(app, taskId);
  return { at: t.last_edited_at, by: t.last_edited_by };
}

test('adding, editing and deleting a subtask stamp the parent task; reordering does not', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const taskId = await seedRawTask(pool);
  assert.equal((await stamp(app, taskId)).at, null, 'a raw-inserted task starts un-stamped');

  const a = await as(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'A' });
  const afterCreate = await stamp(app, taskId);
  assert.ok(afterCreate.at);
  assert.equal(afterCreate.by, EDITOR.name);

  await pause();
  const b = await as(request(app).post(`/api/tasks/${taskId}/subtasks`), EDITOR).send({ name: 'B' });
  await pause();
  await as(request(app).put(`/api/tasks/${taskId}/subtasks/${a.body.id}`), ADMIN).send({ status: 'done' });
  const afterEdit = await stamp(app, taskId);
  assert.ok(new Date(afterEdit.at) > new Date(afterCreate.at));
  assert.equal(afterEdit.by, ADMIN.name);

  await pause();
  await as(request(app).put(`/api/tasks/${taskId}/subtasks/order`), EDITOR).send({ ids: [b.body.id, a.body.id] });
  assert.equal((await stamp(app, taskId)).at, afterEdit.at, 'reorder is not an edit');

  await pause();
  await as(request(app).delete(`/api/tasks/${taskId}/subtasks/${b.body.id}`), EDITOR);
  assert.ok(new Date((await stamp(app, taskId)).at) > new Date(afterEdit.at));
});

test('cloning subtasks stamps the TARGET task, not the source', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const sourceId = await seedRawTask(pool);
  const targetId = await seedRawTask(pool);
  await as(request(app).post(`/api/tasks/${sourceId}/subtasks`), EDITOR).send({ name: 'X' });
  const sourceStamp = await stamp(app, sourceId);
  await pause();

  await as(request(app).post(`/api/tasks/${sourceId}/subtasks/clone`), ADMIN).send({ target_task_id: targetId });
  assert.equal((await stamp(app, targetId)).by, ADMIN.name);
  assert.equal((await stamp(app, sourceId)).at, sourceStamp.at);
});
