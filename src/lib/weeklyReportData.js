// Gathers the numbers behind the weekly boss report (see weeklyReportDeck.js).
// Read-only. "This week" = the 7 days ending today (Vietnam date); the
// week-ago comparison comes from daily_snapshots (nearest snapshot on or
// before today - 7).
const { STATUS_LABELS } = require('./statusCodes');
const { normalizeDate } = require('./normalizeDate');
const { getTodayVN } = require('./today');

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// a timestamp's calendar date in Vietnam, as 'YYYY-MM-DD'
function vnDate(ts) {
  return new Date(new Date(ts).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const STAMP_COLUMN = {
  '1.in_analyst': 'in_analyst_at', '2.ready_for_dev': 'ready_for_dev_at', '3.in_test': 'in_test_at',
  '4.in_test_uat': 'in_test_uat_at', '5.ready_for_staging': 'ready_for_staging_at', '6.done': 'done_at'
};

function countBy(rows, keyFn) {
  return rows.reduce((a, r) => { const k = keyFn(r); a[k] = (a[k] || 0) + 1; return a; }, {});
}

async function collectWeeklyReport(pool, today = getTodayVN()) {
  const weekAgo = addDays(today, -7);
  const q = async (sql) => (await pool.query(sql)).rows;

  const sprints = (await q('SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'))
    .map((s) => ({ ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date) }));
  const tasks = (await q(`SELECT id, category, name, status, start_date, due_date, sprint_id,
      in_analyst_at, ready_for_dev_at, in_test_at, in_test_uat_at, ready_for_staging_at, done_at, created_at
    FROM tasks ORDER BY id`))
    .map((t) => ({ ...t, start_date: normalizeDate(t.start_date), due_date: normalizeDate(t.due_date) }));
  const subtasks = (await q('SELECT id, task_id, name, status, due_date, pic FROM subtasks'))
    .map((s) => ({ ...s, due_date: normalizeDate(s.due_date) }));
  const snapshots = (await q('SELECT snapshot_date, total_tasks, completed_tasks, completion_rate, by_status, by_category FROM daily_snapshots ORDER BY snapshot_date'))
    .map((s) => ({ ...s, snapshot_date: normalizeDate(s.snapshot_date), completion_rate: Number(s.completion_rate) }));

  const sprintById = Object.fromEntries(sprints.map((s) => [s.id, s]));
  const inWeek = (ts) => !!ts && vnDate(ts) > weekAgo;
  const label = (t) => STATUS_LABELS[t.status];
  const brief = (t) => ({
    id: t.id, name: t.name, category: t.category, status: label(t),
    sprint: sprintById[t.sprint_id]?.code || null, due: t.due_date
  });

  const prev = [...snapshots].reverse().find((s) => s.snapshot_date <= weekAgo) || null;
  const latest = snapshots[snapshots.length - 1] || null;

  // tasks that entered a new stage during the week, and which stage(s) they reached
  const movedThisWeek = tasks
    .map((t) => ({ t, reached: Object.entries(STAMP_COLUMN).filter(([, col]) => inWeek(t[col])).map(([code]) => STATUS_LABELS[code]) }))
    .filter((x) => x.reached.length)
    .map((x) => ({ ...brief(x.t), reached: x.reached }));

  // overdue basis = Done UAT (same default as the reminder email): a task at
  // Done UAT or Done is no longer late. overdueByDone is the stricter count.
  const notDone = tasks.filter((t) => t.status !== '6.done');
  const notDoneUat = tasks.filter((t) => t.status !== '6.done' && t.status !== '5.ready_for_staging');
  const overdueByDone = notDone.filter((t) => t.due_date < today).length;
  const overdue = notDoneUat.filter((t) => t.due_date < today)
    .map((t) => ({ ...brief(t), days_late: Math.round((new Date(today) - new Date(t.due_date)) / 864e5) }));
  const dueNext7 = notDoneUat.filter((t) => t.due_date >= today && t.due_date <= addDays(today, 7)).map(brief);
  const subOverdue = subtasks.filter((s) => s.status !== 'done' && s.due_date && s.due_date < today).length;

  const byStatus = countBy(tasks, label);
  const byCategory = {};
  tasks.forEach((t) => {
    const c = (byCategory[t.category] ||= { total: 0, done: 0, overdue: 0 });
    c.total++;
    if (t.status === '6.done') c.done++;
    if (t.status !== '6.done' && t.status !== '5.ready_for_staging' && t.due_date < today) c.overdue++;
  });
  const categoryStatus = {};
  tasks.forEach((t) => { const c = (categoryStatus[t.category] ||= {}); c[label(t)] = (c[label(t)] || 0) + 1; });

  // between sprints (none contains today) -> report the most recent ended sprint
  // as "current" and flag it, plus the next upcoming one
  let current = sprints.find((s) => s.start_date <= today && today <= s.end_date) || null;
  const betweenSprints = !current;
  if (!current) current = [...sprints].reverse().find((s) => s.end_date < today) || null;
  const nextSprint = sprints.find((s) => s.start_date > today) || null;
  const curTasks = current ? tasks.filter((t) => t.sprint_id === current.id) : [];
  const nextTasks = nextSprint ? tasks.filter((t) => t.sprint_id === nextSprint.id) : [];

  return {
    today, weekAgo,
    totals: { total: tasks.length, done: byStatus['Done'] || 0, byStatus, byCategory },
    prevSnapshot: prev, latestSnapshot: latest,
    categoryStatus,
    inUatBySprint: countBy(tasks.filter((t) => t.status === '4.in_test_uat'), (t) => sprintById[t.sprint_id]?.code || '—'),
    sprint: current && {
      ended: betweenSprints, code: current.code, start: current.start_date, end: current.end_date,
      byStatus: countBy(curTasks, label), total: curTasks.length,
      done: curTasks.filter((t) => t.status === '6.done').length,
      overdue: curTasks.filter((t) => t.status !== '6.done' && t.status !== '5.ready_for_staging' && t.due_date < today).length,
      not_done: curTasks.filter((t) => t.status !== '6.done').length,
      days_left: Math.round((new Date(current.end_date) - new Date(today)) / 864e5)
    },
    nextSprint: nextSprint && {
      code: nextSprint.code, start: nextSprint.start_date, end: nextSprint.end_date,
      total: nextTasks.length, byStatus: countBy(nextTasks, label)
    },
    newTasksThisWeek: tasks.filter((t) => inWeek(t.created_at)).map(brief),
    movedThisWeek,
    doneThisWeek: tasks.filter((t) => inWeek(t.done_at)).map(brief),
    risks: { overdueByDone, overdue, dueNext7, subOverdue }
  };
}

module.exports = { collectWeeklyReport };
