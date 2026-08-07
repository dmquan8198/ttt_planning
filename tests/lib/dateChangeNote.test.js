const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDateChangeNote } = require('../../src/lib/dateChangeNote');

test('returns null when neither date changed', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-06', due_date: '2026-07-17' };
  assert.equal(buildDateChangeNote(before, after), null);
});

test('a same-delta move on both ends reports a single "Dịch ngày" shift', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-15', due_date: '2026-07-26' };
  const note = buildDateChangeNote(before, after);
  assert.equal(note, 'Dịch ngày: 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)');
});

test('resizing only the start date reports just that change', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-10', due_date: '2026-07-17' };
  const note = buildDateChangeNote(before, after);
  assert.equal(note, 'Đổi ngày: bắt đầu 06/07/2026 → 10/07/2026 (+4 ngày)');
});

test('resizing only the due date reports just that change', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-06', due_date: '2026-07-12' };
  const note = buildDateChangeNote(before, after);
  assert.equal(note, 'Đổi ngày: kết thúc 17/07/2026 → 12/07/2026 (-5 ngày)');
});

test('both ends changed by different amounts reports both deltas', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-10', due_date: '2026-07-20' };
  const note = buildDateChangeNote(before, after);
  assert.equal(note, 'Đổi ngày: bắt đầu 06/07/2026 → 10/07/2026 (+4 ngày), kết thúc 17/07/2026 → 20/07/2026 (+3 ngày)');
});

test('an actor name is inserted right after the prefix, before the trailing delta', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-15', due_date: '2026-07-26' };
  const note = buildDateChangeNote(before, after, 'Quân');
  assert.equal(note, 'Dịch ngày (Quân): 06/07/2026–17/07/2026 → 15/07/2026–26/07/2026 (+9 ngày)');
});

test('a resize with an actor name still keeps the "(+N ngày)" anchored at the end', () => {
  const before = { start_date: '2026-07-06', due_date: '2026-07-17' };
  const after = { start_date: '2026-07-06', due_date: '2026-07-12' };
  const note = buildDateChangeNote(before, after, 'Quân');
  assert.equal(note, 'Đổi ngày (Quân): kết thúc 17/07/2026 → 12/07/2026 (-5 ngày)');
});
