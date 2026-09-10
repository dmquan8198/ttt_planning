const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS_CODES, STATUS_LABELS, STATUS_TIMESTAMP_COLUMN, mapExcelStatus } = require('../../src/lib/statusCodes');

test('STATUS_CODES has the 6 workflow stages in order', () => {
  assert.deepEqual(STATUS_CODES, [
    '0.backlog', '1.in_analyst', '2.ready_for_dev', '3.in_test', '4.ready_for_staging', '5.done'
  ]);
});

test('STATUS_LABELS has a human label for every code', () => {
  for (const code of STATUS_CODES) {
    assert.equal(typeof STATUS_LABELS[code], 'string');
  }
});

test('STATUS_TIMESTAMP_COLUMN maps every non-Backlog status to an *_at column', () => {
  assert.equal(STATUS_TIMESTAMP_COLUMN['0.backlog'], undefined);
  assert.deepEqual(STATUS_TIMESTAMP_COLUMN, {
    '1.in_analyst': 'in_analyst_at',
    '2.ready_for_dev': 'ready_for_dev_at',
    '3.in_test': 'in_test_at',
    '4.ready_for_staging': 'ready_for_staging_at',
    '5.done': 'done_at'
  });
});

test('mapExcelStatus maps the exact strings used in the sheet', () => {
  assert.equal(mapExcelStatus('0. backlog'), '0.backlog');
  assert.equal(mapExcelStatus('1. Ready for Dev'), '2.ready_for_dev');
  assert.equal(mapExcelStatus('2. inTest'), '3.in_test');
  assert.equal(mapExcelStatus('3. Ready for Staging'), '4.ready_for_staging');
  assert.equal(mapExcelStatus('4. Done'), '5.done');
});

test('mapExcelStatus falls back to backlog for unknown/blank values', () => {
  assert.equal(mapExcelStatus(undefined), '0.backlog');
  assert.equal(mapExcelStatus(''), '0.backlog');
  assert.equal(mapExcelStatus('garbage'), '0.backlog');
});
