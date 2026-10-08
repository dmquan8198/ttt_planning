const { deriveTaskDates } = require('./deriveTaskDates');
const { isWeekend, workingDaysUntil } = require('./workingDays');

// Which unfinished tasks / subtasks are due in exactly N working days, for
// each N in `windows` (default 1 and 3). Pure function over rows already
// loaded from the database — the route does the loading (see
// src/routes/reminders.js), the Apps Script that actually sends the report
// email (docs/email-reminders) only formats what this returns.
//
// - A task is "unfinished" unless its status is 6.done; a subtask unless it
//   is done OR its parent task is done. Subtasks need their own due_date.
// - A task's due date is the one the app shows: its own when the dates were
//   overridden, otherwise the end of its sprint (deriveTaskDates).
// - "N working days" = Mon–Fri days from today up to the due date
//   (workingDaysUntil). Items due today, overdue, or further out than the
//   largest window are not reminded. On a weekend nothing is, whatever the
//   data says, so a trigger that also fires on Saturday/Sunday stays quiet.
// - Each item carries its PIC's name (null when nobody is assigned) so the
//   report can show who is responsible and flag what has no owner, and the
//   TASK's category and status (a subtask carries its parent's) so the report
//   can file it under Analyst / Development and group it by category.
function buildReminders({ tasks, subtasks, sprints, today, windows = [1, 3] }) {
  const weekend = isWeekend(today);
  const base = { today, windows, weekend, items: [] };
  if (weekend) return base;

  const sprintById = new Map(sprints.map((s) => [s.id, s]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const items = [];
  const consider = (item) => {
    const left = workingDaysUntil(today, item.due_date);
    if (!windows.includes(left)) return;
    items.push({ ...item, working_days_left: left });
  };

  tasks.forEach((t) => {
    if (t.status === '6.done') return;
    const sprint = t.sprint_id != null ? sprintById.get(t.sprint_id) : null;
    const { due_date } = deriveTaskDates(t, sprint);
    if (!due_date) return;
    consider({
      kind: 'task', id: t.id, task_id: t.id, name: t.name, task_name: t.name,
      category: t.category || null, task_status: t.status,
      sprint_code: sprint ? sprint.code : null, sprint_start: sprint ? sprint.start_date : null, sprint_end: sprint ? sprint.end_date : null,
      status: t.status, due_date, pic: t.pic || null
    });
  });

  subtasks.forEach((s) => {
    const parent = taskById.get(s.task_id);
    if (!parent || parent.status === '6.done' || s.status === 'done' || !s.due_date) return;
    const sprint = parent.sprint_id != null ? sprintById.get(parent.sprint_id) : null;
    consider({
      kind: 'subtask', id: s.id, task_id: s.task_id, name: s.name, task_name: parent.name,
      category: parent.category || null, task_status: parent.status,
      sprint_code: sprint ? sprint.code : null, sprint_start: sprint ? sprint.start_date : null, sprint_end: sprint ? sprint.end_date : null,
      status: s.status, due_date: s.due_date, pic: s.pic || null
    });
  });

  // soonest first, then by due date, tasks before their own subtasks
  items.sort((a, b) =>
    a.working_days_left - b.working_days_left ||
    a.due_date.localeCompare(b.due_date) ||
    a.task_id - b.task_id ||
    (a.kind === b.kind ? a.id - b.id : (a.kind === 'task' ? -1 : 1))
  );

  return { ...base, items };
}

module.exports = { buildReminders };
