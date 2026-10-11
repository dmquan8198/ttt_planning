const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFocusItems, parseNote, cut, daysBetween } = require('../../src/lib/weeklyReportItems');

const TODAY = '2026-10-11';
const ts = (iso) => `${iso}T05:00:00.000Z`;
const task = (o) => ({ id: 1, name: 'T', category: 'TTT New - Foundation', status: '4.in_test_uat', due_date: '2026-10-20', sprint: 'S19', sprint_id: 1, pic: 'an', updated_at: ts('2026-10-01'), in_test_uat_at: ts('2026-10-01'), ...o });
const log = (task_id, note, day) => ({ task_id, note, created_at: ts(day) });

test('parseNote reads the team\'s "Status:" / "Next action:" lines and drops the " — actor" suffix', () => {
  const n = parseNote('Status: Done dev, VTS đã aware về scope test\nNext action: Team TTT gửi lại test case — Quân Minh');
  assert.equal(n.status, 'Done dev, VTS đã aware về scope test');
  assert.equal(n.next, 'Team TTT gửi lại test case');
});

test('parseNote reads reschedule entries and their reason', () => {
  assert.equal(parseNote('Đổi ngày (Quân Minh): 12/10/2026–23/10/2026 → 26/10/2026–06/11/2026 (+14 ngày)').pushDays, 14);
  assert.equal(parseNote('Đổi ngày (Quân Minh): bắt đầu 12/10/2026 → 28/09/2026 (-14 ngày)').pushDays, -14);
  assert.equal(parseNote('Lý do dời ngày: Chưa test kịp — Quân Minh').reason, 'Chưa test kịp');
  assert.equal(parseNote('Cập nhật thường').status, null);
});

test('cut() shortens at a word boundary with an ellipsis and leaves short text alone', () => {
  assert.equal(cut('ngắn', 20), 'ngắn');
  const c = cut('Chỉ định đầu mối UAT và chốt lịch theo ngày', 20);
  assert.ok(c.endsWith('…') && c.length <= 20);
  assert.ok(!/\s…$/.test(c));
  assert.equal(daysBetween('2026-10-09', '2026-10-11'), 2);
});

test('an overdue item gets a blocker, the latest Status/Next action, and its sprint/PIC/due', () => {
  const { items } = buildFocusItems({
    tasks: [task({ id: 1, name: 'Auto receive', due_date: '2026-10-09' })],
    logs: [log(1, 'Status: Core done dev', '2026-10-05'), log(1, 'Status: QC đang test\nNext action: QC test xong 12.10', '2026-10-08')],
    today: TODAY, focusSprintIds: [1]
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].now, 'QC đang test', 'newest status wins');
  assert.equal(items[0].next, 'QC test xong 12.10');
  assert.ok(items[0].blockers.includes('Quá hạn 2 ngày'));
  assert.equal(items[0].sprint, 'S19');
});

test('rescheduling shows net days moved with the reason; waiting on someone is flagged; no log falls back to the stage step', () => {
  const { items } = buildFocusItems({
    tasks: [task({ id: 2, name: 'Sacombank', status: '3.in_test', in_test_at: ts('2026-10-01') }), task({ id: 3, name: 'Silent', status: '1.in_analyst', in_analyst_at: ts('2026-09-20'), due_date: '2026-10-09' })],
    logs: [
      log(2, 'Đổi ngày (An): kết thúc 09/10/2026 → 23/10/2026 (+14 ngày)', '2026-10-09'),
      log(2, 'Lý do dời ngày: Sacombank chưa hoàn thành — An', '2026-10-09'),
      log(2, 'Status: Phía Sacombank chưa phản hồi', '2026-10-10')
    ],
    today: TODAY, focusSprintIds: [1]
  });
  const sac = items.find((i) => i.name === 'Sacombank');
  assert.ok(sac.blockers.some((b) => b.startsWith('Dời lịch +14 ngày: Sacombank chưa hoàn thành')));
  assert.ok(sac.blockers.length <= 2);
  const silent = items.find((i) => i.name === 'Silent');
  assert.equal(silent.next, 'Chốt phân tích → Ready for Dev', 'default next step by stage');
  assert.match(silent.now, /ngày ở In Analyst/);
  assert.ok(silent.blockers.some((b) => /Chưa có log, 21 ngày/.test(b)));
});

test('done / Done UAT items and quiet, on-track items are left out', () => {
  const { items } = buildFocusItems({
    tasks: [task({ id: 4, status: '6.done', due_date: '2026-10-01' }), task({ id: 5, status: '5.ready_for_staging', due_date: '2026-10-01' }), task({ id: 6, due_date: '2026-12-01', sprint_id: 9 })],
    logs: [], today: TODAY
  });
  assert.deepEqual(items, []);
});

test('siblings with the same prefix and stage fold into one line that shows each blocker kind once', () => {
  const tasks = ['Donation', 'VTS', 'QR'].map((p, i) => task({ id: 10 + i, name: `[SOF] Thanh toán bằng Túi - ${p}`, due_date: '2026-10-09' }));
  const { items } = buildFocusItems({ tasks, logs: [log(10, 'Status: Done dev\nNext action: gửi lại test case', '2026-10-08')], today: TODAY, focusSprintIds: [1] });
  assert.equal(items.length, 1);
  assert.equal(items[0].name, '[SOF] Thanh toán bằng Túi');
  assert.equal(items[0].count, 3);
  assert.equal(items[0].blockers.filter((b) => b.startsWith('Quá hạn')).length, 1);
});

test('the list is capped, varied (max 3 per stage first) and reports how many more there are', () => {
  const tasks = [];
  for (let i = 0; i < 6; i += 1) tasks.push(task({ id: 20 + i, name: `UAT ${i}`, due_date: '2026-10-09' }));
  tasks.push(task({ id: 40, name: 'Dev one', status: '3.in_test', in_test_at: ts('2026-10-01'), due_date: '2026-10-09' }));
  const { items, more } = buildFocusItems({ tasks, logs: [], today: TODAY, focusSprintIds: [1], limit: 4 });
  assert.equal(items.length, 4);
  assert.ok(items.some((i) => i.name === 'Dev one'), 'a different stage makes the cut over the 4th UAT item');
  assert.equal(more, 3);
});
