/**
 * Túi Thần Tài — báo cáo việc sắp đến hạn, gửi qua email.
 *
 * Script này chạy TRONG Google Workspace của bạn (script.google.com), nên mail
 * được gửi từ chính hộp thư công ty của bạn — không cần SMTP, không cần để mật
 * khẩu mail ở đâu cả. Mỗi sáng nó hỏi app (GET /api/reminders/due) xem nghiệp vụ /
 * subtask nào còn đúng 1 và 3 ngày làm việc nữa là đến hạn, rồi gửi MỘT email báo
 * cáo duy nhất tới MỘT địa chỉ nhóm (group mail) — không gửi riêng cho từng
 * người, từng task hay subtask.
 *
 * Cài đặt từng bước: xem README.md cùng thư mục.
 *
 * Script properties (Project Settings → Script properties):
 *   APP_URL          bắt buộc  vd. https://ttt-planning.onrender.com
 *   REMINDER_SECRET  bắt buộc  trùng REMINDER_SECRET trên Render
 *   REPORT_TO        bắt buộc  địa chỉ group mail nhận báo cáo, vd. ttt-team@congty.com
 *                              (nhiều địa chỉ: cách nhau bằng dấu phẩy)
 *   SEND_AT          tùy chọn  giờ gửi tự động, dạng HH:mm, mặc định "09:30"
 *   DAYS             tùy chọn  mặc định "1,3" (số ngày làm việc trước hạn)
 *   TODAY            chỉ để THỬ: YYYY-MM-DD (phải là ngày làm việc) — giả vờ hôm nay là
 *                              ngày đó. Nhớ xóa đi sau khi thử xong.
 */

var STATUS_LABELS_ = {
  '0.backlog': 'Backlog', '1.in_analyst': 'In Analyst', '2.ready_for_dev': 'Ready for Dev',
  '3.in_test': 'In Dev', '4.in_test_uat': 'inTest UAT', '5.ready_for_staging': 'Done UAT', '6.done': 'Done',
  todo: 'TODO', wip: 'WIP', done: 'Done'
};
var WEEKDAYS_ = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** Gửi báo cáo tới REPORT_TO NGAY BÂY GIỜ (chạy tay). Gửi tự động hằng ngày là sendReportAtScheduledTime. */
function sendReport() {
  run_({ dryRun: false, onlyOwner: false });
}

/** Chỉ ghi vào Execution log, KHÔNG gửi gì — để xem trước. */
function previewReport() {
  run_({ dryRun: true, onlyOwner: false });
}

/** Gửi báo cáo chỉ cho chủ script (bỏ qua REPORT_TO) — để thử lần đầu. */
function sendReportToMeOnly() {
  run_({ dryRun: false, onlyOwner: true });
}

/**
 * THỬ TRƯỚC KHI CÓ GÌ: gửi cho chủ script một báo cáo với DỮ LIỆU MẪU (tên "[Mẫu] ...").
 * Không gọi app, không cần REMINDER_SECRET, không cần deploy — chỉ để xem email trông thế nào
 * trong hộp thư thật của bạn và kiểm tra quyền gửi mail.
 */
