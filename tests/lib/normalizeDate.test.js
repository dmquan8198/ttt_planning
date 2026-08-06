const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDate } = require('../../src/lib/normalizeDate');

test('passes through an already-normalized string unchanged', () => {
  assert.equal(normalizeDate('2026-08-03'), '2026-08-03');
});

test('extracts YYYY-MM-DD from a UTC-midnight Date (matches pg-mem\'s representation)', () => {
  assert.equal(normalizeDate(new Date('2026-08-03T00:00:00.000Z')), '2026-08-03');
});

test('passes through null/undefined unchanged', () => {
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate(undefined), undefined);
});
