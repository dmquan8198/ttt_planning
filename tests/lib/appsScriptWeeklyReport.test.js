const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// docs/weekly-report/Code.gs runs on Google's servers, where nothing can be
// unit-tested directly. This loads it into a sandbox with fake Apps Script
// services (same approach as appsScriptReminders.test.js) so a typo, or a
// mismatch with the file name the API sends back, shows up here and not on
// the first scheduled Friday run.

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'weekly-report', 'Code.gs'), 'utf8');
const FILENAME = 'attachment; filename="bao-cao-tuan_2026-10-04_2026-10-11.pptx"';

function load({ props, responses, owner = 'me@corp.com', existingTriggers = [] }) {
  const mails = []; const logs = []; const fetched = []; const created = []; const shared = []; const viewers = []; const triggers = []; const deleted = [];
  const queue = [...responses];
  const blob = { bytes: [1, 2, 3], setContentType() { return this; }, setName() { return this; }, getBytes() { return this.bytes; } };
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    UrlFetchApp: {
      fetch: (url, options) => {
        fetched.push({ url, options });
        const r = queue.length > 1 ? queue.shift() : queue[0];
        return { getResponseCode: () => r.code, getContentText: () => r.body || '', getHeaders: () => r.headers || {}, getBlob: () => blob };
      }
    },
    Drive: { Files: { create: (resource, media, opts) => { created.push({ resource, media, opts }); return { id: 'FILE123' }; } } },
    DriveApp: {
      Access: { DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      getFileById: (id) => ({ setSharing: (a, p) => shared.push({ id, a, p }), addViewer: (email) => { if (props.__failShare) throw new Error('blocked by policy'); viewers.push({ id, email }); } })
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => owner }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { sleep: () => {}, formatDate: (d) => d.toISOString().slice(0, 10) },
    Logger: { log: (m) => logs.push(m) },
    LockService: { getScriptLock: () => ({ tryLock: () => !props.__locked, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; }, getContent() { return this.text; } }) },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY', FRIDAY: 'FRIDAY' },
      getProjectTriggers: () => existingTriggers,
      deleteTrigger: (t) => deleted.push(t.getHandlerFunction()),
      newTrigger: (fn) => ({ timeBased: () => ({ onWeekDay: (d) => ({ atHour: (h) => ({ create: () => triggers.push({ fn, day: d, hour: h }) }) }) }) })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, mails, logs, fetched, created, shared, viewers, triggers, deleted };
}

const PROPS = { APP_URL: 'https://app.example.com/', REPORT_SECRET: 's3cret' };
const OK = { code: 200, headers: { 'Content-Disposition': FILENAME } };

test('createWeeklyReport fetches the deck with the secret and converts it to Google Slides titled by the week', () => {
  const { sandbox, fetched, created, mails } = load({ props: PROPS, responses: [OK] });
  sandbox.createWeeklyReport();
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].url, 'https://app.example.com/api/reports/weekly.pptx');
  assert.equal(fetched[0].options.headers['X-Report-Secret'], 's3cret');
  assert.equal(created.length, 1);
  assert.equal(created[0].resource.mimeType, 'application/vnd.google-apps.presentation');
  assert.equal(created[0].resource.name, '[TTT] Báo cáo tuần 05/10 – 11/10/2026');
  assert.equal(created[0].resource.parents, undefined);
  assert.equal(mails.length, 0, 'no REPORT_TO -> no mail');
});

test('a FOLDER_ID puts the file in that folder; SHARE_WITH_DOMAIN opens it to the company', () => {
  const { sandbox, created, shared } = load({ props: { ...PROPS, FOLDER_ID: 'FOLDER9', SHARE_WITH_DOMAIN: 'true' }, responses: [OK] });
  sandbox.createWeeklyReport();
  assert.deepEqual(Array.from(created[0].resource.parents), ['FOLDER9']); // Array.from: the array comes from the vm realm
  assert.deepEqual(shared, [{ id: 'FILE123', a: 'DOMAIN_WITH_LINK', p: 'VIEW' }]);
});

test('REPORT_TO gets the link by mail; createWeeklyReportToMeOnly mails only the owner', () => {
  const props = { ...PROPS, REPORT_TO: 'boss@corp.com' };
  const a = load({ props, responses: [OK] });
  a.sandbox.createWeeklyReport();
  assert.equal(a.mails.length, 1);
  assert.equal(a.mails[0].to, 'boss@corp.com');
  assert.match(a.mails[0].htmlBody, /docs\.google\.com\/presentation\/d\/FILE123\/edit/);
  const b = load({ props, responses: [OK], owner: 'me@corp.com' });
  b.sandbox.createWeeklyReportToMeOnly();
  assert.equal(b.mails.length, 1);
  assert.equal(b.mails[0].to, 'me@corp.com');
});

test('TODAY is passed through for dry runs; testConnection creates and mails nothing', () => {
  const { sandbox, fetched, created, mails } = load({ props: { ...PROPS, TODAY: '2026-10-11' }, responses: [OK] });
  sandbox.testConnection();
  assert.equal(fetched[0].url, 'https://app.example.com/api/reports/weekly.pptx?today=2026-10-11');
  assert.equal(created.length + mails.length, 0);
});

