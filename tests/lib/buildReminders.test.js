const test = require('node:test');
const assert = require('node:assert/strict');
const { workingDaysUntil, isWeekend } = require('../../src/lib/workingDays');
const { buildReminders } = require('../../src/lib/buildReminders');

// 2026-10-07 is a Wednesday: Thu 08, Fri 09, [Sat 10, Sun 11], Mon 12, Tue 13, Wed 14
const WED = '2026-10-07';

test('workingDaysUntil counts Mon–Fri days in (today, due], weekends adding nothing', () => {
  assert.equal(workingDaysUntil(WED, '2026-10-07'), 0, 'due today');
  assert.equal(workingDaysUntil(WED, '2026-10-06'), 0, 'overdue');
  assert.equal(workingDaysUntil(WED, '2026-10-08'), 1);
  assert.equal(workingDaysUntil(WED, '2026-10-09'), 2);
  assert.equal(workingDaysUntil(WED, '2026-10-10'), 2, 'Saturday counts like the Friday before it');
  assert.equal(workingDaysUntil(WED, '2026-10-11'), 2);
  assert.equal(workingDaysUntil(WED, '2026-10-12'), 3, 'Monday');
  assert.equal(workingDaysUntil('2026-10-09', '2026-10-12'), 1, 'Friday -> Monday is one working day');
});

test('isWeekend', () => {
  assert.equal(isWeekend('2026-10-10'), true);
  assert.equal(isWeekend('2026-10-11'), true);
  assert.equal(isWeekend('2026-10-09'), false);
});

const SPRINTS = [{ id: 1, code: 'S19', start_date: '2026-09-28', end_date: '2026-10-09' }];
const base = (over) => ({ status: '3.in_test', date_overridden: true, start_date: '2026-10-01', sprint_id: 1, pic: null, ...over });

function run(tasks, subtasks = [], today = WED, windows) {
  return buildReminders({ tasks, subtasks, sprints: SPRINTS, today, windows });
}

test('only items due in exactly 1 or 3 working days are reminded (default windows)', () => {
  const r = run([
    base({ id: 1, name: 'today', due_date: '2026-10-07' }),
    base({ id: 2, name: 'tomorrow', due_date: '2026-10-08' }),
    base({ id: 3, name: 'in 2', due_date: '2026-10-09' }),
    base({ id: 4, name: 'monday', due_date: '2026-10-12' }),
    base({ id: 5, name: 'in 4', due_date: '2026-10-13' }),
    base({ id: 6, name: 'overdue', due_date: '2026-10-01' })
  ]);
  assert.deepEqual(r.items.map((i) => [i.name, i.working_days_left]), [['tomorrow', 1], ['monday', 3]]);
  assert.equal(r.weekend, false);
  assert.deepEqual(r.windows, [1, 3]);
});

test('windows are configurable', () => {
  const r = run([base({ id: 1, name: 'in 2', due_date: '2026-10-09' })], [], WED, [2]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].working_days_left, 2);
});

test('finished work is never reminded: done task, done subtask, subtask of a done task, subtask with no due date', () => {
  const tasks = [
    base({ id: 1, name: 'open', due_date: '2026-10-12' }),
    base({ id: 2, name: 'done task', status: '6.done', due_date: '2026-10-12' })
  ];
  const subtasks = [
    { id: 10, task_id: 1, name: 'open sub', status: 'wip', due_date: '2026-10-08', pic: null },
    { id: 11, task_id: 1, name: 'done sub', status: 'done', due_date: '2026-10-08', pic: null },
    { id: 12, task_id: 2, name: 'sub of done task', status: 'todo', due_date: '2026-10-08', pic: null },
    { id: 13, task_id: 1, name: 'undated sub', status: 'todo', due_date: null, pic: null }
  ];
  const r = run(tasks, subtasks);
  assert.deepEqual(r.items.map((i) => `${i.kind}:${i.name}`), ['subtask:open sub', 'task:open']);
});

