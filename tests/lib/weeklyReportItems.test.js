const test = require('node:test');
const assert = require('node:assert/strict');
const { describeTasks, groupThemes, parseNote, cut, daysBetween } = require('../../src/lib/weeklyReportItems');

const TODAY = '2026-10-11';
const ts = (iso) => `${iso}T05:00:00.000Z`;
const task = (o) => ({ id: 1, name: 'T', status: '4.in_test_uat', due_date: '2026-10-20', updated_at: ts('2026-10-01'), in_test_uat_at: ts('2026-10-01'), ...o });
const log = (task_id, note, day) => ({ task_id, note, created_at: ts(day) });
const one = (t, logs) => describeTasks({ tasks: [t], logs, today: TODAY }).get(t.id);

test('parseNote reads the team\'s "Status:" / "Next action:" lines and drops the " — actor" suffix', () => {
  const n = parseNote('Status: Done dev, VTS đã aware về scope test\nNext action: Team TTT gửi lại test case — Quân Minh');
  assert.equal(n.status, 'Done dev, VTS đã aware về scope test');
  assert.equal(n.next, 'Team TTT gửi lại test case');
  assert.equal(parseNote('Next action: - CRM gửi lại list').next, 'CRM gửi lại list', 'a leading list dash is dropped');
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

test('now/next come from the newest Status and Next action notes; an overdue item gets a blocker', () => {
  const d = one(task({ id: 1, due_date: '2026-10-09' }), [
    log(1, 'Status: Core done dev', '2026-10-05'),
    log(1, 'Status: QC đang test\nNext action: QC test xong 12.10', '2026-10-08')
  ]);
  assert.equal(d.now, 'QC đang test', 'newest status wins');
  assert.equal(d.next, 'QC test xong 12.10');
  assert.ok(d.blockers.includes('Quá hạn 2 ngày'));
});

test('no log → a plain default next step per stage and an empty "now"; nothing known means no blockers', () => {
  const d = one(task({ id: 2, status: '1.in_analyst', in_analyst_at: ts('2026-10-09') }), []);
  assert.equal(d.now, '');
  assert.equal(d.next, 'Chốt phân tích, chuyển dev');
  assert.deepEqual(d.blockers, []);
});

test('reschedules show the NET days moved with the reason; waiting on someone and silence are flagged', () => {
  const sac = one(task({ id: 3, status: '3.in_test', in_test_at: ts('2026-10-01') }), [
    log(3, 'Đổi ngày (An): kết thúc 09/10/2026 → 23/10/2026 (+14 ngày)', '2026-10-09'),
    log(3, 'Lý do dời ngày: Sacombank chưa hoàn thành — An', '2026-10-09'),
    log(3, 'Status: Phía Sacombank chưa phản hồi', '2026-10-10')
  ]);
  assert.ok(sac.blockers.some((b) => b.startsWith('Dời lịch +14 ngày: Sacombank chưa hoàn thành')));
  assert.ok(sac.blockers.length <= 2);
  const pulledBack = one(task({ id: 4 }), [log(4, 'Đổi ngày (An): kết thúc 23/10/2026 → 09/10/2026 (-14 ngày)', '2026-10-09'), log(4, 'Đổi ngày (An): kết thúc 09/10/2026 → 23/10/2026 (+14 ngày)', '2026-10-10')]);
  assert.ok(!pulledBack.blockers.some((b) => b.startsWith('Dời lịch')), 'moved out and back = no net slip');
  const waiting = one(task({ id: 5 }), [log(5, 'Status: PO Bank back lại timeline vào 07.10', '2026-10-10')]);
  assert.ok(waiting.blockers.includes('Đang chờ phản hồi bên liên quan'));
  const silent = one(task({ id: 6, status: '1.in_analyst', in_analyst_at: ts('2026-09-20'), due_date: '2026-12-01' }), []);
  assert.ok(silent.blockers.some((b) => /Chưa có cập nhật, đã 21 ngày/.test(b)));
  const quiet = one(task({ id: 7, status: '5.ready_for_staging', due_date: '2026-10-01' }), []);
  assert.deepEqual(quiet.blockers, [], 'a finished item is never "overdue"');
});

test('groupThemes: items sharing a "Prefix - suffix" prefix fold into one theme', () => {
  const items = ['Donation', 'VTS', 'QR'].map((s) => ({ name: `[SOF] Thanh toán bằng Túi - ${s}`, status: '4.in_test_uat' }));
  items.push({ name: 'Add tabbar', status: '4.in_test_uat' });
  const g = groupThemes(items);
  assert.equal(g[0].label, 'Thanh toán bằng Túi');
  assert.equal(g[0].count, 3);
  assert.equal(g[0].status, '4.in_test_uat');
  assert.equal(g.length, 2);
});

test('groupThemes: three or more items sharing a phrase become one theme named after it', () => {
  const names = ['Mở quỹ sinh lời', 'Nạp tiền vào quỹ sinh lời', 'Rút tiền khỏi quỹ sinh lời về ví', 'Bảo trì Túi New'];
  const g = groupThemes(names.map((name) => ({ name, status: '1.in_analyst' })));
  assert.equal(g[0].label, 'Quỹ sinh lời');
  assert.equal(g[0].count, 3);
  assert.ok(g.some((x) => x.label === 'Bảo trì Túi New' && x.count === 1), 'the odd one out keeps its own line');
});

test('groupThemes: every item ends up in exactly one theme', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ name: i % 2 ? `Luồng A - x${i}` : `Việc riêng ${i}`, status: '0.backlog' }));
  const g = groupThemes(items);
  assert.equal(g.reduce((a, x) => a + x.count, 0), 9);
  assert.equal(new Set(g.flatMap((x) => x.tasks)).size, 9);
});
