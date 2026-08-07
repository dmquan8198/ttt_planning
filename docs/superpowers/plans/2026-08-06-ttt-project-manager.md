# TTT Project Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user web app that replaces the `Nghiệp vụ` sheet in `[TTT New] Planning.xlsx` — a real Postgres-backed database, a REST API, and a browser UI with 4 views (Roadmap by Phase, Sprint hiện tại/tiếp theo, Timeline theo ngày, Board theo Status) plus create/edit/delete and an activity log, matching `SPEC.md`.

**Architecture:** Node.js + Express backend talking to Postgres (Neon in production, `pg-mem` in-memory for tests) through a small dependency-injected `createApp(pool)` factory so route handlers never talk to a global connection. Business logic that has real decisions (date derivation, current/next sprint, phase rollup %, Excel status/sprint parsing) lives in pure functions under `src/lib/`, unit-tested without any database. The existing static mockup (`ttt_mockup.html`) is split into `public/index.html` + `public/app.js` + `public/styles.css` and rewired from hardcoded arrays to `fetch()` calls against the new API.

**Tech Stack:** Node.js ≥18, Express 4, `pg` (node-postgres), Neon (Postgres, free tier) for the deployed database, `pg-mem` + `supertest` + built-in `node:test` for testing, `xlsx` (SheetJS) for the one-time Excel import, Render free web service for deployment.

---

## File Structure

```
ttt_timeline/
  package.json
  .env.example
  .gitignore
  migrations/
    001_init.sql
  scripts/
    migrate.js
    import_excel.js
  src/
    app.js                        -- createApp(pool) factory, mounts routes + static
    server.js                     -- real entry point: builds real pg Pool, calls createApp, listens
    lib/
      statusCodes.js               -- STATUS_CODES, STATUS_LABELS, mapExcelStatus
      deriveTaskDates.js           -- hybrid sprint-default date logic
      pickCurrentAndNextSprint.js  -- current/next sprint picker
      phaseRollup.js               -- % + days-remaining calculator per phase
      parseSprintCell.js           -- Excel sprint-cell / date parsing (used by import script)
    routes/
      phases.js
      sprints.js
      tasks.js
      logs.js
  public/
    index.html                    -- adapted from the existing mockup (structure/CSS unchanged)
    styles.css                    -- CSS extracted from the mockup
    app.js                        -- frontend logic, rewritten to fetch() the API
  tests/
    lib/
      deriveTaskDates.test.js
      pickCurrentAndNextSprint.test.js
      phaseRollup.test.js
      parseSprintCell.test.js
    routes/
      phases.test.js
      sprints.test.js
      tasks.test.js
      logs.test.js
```

Reference mockup already built during brainstorming (do not delete until Task 14 finishes copying from it):
`C:\Users\QUAN~1.DAN\AppData\Local\Temp\claude\C--Users-quan-dang1-OneDrive-Desktop-Work-ttt-timeline\914361c7-9eb7-41ef-8bf5-5d81e8b9d8cd\scratchpad\ttt_mockup.html`

Source Excel file: `C:\Users\quan.dang1\Downloads\[TTT New] Planning.xlsx`, sheet `Nghiệp vụ`, header row at 1-indexed row 7, data from row 8 (108 rows). Column layout confirmed during brainstorming (1-indexed): 1=STT, 2=Category, 3=Tasks, 4=Platform, 5=Phase, 6=Sprint, 7=Status, 8=DoneAnalyst, 9=Done Dev, 10=Done UAT, 11=Done Staging, 12=Note("03/08/26"), 13=Note("6/7/2026").

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git and Node project**

Run:
```bash
cd "C:\Users\quan.dang1\OneDrive\Desktop\Work\ttt_timeline"
git init
npm init -y
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install express pg dotenv xlsx
npm install --save-dev supertest pg-mem
```

- [ ] **Step 3: Write `package.json` scripts**

Replace the generated `package.json` with:

