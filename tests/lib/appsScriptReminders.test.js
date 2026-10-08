const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildReminders } = require('../../src/lib/buildReminders');

// docs/email-reminders/Code.gs runs on Google's servers, where nothing can be
// unit-tested directly. This loads the file into a sandbox with fake Apps
// Script services (PropertiesService, UrlFetchApp, MailApp, ...) and feeds it
// the REAL output of buildReminders, so a typo in the script or a mismatch
// with the API's response shape shows up here rather than on the first
// 8 a.m. run.

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'email-reminders', 'Code.gs'), 'utf8');

// `now` (ISO, any offset) fixes the script's clock; the script's timezone is Asia/Ho_Chi_Minh (UTC+7).
// `props` is copied, so setProperty (LAST_SENT, ...) never leaks into another test.
function load({ props, responses, owner = 'me@corp.com', now, lockFree = true, existingTriggers = [] }) {
  const mails = [];
  const logs = [];
  const fetched = [];
  const triggers = [];
  const deleted = [];
  const store = { ...props };
  const queue = [...responses];
  const clock = { ms: now ? new Date(now).getTime() : Date.now() };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(clock.ms); else super(...args); }
    static now() { return clock.ms; }
  }
  const vnIso = (d) => new RealDate(d.getTime() + 7 * 3600 * 1000).toISOString(); // Asia/Ho_Chi_Minh
  const sandbox = {
    Date: FakeDate,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); }
    }) },
    UrlFetchApp: {
      fetch: (url, options) => {
        fetched.push({ url, options });
        const r = queue.length > 1 ? queue.shift() : queue[0];
        return { getResponseCode: () => r.code, getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
      }
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => owner }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { sleep: () => {}, formatDate: (d, tz, fmt) => (fmt === 'HH:mm' ? vnIso(d).slice(11, 16) : vnIso(d).slice(0, 10)) },
    LockService: { getScriptLock: () => ({ tryLock: () => lockFree, releaseLock: () => {} }) },
    Logger: { log: (m) => logs.push(m) },
    ScriptApp: {
      getProjectTriggers: () => existingTriggers,
      deleteTrigger: (t) => deleted.push(t.getHandlerFunction()),
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push({ fn, everyMinutes: n }) }) }) })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, mails, logs, fetched, triggers, deleted, clock, props: store };
}

const PROPS = { APP_URL: 'https://app.example.com/', REMINDER_SECRET: 's3cret', REPORT_TO: 'ttt-team@corp.com' };

function realResponse() {
  const sprints = [{ id: 1, code: 'S19', start_date: '2026-09-28', end_date: '2026-10-09' }];
  return buildReminders({
    today: '2026-10-07', // a Wednesday
    sprints,
    tasks: [
      { id: 1, name: 'Task <due> tomorrow', category: 'TTT New - Internal Features', status: '3.in_test', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-08', sprint_id: 1, pic: 'An' },
      { id: 2, name: 'Parent', category: 'TTT New - Convert & Scale', status: '2.ready_for_dev', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-30', sprint_id: 1, pic: null },
      { id: 3, name: 'Owner-less task', category: 'TTT New - Internal Features', status: '1.in_analyst', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-08', sprint_id: 1, pic: null }
    ],
    subtasks: [{ id: 10, task_id: 2, name: 'Sub Monday', status: 'wip', due_date: '2026-10-12', pic: 'Bình' }]
  });
}

test('sendReport sends ONE report email to the group address — nobody else gets anything', () => {
  const { sandbox, mails, fetched } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();

  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].url, 'https://app.example.com/api/reminders/due?days=1%2C3', 'trailing slash on APP_URL is tolerated');
  assert.equal(fetched[0].options.headers['X-Reminder-Secret'], 's3cret');

  assert.equal(mails.length, 1, 'one email in total, not one per person / task / subtask');
  assert.equal(mails[0].to, 'ttt-team@corp.com');
  assert.equal(mails[0].subject, '[TTT] Báo cáo việc sắp đến hạn — 07/10/2026 (3 việc)');
});

// the report is one small <table>; read it back as rows of cell texts (and keep each row's raw html for style checks)
function rowsOf(html) {
  const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => ({
    html: m[0],
    cells: [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]))
  }));
}

