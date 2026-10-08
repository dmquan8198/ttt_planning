const crypto = require('crypto');
const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { buildReminders } = require('../lib/buildReminders');

// constant-time compare via fixed-length hashes (same approach as basicAuth.js)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// "1,3" -> [1, 3]; undefined -> the default. null = malformed.
function parseWindows(raw) {
  if (raw === undefined) return [1, 3];
  const parts = String(raw).split(',').map((p) => p.trim()).filter(Boolean);
  const nums = parts.map(Number);
  if (nums.length === 0 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
}

function remindersRouter(pool) {
  const router = Router();

  // Read by the Google Apps Script that sends the report email (see
  // docs/email-reminders/README.md) — machine-to-machine, so a shared secret
  // rather than requireRole, like POST /api/snapshots/run. It has its OWN
  // secret (REMINDER_SECRET), not CRON_SECRET: the snapshot secret is also
  // held by GitHub, and this one lets its holder read what is due and who
  // owns it. Denied by default when the server has no secret configured.
  router.get('/due', asyncHandler(async (req, res) => {
    const secret = process.env.REMINDER_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'REMINDER_SECRET chưa được cấu hình trên server' });
    }
    if (!safeEqual(req.headers['x-reminder-secret'] || '', secret)) {
      return res.status(401).json({ error: 'Không có quyền' });
    }

    const windows = parseWindows(req.query.days);
    if (!windows) {
      return res.status(400).json({ error: 'days không hợp lệ (ví dụ: 1,3 — mỗi số từ 1 đến 10)' });
    }
    const today = req.query.today || getTodayVN();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      return res.status(400).json({ error: 'today không hợp lệ (YYYY-MM-DD)' });
    }

    const { rows: tasks } = await pool.query(
      `SELECT id, name, category, status, date_overridden, start_date, due_date, sprint_id, pic
       FROM tasks WHERE status <> '6.done'`
    );
    const { rows: subtasks } = await pool.query(
      `SELECT id, task_id, name, status, due_date, pic
       FROM subtasks WHERE status <> 'done' AND due_date IS NOT NULL`
    );
    const { rows: sprints } = await pool.query('SELECT id, code, start_date, end_date FROM sprints');

    const dates = (row, keys) => keys.reduce((o, k) => ({ ...o, [k]: normalizeDate(row[k]) }), row);
    res.json(buildReminders({
      tasks: tasks.map((t) => dates(t, ['start_date', 'due_date'])),
      subtasks: subtasks.map((s) => dates(s, ['due_date'])),
      sprints: sprints.map((s) => dates(s, ['start_date', 'end_date'])),
      today,
      windows
    }));
  }));

  return router;
}

module.exports = remindersRouter;
