// 'in_analyst' sits between backlog and ready_for_dev (business analysis as
// its own explicit stage) — every code from ready_for_dev on is shifted up
// one from what it used to be. 'in_test_uat' later inserted between in_test
// and ready_for_staging (dedicated "currently under UAT testing" stage,
// distinct from ready_for_staging which means UAT already passed) — every
// code from ready_for_staging on shifted up one again. See
// migrations/001_init.sql for the constraint/data migrations that renumber
// existing rows to match.
const STATUS_CODES = ['0.backlog', '1.in_analyst', '2.ready_for_dev', '3.in_test', '4.in_test_uat', '5.ready_for_staging', '6.done'];

const STATUS_LABELS = {
  '0.backlog': 'Backlog',
  '1.in_analyst': 'In Analyst',
  '2.ready_for_dev': 'Ready for Dev',
  '3.in_test': 'In Dev',
  '4.in_test_uat': 'inTest UAT',
  '5.ready_for_staging': 'Done UAT',
  '6.done': 'Done'
};

// which tasks column stamps "task entered this status at" — Backlog has no
// entry worth recording, so it's deliberately absent (a lookup miss = skip).
const STATUS_TIMESTAMP_COLUMN = {
  '1.in_analyst': 'in_analyst_at',
  '2.ready_for_dev': 'ready_for_dev_at',
  '3.in_test': 'in_test_at',
  '4.in_test_uat': 'in_test_uat_at',
  '5.ready_for_staging': 'ready_for_staging_at',
  '6.done': 'done_at'
};

const EXCEL_STATUS_MAP = {
  '0. backlog': '0.backlog',
  '1. Ready for Dev': '2.ready_for_dev',
  '2. inTest': '3.in_test',
  '3. Ready for Staging': '5.ready_for_staging',
  '4. Done': '6.done'
};

function mapExcelStatus(raw) {
  return EXCEL_STATUS_MAP[raw] || '0.backlog';
}

module.exports = { STATUS_CODES, STATUS_LABELS, STATUS_TIMESTAMP_COLUMN, mapExcelStatus, EXCEL_STATUS_MAP };