test('the report nests Analyst/Development → Sprint → Category, one row per item, no statistics tiles', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const html = mails[0].htmlBody;
  const rows = rowsOf(html);

  assert.doesNotMatch(html, /Tổng số việc|nghiệp vụ · \d+ subtask|Chưa có PIC/);
  assert.ok(html.includes('Task &lt;due&gt; tomorrow'), 'names are HTML-escaped');
  assert.ok(!html.includes('<due>'));

  assert.deepEqual(rows.map((r) => r.cells[0]), [
    'Việc sắp đến hạn · Thứ Tư, 07/10/2026 · 3 việc',          // title: weekday + date + the one count
    'Analyst · 2 việc',                                          // 1. group by Analyst / Development
    'S19 · 28/09 – 09/10',                                       // 2. sprint, with its dates
    'TTT New - Internal Features',                               // 3. category
    'Owner-less task',
    'TTT New - Convert & Scale',
    'Parent',
    '↳ Sub Monday',
    'Development · 1 việc',
    'S19 · 28/09 – 09/10',
    'TTT New - Internal Features',
    'Task <due> tomorrow',
    'Mở hệ thống · Hạn: ngày hết hạn · số ngày làm việc còn lại (đỏ = còn 1 ngày) · — = chưa có PIC'
  ], 'every item is exactly one row');
});

test('each item row reads name | PIC | status | due date + days left; a missing PIC is a dash; red means one working day left', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const rows = rowsOf(mails[0].htmlBody);
  const byName = (n) => rows.find((r) => r.cells[0].replace('↳ ', '') === n);

  assert.deepEqual(byName('Task <due> tomorrow').cells, ['Task <due> tomorrow', 'An', 'In Dev', '08/10 · còn 1 ngày']);
  assert.deepEqual(byName('Owner-less task').cells, ['Owner-less task', '—', 'In Analyst', '08/10 · còn 1 ngày']);
  assert.deepEqual(byName('Sub Monday').cells, ['↳ Sub Monday', 'Bình', 'WIP', '12/10 · còn 3 ngày'], 'no sprint or parent name repeated on a subtask');
  assert.match(byName('Task <due> tomorrow').html, /color:#c0392b[^>]*>08\/10 · còn 1 ngày/, 'one working day left is red');
  assert.doesNotMatch(byName('Sub Monday').html, /color:#c0392b/, 'three days left is not');
});

test('a subtask\'s status (TODO/WIP/Done) looks different from a task status, so the two are not read as the same level', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const rows = rowsOf(mails[0].htmlBody);
  const statusCellHtml = (r) => r.html.match(/<td[^>]*>([\s\S]*?)<\/td>/g)[2];
  const task = rows.find((r) => r.cells[0] === 'Task <due> tomorrow');
  const sub = rows.find((r) => r.cells[0] === '↳ Sub Monday');
  assert.doesNotMatch(statusCellHtml(task), /border-radius|margin-left/, 'a task status is plain text');
  assert.match(statusCellHtml(sub), /border:1px solid[^>]*border-radius:9px[^>]*>WIP</, 'a subtask status is a small outlined pill…');
  assert.match(statusCellHtml(sub), /margin-left:14px/, '…indented under its parent');
});

