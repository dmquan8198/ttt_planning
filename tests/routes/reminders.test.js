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

const SECRET = 'test-reminder-secret';
const WED = '2026-10-07';

async function seed(pool) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date, date_overridden, pic)
     VALUES ('Product Foundation', 'Due tomorrow', 'App', '3.in_test', '2026-10-01', '2026-10-08', true, 'An'),
            ('Product Foundation', 'Due in 4', 'App', '3.in_test', '2026-10-01', '2026-10-13', true, 'An'),
            ('Product Foundation', 'Already done', 'App', '6.done', '2026-10-01', '2026-10-08', true, 'An')
     RETURNING id`
  );
  await pool.query(
    "INSERT INTO subtasks (task_id, name, status, due_date, pic) VALUES ($1, 'Sub due Monday', 'wip', '2026-10-12', 'Bình')",
    [rows[1].id]
  );
}

async function withSecret(fn) {
  const prev = process.env.REMINDER_SECRET;
  process.env.REMINDER_SECRET = SECRET;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.REMINDER_SECRET; else process.env.REMINDER_SECRET = prev;
  }
}

test('GET /api/reminders/due is denied when the server has no REMINDER_SECRET configured', async () => {
  const prev = process.env.REMINDER_SECRET;
  delete process.env.REMINDER_SECRET;
  try {
    const app = createApp(makeTestPool());
    const res = await request(app).get('/api/reminders/due').set('X-Reminder-Secret', 'anything');
    assert.equal(res.status, 500);
  } finally {
    if (prev !== undefined) process.env.REMINDER_SECRET = prev;
  }
});

test('GET /api/reminders/due rejects a missing or wrong secret (and the snapshot secret does not work)', async () => {
  await withSecret(async () => {
    const app = createApp(makeTestPool());
    assert.equal((await request(app).get('/api/reminders/due')).status, 401);
    assert.equal((await request(app).get('/api/reminders/due').set('X-Reminder-Secret', 'nope')).status, 401);
    assert.equal((await request(app).get('/api/reminders/due').set('X-Cron-Secret', SECRET)).status, 401);
  });
});

test('GET /api/reminders/due returns what is due in 1 and 3 working days, each with its PIC', async () => {
  await withSecret(async () => {
    const pool = makeTestPool();
    await seed(pool);
    const app = createApp(pool);
    const res = await request(app).get('/api/reminders/due').query({ today: WED }).set('X-Reminder-Secret', SECRET);
    assert.equal(res.status, 200);
    assert.equal(res.body.today, WED);
    assert.deepEqual(res.body.windows, [1, 3]);
    assert.deepEqual(res.body.items.map((i) => `${i.kind}:${i.name}:${i.working_days_left}`), [
      'task:Due tomorrow:1',
      'subtask:Sub due Monday:3'
    ]);
    assert.equal(res.body.items[0].pic, 'An');
    assert.equal(res.body.items[1].pic, 'Bình');
    assert.equal(res.body.items[1].task_name, 'Due in 4');
    assert.equal('by_pic' in res.body, false);
  });
});

test('GET /api/reminders/due honours ?days= and validates its inputs', async () => {
  await withSecret(async () => {
    const pool = makeTestPool();
    await seed(pool);
    const app = createApp(pool);
    const get = (q) => request(app).get('/api/reminders/due').query(q).set('X-Reminder-Secret', SECRET);

    const only3 = await get({ today: WED, days: '3' });
    assert.deepEqual(only3.body.items.map((i) => i.name), ['Sub due Monday']);

    assert.equal((await get({ today: WED, days: 'abc' })).status, 400);
    assert.equal((await get({ today: WED, days: '0' })).status, 400);
    assert.equal((await get({ today: WED, days: '11' })).status, 400);
    assert.equal((await get({ today: 'not-a-date' })).status, 400);
  });
});

test('GET /api/reminders/due adds what is due today and what is overdue only when asked (?due_today=1 / ?overdue=1)', async () => {
  await withSecret(async () => {
    const pool = makeTestPool();
    await seed(pool);
    await pool.query(
      `INSERT INTO tasks (category, name, platform, status, start_date, due_date, date_overridden, pic)
       VALUES ('Product Foundation', 'Due today', 'App', '3.in_test', '2026-10-01', '2026-10-07', true, 'An'),
              ('Product Foundation', 'Late', 'App', '3.in_test', '2026-09-01', '2026-10-02', true, NULL),
              ('Product Foundation', 'Late but done', 'App', '6.done', '2026-09-01', '2026-10-02', true, 'An')`
    );
    const app = createApp(pool);
    const get = (q) => request(app).get('/api/reminders/due').query({ today: WED, ...q }).set('X-Reminder-Secret', SECRET);
    const summary = (res) => res.body.items.map((i) => `${i.name}:${i.working_days_left}`);

    assert.deepEqual(summary(await get({})), ['Due tomorrow:1', 'Sub due Monday:3'], 'unchanged without the flags');

    const both = await get({ due_today: '1', overdue: '1' });
    assert.equal(both.status, 200);
    assert.deepEqual(summary(both), ['Late:-3', 'Due today:0', 'Due tomorrow:1', 'Sub due Monday:3']);
    assert.equal(both.body.include_today, true);
    assert.equal(both.body.include_overdue, true);
    assert.equal(both.body.items[0].pic, null, 'an overdue item with nobody assigned still shows up (the report flags it)');

    assert.deepEqual(summary(await get({ overdue: 'true' })), ['Late:-3', 'Due tomorrow:1', 'Sub due Monday:3']);
    assert.deepEqual(summary(await get({ due_today: 'on', overdue: '0' })), ['Due today:0', 'Due tomorrow:1', 'Sub due Monday:3']);

    assert.equal((await get({ overdue: 'maybe' })).status, 400);
    assert.equal((await get({ due_today: '2' })).status, 400);
  });
});

test('GET /api/reminders/due ?overdue_by= chooses what overdue is measured against (default done_uat)', async () => {
  await withSecret(async () => {
    const pool = makeTestPool();
    await pool.query(
      `INSERT INTO tasks (category, name, platform, status, start_date, due_date, date_overridden, pic)
       VALUES ('Product Foundation', 'Late in dev', 'App', '3.in_test', '2026-09-01', '2026-10-02', true, 'An'),
              ('Product Foundation', 'Late done UAT', 'App', '5.ready_for_staging', '2026-09-01', '2026-10-02', true, 'An')`
    );
    const app = createApp(pool);
    const get = (q) => request(app).get('/api/reminders/due').query({ today: WED, overdue: '1', ...q }).set('X-Reminder-Secret', SECRET);
    const names = (res) => res.body.items.map((i) => i.name);

    const byDefault = await get({});
    assert.deepEqual(names(byDefault), ['Late in dev']);
    assert.equal(byDefault.body.overdue_basis, 'done_uat');
    assert.deepEqual(names(await get({ overdue_by: 'done_uat' })), ['Late in dev']);

    const byDone = await get({ overdue_by: 'done' });
    assert.deepEqual(names(byDone).sort(), ['Late done UAT', 'Late in dev'], 'with basis "done" the Done UAT task is still overdue');
    assert.equal(byDone.body.overdue_basis, 'done');

    assert.equal((await get({ overdue_by: 'golive' })).status, 400);
  });
});

test('GET /api/reminders/due is empty on a weekend', async () => {
  await withSecret(async () => {
    const pool = makeTestPool();
    await seed(pool);
    const app = createApp(pool);
    const res = await request(app).get('/api/reminders/due').query({ today: '2026-10-10' }).set('X-Reminder-Secret', SECRET);
    assert.equal(res.status, 200);
    assert.equal(res.body.weekend, true);
    assert.deepEqual(res.body.items, []);
  });
});
