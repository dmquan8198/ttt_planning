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