test('the two groups follow the task status: Analyst = Backlog, In Analyst, Ready for Dev; Development = In Dev, inTest UAT, Done UAT, Done', () => {
  const { sandbox } = load({ props: PROPS, responses: [{ code: 200, body: {} }] });
  const item = (status, i) => ({ kind: 'task', id: i, task_id: i, name: 'T' + i, task_name: 'T' + i, category: 'C', task_status: status, sprint_code: 'S1', status, due_date: '2026-10-08', pic: null, working_days_left: 1 });
  const statuses = ['0.backlog', '1.in_analyst', '2.ready_for_dev', '3.in_test', '4.in_test_uat', '5.ready_for_staging', '6.done'];
  const groups = JSON.parse(JSON.stringify(sandbox.groupReport_(statuses.map(item))));
  const namesIn = (key) => groups.find((g) => g.key === key).sprints[0].cats[0].tasks.map((t) => t.task_name);
  assert.deepEqual(namesIn('analyst'), ['T0', 'T1', 'T2'], 'Backlog, In Analyst, Ready for Dev');
  assert.deepEqual(namesIn('dev'), ['T3', 'T4', 'T5', 'T6'], 'In Dev, inTest UAT, Done UAT, Done');
  assert.deepEqual(groups.map((g) => g.label), ['Analyst', 'Development'], 'Analyst first');
  // a group with nothing in it is not shown
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.groupReport_([item('3.in_test', 9)]))).map((g) => g.label), ['Development']);
});

test('inside a group: sprints in numeric order (no sprint last), then categories in the app order (others after, A–Z)', () => {
  const { sandbox } = load({ props: PROPS, responses: [{ code: 200, body: {} }] });
  const item = (id, category, sprint) => ({ kind: 'task', id, task_id: id, name: 'T' + id, task_name: 'T' + id, category, task_status: '3.in_test', sprint_code: sprint, status: '3.in_test', due_date: '2026-10-08', pic: null, working_days_left: 1 });
  const dev = JSON.parse(JSON.stringify(sandbox.groupReport_([
    item(1, 'Zeta team', 'S10'),
    item(2, 'TTT New - Convert & Scale', 'S10'),
    item(3, 'TTT New - Convert & Scale', 'S9'),
    item(4, 'TTT New - Product Foundation', 'S10'),
    item(5, 'Alpha team', 'S10'),
    item(6, 'TTT New - Convert & Scale', null),
    item(7, 'TTT New - Internal Features', 'S11')
  ])))[0];
  assert.deepEqual(dev.sprints.map((s) => s.label), ['S9', 'S10', 'S11', 'Chưa gán sprint'], 'S9 before S10 (numeric, not alphabetical)');
  assert.deepEqual(dev.sprints[1].cats.map((c) => c.name), ['TTT New - Product Foundation', 'TTT New - Convert & Scale', 'Alpha team', 'Zeta team']);
});

test('a subtask sits under its parent, filed by the PARENT\'s status/category; with only the subtask due, the parent is a plain dimmed heading row', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const html = mails[0].htmlBody;
  const rows = rowsOf(html);

  assert.doesNotMatch(html, /Thuộc:/);
  assert.equal(html.match(/Parent/g).length, 1, 'the parent is named once');
  assert.equal(html.match(/Sub Monday/g).length, 1, 'each item appears once');
  const iParent = rows.findIndex((r) => r.cells[0] === 'Parent');
  assert.equal(rows[iParent + 1].cells[0], '↳ Sub Monday', 'the subtask follows its parent immediately');
  // Parent is "Ready for Dev" -> Analyst, even though its subtask's own status is WIP
  assert.ok(rows.findIndex((r) => r.cells[0].startsWith('Analyst')) < iParent && iParent < rows.findIndex((r) => r.cells[0].startsWith('Development')));
  assert.deepEqual(rows[iParent].cells, ['Parent', '', '', ''], 'the parent is not due itself: just a name');
  assert.doesNotMatch(rows[iParent].html, /font-weight:600/, 'and not emphasised');
});

test('when a task AND its subtask are due the same day: parent row (bold) then the nested subtask', () => {
  const sprints = [{ id: 1, code: 'S19', start_date: '2026-09-28', end_date: '2026-10-09' }];
  const body = buildReminders({
    today: '2026-10-07', sprints,
    tasks: [{ id: 1, name: 'Whole task', category: 'Cat', status: '3.in_test', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-08', sprint_id: 1, pic: 'An' }],
    subtasks: [{ id: 10, task_id: 1, name: 'Its subtask', status: 'todo', due_date: '2026-10-08', pic: 'Bình' }]
  });
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body }] });
  sandbox.sendReport();
  const rows = rowsOf(mails[0].htmlBody);
  const iTask = rows.findIndex((r) => r.cells[0] === 'Whole task');
  assert.deepEqual(rows[iTask].cells, ['Whole task', 'An', 'In Dev', '08/10 · còn 1 ngày']);
  assert.match(rows[iTask].html, /font-weight:600/, 'the due task itself is emphasised');
  assert.deepEqual(rows[iTask + 1].cells, ['↳ Its subtask', 'Bình', 'TODO', '08/10 · còn 1 ngày']);
  assert.equal(mails[0].htmlBody.match(/S19/g).length, 1, 'the sprint is a heading, not repeated on rows');
});

