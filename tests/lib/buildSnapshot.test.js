const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSnapshot, summarizeTasks } = require('../../src/lib/buildSnapshot');

test('summarizeTasks counts every status code, including ones with zero tasks', () => {
  const tasks = [
    { status: '0.backlog', category: 'A' },
    { status: '5.done', category: 'A' },
    { status: '5.done', category: 'B' }
  ];
  const s = summarizeTasks(tasks);
  assert.equal(s.total_tasks, 3);
  assert.equal(s.completed_tasks, 2);
  assert.equal(s.completion_rate, 66.67);
  assert.equal(s.by_status['0.backlog'], 1);
  assert.equal(s.by_status['1.in_analyst'], 0);
  assert.equal(s.by_status['5.done'], 2);
  assert.deepEqual(s.by_category, { A: 2, B: 1 });
});

test('summarizeTasks on an empty list has a 0 completion_rate, not NaN', () => {
  const s = summarizeTasks([]);
  assert.equal(s.total_tasks, 0);
  assert.equal(s.completion_rate, 0);
});

test('buildSnapshot scopes sprint_now/sprint_next to that sprint\'s own tasks', () => {
  const sprints = [
    { id: 1, code: 'S1', start_date: '2026-01-01', end_date: '2026-01-14' },
    { id: 2, code: 'S2', start_date: '2026-01-15', end_date: '2026-01-28' }
  ];
  const tasks = [
    { status: '5.done', category: 'A', sprint_id: 1 },
    { status: '0.backlog', category: 'A', sprint_id: 1 },
    { status: '0.backlog', category: 'B', sprint_id: 2 }
  ];
  const snap = buildSnapshot(tasks, sprints, '2026-01-05');
  assert.equal(snap.total_tasks, 3);
  assert.equal(snap.sprint_now.code, 'S1');
  assert.equal(snap.sprint_now.total_tasks, 2);
  assert.equal(snap.sprint_now.completed_tasks, 1);
  assert.equal(snap.sprint_next.code, 'S2');
  assert.equal(snap.sprint_next.total_tasks, 1);
});

test('buildSnapshot leaves sprint_now/sprint_next null when there is no such sprint', () => {
  const snap = buildSnapshot([], [], '2026-01-05');
  assert.equal(snap.sprint_now, null);
  assert.equal(snap.sprint_next, null);
});