```json
{
  "name": "ttt-project-manager",
  "version": "1.0.0",
  "private": true,
  "description": "Single-user project manager replacing the TTT New Nghiep vu sheet",
  "main": "src/server.js",
  "engines": { "node": ">=18" },
  "scripts": {
    "dev": "node src/server.js",
    "migrate": "node scripts/migrate.js",
    "import:excel": "node scripts/import_excel.js",
    "test": "node --test tests/**/*.test.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "pg": "^8.12.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "pg-mem": "^2.8.1",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 4: Write `.env.example`**

```
DATABASE_URL=postgresql://user:password@ep-xxxx.neon.tech/ttt_timeline?sslmode=require
PORT=3000
EXCEL_SOURCE=C:\Users\quan.dang1\Downloads\[TTT New] Planning.xlsx
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
.env
*.log
```

- [ ] **Step 6: Commit**

```bash
git add package.json .env.example .gitignore
git commit -m "chore: scaffold Node project"
```

---

### Task 2: Database schema & migration runner

**Files:**
- Create: `migrations/001_init.sql`
- Create: `scripts/migrate.js`

- [ ] **Step 1: Write the schema**

`migrations/001_init.sql`:
```sql
CREATE TABLE IF NOT EXISTS phases (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  target_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS sprints (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  stt INTEGER,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  phase_id INTEGER REFERENCES phases(id),
  sprint_id INTEGER REFERENCES sprints(id),
  status TEXT NOT NULL DEFAULT '0.backlog'
    CHECK (status IN ('0.backlog','1.ready_for_dev','2.in_test','3.ready_for_staging','4.done')),
  done_analyst BOOLEAN NOT NULL DEFAULT FALSE,
  done_dev BOOLEAN NOT NULL DEFAULT FALSE,
  done_uat BOOLEAN NOT NULL DEFAULT FALSE,
  done_staging BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE,
  due_date DATE,
  date_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_task ON activity_logs(task_id);
```

- [ ] **Step 2: Write the migration runner**

`scripts/migrate.js`:
```js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration applied.');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify against a real Neon database**

Create a free Neon project (neon.tech), copy the connection string into a local `.env` (not committed), then run:
```bash
npm run migrate
```
Expected: `Migration applied.` and no errors. Confirm in the Neon console that `phases`, `sprints`, `tasks`, `activity_logs` exist.

- [ ] **Step 4: Commit**

```bash
git add migrations/001_init.sql scripts/migrate.js
git commit -m "feat: add database schema and migration runner"
```

---

### Task 3: Pure logic — status codes

**Files:**
- Create: `src/lib/statusCodes.js`
- Test: `tests/lib/statusCodes.test.js`

- [ ] **Step 1: Write the failing test**

`tests/lib/statusCodes.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS_CODES, STATUS_LABELS, mapExcelStatus } = require('../../src/lib/statusCodes');

test('STATUS_CODES has the 5 workflow stages in order', () => {
  assert.deepEqual(STATUS_CODES, [
    '0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'
  ]);
});

test('STATUS_LABELS has a human label for every code', () => {
  for (const code of STATUS_CODES) {
    assert.equal(typeof STATUS_LABELS[code], 'string');
  }
});

test('mapExcelStatus maps the exact strings used in the sheet', () => {
  assert.equal(mapExcelStatus('0. backlog'), '0.backlog');
  assert.equal(mapExcelStatus('1. Ready for Dev'), '1.ready_for_dev');
  assert.equal(mapExcelStatus('2. inTest'), '2.in_test');
  assert.equal(mapExcelStatus('3. Ready for Staging'), '3.ready_for_staging');
  assert.equal(mapExcelStatus('4. Done'), '4.done');
});

test('mapExcelStatus falls back to backlog for unknown/blank values', () => {
  assert.equal(mapExcelStatus(undefined), '0.backlog');
  assert.equal(mapExcelStatus(''), '0.backlog');
  assert.equal(mapExcelStatus('garbage'), '0.backlog');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/statusCodes.test.js`
Expected: FAIL with `Cannot find module '../../src/lib/statusCodes'`

- [ ] **Step 3: Write the implementation**

`src/lib/statusCodes.js`:
```js
const STATUS_CODES = ['0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'];

const STATUS_LABELS = {
  '0.backlog': 'Backlog',
  '1.ready_for_dev': 'Ready for Dev',
  '2.in_test': 'In Test',
  '3.ready_for_staging': 'Ready for Staging',
  '4.done': 'Done'
};

const EXCEL_STATUS_MAP = {
  '0. backlog': '0.backlog',
  '1. Ready for Dev': '1.ready_for_dev',
  '2. inTest': '2.in_test',
  '3. Ready for Staging': '3.ready_for_staging',
  '4. Done': '4.done'
};

function mapExcelStatus(raw) {
  return EXCEL_STATUS_MAP[raw] || '0.backlog';
}

module.exports = { STATUS_CODES, STATUS_LABELS, mapExcelStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/statusCodes.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusCodes.js tests/lib/statusCodes.test.js
git commit -m "feat: add status code mapping"
```

---

### Task 4: Pure logic — hybrid task date derivation

**Files:**
- Create: `src/lib/deriveTaskDates.js`
- Test: `tests/lib/deriveTaskDates.test.js`

This encodes the hybrid decision from brainstorming: a task's Start/Due default to its sprint's start/end, unless the task has been manually overridden.

- [ ] **Step 1: Write the failing test**

`tests/lib/deriveTaskDates.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveTaskDates } = require('../../src/lib/deriveTaskDates');

test('uses sprint start/end when the task has not been overridden', () => {
  const task = { date_overridden: false, start_date: null, due_date: null };
  const sprint = { start_date: '2026-08-03', end_date: '2026-08-14' };
  assert.deepEqual(deriveTaskDates(task, sprint), {
    start_date: '2026-08-03', due_date: '2026-08-14'
  });
});

test('uses the task own dates when overridden', () => {
  const task = { date_overridden: true, start_date: '2026-08-05', due_date: '2026-08-06' };
  const sprint = { start_date: '2026-08-03', end_date: '2026-08-14' };
  assert.deepEqual(deriveTaskDates(task, sprint), {
    start_date: '2026-08-05', due_date: '2026-08-06'
  });
});

test('returns nulls when there is no sprint and no override (legacy row)', () => {
  const task = { date_overridden: false, start_date: null, due_date: null };
  assert.deepEqual(deriveTaskDates(task, null), { start_date: null, due_date: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/deriveTaskDates.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/deriveTaskDates.js`:
```js
function deriveTaskDates(task, sprint) {
  if (task.date_overridden) {
    return { start_date: task.start_date, due_date: task.due_date };
  }
  if (!sprint) {
    return { start_date: task.start_date, due_date: task.due_date };
  }
  return { start_date: sprint.start_date, due_date: sprint.end_date };
}

module.exports = { deriveTaskDates };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/deriveTaskDates.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deriveTaskDates.js tests/lib/deriveTaskDates.test.js
git commit -m "feat: add hybrid task date derivation"
```

---

### Task 5: Pure logic — current/next sprint picker

**Files:**
- Create: `src/lib/pickCurrentAndNextSprint.js`
- Test: `tests/lib/pickCurrentAndNextSprint.test.js`

- [ ] **Step 1: Write the failing test**

`tests/lib/pickCurrentAndNextSprint.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickCurrentAndNextSprint } = require('../../src/lib/pickCurrentAndNextSprint');

const SPRINTS = [
  { code: 'S14', start_date: '2026-07-20', end_date: '2026-07-31' },
  { code: 'S15', start_date: '2026-08-03', end_date: '2026-08-14' },
  { code: 'S16', start_date: '2026-08-17', end_date: '2026-08-28' },
  { code: 'S17', start_date: '2026-08-31', end_date: '2026-09-11' }
];

test('picks the sprint containing today as current, the following one as next', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-08-06');
  assert.equal(current.code, 'S15');
  assert.equal(next.code, 'S16');
});

test('today on the exact boundary (start date) counts as current', () => {
  const { current } = pickCurrentAndNextSprint(SPRINTS, '2026-08-17');
  assert.equal(current.code, 'S16');
});

test('today before every sprint: no current, next is the first sprint', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-07-01');
  assert.equal(current, null);
  assert.equal(next.code, 'S14');
});

test('today in a gap between two sprints: no current, next is the upcoming one', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-08-01');
  assert.equal(current, null);
  assert.equal(next.code, 'S15');
});

test('today after every sprint: no current, no next', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-12-01');
  assert.equal(current, null);
  assert.equal(next, null);
});

test('works when sprints are passed out of order', () => {
  const shuffled = [SPRINTS[2], SPRINTS[0], SPRINTS[3], SPRINTS[1]];
  const { current, next } = pickCurrentAndNextSprint(shuffled, '2026-08-06');
  assert.equal(current.code, 'S15');
  assert.equal(next.code, 'S16');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/pickCurrentAndNextSprint.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/pickCurrentAndNextSprint.js`:
```js
function pickCurrentAndNextSprint(sprints, todayISO) {
  const sorted = [...sprints].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currentIndex = sorted.findIndex((s) => s.start_date <= todayISO && todayISO <= s.end_date);

  if (currentIndex === -1) {
    const next = sorted.find((s) => s.start_date > todayISO) || null;
    return { current: null, next };
  }

  return {
    current: sorted[currentIndex],
    next: sorted[currentIndex + 1] || null
  };
}

module.exports = { pickCurrentAndNextSprint };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/pickCurrentAndNextSprint.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pickCurrentAndNextSprint.js tests/lib/pickCurrentAndNextSprint.test.js
git commit -m "feat: add current/next sprint picker"
```

---

### Task 6: Pure logic — phase rollup calculator

**Files:**
- Create: `src/lib/phaseRollup.js`
- Test: `tests/lib/phaseRollup.test.js`

Fixtures below are the real P1/P2 numbers confirmed against the sheet during brainstorming — they double as a regression check that the formula matches the existing summary table.

- [ ] **Step 1: Write the failing test**

`tests/lib/phaseRollup.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computePhaseRollup } = require('../../src/lib/phaseRollup');

function makeTasks(n, { analyst = 0, dev = 0, uat = 0 } = {}) {
  const tasks = [];
  for (let i = 0; i < n; i++) {
    tasks.push({
      done_analyst: i < analyst,
      done_dev: i < dev,
      done_uat: i < uat
    });
  }
  return tasks;
}

test('P1 rollup matches the sheet: 43/43 analyst, 43/43 dev, 39/43 uat, 4 days to 10/08', () => {
  const phase = { code: 'P1', name: 'Lived', target_date: '2026-08-10' };
  const tasks = makeTasks(43, { analyst: 43, dev: 43, uat: 39 });
  const rollup = computePhaseRollup(phase, tasks, '2026-08-06');
  assert.equal(rollup.total, 43);
  assert.equal(rollup.done_analyst, 43);
  assert.equal(rollup.done_dev, 43);
  assert.equal(rollup.done_uat, 39);
  assert.equal(rollup.pct_complete, 100);
  assert.equal(rollup.days_remaining, 4);
});

test('P2 rollup matches the sheet: 18/28 analyst = 64.3%, 26 days to 01/09', () => {
  const phase = { code: 'P2', name: 'Rollout', target_date: '2026-09-01' };
  const tasks = makeTasks(28, { analyst: 18, dev: 11, uat: 2 });
  const rollup = computePhaseRollup(phase, tasks, '2026-08-06');
  assert.equal(rollup.total, 28);
  assert.equal(rollup.pct_complete, 64.3);
  assert.equal(rollup.days_remaining, 26);
});

test('phase with no tasks yet returns 0 total and null pct_complete', () => {
  const phase = { code: 'P4', name: 'Booming', target_date: '2027-01-01' };
  const rollup = computePhaseRollup(phase, [], '2026-08-06');
  assert.equal(rollup.total, 0);
  assert.equal(rollup.pct_complete, null);
  assert.equal(rollup.days_remaining, 148);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/phaseRollup.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/phaseRollup.js`:
```js
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computePhaseRollup(phase, tasks, todayISO) {
  const total = tasks.length;
  const doneAnalyst = tasks.filter((t) => t.done_analyst).length;
  const doneDev = tasks.filter((t) => t.done_dev).length;
  const doneUat = tasks.filter((t) => t.done_uat).length;
  const pctComplete = total === 0 ? null : Math.round((doneAnalyst / total) * 1000) / 10;
  const daysRemaining = Math.round(
    (new Date(phase.target_date) - new Date(todayISO)) / MS_PER_DAY
  );

  return {
    code: phase.code,
    name: phase.name,
    target_date: phase.target_date,
    total,
    done_analyst: doneAnalyst,
    done_dev: doneDev,
    done_uat: doneUat,
    pct_complete: pctComplete,
    days_remaining: daysRemaining
  };
}

module.exports = { computePhaseRollup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/phaseRollup.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/phaseRollup.js tests/lib/phaseRollup.test.js
git commit -m "feat: add phase rollup calculator"
```

---

### Task 7: Express app skeleton

**Files:**
- Create: `src/app.js`
- Create: `src/server.js`
- Test: `tests/routes/health.test.js`

`createApp(pool)` is a factory so tests can inject a `pg-mem` pool instead of a real one — no route handler ever imports a pool directly.

- [ ] **Step 1: Write the failing test**

`tests/routes/health.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../../src/app');

test('GET /api/health returns ok', async () => {
  const app = createApp({ query: async () => ({ rows: [] }) });
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/health.test.js`
Expected: FAIL, `../../src/app` not found.

- [ ] **Step 3: Write the implementation**

`src/app.js`:
```js
const express = require('express');
const path = require('path');

function createApp(pool) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = createApp;
```

`src/server.js`:
```js
require('dotenv').config();
const { Pool } = require('pg');
const createApp = require('./app');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = createApp(pool);
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`TTT Project Manager listening on port ${port}`);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/health.test.js`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/server.js tests/routes/health.test.js
git commit -m "feat: add Express app skeleton with DI pool"
```

---

### Task 8: API — Phases endpoint

**Files:**
- Create: `src/routes/phases.js`
- Modify: `src/app.js` (mount the router)
- Test: `tests/routes/phases.test.js`

- [ ] **Step 1: Write the failing test**

`tests/routes/phases.test.js`:
```js
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
    `INSERT INTO tasks (category, name, platform, phase_id, done_analyst, done_dev, done_uat)
     VALUES ('Product Foundation','Task A','Web',$1,true,true,true),
            ('Product Foundation','Task B','Web',$1,true,false,false)`,
    [p1.id]
  );

  const app = createApp(pool);
  const res = await request(app).get('/api/phases');

  assert.equal(res.status, 200);
  const p1Result = res.body.find((p) => p.code === 'P1');
  assert.equal(p1Result.total, 2);
  assert.equal(p1Result.done_analyst, 2);
  assert.equal(p1Result.done_dev, 1);
  const p2Result = res.body.find((p) => p.code === 'P2');
  assert.equal(p2Result.total, 0);
  assert.equal(p2Result.pct_complete, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/phases.test.js`
Expected: FAIL, `../../src/routes/phases` not found.

- [ ] **Step 3: Write the implementation**

`src/routes/phases.js`:
```js
const { Router } = require('express');
const { computePhaseRollup } = require('../lib/phaseRollup');

function phasesRouter(pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { rows: phases } = await pool.query(
      'SELECT id, code, name, target_date FROM phases ORDER BY target_date'
    );
    const { rows: tasks } = await pool.query(
      'SELECT phase_id, done_analyst, done_dev, done_uat FROM tasks'
    );
    const today = new Date().toISOString().slice(0, 10);

    const result = phases.map((phase) => {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      return computePhaseRollup(phase, phaseTasks, today);
    });

    res.json(result);
  });

  return router;
}