test('the email also has a plain-text version in the same shape', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const text = mails[0].body;
  assert.match(text, /^VIỆC SẮP ĐẾN HẠN — Thứ Tư, 07\/10\/2026 · 3 việc/);
  assert.ok(text.includes('== ANALYST (2 việc) ==\nS19 · 28/09 – 09/10\n  [TTT New - Internal Features]\n  - Owner-less task  (chưa có PIC · In Analyst · 08/10 · còn 1 ngày)'));
  assert.ok(text.includes('  [TTT New - Convert & Scale]\n  - Parent\n      ↳ Sub Monday  (Bình · subtask WIP · 12/10 · còn 3 ngày)'));
  assert.ok(text.includes('== DEVELOPMENT (1 việc) ==\nS19 · 28/09 – 09/10\n  [TTT New - Internal Features]\n  - Task <due> tomorrow  (An · In Dev · 08/10 · còn 1 ngày)'));
  assert.ok(text.indexOf('== ANALYST') < text.indexOf('== DEVELOPMENT'));
  assert.match(text, /Mở hệ thống: https:\/\/app\.example\.com\/?$/);
});

test('REPORT_TO may list several addresses', () => {
  const { sandbox, mails } = load({ props: { ...PROPS, REPORT_TO: 'a@corp.com, b@corp.com' }, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'a@corp.com, b@corp.com');
});

test('sendReportToMeOnly mails only the script owner, never the group', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReportToMeOnly();
  assert.deepEqual(mails.map((m) => m.to), ['me@corp.com']);
});

test('previewReport sends nothing but logs what it would send', () => {
  const { sandbox, mails, logs } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.previewReport();
  assert.equal(mails.length, 0);
  assert.ok(logs.some((l) => l.includes('[xem trước] → ttt-team@corp.com')));
});

test('nothing due (or a weekend) sends no email at all', () => {
  const empty = { today: '2026-10-10', windows: [1, 3], weekend: true, items: [] };
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: empty }] });
  sandbox.sendReport();
  assert.equal(mails.length, 0);
});

test('a sleeping server (503) is retried; a bad secret (401) fails immediately with a clear message', () => {
  const ok = load({ props: PROPS, responses: [{ code: 503, body: 'waking up' }, { code: 502, body: '' }, { code: 200, body: realResponse() }] });
  ok.sandbox.sendReport();
  assert.equal(ok.fetched.length, 3);
  assert.equal(ok.mails.length, 1);

  const bad = load({ props: PROPS, responses: [{ code: 401, body: { error: 'Không có quyền' } }] });
  assert.throws(() => bad.sandbox.sendReport(), /401/);
  assert.equal(bad.fetched.length, 1, 'no point retrying a wrong secret');
  assert.equal(bad.mails.length, 0);
});

test('missing configuration fails loudly instead of silently sending nothing', () => {
  const noSecret = load({ props: { APP_URL: 'https://app.example.com', REPORT_TO: 'g@corp.com' }, responses: [{ code: 200, body: {} }] });
  assert.throws(() => noSecret.sandbox.sendReport(), /APP_URL|REMINDER_SECRET/);

  const noGroup = load({ props: { APP_URL: 'https://app.example.com', REMINDER_SECRET: 'x' }, responses: [{ code: 200, body: realResponse() }] });
  assert.throws(() => noGroup.sandbox.sendReport(), /REPORT_TO/);
  assert.equal(noGroup.fetched.length, 0, 'does not even call the app without a recipient');
});