function sendSampleReportToMeOnly() {
  var tz = Session.getScriptTimeZone();
  function dayPlus_(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  var CAT_A = 'TTT New - Internal Features', CAT_B = 'TTT New - Convert & Scale';
  var S19 = { sprint_code: 'S19', sprint_start: dayPlus_(-8), sprint_end: dayPlus_(3) };
  var S20 = { sprint_code: 'S20', sprint_start: dayPlus_(4), sprint_end: dayPlus_(15) };
  var PARENT = '[Mẫu] Nạp tiền vào Túi qua ví liên kết';
  var data = {
    today: dayPlus_(0), windows: [1, 3], weekend: false,
    items: [
      { kind: 'task', id: 1, task_id: 1, name: PARENT, task_name: PARENT, category: CAT_A, task_status: '3.in_test',
        sprint_code: S19.sprint_code, sprint_start: S19.sprint_start, sprint_end: S19.sprint_end, status: '3.in_test', due_date: dayPlus_(1), pic: 'An', working_days_left: 1 },
      { kind: 'subtask', id: 10, task_id: 1, name: '[Mẫu] QC test lại luồng nạp tiền', task_name: PARENT, category: CAT_A, task_status: '3.in_test',
        sprint_code: S19.sprint_code, sprint_start: S19.sprint_start, sprint_end: S19.sprint_end, status: 'wip', due_date: dayPlus_(1), pic: 'Bình', working_days_left: 1 },
      { kind: 'task', id: 2, task_id: 2, name: '[Mẫu] Báo cáo tăng giảm vốn', task_name: '[Mẫu] Báo cáo tăng giảm vốn', category: CAT_A, task_status: '1.in_analyst',
        sprint_code: S19.sprint_code, sprint_start: S19.sprint_start, sprint_end: S19.sprint_end, status: '1.in_analyst', due_date: dayPlus_(1), pic: null, working_days_left: 1 },
      { kind: 'task', id: 3, task_id: 3, name: '[Mẫu] Game Tiền lời nhân đôi', task_name: '[Mẫu] Game Tiền lời nhân đôi', category: CAT_B, task_status: '4.in_test_uat',
        sprint_code: S20.sprint_code, sprint_start: S20.sprint_start, sprint_end: S20.sprint_end, status: '4.in_test_uat', due_date: dayPlus_(3), pic: 'Cường', working_days_left: 3 },
      // chỉ subtask đến hạn, nghiệp vụ cha thì chưa
      { kind: 'subtask', id: 11, task_id: 4, name: '[Mẫu] Viết tài liệu tích hợp', task_name: '[Mẫu] Merge API rút tiền', category: CAT_B, task_status: '2.ready_for_dev',
        sprint_code: S20.sprint_code, sprint_start: S20.sprint_start, sprint_end: S20.sprint_end, status: 'todo', due_date: dayPlus_(3), pic: null, working_days_left: 3 }
    ]
  };
  var appUrl = (PropertiesService.getScriptProperties().getProperty('APP_URL') || 'https://ttt-planning.onrender.com').replace(/\/+$/, '');
  deliver_(data, Session.getEffectiveUser().getEmail(), appUrl, false);
}

/**
 * Chạy MỘT LẦN để bật gửi tự động mỗi ngày lúc SEND_AT (mặc định 09:30, theo múi giờ của project).
 *
 * Vì sao không dùng "mỗi ngày lúc 9h30" của Apps Script: trigger theo giờ của nó chỉ chọn được GIỜ, phút
 * chỉ là "khoảng" (sai lệch tới ±15 phút). Nên ở đây trigger chạy mỗi 5 phút và hàm
 * sendReportAtScheduledTime tự kiểm tra: tới SEND_AT mà hôm nay chưa gửi thì gửi — tức là 9:30–9:35.
 * Mỗi lần kiểm tra chỉ mất vài mili-giây khi chưa tới giờ hoặc đã gửi rồi.
 */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'sendReport' || fn === 'sendReportAtScheduledTime') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendReportAtScheduledTime').timeBased().everyMinutes(5).create();
  var props = PropertiesService.getScriptProperties();
  var sendAt = sendAt_(props);
  // cài sau giờ gửi thì KHÔNG gửi bù ngay hôm nay (báo cáo tới group lúc 11h sẽ làm mọi người bất ngờ):
  // đánh dấu hôm nay là đã gửi, lần đầu sẽ là sáng mai. Muốn có ngay thì chạy sendReport hoặc sendReportToMeOnly.
  if (nowHhmm_() >= sendAt) {
    props.setProperty('LAST_SENT', todayKey_());
    Logger.log('Đã bật gửi tự động lúc ' + sendAt + ' mỗi ngày. Đã quá giờ hôm nay nên lần gửi đầu tiên là sáng mai.');
  } else {
    Logger.log('Đã bật gửi tự động lúc ' + sendAt + ' mỗi ngày, bắt đầu từ hôm nay.');
  }
}

/**
 * Hàm mà trigger 5 phút gọi. Gửi đúng một lần mỗi ngày, từ SEND_AT trở đi. Có thể chạy tay để thử:
 * trước SEND_AT hoặc hôm nay đã gửi rồi thì nó không làm gì.
 * Lỗi (vd. app đang ngủ lâu, sai secret) được thử lại ở lần kiểm tra sau, tối đa 3 lần mỗi ngày rồi bỏ cuộc tới sáng mai
 * để không báo lỗi 288 lần/ngày.
 */
