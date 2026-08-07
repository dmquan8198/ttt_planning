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

test('GET /api/phases returns rollup per phase', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO phases (code, name, target_date) VALUES ('P1','Lived','2026-08-10'), ('P2','Rollout','2026-09-01')"
  );
  const { rows: [p1] } = await pool.query("SELECT id FROM phases WHERE code='P1'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, done_analyst, done_dev, done_uat, start_date, due_date)
     VALUES ('Product Foundation','Task A','Web',$1,true,true,true,'2026-08-05','2026-08-10'),
            ('Product Foundation','Task B','Web',$1,true,false,false,'2026-08-05','2026-08-10')`,
    [p1.id]
  );
  await pool.query(
    "INSERT INTO tasks (category, name, platform, start_date, due_date) VALUES ('Product Foundation','Unassigned Task','Web','2026-08-05','2026-08-10')"
  );

  const app = createApp(pool);
  const res = await request(app).get('/api/phases');

  assert.equal(res.status, 200);
  const p1Result = res.body.find((p) => p.code === 'P1');
  assert.equal(p1Result.target_date, '2026-08-10');
  assert.equal(p1Result.total, 2);
  assert.equal(p1Result.done_analyst, 2);
  assert.equal(p1Result.done_dev, 1);
  const p2Result = res.body.find((p) => p.code === 'P2');
  assert.equal(p2Result.total, 0);
  assert.equal(p2Result.pct_complete, null);
});