test('the TODAY property (for trying it out) is passed through to the API', () => {
  const { sandbox, fetched } = load({ props: { ...PROPS, TODAY: '2026-10-07' }, responses: [{ code: 200, body: realResponse() }] });
  sandbox.previewReport();
  assert.ok(fetched[0].url.endsWith('&today=2026-10-07'));
});


test('sendSampleReportToMeOnly mails the owner a clearly-fake report without calling the app or needing any property', () => {
  const { sandbox, mails, fetched } = load({ props: {}, responses: [{ code: 500, body: 'must not be called' }] });
  sandbox.sendSampleReportToMeOnly();
  assert.equal(fetched.length, 0, 'no network call');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'me@corp.com');
  assert.match(mails[0].subject, /^\[TTT\] Báo cáo việc sắp đến hạn — \d{2}\/\d{2}\/\d{4} \(5 việc\)$/);
  assert.ok(mails[0].htmlBody.includes('[Mẫu] Nạp tiền vào Túi qua ví liên kết'));
  const heads = rowsOf(mails[0].htmlBody).map((r) => r.cells[0]);
  assert.ok(heads.includes('Analyst · 2 việc') && heads.includes('Development · 3 việc'), 'the sample shows both groups');
  assert.ok(heads.some((h) => /^S19 · \d{2}\/\d{2} – \d{2}\/\d{2}$/.test(h)) && heads.some((h) => /^S20 · \d{2}\/\d{2} – \d{2}\/\d{2}$/.test(h)), 'two sprints, each with its dates');
  assert.ok(heads.includes('TTT New - Internal Features') && heads.includes('TTT New - Convert & Scale'), 'and two categories');
  assert.match(mails[0].body, /còn 1 ngày/);
  assert.match(mails[0].body, /còn 3 ngày/);
  assert.ok(mails[0].htmlBody.includes('>—<'), 'an item without a PIC shows the dash');
  assert.ok(mails[0].htmlBody.includes('[Mẫu] Merge API rút tiền'), 'the sample also shows a parent whose only subtask is due');
  assert.ok(mails[0].htmlBody.includes('https://ttt-planning.onrender.com'), 'falls back to the live URL for the footer link');
});

// ---- automatic sending at 09:30 ----
const VN = (hhmm, date = '2026-10-08') => date + 'T' + hhmm + ':00+07:00'; // 2026-10-08 is a Thursday

test('installDailyTrigger: ONE every-5-minutes trigger for the scheduled sender, replacing the old ones', () => {
  const old = (fn) => ({ getHandlerFunction: () => fn });
  const { sandbox, triggers, deleted, props } = load({
    props: PROPS, responses: [{ code: 200, body: {} }], now: VN('08:00'),
    existingTriggers: [old('sendReport'), old('sendReportAtScheduledTime'), old('somethingElse')]
  });
  sandbox.installDailyTrigger();
  assert.deepEqual(deleted, ['sendReport', 'sendReportAtScheduledTime'], 'its own earlier triggers go, unrelated ones stay');
  assert.deepEqual(triggers, [{ fn: 'sendReportAtScheduledTime', everyMinutes: 5 }]);
  assert.equal(props.LAST_SENT, undefined, 'installed before 09:30: today is still to be sent');
});

test('installing AFTER the send time does not mail the group a late report today — the first one is tomorrow morning', () => {
  const { sandbox, mails, fetched, logs, clock, props } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }], now: VN('11:00') });
  sandbox.installDailyTrigger();
  assert.equal(props.LAST_SENT, '2026-10-08');
  assert.ok(logs.some((l) => l.includes('sáng mai')));
  clock.ms = new Date(VN('11:05')).getTime();
  sandbox.sendReportAtScheduledTime();
  assert.equal(fetched.length + mails.length, 0);
  clock.ms = new Date(VN('09:30', '2026-10-09')).getTime();
  sandbox.sendReportAtScheduledTime();
  assert.equal(mails.length, 1, 'tomorrow it sends');
});