function sendReportAtScheduledTime() {
  var props = PropertiesService.getScriptProperties();
  var today = todayKey_();
  if (props.getProperty('LAST_SENT') === today) return;       // hôm nay gửi rồi
  if (nowHhmm_() < sendAt_(props)) return;                    // chưa tới giờ
  if (props.getProperty('FAIL_DATE') === today && Number(props.getProperty('FAIL_COUNT')) >= 3) return; // bỏ cuộc hôm nay

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;                           // một lần chạy khác đang gửi
  try {
    if (props.getProperty('LAST_SENT') === today) return;
    try {
      run_({ dryRun: false, onlyOwner: false });
      props.setProperty('LAST_SENT', today);                  // cả khi hôm nay không có việc / cuối tuần (không gọi lại app cả ngày)
    } catch (e) {
      var fails = props.getProperty('FAIL_DATE') === today ? Number(props.getProperty('FAIL_COUNT')) + 1 : 1;
      props.setProperty('FAIL_DATE', today);
      props.setProperty('FAIL_COUNT', String(fails));
      throw e;
    }
  } finally {
    lock.releaseLock();
  }
}

/** Giờ gửi 'HH:mm' (mặc định 09:30); chuỗi sai định dạng thì dùng mặc định. */
function sendAt_(props) {
  var v = String(props.getProperty('SEND_AT') || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '09:30';
}
function nowHhmm_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'); }
function todayKey_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function run_(opts) {
  var props = PropertiesService.getScriptProperties();
  var appUrl = (props.getProperty('APP_URL') || '').replace(/\/+$/, '');
  var secret = props.getProperty('REMINDER_SECRET');
  if (!appUrl || !secret) throw new Error('Thiếu APP_URL hoặc REMINDER_SECRET trong Script properties.');
  var to = opts.onlyOwner ? Session.getEffectiveUser().getEmail() : (props.getProperty('REPORT_TO') || '').trim();
  if (!to) throw new Error('Thiếu REPORT_TO (địa chỉ group mail nhận báo cáo) trong Script properties.');

  var data = fetchDue_(appUrl, secret, props.getProperty('DAYS') || '1,3', props.getProperty('TODAY'));
  Logger.log('Hôm nay ' + data.today + (data.weekend ? ' (cuối tuần — không gửi)' : '') +
    ': ' + data.items.length + ' việc sắp đến hạn.');
  if (data.items.length === 0) return; // không có gì để báo cáo thì không gửi

  deliver_(data, to, appUrl, opts.dryRun);
}

/** Dựng và gửi (hoặc chỉ ghi log nếu dryRun) báo cáo từ `data` — dùng chung cho gửi thật và gửi mẫu. */
function deliver_(data, to, appUrl, dryRun) {
  if (data.items.length === 0) return;
  var mail = {
    to: to,
    subject: '[TTT] Báo cáo việc sắp đến hạn — ' + formatDmy_(data.today) + ' (' + data.items.length + ' việc)',
    html: buildHtml_(data, appUrl),
    text: buildText_(data, appUrl)
  };
  if (dryRun) {
    Logger.log('[xem trước] → ' + mail.to + ' | ' + mail.subject + '\n' + mail.text);
    return;
  }
  MailApp.sendEmail({ to: mail.to, subject: mail.subject, htmlBody: mail.html, body: mail.text, name: 'Túi Thần Tài' });
  Logger.log('Đã gửi → ' + mail.to + ' | ' + mail.subject);
}

/** Gọi app; Render gói free ngủ khi rảnh nên lần đầu có thể mất ~1 phút → thử lại. */
function fetchDue_(appUrl, secret, days, todayOverride) {
  var url = appUrl + '/api/reminders/due?days=' + encodeURIComponent(days) +
    (todayOverride ? '&today=' + encodeURIComponent(todayOverride) : '');
  var lastError;
  for (var attempt = 1; attempt <= 4; attempt++) {
    try {
      var res = UrlFetchApp.fetch(url, { headers: { 'X-Reminder-Secret': secret }, muteHttpExceptions: true });
      var code = res.getResponseCode();
      if (code === 200) return JSON.parse(res.getContentText());
      if (code === 400 || code === 401 || code === 500) {
        // cấu hình sai — thử lại cũng vô ích
        throw new Error('App trả về ' + code + ': ' + res.getContentText().slice(0, 200));
      }
      lastError = new Error('App trả về ' + code + ' (đang khởi động?)');
    } catch (e) {
      if (/App trả về (400|401|500)/.test(String(e.message))) throw e;
      lastError = e;
    }
    if (attempt < 4) Utilities.sleep(15000);
  }
  throw lastError;
}

// ---- định dạng báo cáo ----
//
// Ba tầng nhóm, đúng thứ tự: (1) Analyst / Development theo trạng thái của NGHIỆP VỤ — Analyst gồm Backlog,
// In Analyst, Ready for Dev; Development gồm In Dev, inTest UAT, Done UAT, Done — (2) Sprint tăng dần, (3) Category.
// Sprint và category đã là tiêu đề nên bỏ cột Sprint khỏi từng dòng; mỗi việc đúng MỘT dòng: tên | PIC | status | hạn.
// Subtask nằm ngay dưới nghiệp vụ cha (và theo nhóm/sprint/category của cha) nên không phải lặp tên cha.
// Ít chữ lặp lại để dễ nhìn: thiếu PIC là "—"; hạn là ngày + số ngày làm việc còn lại, tô đỏ khi còn 1 ngày.
// Status của SUBTASK (TODO/WIP/Done) là một viên thuốc viền nhỏ, thụt vào — khác hẳn status của nghiệp vụ (chữ thường)
// để không ai đọc nhầm hai thứ ngang hàng.

var INK_ = '#1a1a1a', MUTED_ = '#8a8a8a', RULE_ = '#ececec', WARN_ = '#c0392b', URGENT_ = '#c0392b';

var SECTIONS_ = [
  { key: 'analyst', label: 'Analyst', accent: '#3b6ea5' },
  { key: 'dev', label: 'Development', accent: '#2f8f6b' }
];
var SECTION_BY_STATUS_ = {
  '0.backlog': 'analyst', '1.in_analyst': 'analyst', '2.ready_for_dev': 'analyst',
  '3.in_test': 'dev', '4.in_test_uat': 'dev', '5.ready_for_staging': 'dev', '6.done': 'dev'
};
// thứ tự category giống màn Sprint Overview của app; category khác xếp sau, theo bảng chữ cái
var CATEGORY_ORDER_ = [
  'TTT New - Product Foundation', 'TTT New - Cross Service Integration',
  'TTT New - Internal Features', 'TTT New - Convert & Scale'
];
var NO_SPRINT_ = 'Chưa gán sprint';
var NO_CATEGORY_ = 'Chưa có category';

/** 'S19' → 19 (so sánh số để S9 đứng trước S10); không có sprint thì xuống cuối. */
function sprintNo_(code) {
  var m = /(\d+)/.exec(String(code || ''));
  return m ? Number(m[1]) : 1e9;
}
function categoryRank_(name) {
  var i = CATEGORY_ORDER_.indexOf(name);
  return i === -1 ? CATEGORY_ORDER_.length : i;
}
function cmp_(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

/**
 * items → [{ key, label, accent, sprints: [{ label, start, end, cats: [{ name, tasks: [{ task_id, task_name, self, subs }] }] }] }]
 * Chỉ trả nhóm có việc. `self` là null khi chỉ có subtask của nghiệp vụ đó đến hạn (cha thì chưa).
 */
function groupReport_(items) {
  var secs = {};
  items.forEach(function (it) {
    var secKey = SECTION_BY_STATUS_[it.task_status] || 'dev';
    var sec = secs[secKey] = secs[secKey] || { sprints: {} };
    var sprintLabel = it.sprint_code || NO_SPRINT_;
    var sprint = sec.sprints[sprintLabel] = sec.sprints[sprintLabel] || { label: sprintLabel, no: sprintNo_(it.sprint_code), start: it.sprint_start || null, end: it.sprint_end || null, cats: {} };
    var catName = it.category || NO_CATEGORY_;
    var cat = sprint.cats[catName] = sprint.cats[catName] || { name: catName, tasks: {} };
    var t = cat.tasks[it.task_id];
    if (!t) t = cat.tasks[it.task_id] = { task_id: it.task_id, task_name: it.task_name, self: null, subs: [] };
    if (it.kind === 'task') t.self = it; else t.subs.push(it);
  });

  var earliest = function (t) { return [t.self].concat(t.subs).filter(Boolean).map(function (i) { return i.due_date; }).sort()[0]; };
  return SECTIONS_.filter(function (s) { return secs[s.key]; }).map(function (s) {
    var sprints = Object.keys(secs[s.key].sprints).map(function (k) { return secs[s.key].sprints[k]; });
    sprints.sort(function (a, b) { return a.no - b.no || cmp_(a.label, b.label); });
    sprints.forEach(function (sp) {
      sp.cats = Object.keys(sp.cats).map(function (k) { return sp.cats[k]; });
      sp.cats.sort(function (a, b) { return categoryRank_(a.name) - categoryRank_(b.name) || cmp_(a.name, b.name); });
      sp.cats.forEach(function (c) {
        c.tasks = Object.keys(c.tasks).map(function (k) { return c.tasks[k]; });
        c.tasks.sort(function (a, b) { return cmp_(earliest(a), earliest(b)) || a.task_id - b.task_id; });
        c.tasks.forEach(function (t) { t.subs.sort(function (a, b) { return cmp_(a.due_date, b.due_date) || a.id - b.id; }); });
      });
    });
    return { key: s.key, label: s.label, accent: s.accent, sprints: sprints };
  });
}

function countItems_(sec) {
  var n = 0;
  sec.sprints.forEach(function (sp) {
    sp.cats.forEach(function (c) { c.tasks.forEach(function (t) { n += (t.self ? 1 : 0) + t.subs.length; }); });
  });
  return n;
}

function weekdayDmy_(iso) {
  var d = new Date(String(iso) + 'T00:00:00Z');
  return WEEKDAYS_[d.getUTCDay()] + ', ' + formatDmy_(iso);
}
/** { start:'2026-09-28', end:'2026-10-09' } → '28/09 – 09/10' ('' when the sprint has no dates) */
function sprintRange_(sp) {
  return sp.start && sp.end ? formatDmy_(sp.start).slice(0, 5) + ' – ' + formatDmy_(sp.end).slice(0, 5) : '';
}
/** '2026-10-09' → '09/10' */
function dueShort_(it) { return formatDmy_(it.due_date).slice(0, 5); }
/** '09/10 · còn 1 ngày' (ngày làm việc còn lại) — dùng cho bản chữ thường */
function dueText_(it) { return dueShort_(it) + ' · còn ' + it.working_days_left + ' ngày'; }
function statusText_(it) { return STATUS_LABELS_[it.status] || it.status || ''; }

/**
 * Một bảng, mỗi việc đúng MỘT dòng (tên | PIC | status | hạn). Nền xám nhạt bao ngoài, thẻ trắng ở giữa.
 * Tầng 1 (Analyst / Development) là dải tô nhạt có vạch màu bên trái; tầng 2 (sprint) là chữ đậm có kẻ chân,
 * có khoảng trống phía trên cho thoáng; tầng 3 (category) là dòng nhỏ mờ thụt vào. Dùng <table> vì đó là thứ
 * mọi mail client (kể cả Outlook desktop) hiển thị đúng.
 */
function buildHtml_(data, appUrl) {
  var FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  var COLS = 4;
  function cell_(style, content) {
    return '<td style="padding:2px 10px;border-bottom:1px solid ' + RULE_ + ';vertical-align:top;' + style + '">' + content + '</td>';
  }
  /** Một dòng: name | pic | status | hạn. `indent` = số px thụt của tên. */
  function row_(c) {
    var nameStyle = 'padding-left:' + c.indent + 'px;' + (c.bold ? 'font-weight:600;' : '') + (c.dim ? 'color:#666;' : '');
    var pic = c.blank ? '' : (c.pic ? esc_(c.pic) : '<span style="color:' + WARN_ + '">—</span>');
    var due = c.dueIt ? '<span style="color:' + (c.dueIt.working_days_left <= 1 ? URGENT_ : MUTED_) + '">' + esc_(dueText_(c.dueIt)) + '</span>' : '';
    // status của nghiệp vụ: chữ thường. Của subtask: viên thuốc viền nhỏ + thụt vào, để không đọc ngang hàng với nghiệp vụ
    var status = c.sub
      ? '<span style="display:inline-block;margin-left:14px;padding:0 7px;border:1px solid #d3d8de;border-radius:9px;font-size:10.5px;line-height:1.55;color:#777;background:#fafbfc">' + esc_(c.status || '') + '</span>'
      : esc_(c.status || '');
    return '<tr>' +
      cell_(nameStyle, (c.sub ? '<span style="color:#b5b5b5">↳</span> ' : '') + esc_(c.name)) +
      cell_('width:104px;white-space:nowrap;color:#555', pic) +
      cell_('width:96px;white-space:nowrap;color:#555', status) +
      cell_('width:112px;white-space:nowrap', due) +
      '</tr>';
  }

  var html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;font-family:' + FONT + ';color:' + INK_ + '">' +
    '<tr><td style="padding:10px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:900px;background:#ffffff;border:1px solid #dde1e6;border-collapse:separate;border-radius:6px;font-size:12px;line-height:1.35">' +
    '<tr><td colspan="' + COLS + '" style="padding:10px 10px 8px"><span style="font-size:16px;font-weight:600">Việc sắp đến hạn</span>' +
    '<span style="color:' + MUTED_ + '"> &nbsp;·&nbsp; ' + esc_(weekdayDmy_(data.today)) + ' &nbsp;·&nbsp; ' + data.items.length + ' việc</span></td></tr>';

  groupReport_(data.items).forEach(function (sec) {
    html += '<tr><td colspan="' + COLS + '" style="background:#eef1f5;border-left:3px solid ' + sec.accent +
      ';padding:6px 10px;font-weight:700;font-size:12.5px;border-bottom:1px solid ' + RULE_ + '">' + esc_(sec.label) +
      '<span style="font-weight:400;color:' + MUTED_ + '"> · ' + countItems_(sec) + ' việc</span></td></tr>';
    sec.sprints.forEach(function (sp) {
      html += '<tr><td colspan="' + COLS + '" style="padding:10px 10px 3px;font-weight:700;font-size:12.5px;border-bottom:1px solid #d5d9df">' + esc_(sp.label) +
        (sprintRange_(sp) ? '<span style="font-weight:400;color:' + MUTED_ + '"> · ' + esc_(sprintRange_(sp)) + '</span>' : '') + '</td></tr>';
      sp.cats.forEach(function (cat) {
        html += '<tr><td colspan="' + COLS + '" style="padding:5px 10px 1px 18px;font-size:11px;font-weight:600;color:#6b7280">' + esc_(cat.name) + '</td></tr>';
        cat.tasks.forEach(function (t) {
          if (t.self) {
            html += row_({ name: t.task_name, bold: true, indent: 26, pic: t.self.pic, status: statusText_(t.self), dueIt: t.self });
          } else {
            // chỉ subtask đến hạn, nghiệp vụ cha thì chưa: cha là một dòng đầu mục mờ, chỉ có tên
            html += row_({ name: t.task_name, dim: true, blank: true, indent: 26 });
          }
          t.subs.forEach(function (s) {
            html += row_({ name: s.name, sub: true, indent: 44, pic: s.pic, status: statusText_(s), dueIt: s });
          });
        });
      });
    });
  });

  html += '<tr><td colspan="' + COLS + '" style="padding:8px 10px;font-size:11px;color:' + MUTED_ + '">' +
    '<a href="' + esc_(appUrl) + '" style="color:' + MUTED_ + '">Mở hệ thống</a> &nbsp;·&nbsp; Hạn: ngày hết hạn · số ngày làm việc còn lại (<span style="color:' + URGENT_ + '">đỏ</span> = còn 1 ngày)' +
    ' &nbsp;·&nbsp; <span style="color:' + WARN_ + '">—</span> = chưa có PIC</td></tr>' +
    '</table></td></tr></table>';
  return html;
}

function buildText_(data, appUrl) {
  var lines = ['VIỆC SẮP ĐẾN HẠN — ' + weekdayDmy_(data.today) + ' · ' + data.items.length + ' việc', ''];
  groupReport_(data.items).forEach(function (sec) {
    lines.push('== ' + sec.label.toUpperCase() + ' (' + countItems_(sec) + ' việc) ==');
    sec.sprints.forEach(function (sp) {
      lines.push(sp.label + (sprintRange_(sp) ? ' · ' + sprintRange_(sp) : ''));
      sp.cats.forEach(function (cat) {
        lines.push('  [' + cat.name + ']');
        cat.tasks.forEach(function (t) {
          if (t.self) {
            lines.push('  - ' + t.task_name + '  (' + [t.self.pic || 'chưa có PIC', statusText_(t.self), dueText_(t.self)].filter(Boolean).join(' · ') + ')');
          } else {
            lines.push('  - ' + t.task_name);
          }
          t.subs.forEach(function (s) {
            lines.push('      ↳ ' + s.name + '  (' + [s.pic || 'chưa có PIC', 'subtask ' + statusText_(s), dueText_(s)].filter(Boolean).join(' · ') + ')');
          });
        });
      });
    });
    lines.push('');
  });
  lines.push('Hạn: ngày hết hạn · số ngày làm việc còn lại');
  lines.push('Mở hệ thống: ' + appUrl);
  return lines.join('\n');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
function formatDmy_(iso) {
  var p = String(iso || '').slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
}
