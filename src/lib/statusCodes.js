const STATUS_CODES = ['0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'];

const STATUS_LABELS = {
  '0.backlog': 'Backlog',
  '1.ready_for_dev': 'Ready for Dev',
  '2.in_test': 'In Dev',
  '3.ready_for_staging': 'Done UAT',
  '4.done': 'Done'
};

const EXCEL_STATUS_MAP = {
  '0. backlog': '0.backlog',
  '1. Ready for Dev': '1.ready_for_dev',
  '2. inTest': '2.in_test',
  '3. Ready for Staging': '3.ready_for_staging',
  '4. Done': '4.done'
};

function mapExcelStatus(raw) {
  return EXCEL_STATUS_MAP[raw] || '0.backlog';
}

module.exports = { STATUS_CODES, STATUS_LABELS, mapExcelStatus, EXCEL_STATUS_MAP };
