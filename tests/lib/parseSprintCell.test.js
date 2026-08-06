const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSprintCell } = require('../../src/lib/parseSprintCell');

test('parses a normal 2-digit-year-implied sprint range', () => {
  const result = parseSprintCell('S15 (03/08 - 14/08)');
  assert.deepEqual(result, { code: 'S15', start: '2026-08-03', end: '2026-08-14', legacy: false });
});

test('parses a sprint range that wraps into the explicit next year', () => {
  const result = parseSprintCell('S25 (21/12 - 01/01/27)');
  assert.deepEqual(result, { code: 'S25', start: '2026-12-21', end: '2027-01-01', legacy: false });
});

test('parses a legacy Date-object cell as a same-day, sprint-less range', () => {
  const result = parseSprintCell(new Date(2026, 5, 1)); // local-time construction, matches real SheetJS's cellDates:true output
  assert.deepEqual(result, { code: null, start: '2026-06-01', end: '2026-06-01', legacy: true });
});

test('returns null for an unrecognized string', () => {
  assert.equal(parseSprintCell('not a sprint'), null);
});
