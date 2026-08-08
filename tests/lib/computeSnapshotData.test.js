const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSnapshotData } = require('../../src/lib/computeSnapshotData');

const PHASE = { id: 1, code: 'P1', name: 'Lived', target_date: '2026-09-01' };

test('rolls up phase completion the same way /api/phases does', () => {
  const tasks = [
    { phase_id: 1, status: '4.done', due_date: '2026-07-01', done_analyst: true, done_dev: true, done_uat: true },
    { phase_id: 1, status: '0.backlog', due_date: '2026-08-20', done_analyst: false, done_dev: false, done_uat: false }
  ];
  const data = computeSnapshotData([PHASE], tasks, '2026-08-08');
  assert.equal(data.phases.length, 1);
  assert.equal(data.phases[0].total, 2);
  assert.equal(data.phases[0].pct_complete, 50); // (1+1+1)/(2*3) = 50%
});

test('risk_count only counts tasks overdue AND below the Ready-for-Staging threshold', () => {
  const tasks = [
    { phase_id: 1, status: '2.in_test', due_date: '2026-08-01', done_analyst: false, done_dev: false, done_uat: false }, // overdue, not done -> at risk
    { phase_id: 1, status: '3.ready_for_staging', due_date: '2026-08-01', done_analyst: true, done_dev: true, done_uat: true }, // overdue but already at/past threshold -> not at risk
    { phase_id: 1, status: '0.backlog', due_date: '2026-08-20', done_analyst: false, done_dev: false, done_uat: false } // not yet due -> not at risk
  ];
  const data = computeSnapshotData([PHASE], tasks, '2026-08-08');
  assert.equal(data.risk_count, 1);
});

test('due_soon_count counts tasks due within the next 7 days but not yet overdue', () => {
  const tasks = [
    { phase_id: 1, status: '0.backlog', due_date: '2026-08-08', done_analyst: false, done_dev: false, done_uat: false }, // due today -> due soon
    { phase_id: 1, status: '0.backlog', due_date: '2026-08-15', done_analyst: false, done_dev: false, done_uat: false }, // exactly 7 days out -> due soon
    { phase_id: 1, status: '0.backlog', due_date: '2026-08-16', done_analyst: false, done_dev: false, done_uat: false }, // 8 days out -> not yet
    { phase_id: 1, status: '0.backlog', due_date: '2026-08-01', done_analyst: false, done_dev: false, done_uat: false } // already overdue -> counted in risk, not due-soon
  ];
  const data = computeSnapshotData([PHASE], tasks, '2026-08-08');
  assert.equal(data.due_soon_count, 2);
  assert.equal(data.risk_count, 1);
});
