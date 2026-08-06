const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS_CODES, STATUS_LABELS, mapExcelStatus } = require('../../src/lib/statusCodes');

test('STATUS_CODES has the 5 workflow stages in order', () => {
  assert.deepEqual(STATUS_CODES, [
    '0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'
  ]);
});

test('STATUS_LABELS has a human label for every code', () => {
  for (const code of STATUS_CODES) {
    assert.equal(typeof STATUS_LABELS[code], 'string');
  }
});

test('mapExcelStatus maps the exact strings used in the sheet', () => {
  assert.equal(mapExcelStatus('0. backlog'), '0.backlog');
  assert.equal(mapExcelStatus('1. Ready for Dev'), '1.ready_for_dev');
  assert.equal(mapExcelStatus('2. inTest'), '2.in_test');
  assert.equal(mapExcelStatus('3. Ready for Staging'), '3.ready_for_staging');
  assert.equal(mapExcelStatus('4. Done'), '4.done');
});

test('mapExcelStatus falls back to backlog for unknown/blank values', () => {
  assert.equal(mapExcelStatus(undefined), '0.backlog');
  assert.equal(mapExcelStatus(''), '0.backlog');
  assert.equal(mapExcelStatus('garbage'), '0.backlog');
});