test('a wrong secret (401) fails at once instead of retrying; a sleeping app (503) is retried', () => {
  const bad = load({ props: PROPS, responses: [{ code: 401, body: '{"error":"Không có quyền"}' }] });
  assert.throws(() => bad.sandbox.createWeeklyReport(), /401/);
  assert.equal(bad.fetched.length, 1);
  const waking = load({ props: PROPS, responses: [{ code: 503 }, { code: 503 }, OK] });
  waking.sandbox.createWeeklyReport();
  assert.equal(waking.fetched.length, 3);
  assert.equal(waking.created.length, 1);
});

test('missing properties are reported clearly', () => {
  const { sandbox } = load({ props: { APP_URL: 'https://x' }, responses: [OK] });
  assert.throws(() => sandbox.createWeeklyReport(), /APP_URL hoặc REPORT_SECRET/);
});

test('installWeeklyTrigger schedules one weekly trigger (Friday 9h by default) and replaces any old one', () => {
  const old = { getHandlerFunction: () => 'createWeeklyReport' };
  const { sandbox, triggers, deleted } = load({ props: PROPS, responses: [OK], existingTriggers: [old] });
  sandbox.installWeeklyTrigger();
  assert.deepEqual(deleted, ['createWeeklyReport']);
  assert.deepEqual(triggers, [{ fn: 'createWeeklyReport', day: 'FRIDAY', hour: 9 }]);
  const mon = load({ props: { ...PROPS, REPORT_DAY: 'monday', REPORT_HOUR: '8' }, responses: [OK] });
  mon.sandbox.installWeeklyTrigger();
  assert.deepEqual(mon.triggers, [{ fn: 'createWeeklyReport', day: 'MONDAY', hour: 8 }]);
  assert.throws(() => load({ props: { ...PROPS, REPORT_DAY: 'FUNDAY' }, responses: [OK] }).sandbox.installWeeklyTrigger(), /REPORT_DAY/);
});

// ---- doPost: the web button's entry point ----

const post = (sandbox, body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());

test('doPost: rejects a wrong or missing secret and does nothing', () => {
  const { sandbox, fetched, created, mails } = load({ props: PROPS, responses: [OK] });
  assert.deepEqual(post(sandbox, { secret: 'nope', to: 'a@b.com' }), { ok: false, error: 'Không có quyền.' });
  assert.equal(post(sandbox, { to: 'a@b.com' }).ok, false);
  assert.equal(fetched.length + created.length + mails.length, 0);
});

test('doPost: needs a valid recipient email', () => {
  const { sandbox, created } = load({ props: PROPS, responses: [OK] });
  const r = post(sandbox, { secret: 's3cret', to: 'not-an-email' });
  assert.equal(r.ok, false);
  assert.match(r.error, /email/);
  assert.equal(created.length, 0);
});

test('doPost: creates the Slides, shares it with the requester and mails the requester only — ignoring a leftover TODAY and REPORT_TO', () => {
  const { sandbox, fetched, created, viewers, mails } = load({ props: { ...PROPS, TODAY: '2026-01-01', REPORT_TO: 'boss@corp.com' }, responses: [OK] });
  const r = post(sandbox, { secret: 's3cret', to: 'me@corp.com' });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://docs.google.com/presentation/d/FILE123/edit');
  assert.equal(r.title, '[TTT] Báo cáo tuần 05/10 – 11/10/2026');
  assert.equal(r.to, 'me@corp.com');
  assert.equal(r.shared, true);
  assert.equal(fetched[0].url, 'https://app.example.com/api/reports/weekly.pptx', 'real today, not TODAY');
  assert.equal(created[0].resource.mimeType, 'application/vnd.google-apps.presentation');
  assert.deepEqual(viewers, [{ id: 'FILE123', email: 'me@corp.com' }]);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'me@corp.com');
});

test('doPost: if sharing is blocked the link is still mailed and the reply says shared:false', () => {
  const { sandbox, mails } = load({ props: { ...PROPS, __failShare: true }, responses: [OK] });
  const r = post(sandbox, { secret: 's3cret', to: 'me@gmail.com' });
  assert.equal(r.ok, true);
  assert.equal(r.shared, false);
  assert.match(mails[0].htmlBody, /Chưa chia sẻ được/);
});

test('doPost: errors (busy, app unreachable) come back as {ok:false,error} rather than throwing', () => {
  const busy = load({ props: { ...PROPS, __locked: true }, responses: [OK] });
  assert.match(post(busy.sandbox, { secret: 's3cret', to: 'me@corp.com' }).error, /Đang có một báo cáo khác/);
  const bad = load({ props: PROPS, responses: [{ code: 401, body: 'x' }] });
  const r = post(bad.sandbox, { secret: 's3cret', to: 'me@corp.com' });
  assert.equal(r.ok, false);
  assert.match(r.error, /401/);
});
