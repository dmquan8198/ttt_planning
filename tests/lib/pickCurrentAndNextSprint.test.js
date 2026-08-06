const test = require('node:test');
const assert = require('node:assert/strict');
const { pickCurrentAndNextSprint } = require('../../src/lib/pickCurrentAndNextSprint');

const SPRINTS = [
  { code: 'S14', start_date: '2026-07-20', end_date: '2026-07-31' },
  { code: 'S15', start_date: '2026-08-03', end_date: '2026-08-14' },
  { code: 'S16', start_date: '2026-08-17', end_date: '2026-08-28' },
  { code: 'S17', start_date: '2026-08-31', end_date: '2026-09-11' }
];

test('picks the sprint containing today as current, the following one as next', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-08-06');
  assert.equal(current.code, 'S15');
  assert.equal(next.code, 'S16');
});

test('today on the exact boundary (start date) counts as current', () => {
  const { current } = pickCurrentAndNextSprint(SPRINTS, '2026-08-17');
  assert.equal(current.code, 'S16');
});

test('today before every sprint: no current, next is the first sprint', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-07-01');
  assert.equal(current, null);
  assert.equal(next.code, 'S14');
});

test('today in a gap between two sprints: no current, next is the upcoming one', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-08-01');
  assert.equal(current, null);
  assert.equal(next.code, 'S15');
});

test('today after every sprint: no current, no next', () => {
  const { current, next } = pickCurrentAndNextSprint(SPRINTS, '2026-12-01');
  assert.equal(current, null);
  assert.equal(next, null);
});

test('works when sprints are passed out of order', () => {
  const shuffled = [SPRINTS[2], SPRINTS[0], SPRINTS[3], SPRINTS[1]];
  const { current, next } = pickCurrentAndNextSprint(shuffled, '2026-08-06');
  assert.equal(current.code, 'S15');
  assert.equal(next.code, 'S16');
});