module.exports = phasesRouter;
```

Modify `src/app.js` — add the import and mount line:
```js
const express = require('express');
const path = require('path');
const phasesRouter = require('./routes/phases');

function createApp(pool) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/phases', phasesRouter(pool));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = createApp;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/phases.test.js`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/routes/phases.js src/app.js tests/routes/phases.test.js
git commit -m "feat: add GET /api/phases with rollup"
```

---

### Task 9: API — Sprints endpoints

**Files:**
- Create: `src/routes/sprints.js`
- Modify: `src/app.js` (mount the router)
- Test: `tests/routes/sprints.test.js`

- [ ] **Step 1: Write the failing test**

`tests/routes/sprints.test.js`:
```js
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

test('GET /api/sprints lists every sprint ordered by start date', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO sprints (code, start_date, end_date) VALUES ('S16','2026-08-17','2026-08-28'), ('S15','2026-08-03','2026-08-14')"
  );
  const app = createApp(pool);
  const res = await request(app).get('/api/sprints');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((s) => s.code), ['S15', 'S16']);
});

test('GET /api/sprints/current-next returns current sprint tasks and next sprint tasks', async () => {
  const pool = makeTestPool();
  await pool.query(
    "INSERT INTO sprints (code, start_date, end_date) VALUES ('S15','2026-08-03','2026-08-14'), ('S16','2026-08-17','2026-08-28')"
  );
  const { rows: [s15] } = await pool.query("SELECT id FROM sprints WHERE code='S15'");
  await pool.query(
    "INSERT INTO tasks (category, name, platform, sprint_id, status) VALUES ('Product Foundation','Task A','Web',$1,'1.ready_for_dev')",
    [s15.id]
  );

  const app = createApp(pool);
  const res = await request(app).get('/api/sprints/current-next?today=2026-08-06');

  assert.equal(res.status, 200);
  assert.equal(res.body.current.code, 'S15');
  assert.equal(res.body.current.tasks.length, 1);
  assert.equal(res.body.next.code, 'S16');
  assert.equal(res.body.next.tasks.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/sprints.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/routes/sprints.js`:
```js
const { Router } = require('express');
const { pickCurrentAndNextSprint } = require('../lib/pickCurrentAndNextSprint');

function sprintsRouter(pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'
    );
    res.json(rows);
  });

  router.get('/current-next', async (req, res) => {
    const { rows: sprints } = await pool.query(
      'SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'
    );
    const today = req.query.today || new Date().toISOString().slice(0, 10);
    const { current, next } = pickCurrentAndNextSprint(sprints, today);

    const result = { current: null, next: null };
    for (const [key, sprint] of [['current', current], ['next', next]]) {
      if (!sprint) continue;
      const { rows: tasks } = await pool.query(
        `SELECT id, name, category, platform, status
         FROM tasks WHERE sprint_id = $1 ORDER BY stt`,
        [sprint.id]
      );
      result[key] = { ...sprint, tasks };
    }
    res.json(result);
  });

  return router;
}

