const test = require('node:test');
const assert = require('node:assert/strict');
const { computePhaseRollup } = require('../../src/lib/phaseRollup');

function makeTasks(n, { analyst = 0, dev = 0, uat = 0 } = {}) {
  const tasks = [];
  for (let i = 0; i < n; i++) {
    tasks.push({
      done_analyst: i < analyst,
      done_dev: i < dev,
      done_uat: i < uat
    });
  }
  return tasks;
}

test('P1 rollup matches the sheet: 43/43 analyst, 43/43 dev, 39/43 uat, 4 days to 10/08', () => {
  const phase = { code: 'P1', name: 'Lived', target_date: '2026-08-10' };
  const tasks = makeTasks(43, { analyst: 43, dev: 43, uat: 39 });
  const rollup = computePhaseRollup(phase, tasks, '2026-08-06');
  assert.equal(rollup.total, 43);
  assert.equal(rollup.done_analyst, 43);
  assert.equal(rollup.done_dev, 43);
  assert.equal(rollup.done_uat, 39);
  assert.equal(rollup.pct_complete, 100);
  assert.equal(rollup.days_remaining, 4);
});

test('P2 rollup matches the sheet: 18/28 analyst = 64.3%, 26 days to 01/09', () => {
  const phase = { code: 'P2', name: 'Rollout', target_date: '2026-09-01' };
  const tasks = makeTasks(28, { analyst: 18, dev: 11, uat: 2 });
  const rollup = computePhaseRollup(phase, tasks, '2026-08-06');
  assert.equal(rollup.total, 28);
  assert.equal(rollup.done_analyst, 18);
  assert.equal(rollup.done_dev, 11);
  assert.equal(rollup.done_uat, 2);
  assert.equal(rollup.pct_complete, 64.3);
  assert.equal(rollup.days_remaining, 26);
});

test('phase with no tasks yet returns 0 total and null pct_complete', () => {
  const phase = { code: 'P4', name: 'Booming', target_date: '2027-01-01' };
  const rollup = computePhaseRollup(phase, [], '2026-08-06');
  assert.equal(rollup.total, 0);
  assert.equal(rollup.pct_complete, null);
  assert.equal(rollup.days_remaining, 148);
});
