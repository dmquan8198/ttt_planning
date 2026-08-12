const test = require('node:test');
const assert = require('node:assert/strict');
const { computePhaseRollup } = require('../../src/lib/phaseRollup');

// each count is cumulative by status, not an independent flag: a task at
// '4.done' counts toward done_analyst and done_dev_qc too, same as it would
// have under the old done_analyst/done_dev/done_uat boolean flags (each
// stayed true once set, regardless of later Kanban status).
function makeTasksByStatus(counts) {
  const tasks = [];
  Object.keys(counts).forEach((status) => {
    for (let i = 0; i < counts[status]; i++) tasks.push({ status });
  });
  return tasks;
}

test('P1 rollup: cumulative funnel counts and headline % (Done UAT / total)', () => {
  const phase = { code: 'P1', name: 'Lived', target_date: '2026-08-10' };
  // 39 fully done, 4 at Done UAT, 0 earlier — everyone has at least
  // reached Ready for Dev and Done UAT, only 39/43 have gone all the way live.
  const tasks = makeTasksByStatus({ '3.ready_for_staging': 4, '4.done': 39 });
  const rollup = computePhaseRollup(phase, tasks, '2026-08-06');
  assert.equal(rollup.total, 43);
  assert.equal(rollup.done_analyst, 43);
  assert.equal(rollup.done_dev_qc, 43);
  assert.equal(rollup.golive, 39);
  assert.equal(rollup.pct_complete, 100); // done_dev_qc(43)/total(43)
  assert.equal(rollup.days_remaining, 4);
});

test('P2 rollup: a mixed spread across every status', () => {
  const phase = { code: 'P2', name: 'Rollout', target_date: '2026-09-01' };
  // 10 backlog, 8 ready for dev, 8 in dev, 8 done UAT, 2 done — total 36
  const tasks = makeTasksByStatus({
    '0.backlog': 10,
    '1.ready_for_dev': 8,
    '2.in_test': 8,
    '3.ready_for_staging': 8,
    '4.done': 2
  });
  const rollup = computePhaseRollup(phase, tasks, '2026-08-06');
  assert.equal(rollup.total, 36);
  assert.equal(rollup.done_analyst, 26); // 8+8+8+2, everyone past backlog
  assert.equal(rollup.done_dev_qc, 10); // 8+2, reached Done UAT or further
  assert.equal(rollup.golive, 2);
  assert.equal(rollup.pct_complete, 27.8); // 10/36 = 27.77...% rounded to 1dp
  assert.equal(rollup.days_remaining, 26);
});

test('phase with no tasks yet returns 0 total and null pct_complete', () => {
  const phase = { code: 'P4', name: 'Booming', target_date: '2027-01-01' };
  const rollup = computePhaseRollup(phase, [], '2026-08-06');
  assert.equal(rollup.total, 0);
  assert.equal(rollup.done_analyst, 0);
  assert.equal(rollup.done_dev_qc, 0);
  assert.equal(rollup.golive, 0);
  assert.equal(rollup.pct_complete, null);
  assert.equal(rollup.days_remaining, 148);
});
