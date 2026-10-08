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

function load({ props, responses, owner = 'me@corp.com' }) {
  const mails = [];
  const logs = [];
  const fetched = [];
  const triggers = [];
  const queue = [...responses];
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    UrlFetchApp: {
      fetch: (url, options) => {
        fetched.push({ url, options });
        const r = queue.length > 1 ? queue.shift() : queue[0];
        return { getResponseCode: () => r.code, getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
      }
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => owner }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { sleep: () => {}, formatDate: (d) => d.toISOString().slice(0, 10) },
    Logger: { log: (m) => logs.push(m) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: (fn) => ({ timeBased: () => ({ everyDays: () => ({ atHour: (h) => ({ create: () => triggers.push({ fn, hour: h }) }) }) }) })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, mails, logs, fetched, triggers };
}

const PROPS = { APP_URL: 'https://app.example.com/', REMINDER_SECRET: 's3cret', REPORT_TO: 'ttt-team@corp.com' };

function realResponse() {
  const sprints = [{ id: 1, code: 'S19', start_date: '2026-09-28', end_date: '2026-10-09' }];
  return buildReminders({
    today: '2026-10-07', // a Wednesday
    sprints,
    tasks: [
      { id: 1, name: 'Task <due> tomorrow', status: '3.in_test', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-08', sprint_id: 1, pic: 'An' },
      { id: 2, name: 'Parent', status: '2.ready_for_dev', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-30', sprint_id: 1, pic: null },
      { id: 3, name: 'Owner-less task', status: '1.in_analyst', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-08', sprint_id: 1, pic: null }
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

test('the report is compact: a plain header, one section per due date, one row per item, no statistics tiles', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const html = mails[0].htmlBody;
  const rows = rowsOf(html);

  assert.deepEqual(rows[0].cells, ['Việc sắp đến hạn · Thứ Tư, 07/10/2026 · 3 việc'], 'title, weekday + date and the one count');
  // no statistics: not the totals, not the nghiệp vụ/subtask split, not a "no PIC" counter tile
  assert.doesNotMatch(html, /Tổng số việc|nghiệp vụ · \d+ subtask|Chưa có PIC/);

  // sections: the due date is written once, in the section heading — not repeated on every row
  assert.ok(rows.some((r) => r.cells[0] === 'Còn 1 ngày làm việc · hạn Thứ Năm 08/10'));
  assert.ok(rows.some((r) => r.cells[0] === 'Còn 3 ngày làm việc · hạn Thứ Hai 12/10'));
  assert.doesNotMatch(html, /08\/10\/2026|12\/10\/2026/);

  assert.ok(html.includes('Task &lt;due&gt; tomorrow'), 'names are HTML-escaped');
  assert.ok(!html.includes('<due>'));
  assert.ok(rows[rows.length - 1].cells[0] === 'Mở hệ thống');

  // density: title + 2 section headings + 4 item rows (Task, Owner-less, Parent, Sub) + footer — no column-header row
  assert.equal(rows.length, 1 + 2 + 4 + 1, 'every item is exactly one row');
});

test('each item row reads name | PIC | status | sprint; a missing PIC shows itself in the PIC column', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const rows = rowsOf(mails[0].htmlBody);
  const byName = (n) => rows.find((r) => r.cells[0].replace('↳ ', '') === n);

  assert.deepEqual(byName('Task <due> tomorrow').cells, ['Task <due> tomorrow', 'An', 'In Dev', 'S19']);
  assert.deepEqual(byName('Owner-less task').cells, ['Owner-less task', 'chưa có PIC', 'In Analyst', 'S19']);
  assert.ok(byName('Owner-less task').html.includes('>chưa có PIC<'), 'the missing PIC is its own (highlighted) span');
  assert.deepEqual(byName('Sub Monday').cells, ['↳ Sub Monday', 'Bình', 'WIP', ''], 'a subtask repeats neither sprint nor parent name');
});

test('a subtask sits under its parent task; with only the subtask due, the parent is a plain dimmed heading row', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const html = mails[0].htmlBody;
  const rows = rowsOf(html);

  assert.doesNotMatch(html, /Thuộc:/);
  assert.equal(html.match(/Parent/g).length, 1, 'the parent is named once');
  assert.equal(html.match(/Sub Monday/g).length, 1, 'each item appears once');
  const iParent = rows.findIndex((r) => r.cells[0] === 'Parent');
  assert.equal(rows[iParent + 1].cells[0], '↳ Sub Monday', 'the subtask follows its parent immediately');
  assert.deepEqual(rows[iParent].cells, ['Parent', '', '', 'S19'], 'the parent is not due itself: just a name and its sprint');
  assert.doesNotMatch(rows[iParent].cells[0] && rows[iParent].html, /font-weight:600/, 'and not emphasised');
});

test('when a task AND its subtask are due the same day: parent row (bold) then the nested subtask, sprint shown once', () => {
  const sprints = [{ id: 1, code: 'S19', start_date: '2026-09-28', end_date: '2026-10-09' }];
  const body = buildReminders({
    today: '2026-10-07', sprints,
    tasks: [{ id: 1, name: 'Whole task', status: '3.in_test', date_overridden: true, start_date: '2026-10-01', due_date: '2026-10-08', sprint_id: 1, pic: 'An' }],
    subtasks: [{ id: 10, task_id: 1, name: 'Its subtask', status: 'todo', due_date: '2026-10-08', pic: 'Bình' }]
  });
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body }] });
  sandbox.sendReport();
  const rows = rowsOf(mails[0].htmlBody);
  const iTask = rows.findIndex((r) => r.cells[0] === 'Whole task');
  assert.deepEqual(rows[iTask].cells, ['Whole task', 'An', 'In Dev', 'S19']);
  assert.match(rows[iTask].html, /font-weight:600/, 'the due task itself is emphasised');
  assert.deepEqual(rows[iTask + 1].cells, ['↳ Its subtask', 'Bình', 'TODO', '']);
  assert.equal(mails[0].htmlBody.match(/S19/g).length, 1, 'sprint shown once, on the parent');
});

test('the email also has a plain-text version in the same shape', () => {
  const { sandbox, mails } = load({ props: PROPS, responses: [{ code: 200, body: realResponse() }] });
  sandbox.sendReport();
  const text = mails[0].body;
  assert.match(text, /^VIỆC SẮP ĐẾN HẠN — Thứ Tư, 07\/10\/2026 · 3 việc/);
  assert.match(text, /CÒN 1 NGÀY LÀM VIỆC · hạn Thứ Năm 08\/10/);
  assert.match(text, /CÒN 3 NGÀY LÀM VIỆC · hạn Thứ Hai 12\/10/);
  assert.ok(text.includes('- Task <due> tomorrow  (S19 · An · In Dev)'));
  assert.ok(text.includes('- Owner-less task  (S19 · chưa có PIC · In Analyst)'));
  assert.ok(text.includes('- Parent  (S19)\n    ↳ Sub Monday  (Bình · WIP)'));
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

test('installDailyTrigger schedules sendReport for 8 a.m.', () => {
  const { sandbox, triggers } = load({ props: PROPS, responses: [{ code: 200, body: {} }] });
  sandbox.installDailyTrigger();
  assert.deepEqual(triggers, [{ fn: 'sendReport', hour: 8 }]);
});

test('sendSampleReportToMeOnly mails the owner a clearly-fake report without calling the app or needing any property', () => {
  const { sandbox, mails, fetched } = load({ props: {}, responses: [{ code: 500, body: 'must not be called' }] });
  sandbox.sendSampleReportToMeOnly();
  assert.equal(fetched.length, 0, 'no network call');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'me@corp.com');
  assert.match(mails[0].subject, /^\[TTT\] Báo cáo việc sắp đến hạn — \d{2}\/\d{2}\/\d{4} \(5 việc\)$/);
  assert.ok(mails[0].htmlBody.includes('[Mẫu] Nạp tiền vào Túi qua ví liên kết'));
  assert.match(mails[0].htmlBody, /Còn 1 ngày làm việc/);
  assert.match(mails[0].htmlBody, /Còn 3 ngày làm việc/);
  assert.ok(mails[0].htmlBody.includes('chưa có PIC'));
  assert.ok(mails[0].htmlBody.includes('[Mẫu] Merge API rút tiền'), 'the sample also shows a parent whose only subtask is due');
  assert.ok(mails[0].htmlBody.includes('https://ttt-planning.onrender.com'), 'falls back to the live URL for the footer link');
});