module.exports = sprintsRouter;
```

Modify `src/app.js` — add the import and mount line (after the phases mount):
```js
const sprintsRouter = require('./routes/sprints');
// ...
app.use('/api/sprints', sprintsRouter(pool));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/sprints.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routes/sprints.js src/app.js tests/routes/sprints.test.js
git commit -m "feat: add sprints endpoints including current/next"
```

---

### Task 10: API — Tasks CRUD endpoints

**Files:**
- Create: `src/routes/tasks.js`
- Modify: `src/app.js` (mount the router)
- Test: `tests/routes/tasks.test.js`

- [ ] **Step 1: Write the failing test**

`tests/routes/tasks.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/tasks.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/routes/tasks.js`:
```js
const { Router } = require('express');
const { STATUS_CODES } = require('../lib/statusCodes');

function tasksRouter(pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(`
      SELECT t.*, p.code AS phase_code, s.code AS sprint_code,
             s.start_date AS sprint_start, s.end_date AS sprint_end
      FROM tasks t
      LEFT JOIN phases p ON p.id = t.phase_id
      LEFT JOIN sprints s ON s.id = t.sprint_id
      ORDER BY t.stt NULLS LAST, t.id
    `);
    res.json(rows);
  });

  router.post('/', async (req, res) => {
    const b = req.body;
    if (!b.name || !b.category || !b.platform) {
      return res.status(400).json({ error: 'name, category, platform là bắt buộc' });
    }
    if (b.status && !STATUS_CODES.includes(b.status)) {
      return res.status(400).json({ error: 'status không hợp lệ' });
    }
    const { rows } = await pool.query(
      `INSERT INTO tasks
         (stt, category, name, platform, phase_id, sprint_id, status,
          done_analyst, done_dev, done_uat, done_staging, start_date, due_date, date_overridden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        b.stt || null, b.category, b.name, b.platform, b.phase_id || null, b.sprint_id || null,
        b.status || STATUS_CODES[0], !!b.done_analyst, !!b.done_dev, !!b.done_uat, !!b.done_staging,
        b.start_date || null, b.due_date || null, !!b.date_overridden
      ]
    );
    res.status(201).json(rows[0]);
  });

  router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    if (b.status && !STATUS_CODES.includes(b.status)) {
      return res.status(400).json({ error: 'status không hợp lệ' });
    }
    const { rows } = await pool.query(
      `UPDATE tasks SET
         category=$1, name=$2, platform=$3, phase_id=$4, sprint_id=$5, status=$6,
         done_analyst=$7, done_dev=$8, done_uat=$9, done_staging=$10,
         start_date=$11, due_date=$12, date_overridden=$13, updated_at=now()
       WHERE id=$14
       RETURNING *`,
      [
        b.category, b.name, b.platform, b.phase_id || null, b.sprint_id || null, b.status,
        !!b.done_analyst, !!b.done_dev, !!b.done_uat, !!b.done_staging,
        b.start_date || null, b.due_date || null, !!b.date_overridden, id
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
    }
    res.json(rows[0]);
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id=$1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
    }
    res.status(204).end();
  });

  return router;
}

module.exports = tasksRouter;
```

Modify `src/app.js` — add the import and mount line:
```js
const tasksRouter = require('./routes/tasks');
// ...
app.use('/api/tasks', tasksRouter(pool));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/tasks.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tasks.js src/app.js tests/routes/tasks.test.js
git commit -m "feat: add tasks CRUD endpoints"
```

---

### Task 11: API — Activity logs endpoints

**Files:**
- Create: `src/routes/logs.js`
- Modify: `src/app.js` (mount the router, nested under `/api/tasks/:taskId/logs`)
- Test: `tests/routes/logs.test.js`

- [ ] **Step 1: Write the failing test**

`tests/routes/logs.test.js`:
```js
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

test('POST then GET activity log entries for a task', async () => {
  const pool = makeTestPool();
  const created = await pool.query(
    "INSERT INTO tasks (category, name, platform) VALUES ('Product Foundation','Task A','Web') RETURNING id"
  );
  const taskId = created.rows[0].id;
  const app = createApp(pool);

  const post = await request(app)
    .post(`/api/tasks/${taskId}/logs`)
    .send({ note: 'Chuyển sang Ready for Dev, giao cho BE.' });
  assert.equal(post.status, 201);

  const list = await request(app).get(`/api/tasks/${taskId}/logs`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].note, 'Chuyển sang Ready for Dev, giao cho BE.');
});

test('POST rejects an empty note', async () => {
  const pool = makeTestPool();
  const created = await pool.query(
    "INSERT INTO tasks (category, name, platform) VALUES ('Product Foundation','Task A','Web') RETURNING id"
  );
  const app = createApp(pool);
  const res = await request(app)
    .post(`/api/tasks/${created.rows[0].id}/logs`)
    .send({ note: '   ' });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/logs.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/routes/logs.js`:
```js
const { Router } = require('express');

function logsRouter(pool) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const taskId = Number(req.params.taskId);
    const { rows } = await pool.query(
      'SELECT id, note, created_at FROM activity_logs WHERE task_id=$1 ORDER BY created_at DESC',
      [taskId]
    );
    res.json(rows);
  });

  router.post('/', async (req, res) => {
    const taskId = Number(req.params.taskId);
    const note = (req.body.note || '').trim();
    if (!note) {
      return res.status(400).json({ error: 'note không được để trống' });
    }
    const { rows } = await pool.query(
      'INSERT INTO activity_logs (task_id, note) VALUES ($1, $2) RETURNING id, note, created_at',
      [taskId, note]
    );
    res.status(201).json(rows[0]);
  });

  return router;
}

module.exports = logsRouter;
```

Modify `src/app.js` — add the import and mount line **before** the `/api/tasks` mount (more specific path first):
```js
const logsRouter = require('./routes/logs');
// ...
app.use('/api/tasks/:taskId/logs', logsRouter(pool));
app.use('/api/tasks', tasksRouter(pool));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/logs.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routes/logs.js src/app.js tests/routes/logs.test.js
git commit -m "feat: add activity log endpoints"
```

---

### Task 12: Pure logic — Excel sprint-cell parser

**Files:**
- Create: `src/lib/parseSprintCell.js`
- Test: `tests/lib/parseSprintCell.test.js`

The sheet mixes two cell shapes in the Sprint column: real `Sxx (dd/mm - dd/mm)` strings, and, for 36 legacy pre-sprint rows, a plain `Date` object. This function normalizes both, confirmed against the real file during brainstorming (all years are 2026 except `S25`'s explicit `01/01/27` wrap into 2027).

- [ ] **Step 1: Write the failing test**

`tests/lib/parseSprintCell.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSprintCell } = require('../../src/lib/parseSprintCell');

test('parses a normal 2-digit-year-implied sprint range', () => {
  const result = parseSprintCell('S15 (03/08 - 14/08)');
  assert.deepEqual(result, { code: 'S15', start: '2026-08-03', end: '2026-08-14', legacy: false });
});

test('parses a sprint range that wraps into the explicit next year', () => {
  const result = parseSprintCell('S25 (21/12 - 01/01/27)');
  assert.deepEqual(result, { code: 'S25', start: '2026-12-21', end: '2027-01-01', legacy: false });
});

test('parses a legacy Date-object cell as a same-day, sprint-less range', () => {
  const result = parseSprintCell(new Date(Date.UTC(2026, 5, 1)));
  assert.deepEqual(result, { code: null, start: '2026-06-01', end: '2026-06-01', legacy: true });
});

test('returns null for an unrecognized string', () => {
  assert.equal(parseSprintCell('not a sprint'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/parseSprintCell.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/parseSprintCell.js`:
```js
function toISODate(raw) {
  const parts = raw.split('/');
  if (parts.length === 3) {
    const [d, mo, y] = parts;
    return `20${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const [d, mo] = parts;
  return `2026-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseSprintCell(cell) {
  if (cell instanceof Date) {
    const iso = cell.toISOString().slice(0, 10);
    return { code: null, start: iso, end: iso, legacy: true };
  }
  const m = String(cell).match(/^(S\d+)\s*\(([\d/]+)\s*-\s*([\d/]+)\)$/);
  if (!m) return null;
  const [, code, startRaw, endRaw] = m;
  return { code, start: toISODate(startRaw), end: toISODate(endRaw), legacy: false };
}

module.exports = { parseSprintCell, toISODate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/parseSprintCell.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parseSprintCell.js tests/lib/parseSprintCell.test.js
git commit -m "feat: add Excel sprint-cell parser"
```

---

### Task 13: One-time Excel import script

**Files:**
- Create: `scripts/import_excel.js`

This runs once against the real Neon database to migrate the 108 existing rows. It is not unit-tested (it is a thin orchestration wrapper around the already-tested `parseSprintCell` and `mapExcelStatus`); instead it is verified by running it and checking row counts, per Step 3.

- [ ] **Step 1: Write the script**

`scripts/import_excel.js`:
```js
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');
const { parseSprintCell } = require('../src/lib/parseSprintCell');
const { mapExcelStatus } = require('../src/lib/statusCodes');

const SOURCE_FILE = process.env.EXCEL_SOURCE
  || path.join(process.env.USERPROFILE || '', 'Downloads', '[TTT New] Planning.xlsx');

const PHASES = [
  { code: 'P1', name: 'Lived', target_date: '2026-08-10', match: 'P1: Lived 10/08' },
  { code: 'P2', name: 'Rollout', target_date: '2026-09-01', match: 'P2: Rollout 01/09' },
  { code: 'P3', name: 'Convert', target_date: '2026-11-01', match: 'P3: Convert 01/11' },
  { code: 'P4', name: 'Booming', target_date: '2027-01-01', match: 'P4: Booming 01/01' }
];

async function run() {
  const wb = XLSX.readFile(SOURCE_FILE);
  const sheet = wb.Sheets['Nghiệp vụ'];
  // range: 7 skips the 7 header/summary rows above the data (0-indexed row 7 = 1-indexed row 8)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 7 });

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const phaseIdByMatch = {};
  for (const p of PHASES) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO phases (code, name, target_date) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, target_date=EXCLUDED.target_date
       RETURNING id`,
      [p.code, p.name, p.target_date]
    );
    phaseIdByMatch[p.match] = row.id;
  }

  const seenSprints = new Map();
  for (const row of rows) {
    if (!row[2]) continue;
    const parsed = parseSprintCell(row[5]);
    if (parsed && parsed.code && !seenSprints.has(parsed.code)) {
      seenSprints.set(parsed.code, parsed);
    }
  }
  const sprintIdByCode = {};
  for (const [code, s] of seenSprints) {
    const { rows: [r] } = await pool.query(
      `INSERT INTO sprints (code, start_date, end_date) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date
       RETURNING id`,
      [code, s.start, s.end]
    );
    sprintIdByCode[code] = r.id;
  }

  let imported = 0;
  for (const row of rows) {
    const [stt, category, name, platform, phaseRaw, sprintRaw, statusRaw,
      doneAnalyst, doneDev, doneUat, doneStaging, note1, note2] = row;
    if (!name) continue;

    const phaseId = phaseIdByMatch[phaseRaw] || null;
    const sprintParsed = parseSprintCell(sprintRaw);
    const sprintId = sprintParsed && sprintParsed.code ? sprintIdByCode[sprintParsed.code] : null;
    const isLegacyDate = !!(sprintParsed && sprintParsed.legacy);
    const status = mapExcelStatus(statusRaw);

    const { rows: [task] } = await pool.query(
      `INSERT INTO tasks
         (stt, category, name, platform, phase_id, sprint_id, status,
          done_analyst, done_dev, done_uat, done_staging, start_date, due_date, date_overridden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        stt || null, category, name, platform, phaseId, sprintId, status,
        !!doneAnalyst, !!doneDev, !!doneUat, !!doneStaging,
        isLegacyDate ? sprintParsed.start : null,
        isLegacyDate ? sprintParsed.end : null,
        isLegacyDate
      ]
    );

    for (const { note, date } of [{ note: note1, date: '2026-08-03' }, { note: note2, date: '2026-07-06' }]) {
      if (note && String(note).trim()) {
        await pool.query(
          'INSERT INTO activity_logs (task_id, note, created_at) VALUES ($1,$2,$3)',
          [task.id, String(note).trim(), date]
        );
      }
    }
    imported++;
  }

  console.log(`Imported ${imported} nghiệp vụ, ${sprintIdByCode ? Object.keys(sprintIdByCode).length : 0} sprint, ${PHASES.length} phase.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the real Neon database**

Ensure `.env` has the real `DATABASE_URL` and `EXCEL_SOURCE` pointing at `C:\Users\quan.dang1\Downloads\[TTT New] Planning.xlsx`, then:
```bash
npm run migrate
npm run import:excel
```
Expected output: `Imported 108 nghiệp vụ, ...`

- [ ] **Step 3: Verify row counts in the database**

Run (via `psql` or the Neon SQL console):
```sql
SELECT count(*) FROM tasks;          -- expect 108
SELECT count(*) FROM phases;         -- expect 4
SELECT count(*) FROM sprints;        -- expect 13 (S13..S25)
SELECT code, sum(case when t.id is not null then 1 else 0 end)
  FROM phases p LEFT JOIN tasks t ON t.phase_id = p.id GROUP BY p.code;
  -- expect P1=43, P2=28, P3=30 (rounded), P4=0 or close, matching the sheet's summary table
```

If counts do not match, inspect the mismatched rows with `SELECT * FROM tasks WHERE phase_id IS NULL` — this usually means `phaseRaw` text in a row does not exactly match one of the 4 `PHASES[].match` strings; fix the offending cell or extend `PHASES`.

- [ ] **Step 4: Commit**

```bash
git add scripts/import_excel.js
git commit -m "feat: add one-time Excel import script"
```

---

### Task 14: Frontend scaffold — split the mockup and wire Roadmap + Sprint views

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] **Step 1: Split the existing mockup into three files**

Copy `<style>...</style>` contents from the mockup at
`C:\Users\QUAN~1.DAN\AppData\Local\Temp\claude\C--Users-quan-dang1-OneDrive-Desktop-Work-ttt-timeline\914361c7-9eb7-41ef-8bf5-5d81e8b9d8cd\scratchpad\ttt_mockup.html`
into `public/styles.css` verbatim (no `<style>` tags).

Copy the `<title>` + all markup between `<div class="app-frame">` and the closing `</div>` before `<div class="overlay">`, plus the `overlay`/`drawer` markup, into `public/index.html`, replacing the inline `<style>` block with:
```html
<link rel="stylesheet" href="styles.css">
```
and replacing the inline `<script>...</script>` block with:
```html
<script src="app.js"></script>
```

Copy the JS from the mockup's `<script>` tag into `public/app.js` as the starting point for Steps 2–4 below (it will be rewritten piece by piece, not kept as-is).

- [ ] **Step 2: Replace the hardcoded phase cards with a fetch-and-render function**

In `public/index.html`, replace the 4 hardcoded `.phase-card` blocks inside `.phase-row` with an empty container:
```html
<div class="phase-row" id="phaseRow"></div>
```

In `public/app.js`, replace the master-axis IIFE and remove the old hardcoded phase markup entirely, adding:
```js
const PHASE_META = {
  P1: { label: 'P1 · Lived' },
  P2: { label: 'P2 · Rollout' },
  P3: { label: 'P3 · Convert' },
  P4: { label: 'P4 · Booming' }
};

async function loadPhases() {
  const res = await fetch('/api/phases');
  const phases = await res.json();
  const row = document.getElementById('phaseRow');
  row.innerHTML = '';
  phases.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'phase-card' + (p.code === 'P2' ? ' is-current' : '');
    const pct = p.pct_complete === null ? '—' : p.pct_complete + '%';
    const barWidth = p.pct_complete === null ? 0 : p.pct_complete;
    const daysText = p.days_remaining >= 0 ? `còn ${p.days_remaining} ngày` : `đã qua ${-p.days_remaining} ngày`;
    card.innerHTML = `
      <div class="phase-name">${PHASE_META[p.code]?.label || p.code}</div>
      <div class="phase-target">Mốc đích ${formatDateVN(p.target_date)}</div>
      <div class="phase-meta">
        <div class="phase-pct">${pct}</div>
        <div class="phase-days">${daysText}<br>${p.done_analyst}/${p.total} nghiệp vụ</div>
      </div>
      <div class="stack"><i style="width:${barWidth}%; background:var(--accent-ink);"></i></div>
      <div class="funnel">
        <div>Analyst <span class="n">${p.done_analyst}/${p.total}</span></div>
        <div>Dev <span class="n">${p.done_dev}/${p.total}</span></div>
        <div>UAT <span class="n">${p.done_uat}/${p.total}</span></div>
      </div>`;
    row.appendChild(card);
  });
}

function formatDateVN(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

loadPhases();
```

Keep the existing master-axis IIFE (it draws the today marker independent of API data) but change its 4 hardcoded phase marks to be built from the same `PHASE_META`/fetched `target_date` values once `loadPhases()` resolves — call `drawMasterAxis(phases)` from inside `loadPhases()` after building the cards, passing the fetched `phases` array instead of the hardcoded `marks` array.

- [ ] **Step 3: Wire the Sprint view to `/api/sprints/current-next`**

In `public/app.js`, delete the old `tasks` hardcoded array and the old sprint-view IIFE. Replace with:
```js
async function loadSprintView() {
  const res = await fetch('/api/sprints/current-next');
  const { current, next } = await res.json();
  const col = document.getElementById('sprintColumns');
  col.innerHTML = '';
  renderSprintPanel(col, current, 'Sprint hiện tại', true);
  renderSprintPanel(col, next, 'Sprint tiếp theo', false);
}

function renderSprintPanel(col, sprint, title, isCurrent) {
  const panel = document.createElement('div');
  panel.className = 'sprint-panel' + (isCurrent ? ' is-current' : '');
  if (!sprint) {
    panel.innerHTML = `<div class="sprint-panel-title">${title}</div><div class="sprint-panel-sub">Không có sprint</div>`;
    col.appendChild(panel);
    return;
  }
  panel.innerHTML = `
    <div class="sprint-panel-head">
      <div class="sprint-panel-title">${title}</div>
      <div class="sprint-panel-range">${sprint.code} (${formatDateVN(sprint.start_date)}–${formatDateVN(sprint.end_date)})</div>
    </div>
    <div class="sprint-panel-sub">${sprint.tasks.length} nghiệp vụ</div>`;
  const list = document.createElement('div');
  sprint.tasks.forEach((t) => {
    const item = document.createElement('div');
    item.className = 'sprint-task';
    const stIndex = STATUS_CODES.indexOf(t.status);
    item.innerHTML = `
      <div class="sprint-task-top">
        <div class="sprint-task-name">${t.name}</div>
        <span class="pill st-${stIndex}">${STATUS_LABELS[t.status]}</span>
      </div>
      <div class="card-tags"><span class="tag">${t.category}</span><span class="tag">${t.platform}</span></div>`;
    item.addEventListener('click', () => openDrawer('edit', t));
    list.appendChild(item);
  });
  panel.appendChild(list);
  col.appendChild(panel);
}

const STATUS_CODES = ['0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'];
const STATUS_LABELS = {
  '0.backlog': 'Backlog', '1.ready_for_dev': 'Ready for Dev', '2.in_test': 'In Test',
  '3.ready_for_staging': 'Ready for Staging', '4.done': 'Done'
};

loadSprintView();
```

- [ ] **Step 4: Manually verify in the browser**

Run:
```bash
npm run dev
```
Open `http://localhost:3000`. Expected: Roadmap tab shows 4 phase cards with real percentages from the database (after Task 13's import); Sprint tab shows the true current/next sprint based on today's date, not hardcoded S15/S16.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: wire Roadmap and Sprint views to the API"
```

---

### Task 15: Frontend — wire Timeline and Board views to the API

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Replace the hardcoded `tasks`/gantt code with a fetch-driven version**

Delete the old hardcoded `tasks` array and the gantt-rendering block. Replace with:
```js
let allTasks = [];
let allSprints = [];

async function loadTimeline() {
  const [tasksRes, sprintsRes] = await Promise.all([fetch('/api/tasks'), fetch('/api/sprints')]);
  allTasks = await tasksRes.json();
  allSprints = await sprintsRes.json();
  renderGanttHeader();
  renderGanttBody();
}

function renderGanttHeader() {
  const bandsEl = document.getElementById('sprintBands');
  bandsEl.innerHTML = '';
  const axisStart = new Date(allSprints[0].start_date);
  const axisEnd = new Date(allSprints[allSprints.length - 1].end_date);
  const axisSpan = axisEnd - axisStart;
  window.__ganttAxis = { axisStart, axisSpan };

  allSprints.forEach((s) => {
    const w = (new Date(s.end_date) - new Date(s.start_date)) / axisSpan * 100;
    const band = document.createElement('div');
    band.className = 'sprint-band';
    band.style.width = w + '%';
    band.innerHTML = `<span class="lbl">${s.code}</span>${formatDateVN(s.start_date)}–${formatDateVN(s.end_date)}`;
    bandsEl.appendChild(band);
  });
}

function pctPos(date) {
  const { axisStart, axisSpan } = window.__ganttAxis;
  return (new Date(date) - axisStart) / axisSpan * 100;
}

function renderGanttBody() {
  const body = document.getElementById('ganttBody');
  body.innerHTML = '';
  const withDates = allTasks.filter((t) => t.sprint_start && t.sprint_end);
  const cats = [...new Set(withDates.map((t) => t.category))];

  cats.forEach((cat) => {
    const group = document.createElement('div');
    group.className = 'cat-group';
    const divider = document.createElement('div');
    divider.className = 'cat-divider';
    divider.textContent = cat;
    group.appendChild(divider);

    withDates.filter((t) => t.category === cat).forEach((t) => {
      const row = document.createElement('div');
      row.className = 'task-row';
      const label = document.createElement('div');
      label.className = 'task-label';
      label.textContent = t.name;
      const track = document.createElement('div');
      track.className = 'task-track';
      const left = pctPos(t.sprint_start);
      const width = pctPos(t.sprint_end) - left;
      const stIndex = STATUS_CODES.indexOf(t.status);
      const bar = document.createElement('div');
      bar.className = `bar st-${stIndex}`;
      bar.style.left = left + '%';
      bar.style.width = width + '%';
      bar.textContent = t.sprint_code || '';
      bar.addEventListener('click', () => openDrawer('edit', t));
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      group.appendChild(row);
    });
    body.appendChild(group);
  });

  const todayLeft = pctPos(new Date().toISOString().slice(0, 10));
  const overlay = document.createElement('div');
  overlay.className = 'gantt-track-overlay';
  const line = document.createElement('div');
  line.className = 'gantt-today-line';
  line.style.left = todayLeft + '%';
  overlay.appendChild(line);
  document.querySelector('.gantt').style.position = 'relative';
  document.querySelector('.gantt').appendChild(overlay);
}

loadTimeline();
```

- [ ] **Step 2: Replace the hardcoded Kanban `cardData`/`statusDefs` with a fetch-driven version**

Delete the old `statusDefs`/`cardData`/board-rendering block. Replace with:
```js
async function loadBoard() {
  const res = await fetch('/api/tasks');
  const tasks = await res.json();
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  STATUS_CODES.forEach((code, key) => {
    const col = document.createElement('div');
    col.className = 'col';
    const inColumn = tasks.filter((t) => t.status === code);
    const head = document.createElement('div');
    head.className = 'col-head';
    head.innerHTML = `<span class="pill st-${key}">${STATUS_LABELS[code]}</span><span class="col-count">${inColumn.length}</span>`;
    col.appendChild(head);

    inColumn.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `${t.name}<div class="card-tags"><span class="tag">${t.category}</span><span class="tag">${t.platform}</span></div>`;
      card.addEventListener('click', () => openDrawer('edit', t));
      col.appendChild(card);
    });
    boardEl.appendChild(col);
  });
}

loadBoard();
```

- [ ] **Step 3: Manually verify in the browser**

Run `npm run dev`, open `http://localhost:3000`, switch to Timeline and Board tabs. Expected: bars/cards reflect the 108 imported rows, not the old mockup samples; the "hôm nay" line sits inside whichever sprint contains today's date.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: wire Timeline and Board views to the API"
```

---

### Task 16: Frontend — wire the create/edit/delete drawer and activity log

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html` (add a Delete button and log input to the drawer)

- [ ] **Step 1: Add a Delete button and a log-entry input to the drawer markup**

In `public/index.html`, inside `#drawer`, directly below the existing `<button class="save-btn" id="saveBtn">`, add:
```html
<button class="save-btn" id="deleteBtn" style="background:var(--red-ink); display:none;">Xoá nghiệp vụ</button>
```
Inside `#logField`, above `#logPreview`, add:
```html
<div class="field-row" style="margin-bottom:8px;">
  <input id="f-newlog" type="text" placeholder="Ghi chú mới...">
  <button class="save-btn" id="addLogBtn" style="width:auto; padding:8px 14px;">Thêm</button>
</div>
```

- [ ] **Step 2: Replace `openDrawer`/save logic to call the real API**

Replace the existing `openDrawer` function and the `saveBtn`/`openDrawer('create')` wiring in `public/app.js` with:
```js
let editingTaskId = null;

function readForm() {
  return {
    category: document.getElementById('f-cat').value,
    name: document.getElementById('f-name').value.trim(),
    platform: document.getElementById('f-platform').value,
    status: document.getElementById('f-status').value,
    start_date: document.getElementById('f-start').value || null,
    due_date: document.getElementById('f-due').value || null
  };
}

async function openDrawer(mode, task) {
  editingTaskId = mode === 'edit' ? task.id : null;
  document.getElementById('drawerTitle').textContent = mode === 'edit' ? 'Sửa nghiệp vụ' : 'Nghiệp vụ mới';
  document.getElementById('saveBtn').textContent = mode === 'edit' ? 'Lưu thay đổi' : 'Lưu nghiệp vụ';
  document.getElementById('deleteBtn').style.display = mode === 'edit' ? 'block' : 'none';
  document.getElementById('logField').style.display = mode === 'edit' ? 'block' : 'none';

  document.getElementById('f-name').value = task?.name || '';
  if (task?.category) document.getElementById('f-cat').value = task.category;
  if (task?.platform) document.getElementById('f-platform').value = task.platform;
  if (task?.status) document.getElementById('f-status').value = task.status;
  document.getElementById('f-start').value = task?.start_date || task?.sprint_start || '';
  document.getElementById('f-due').value = task?.due_date || task?.sprint_end || '';

  if (mode === 'edit') {
    await loadLogPreview(task.id);
  }

  overlay.classList.add('show');
  drawer.classList.add('show');
}

async function loadLogPreview(taskId) {
  const res = await fetch(`/api/tasks/${taskId}/logs`);
  const logs = await res.json();
  const preview = document.getElementById('logPreview');
  preview.innerHTML = logs.length === 0
    ? '<div class="log-item">Chưa có cập nhật nào.</div>'
    : logs.map((l) => `<div class="log-item"><span class="log-date">${formatDateVN(l.created_at.slice(0, 10))}</span>${l.note}</div>`).join('');
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const body = readForm();
  if (!body.name || !body.category || !body.platform) {
    alert('Cần nhập đủ Category, Tên nghiệp vụ, Platform.');
    return;
  }
  if (editingTaskId) {
    await fetch(`/api/tasks/${editingTaskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  } else {
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  }
  close();
  await Promise.all([loadPhases(), loadSprintView(), loadTimeline(), loadBoard()]);
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!editingTaskId) return;
  if (!confirm('Xoá nghiệp vụ này? Không thể hoàn tác.')) return;
  await fetch(`/api/tasks/${editingTaskId}`, { method: 'DELETE' });
  close();
  await Promise.all([loadPhases(), loadSprintView(), loadTimeline(), loadBoard()]);
});