test('scheduled sender: nothing before 09:30; sends once from 09:30; later ticks that day do nothing; next morning sends again', () => {
  const { sandbox, mails, fetched, clock, props } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }], now: VN('09:29') });
  const tickAt = (hhmm, date) => { clock.ms = new Date(VN(hhmm, date)).getTime(); sandbox.sendReportAtScheduledTime(); };

  tickAt('09:29');
  assert.equal(fetched.length, 0, 'one minute early: not yet');
  tickAt('09:30');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'ttt-team@corp.com');
  assert.equal(props.LAST_SENT, '2026-10-08');
  tickAt('09:35'); tickAt('12:00'); tickAt('23:55');
  assert.equal(fetched.length, 1, 'already sent today: no more calls to the app');
  assert.equal(mails.length, 1);
  tickAt('09:31', '2026-10-09');
  assert.equal(mails.length, 2, 'next morning it sends again');
});

test('SEND_AT changes the time; a malformed value falls back to 09:30', () => {
  const a = load({ props: { ...PROPS, SEND_AT: '08:15' }, responses: [{ code: 200, body: realResponse() }], now: VN('08:14') });
  a.sandbox.sendReportAtScheduledTime();
  assert.equal(a.mails.length, 0);
  a.clock.ms = new Date(VN('08:15')).getTime();
  a.sandbox.sendReportAtScheduledTime();
  assert.equal(a.mails.length, 1);

  const b = load({ props: { ...PROPS, SEND_AT: 'abc' }, responses: [{ code: 200, body: realResponse() }], now: VN('09:29') });
  b.sandbox.sendReportAtScheduledTime();
  assert.equal(b.mails.length, 0);
  b.clock.ms = new Date(VN('09:30')).getTime();
  b.sandbox.sendReportAtScheduledTime();
  assert.equal(b.mails.length, 1);
});

test('a day with nothing to report (or a weekend) still counts as done — the app is not asked again all day', () => {
  const empty = { today: '2026-10-10', windows: [1, 3], weekend: true, items: [] };
  const { sandbox, mails, fetched, clock } = load({ props: PROPS, responses: [{ code: 200, body: empty }], now: VN('09:30') });
  sandbox.sendReportAtScheduledTime();
  clock.ms = new Date(VN('09:35')).getTime();
  sandbox.sendReportAtScheduledTime();
  assert.equal(fetched.length, 1);
  assert.equal(mails.length, 0);
});

test('a failure is retried on the next tick; after 3 failures it gives up until tomorrow', () => {
  // recovers on the 2nd attempt
  const ok = load({ props: PROPS, responses: [{ code: 401, body: { error: 'x' } }, { code: 200, body: realResponse() }], now: VN('09:30') });
  assert.throws(() => ok.sandbox.sendReportAtScheduledTime(), /401/);
  assert.equal(ok.mails.length, 0);
  ok.clock.ms = new Date(VN('09:35')).getTime();
  ok.sandbox.sendReportAtScheduledTime();
  assert.equal(ok.mails.length, 1, 'the retry succeeded');

  // never recovers
  const bad = load({ props: PROPS, responses: [{ code: 401, body: { error: 'x' } }], now: VN('09:30') });
  const tick = (hhmm, date) => { bad.clock.ms = new Date(VN(hhmm, date)).getTime(); bad.sandbox.sendReportAtScheduledTime(); };
  assert.throws(() => tick('09:30'), /401/);
  assert.throws(() => tick('09:35'), /401/);
  assert.throws(() => tick('09:40'), /401/);
  tick('09:45'); tick('14:00');                       // gave up for today: silent, no more calls
  assert.equal(bad.fetched.length, 3);
  assert.throws(() => tick('09:30', '2026-10-09'), /401/); // tomorrow it tries again
  assert.equal(bad.fetched.length, 4);
  assert.equal(bad.mails.length, 0);
});

test('two overlapping runs cannot both send: if the lock is taken, the tick does nothing', () => {
  const { sandbox, mails, fetched } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }], now: VN('09:30'), lockFree: false });
  sandbox.sendReportAtScheduledTime();
  assert.equal(fetched.length + mails.length, 0);
});
