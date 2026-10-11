const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { advance, lineHeight, layout, FONT_FACE } = require('../../src/lib/deckText');
const { buildWeeklyDeck } = require('../../src/lib/weeklyReportDeck');

// The deck's text boxes are sized from real font metrics (Momo Trust Display),
// not drawn as fixed frames: these tests pin the measuring/wrapping the layout relies on.

test('advance() measures with the real font: longer text is wider, bigger type is wider, Vietnamese glyphs exist', () => {
  assert.ok(advance('Báo cáo tuần', 10) > advance('Báo', 10));
  assert.ok(advance('Báo', 20) > advance('Báo', 10) * 1.9);
  assert.ok(advance('ẳ', 10) > 0 && advance('đ', 10) > 0);
  assert.equal(advance('', 10), 0);
});

test('layout() wraps on words within maxW and the box hugs the longest line', () => {
  const text = 'Chỉ định đầu mối UAT, chốt lịch theo ngày và xử lý trước các việc trễ nhất';
  const maxW = 1.6;
  const lay = layout(text, { pt: 9, color: '000000', maxW });
  assert.ok(lay.lines.length > 1);
  lay.lines.forEach((l) => assert.ok(l.w <= maxW + 1e-9, `line wider than maxW: ${l.w}`));
  assert.equal(lay.w, Math.max(...lay.lines.map((l) => l.w)), 'hugs the widest line');
  assert.ok(Math.abs(lay.h - lay.lines.length * lineHeight(9)) < 1e-9);
  assert.equal(lay.lines.map((l) => l.runs.map((r) => r.text).join('')).join(' '), text, 'no words lost or duplicated');
});

test('layout() honours explicit line breaks, styled runs, and never splits a word that is too long', () => {
  const two = layout('a\nb', { pt: 10, color: '000000' });
  assert.equal(two.lines.length, 2);
  const runs = layout([{ text: 'Done ', color: 'A50064' }, { text: 'tuần này' }], { pt: 10, color: '262626' });
  assert.deepEqual(runs.lines[0].runs.map((r) => r.color), ['A50064', '262626']);
  const long = layout('Siêucực dài', { pt: 10, color: '000000', maxW: 0.2 });
  assert.equal(long.lines.length, 2);
  assert.equal(long.lines[0].runs[0].text, 'Siêucực');
});

test('the deck uses only Momo Trust Display, a single weight, and hugging text boxes', async () => {
  const report = {
    today: '2026-10-11', weekAgo: '2026-10-04',
    totals: { total: 3, done: 1, byStatus: { 'Done': 1, 'inTest UAT': 1, 'In Analyst': 1 }, byCategory: { 'TTT New - Foundation': { total: 3, done: 1, overdue: 1 } } },
    prevSnapshot: null, latestSnapshot: null,
    categoryStatus: { 'TTT New - Foundation': { 'Done': 1, 'inTest UAT': 1, 'In Analyst': 1 } },
    inUatBySprint: { S1: 1 },
    sprint: { ended: true, code: 'S1', start: '2026-09-28', end: '2026-10-09', byStatus: { 'Done': 1, 'inTest UAT': 1 }, total: 2, done: 1, overdue: 1, not_done: 1, days_left: -2 },
    nextSprint: { code: 'S2', start: '2026-10-12', end: '2026-10-23', total: 1, byStatus: { 'In Analyst': 1 } },
    newTasksThisWeek: [], movedThisWeek: [], doneThisWeek: [],
    focus: { items: [{ name: 'x', count: 1, statusLabel: 'inTest UAT', sprint: 'S1', pic: 'an', due: '2026-10-09', now: 'QC đang test', next: 'Chốt UAT', blockers: ['Quá hạn 2 ngày'] }], more: 0 },
    risks: { overdueByDone: 1, overdue: [{ id: 2, name: 'x', category: 'TTT New - Foundation', status: 'inTest UAT', sprint: 'S1', due: '2026-10-09', days_late: 2 }], dueNext7: [], subOverdue: 0 }
  };
  const { buffer, warnings } = await buildWeeklyDeck(report);
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slides.length, 2);
  const xml = (await Promise.all(slides.map((n) => zip.file(n).async('string')))).join('');
  const faces = new Set([...xml.matchAll(/<a:latin typeface="([^"]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...faces], [FONT_FACE]);
  assert.ok(!/ b="1"/.test(xml), 'single-weight font: no bold runs');
  assert.ok(/wrap="none"/.test(xml), 'text keeps the exact line breaks we measured');
  assert.deepEqual(warnings, [], 'nothing runs past the slide on a small report');
});
