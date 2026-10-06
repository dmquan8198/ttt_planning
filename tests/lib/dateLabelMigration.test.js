const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const { isDateChangeNote } = require('../../src/lib/dateChangeNote');

// Date-change notes used to be labelled "Dịch ngày" (whole-range shift) or
// "Đổi ngày" (anything else); the migration rewrites the old label so the
// history reads the same.

const SQL = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
// the label-normalizing UPDATE is the last statement of the migration
const LABEL_UPDATE = SQL.slice(SQL.lastIndexOf('UPDATE activity_logs'));

test('migration rewrites a legacy "Dịch ngày" log to "Đổi ngày" and leaves everything else alone', async () => {
  const db = newDb();
  db.public.none(SQL);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const { rows: [task] } = await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'T', 'Web', '0.backlog', '2026-07-06', '2026-07-17') RETURNING id`
  );
  const legacy = 'Dịch ngày (Quân): 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)';
  const untouched = [
    'Đổi ngày (Quân): kết thúc 17/07/2026 → 12/07/2026 (-5 ngày)',
    'Lý do dời ngày: khách hàng đổi lịch',
    'Cập nhật: đã Dịch ngày xong — Quân' // mentions the words, but not as the label
  ];
  for (const note of [legacy, ...untouched]) {
    await pool.query('INSERT INTO activity_logs (task_id, note) VALUES ($1, $2)', [task.id, note]);
  }

  await pool.query(LABEL_UPDATE);
  await pool.query(LABEL_UPDATE); // re-running is a no-op

  const { rows } = await pool.query('SELECT note FROM activity_logs ORDER BY id');
  assert.deepEqual(rows.map((r) => r.note), [
    'Đổi ngày (Quân): 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)',
    ...untouched
  ]);
});

test('isDateChangeNote recognizes both the current and the legacy label, and nothing else', () => {
  assert.equal(isDateChangeNote('Đổi ngày (Quân): kết thúc 17/07/2026 → 12/07/2026 (-5 ngày)'), true);
  assert.equal(isDateChangeNote('Dịch ngày: 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)'), true);
  assert.equal(isDateChangeNote('Lý do dời ngày: khách hàng đổi lịch'), false);
});
