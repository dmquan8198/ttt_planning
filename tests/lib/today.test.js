const test = require('node:test');
const assert = require('node:assert/strict');
const { getTodayVN } = require('../../src/lib/today');

test('getTodayVN returns a YYYY-MM-DD shaped string', () => {
  assert.match(getTodayVN(), /^\d{4}-\d{2}-\d{2}$/);
});

test('getTodayVN shifts a near-midnight UTC time to the Vietnam calendar date', () => {
  const originalNow = Date.now;
  // Jan 1, 20:00 UTC = Jan 2, 03:00 Vietnam (UTC+7) — crosses the day boundary
  Date.now = () => Date.UTC(2026, 0, 1, 20, 0, 0);
  try {
    assert.equal(getTodayVN(), '2026-01-02');
  } finally {
    Date.now = originalNow;
  }
});
