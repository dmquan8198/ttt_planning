const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const { executeTool } = require('../../src/lib/chatbotTools');
const { getTodayVN } = require('../../src/lib/today');

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

// sprint window built around the REAL today (getTodayVN(), no way to mock
// "now" in today.js) rather than a hardcoded date range — a fixed
// 2026-09-14..25 window would start silently failing the instant a real
// clock ran this test after 2026-09-25.
function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedProject(pool) {
  const today = getTodayVN();
  const sprintStart = shiftDate(today, -3);
  const sprintEnd = shiftDate(today, 3);
  const nextSprintStart = shiftDate(today, 4);
  const nextSprintEnd = shiftDate(today, 10);

  await pool.query("INSERT INTO phases (code, name, target_date) VALUES ('P1', 'Lived', '2026-09-01')");
  const { rows: [phase] } = await pool.query("SELECT id FROM phases WHERE code='P1'");
  await pool.query('INSERT INTO sprints (code, start_date, end_date) VALUES ($1, $2, $3)', ['S18', sprintStart, sprintEnd]);
  await pool.query('INSERT INTO sprints (code, start_date, end_date) VALUES ($1, $2, $3)', ['S19', nextSprintStart, nextSprintEnd]);
  const { rows: [sprint] } = await pool.query("SELECT id FROM sprints WHERE code='S18'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, sprint_id, status, start_date, due_date, stt)
     VALUES ('Product Foundation', 'Task A', 'Web', $1, $2, '5.done', $3, $4, 1)`,
    [phase.id, sprint.id, sprintStart, shiftDate(sprintStart, 2)]
  );
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, sprint_id, status, start_date, due_date, stt)
     VALUES ('Product Foundation', 'Task B', 'BE', $1, $2, '0.backlog', $3, $4, 2)`,
    [phase.id, sprint.id, shiftDate(sprintStart, 1), shiftDate(sprintStart, 4)]
  );
  await pool.query(
    `INSERT INTO sops (group_name, category, title, steps, pic)
     VALUES ('Vận hành', 'Ticket', 'Xử lý hoàn tiền cho user', 'Bước 1: kiểm tra giao dịch', 'anh.nguyen80')`
  );
  return { phase, sprint };
}

test('sprint_hien_tai returns the sprint whose date range contains today, plus the one right after it', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'sprint_hien_tai', {});
  assert.equal(result.sprint_hien_tai.code, 'S18');
  assert.equal(result.sprint_ke_tiep.code, 'S19');
  assert.equal(result.hom_nay, getTodayVN());
});

test('dem_task resolves sprint_code:"hiện tại" to the real current sprint instead of requiring the model to already know its code', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const byAlias = await executeTool(pool, 'dem_task', { sprint_code: 'hiện tại' });
  const byRealCode = await executeTool(pool, 'dem_task', { sprint_code: 'S18' });
  assert.equal(byAlias.so_luong, byRealCode.so_luong);
  assert.equal(byAlias.so_luong, 2);
});

test('dem_task resolves sprint_code:"tiếp theo" to the sprint right after the current one', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const byAlias = await executeTool(pool, 'dem_task', { sprint_code: 'tiếp theo' });
  const byRealCode = await executeTool(pool, 'dem_task', { sprint_code: 'S19' });
  assert.equal(byAlias.so_luong, byRealCode.so_luong);
});

test('dem_task counts exactly, filtered by sprint_code', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'dem_task', { sprint_code: 'S18' });
  assert.equal(result.so_luong, 2);
});

test('dem_task filtered by status accepts either the raw code or the Vietnamese label', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const byCode = await executeTool(pool, 'dem_task', { status: '5.done' });
  const byLabel = await executeTool(pool, 'dem_task', { status: 'Done' });
  assert.equal(byCode.so_luong, 1);
  assert.equal(byLabel.so_luong, 1);
});

test('dem_task combines sprint_code + status filters (AND, not OR)', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'dem_task', { sprint_code: 'S18', status: 'Backlog' });
  assert.equal(result.so_luong, 1);
});

test('dem_task returns a typed error for an unknown sprint_code, not a crash or a false zero', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'dem_task', { sprint_code: 'S99' });
  assert.match(result.error, /Không tìm thấy sprint "S99"/);
  assert.equal(result.so_luong, undefined);
});

test('dem_task returns a typed error for an invalid status value', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'dem_task', { status: 'not-a-real-status' });
  assert.match(result.error, /status .* không hợp lệ/);
});

test('liet_ke_task returns matching tasks with human-readable status labels and reports whether the list was truncated', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'liet_ke_task', { sprint_code: 'S18' });
  assert.equal(result.tong_so_khop, 2);
  assert.equal(result.so_dang_hien, 2);
  assert.equal(result.bi_cat_bot, false);
  const names = result.tasks.map((t) => t.ten).sort();
  assert.deepEqual(names, ['Task A', 'Task B']);
  const taskA = result.tasks.find((t) => t.ten === 'Task A');
  assert.equal(taskA.trang_thai, 'Done');
});

