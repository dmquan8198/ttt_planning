const test = require('node:test');
const assert = require('node:assert/strict');
const { SUBTASK_STATUSES, SUBTASK_STATUS_LABELS } = require('../../src/lib/subtaskStatuses');

test('SUBTASK_STATUSES has the 3 stages in order', () => {
  assert.deepEqual(SUBTASK_STATUSES, ['todo', 'wip', 'done']);
});

test('SUBTASK_STATUS_LABELS has a human label for every code', () => {
  for (const code of SUBTASK_STATUSES) {
    assert.equal(typeof SUBTASK_STATUS_LABELS[code], 'string');
  }
});