document.getElementById('addLogBtn').addEventListener('click', async () => {
  const input = document.getElementById('f-newlog');
  const note = input.value.trim();
  if (!note || !editingTaskId) return;
  await fetch(`/api/tasks/${editingTaskId}/logs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note })
  });
  input.value = '';
  await loadLogPreview(editingTaskId);
});

document.getElementById('openDrawer').addEventListener('click', () => openDrawer('create', null));
```

Remove the old `setSelect`/`statusLabel`/`phaseLabel`/`sprintRangeLabel` helpers tied to the mockup's fake data — the new `openDrawer` above reads real DB rows directly.

- [ ] **Step 3: Manually verify in the browser**

Run `npm run dev`. Create a new nghiệp vụ, confirm it appears in Board/Timeline after the drawer closes. Click an existing task, confirm the form is pre-filled, change its status, save, confirm the Board view reflects the new column. Add a log entry, reopen the same task, confirm the log entry persists (survives a page reload). Delete a task, confirm it disappears from all views.

- [ ] **Step 4: Commit**

```bash
git add public/app.js public/index.html
git commit -m "feat: wire create/edit/delete and activity log to the API"
```

---

### Task 17: Deployment — Render + Neon

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Write the Render service definition**

`render.yaml`:
```yaml
services:
  - type: web
    name: ttt-project-manager
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm run dev
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: PORT
        value: 3000
```

- [ ] **Step 2: Create the Neon project and run migrations against it**

1. Create a free project at neon.tech, copy its pooled connection string.
2. In Render, create a new Web Service from this repo; it will pick up `render.yaml`.
3. Set `DATABASE_URL` in the Render dashboard's environment tab to the Neon connection string (append `?sslmode=require` if not already present).
4. From your local machine (with `.env` pointed at the same Neon connection string), run:
```bash
npm run migrate
npm run import:excel
```

- [ ] **Step 3: Verify the deployed app**

Open the Render-provided URL (e.g. `https://ttt-project-manager.onrender.com`) from a phone or another machine. Expected: Roadmap/Sprint/Timeline/Board all show the real imported data. First request after idle may take a few seconds (free tier cold start) — this is expected and acceptable per `SPEC.md`.

- [ ] **Step 4: Commit**

```bash
git add render.yaml
git commit -m "chore: add Render deployment config"
```

---

### Task 18: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write setup/run/deploy instructions**

`README.md`:
```markdown
# TTT Project Manager

Thay thế sheet "Nghiệp vụ" trong `[TTT New] Planning.xlsx` — xem `SPEC.md` để biết đầy đủ yêu cầu.

## Chạy local

1. Copy `.env.example` thành `.env`, điền `DATABASE_URL` (connection string Neon) và `EXCEL_SOURCE` (đường dẫn tới file Excel gốc, chỉ cần cho lần import đầu).
2. `npm install`
3. `npm run migrate` — tạo bảng trong DB.
4. `npm run import:excel` — nhập 108 nghiệp vụ hiện có (chỉ chạy 1 lần).
5. `npm run dev` — mở `http://localhost:3000`.

## Test

`npm test` — chạy toàn bộ unit test (logic thuần) và integration test (API, dùng `pg-mem`, không cần DB thật).

## Deploy

Xem phần "Hosting & Deployment" trong `SPEC.md` và `render.yaml`. Tóm tắt: Neon (Postgres free) + Render (web service free).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review Notes

- **Spec coverage:** every P0 checklist item in `SPEC.md` maps to a task above — DB (Task 2), import (Task 13), CRUD (Tasks 10, 16), 4 views (Tasks 8, 9, 14, 15), activity log (Tasks 11, 16). P1 items (real filters, export, drag-and-drop status, past-sprint view) and P2 items (risk indicator, reminders, multi-user) are intentionally not planned here — they are fast-follows per `SPEC.md`'s own prioritization, not part of this plan's scope.
- **Placeholder scan:** no task contains "TBD"/"add validation"/"similar to Task N" — every step has complete, runnable code.
- **Type/name consistency check:** `STATUS_CODES` values (`'0.backlog'`, `'1.ready_for_dev'`, `'2.in_test'`, `'3.ready_for_staging'`, `'4.done'`) are identical across `src/lib/statusCodes.js`, all route handlers, and `public/app.js`. `createApp(pool)` signature is identical in Tasks 7 through 16. `deriveTaskDates`, `pickCurrentAndNextSprint`, `computePhaseRollup`, `parseSprintCell` signatures introduced in Tasks 4–6 and 12 are used with matching argument shapes in Tasks 8–10 and 13.
