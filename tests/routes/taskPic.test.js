const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');

// A task now has an optional PIC (owner, by name from the pics lookup) — shown
// in the due-date report email so the group can see who is responsible.

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

const ADMIN = { name: 'quan.dang1', email: 'dmquan8198@gmail.com' };
const EDITOR = { name: 'Anh Nguyễn', email: 'anh.nguyen80@gmail.com' };
const as = (req, actor) => req
  .set('X-Actor-Name', encodeURIComponent(actor.name))
  .set('X-Actor-Email', encodeURIComponent(actor.email));

const BASE_TASK = {
  name: 'Task A', category: 'Product Foundation', platform: 'App', status: '2.ready_for_dev',
  start_date: '2026-07-06', due_date: '2026-07-17', stt: 3
};
async function createTask(app, overrides) {
  const res = await as(request(app).post('/api/tasks'), ADMIN).send({ ...BASE_TASK, ...overrides });
  assert.equal(res.status, 201);
  return res.body;
}
const getTask = async (app, id) => (await request(app).get('/api/tasks')).body.find((t) => t.id === id);
const putTask = (app, id, body, actor) => as(request(app).put(`/api/tasks/${id}`), actor || EDITOR).send({ ...BASE_TASK, ...body });
const pause = (ms = 15) => new Promise((r) => setTimeout(r, ms));

// ---- tasks.pic ----

test('a task can be created with a PIC and shows it in the list', async () => {
  const app = createApp(makeTestPool());
  const created = await createTask(app, { pic: ' An ' });
  assert.equal(created.pic, 'An');
  assert.equal((await getTask(app, created.id)).pic, 'An');
  assert.equal((await createTask(app, { name: 'No pic' })).pic, null);
});

test('PUT: omitting `pic` keeps the stored one (older cached clients, Timeline drags); sending it changes it; "" clears it', async () => {
  const app = createApp(makeTestPool());
  const { id } = await createTask(app, { pic: 'An' });

  await putTask(app, id, { stt: 9 }); // no pic key
  assert.equal((await getTask(app, id)).pic, 'An');

  await putTask(app, id, { pic: 'Bình' });
  assert.equal((await getTask(app, id)).pic, 'Bình');

  await putTask(app, id, { pic: '' });
  assert.equal((await getTask(app, id)).pic, null);
});

test('changing a task\'s PIC counts as an edit (last-edited stamp); re-sending the same PIC does not', async () => {
  const app = createApp(makeTestPool());
  const { id } = await createTask(app, { pic: 'An' });
  const first = (await getTask(app, id)).last_edited_at;
  await pause();

  await putTask(app, id, { pic: 'An' });
  assert.equal((await getTask(app, id)).last_edited_at, first, 'identical re-save is not an edit');

  await putTask(app, id, { pic: 'Bình' });
  const after = await getTask(app, id);
  assert.ok(new Date(after.last_edited_at) > new Date(first));
  assert.equal(after.last_edited_by, EDITOR.name);
});

test('renaming a PIC also renames it on tasks; deleting a PIC still on a task is blocked', async () => {
  const app = createApp(makeTestPool());
  const { body: pic } = await as(request(app).post('/api/pics'), EDITOR).send({ name: 'An' });
  const { id } = await createTask(app, { pic: 'An' });

  const listed = (await request(app).get('/api/pics')).body[0];
  assert.equal(listed.task_count, 1);

  const blocked = await as(request(app).delete(`/api/pics/${pic.id}`), ADMIN);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /nghiệp vụ/);

  const renamed = await as(request(app).put(`/api/pics/${pic.id}`), EDITOR).send({ name: 'An Nguyễn' });
  assert.equal(renamed.body.task_count, 1);
  assert.equal((await getTask(app, id)).pic, 'An Nguyễn');

  await putTask(app, id, { pic: null });
  assert.equal((await as(request(app).delete(`/api/pics/${pic.id}`), ADMIN)).status, 204);
});