test('liet_ke_task caps the returned rows at MAX_LIST_ROWS but still reports the true total', async () => {
  const pool = makeTestPool();
  const { phase } = await seedProject(pool);
  for (let i = 0; i < 35; i++) {
    await pool.query(
      `INSERT INTO tasks (category, name, platform, phase_id, status, start_date, due_date)
       VALUES ('Product Foundation', $1, 'Web', $2, '0.backlog', '2026-09-01', '2026-09-05')`,
      [`Bulk task ${i}`, phase.id]
    );
  }
  const result = await executeTool(pool, 'liet_ke_task', { phase_code: 'P1' });
  assert.equal(result.tong_so_khop, 37); // 35 bulk + Task A + Task B, all phase P1
  assert.equal(result.so_dang_hien, 30);
  assert.equal(result.bi_cat_bot, true);
});

test('tim_sop finds SOPs matching a keyword in the steps text, not just the title', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'tim_sop', { tu_khoa: 'kiểm tra giao dịch' });
  assert.equal(result.so_ket_qua, 1);
  assert.equal(result.ket_qua[0].tieu_de, 'Xử lý hoàn tiền cho user');
});

test('tim_sop rejects an empty keyword instead of matching everything', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'tim_sop', { tu_khoa: '  ' });
  assert.match(result.error, /tu_khoa/);
});

// this is the fix for the real "Phase P2 hoàn thành bao nhiêu %?" failure —
// the model previously had only dem_task's raw count to guess a % from and
// invented 54% when the real figure was 42%. thong_tin_phase must return
// the SAME number GET /api/phases would (both call computePhaseRollup).
test('thong_tin_phase returns the real completion % (same computation as GET /api/phases), not something dem_task could ever derive', async () => {
  const pool = makeTestPool();
  await seedProject(pool); // phase P1: Task A '5.done', Task B '0.backlog' -> 1/2 reached Done UAT+
  const result = await executeTool(pool, 'thong_tin_phase', { phase_code: 'P1' });
  assert.equal(result.phases.length, 1);
  assert.equal(result.phases[0].ma, 'P1');
  assert.equal(result.phases[0].tong_task, 2);
  assert.equal(result.phases[0].phan_tram_hoan_thanh, 50);
});

test('thong_tin_phase with no phase_code returns every phase', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  await pool.query("INSERT INTO phases (code, name, target_date) VALUES ('P2', 'Rollout', '2026-11-01')");
  const result = await executeTool(pool, 'thong_tin_phase', {});
  assert.deepEqual(result.phases.map((p) => p.ma).sort(), ['P1', 'P2']);
});

test('thong_tin_phase returns a typed error for an unknown phase_code', async () => {
  const pool = makeTestPool();
  await seedProject(pool);
  const result = await executeTool(pool, 'thong_tin_phase', { phase_code: 'P99' });
  assert.match(result.error, /Không tìm thấy phase "P99"/);
});

test('executeTool returns a typed error for an unknown tool name instead of throwing', async () => {
  const pool = makeTestPool();
  const result = await executeTool(pool, 'khong_ton_tai', {});
  assert.match(result.error, /Không có tool/);
});

// this is the fix for the real "task nào trễ hạn?" failure — asked that,
// the model called liet_ke_task(status: "In Dev") whose due dates were
// still in the FUTURE, then just asserted in the final text that they
// were overdue with no date comparison behind it at all. task_qua_han
// must do that comparison in SQL, never leave it to the model.
test('task_qua_han finds only tasks whose due_date is before today and not Done — never a future-dated or already-Done task', async () => {
  const pool = makeTestPool();
  const { phase, sprint } = await seedProject(pool);
  const today = getTodayVN();
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, sprint_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task overdue', 'Web', $1, $2, '3.in_test', $3, $4)`,
    [phase.id, sprint.id, shiftDate(today, -5), shiftDate(today, -2)]
  );
  // a Done task past its due_date must NOT count as overdue
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, sprint_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task done late', 'Web', $1, $2, '5.done', $3, $4)`,
    [phase.id, sprint.id, shiftDate(today, -5), shiftDate(today, -1)]
  );

  const result = await executeTool(pool, 'task_qua_han', {});
  assert.equal(result.tong_so_task_qua_han, 1);
  assert.equal(result.tasks[0].ten, 'Task overdue');
  assert.equal(result.tasks[0].so_ngay_qua_han, 2);
  // Task A ('5.done', due in the future per seedProject) and Task B
  // ('0.backlog', due in the future) must both be absent.
  assert.equal(result.tasks.some((t) => t.ten === 'Task A'), false);
  assert.equal(result.tasks.some((t) => t.ten === 'Task B'), false);
});

test('task_qua_han filtered by sprint_code:"hiện tại" only counts overdue tasks in the current sprint', async () => {
  const pool = makeTestPool();
  const { phase, sprint } = await seedProject(pool);
  const today = getTodayVN();
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, sprint_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task overdue in S18', 'Web', $1, $2, '3.in_test', $3, $4)`,
    [phase.id, sprint.id, shiftDate(today, -5), shiftDate(today, -2)]
  );
  const result = await executeTool(pool, 'task_qua_han', { sprint_code: 'hiện tại' });
  assert.equal(result.tong_so_task_qua_han, 1);
  assert.equal(result.tasks[0].ten, 'Task overdue in S18');
});