test('a task that is not date-overridden is due at the end of its sprint, not on its own stale due_date', () => {
  // sprint S19 ends Fri 2026-10-09 = 2 working days from Wednesday; the task's own due_date (Thu) is stale
  const r = run([base({ id: 1, name: 'follows sprint', date_overridden: false, due_date: '2026-10-08' })], [], WED, [2]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].due_date, '2026-10-09');
  assert.equal(r.items[0].sprint_code, 'S19');
});

test('subtasks carry their parent task name and sprint', () => {
  const r = run(
    [base({ id: 1, name: 'Parent', due_date: '2026-10-30' })],
    [{ id: 10, task_id: 1, name: 'Child', status: 'todo', due_date: '2026-10-08', pic: null }]
  );
  assert.equal(r.items[0].kind, 'subtask');
  assert.equal(r.items[0].task_name, 'Parent');
  assert.equal(r.items[0].sprint_code, 'S19');
});

test('every item carries its PIC (null when nobody owns it) so the report can show who is responsible', () => {
  const r = run(
    [base({ id: 1, name: 'T1', due_date: '2026-10-08', pic: 'An' }), base({ id: 3, name: 'T3', due_date: '2026-10-08' })],
    [{ id: 10, task_id: 3, name: 'S1', status: 'todo', due_date: '2026-10-08', pic: 'Bình' }]
  );
  assert.deepEqual(r.items.map((i) => [i.name, i.pic]), [['T1', 'An'], ['T3', null], ['S1', 'Bình']]);
  assert.equal('by_pic' in r, false, 'the report is one email — nothing is split per person any more');
});

test('on a weekend nothing is reminded, whatever the data', () => {
  const r = run([base({ id: 1, name: 'x', due_date: '2026-10-12' })], [], '2026-10-10');
  assert.equal(r.weekend, true);
  assert.deepEqual(r.items, []);
});

test('every item carries the TASK\'s category and status — a subtask carries its parent\'s — so the report can file and group it', () => {
  const r = run(
    [base({ id: 1, name: 'T1', due_date: '2026-10-08', category: 'TTT New - Internal Features', status: '1.in_analyst' }),
     base({ id: 2, name: 'Parent', due_date: '2026-10-30', category: 'Túi Thần Tài', status: '3.in_test' })],
    [{ id: 10, task_id: 2, name: 'Sub', status: 'todo', due_date: '2026-10-08', pic: null }]
  );
  const byName = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.equal(byName.T1.category, 'TTT New - Internal Features');
  assert.equal(byName.T1.task_status, '1.in_analyst');
  assert.equal(byName.Sub.category, 'Túi Thần Tài', "a subtask is filed under its parent's category…");
  assert.equal(byName.Sub.task_status, '3.in_test', "…and its parent's status (the subtask's own is todo/wip/done)");
  assert.equal(byName.Sub.status, 'todo');
});

test('every item carries its sprint\'s dates (a subtask its parent\'s), null when there is no sprint', () => {
  const r = run(
    [base({ id: 1, name: 'In a sprint', due_date: '2026-10-08' }), base({ id: 2, name: 'No sprint', due_date: '2026-10-08', sprint_id: null })],
    [{ id: 10, task_id: 1, name: 'Sub', status: 'todo', due_date: '2026-10-08', pic: null }]
  );
  const byName = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.deepEqual([byName['In a sprint'].sprint_code, byName['In a sprint'].sprint_start, byName['In a sprint'].sprint_end], ['S19', '2026-09-28', '2026-10-09']);
  assert.deepEqual([byName.Sub.sprint_start, byName.Sub.sprint_end], ['2026-09-28', '2026-10-09']);
  assert.deepEqual([byName['No sprint'].sprint_code, byName['No sprint'].sprint_start, byName['No sprint'].sprint_end], [null, null, null]);
});
