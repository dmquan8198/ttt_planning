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

/** Chạy hằng ngày bởi trigger: gửi báo cáo tới REPORT_TO. */
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
  var PARENT = '[Mẫu] Nạp tiền vào Túi qua ví liên kết';
  var data = {
    today: dayPlus_(0), windows: [1, 3], weekend: false,
    items: [
      { kind: 'task', id: 1, task_id: 1, name: PARENT, task_name: PARENT,
        sprint_code: 'S19', status: '3.in_test', due_date: dayPlus_(1), pic: 'An', working_days_left: 1 },
      { kind: 'subtask', id: 10, task_id: 1, name: '[Mẫu] QC test lại luồng nạp tiền', task_name: PARENT,
        sprint_code: 'S19', status: 'wip', due_date: dayPlus_(1), pic: 'Bình', working_days_left: 1 },
      { kind: 'task', id: 2, task_id: 2, name: '[Mẫu] Báo cáo tăng giảm vốn', task_name: '[Mẫu] Báo cáo tăng giảm vốn',
        sprint_code: 'S19', status: '1.in_analyst', due_date: dayPlus_(1), pic: null, working_days_left: 1 },
      { kind: 'task', id: 3, task_id: 3, name: '[Mẫu] Game Tiền lời nhân đôi', task_name: '[Mẫu] Game Tiền lời nhân đôi',
        sprint_code: 'S20', status: '4.in_test_uat', due_date: dayPlus_(3), pic: 'Cường', working_days_left: 3 },
      // chỉ subtask đến hạn, nghiệp vụ cha thì chưa
      { kind: 'subtask', id: 11, task_id: 4, name: '[Mẫu] Viết tài liệu tích hợp', task_name: '[Mẫu] Merge API rút tiền',
        sprint_code: 'S20', status: 'todo', due_date: dayPlus_(3), pic: null, working_days_left: 3 }
    ]
  };
  var appUrl = (PropertiesService.getScriptProperties().getProperty('APP_URL') || 'https://ttt-planning.onrender.com').replace(/\/+$/, '');
  deliver_(data, Session.getEffectiveUser().getEmail(), appUrl, false);
}

/** Chạy MỘT LẦN để hẹn giờ gửi mỗi sáng khoảng 8h (giờ theo múi giờ của project). */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendReport').timeBased().everyDays(1).atHour(8).create();
  Logger.log('Đã hẹn giờ: sendReport chạy mỗi ngày khoảng 8h–9h.');
}

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
// Gọn có chủ đích: không ô thống kê, mỗi việc đúng MỘT dòng trong một bảng nhỏ để xem hết trong một màn hình.
// Việc được gom theo NGÀY HẾT HẠN (ngày ghi một lần ở dải tiêu đề nhóm); trong nhóm, subtask nằm ngay dưới
// nghiệp vụ cha nên không phải lặp tên cha; việc chưa có PIC tự lộ ra ở cột PIC, không cần ô thống kê riêng.

var INK_ = '#1a1a1a', MUTED_ = '#8a8a8a', RULE_ = '#ececec', WARN_ = '#b5533c';

/**
 * Gom theo ngày hết hạn → trong ngày gom theo nghiệp vụ.
 * [{ due_date, days, tasks: [{ task_id, task_name, sprint_code, self: item|null, subs: [item] }] }]
 * `self` là null khi chỉ có subtask của nghiệp vụ đó đến hạn (nghiệp vụ cha thì chưa).
 */
function groupByDue_(items) {
  var groups = [];
  var byDate = {};
  items.forEach(function (it) {
    var g = byDate[it.due_date];
    if (!g) {
      g = byDate[it.due_date] = { due_date: it.due_date, days: it.working_days_left, tasks: [], byTask: {} };
      groups.push(g);
    }
    var t = g.byTask[it.task_id];
    if (!t) {
      t = g.byTask[it.task_id] = { task_id: it.task_id, task_name: it.task_name, sprint_code: it.sprint_code, self: null, subs: [] };
      g.tasks.push(t);
    }
    if (it.kind === 'task') t.self = it; else t.subs.push(it);
  });
  return groups.sort(function (a, b) { return a.due_date < b.due_date ? -1 : (a.due_date > b.due_date ? 1 : 0); });
}

/** Dòng phụ: các phần có giá trị, nối bằng " · ". Thiếu PIC thì nói rõ "chưa có PIC". */
function metaParts_(it, withSprint) {
  var parts = [];
  if (withSprint && it.sprint_code) parts.push({ text: it.sprint_code });
  parts.push(it.pic ? { text: it.pic } : { text: 'chưa có PIC', warn: true });
  var status = STATUS_LABELS_[it.status] || it.status;
  if (status) parts.push({ text: status });
  return parts;
}

function weekdayShort_(iso) {
  var d = new Date(String(iso) + 'T00:00:00Z');
  return WEEKDAYS_[d.getUTCDay()] + ' ' + formatDmy_(iso).slice(0, 5);
}
function weekdayDmy_(iso) {
  var d = new Date(String(iso) + 'T00:00:00Z');
  return WEEKDAYS_[d.getUTCDay()] + ', ' + formatDmy_(iso);
}

/**
 * Một bảng gọn, mỗi việc đúng MỘT dòng (tên | PIC | status | sprint) để cả báo cáo lọt trong một màn hình
 * (không có dòng tiêu đề cột — nội dung các cột tự giải thích).
 * Nền xám nhạt bao ngoài, thẻ trắng ở giữa, mỗi nhóm ngày hết hạn có một dải tiêu đề tô nhạt với vạch màu
 * bên trái (đỏ = còn 1 ngày, xám = còn nhiều hơn). Dùng <table> vì đó là thứ mọi mail client (kể cả Outlook
 * bản desktop) hiển thị đúng.
 */
function buildHtml_(data, appUrl) {
  var FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  var COLS = 4;
  function cell_(style, content) {
    return '<td style="padding:2px 10px;border-bottom:1px solid ' + RULE_ + ';vertical-align:top;' + style + '">' + content + '</td>';
  }
  /** Một dòng: name | pic | status | sprint. */
  function row_(c) {
    var nameStyle = 'padding-left:' + (c.sub ? 26 : 10) + 'px;' + (c.bold ? 'font-weight:600;' : '') + (c.dim ? 'color:#666;' : '');
    var pic = c.noPicCell ? '' : (c.pic ? esc_(c.pic) : '<span style="color:' + WARN_ + '">chưa có PIC</span>');
    return '<tr>' +
      cell_(nameStyle, (c.sub ? '<span style="color:#b5b5b5">↳</span> ' : '') + esc_(c.name)) +
      cell_('width:112px;white-space:nowrap;color:#555', pic) +
      cell_('width:88px;white-space:nowrap;color:#555', esc_(c.status || '')) +
      cell_('width:44px;white-space:nowrap;color:' + MUTED_, esc_(c.sprint || '')) +
      '</tr>';
  }

  var html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;font-family:' + FONT + ';color:' + INK_ + '">' +
    '<tr><td style="padding:10px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:780px;background:#ffffff;border:1px solid #dde1e6;border-collapse:separate;border-radius:6px;font-size:12px;line-height:1.3">' +
    '<tr><td colspan="' + COLS + '" style="padding:9px 10px 7px"><span style="font-size:16px;font-weight:600">Việc sắp đến hạn</span>' +
    '<span style="color:' + MUTED_ + '"> &nbsp;·&nbsp; ' + esc_(weekdayDmy_(data.today)) + ' &nbsp;·&nbsp; ' + data.items.length + ' việc</span></td></tr>';

  groupByDue_(data.items).forEach(function (g) {
    html += '<tr><td colspan="' + COLS + '" style="background:#eef1f5;border-left:3px solid ' + (g.days <= 1 ? '#d64545' : '#b9c0ca') +
      ';padding:4px 10px;font-weight:600;border-bottom:1px solid ' + RULE_ + '">Còn ' + g.days + ' ngày làm việc' +
      '<span style="font-weight:400;color:' + MUTED_ + '"> · hạn ' + esc_(weekdayShort_(g.due_date)) + '</span></td></tr>';
    g.tasks.forEach(function (t) {
      if (t.self) {
        html += row_({ name: t.task_name, bold: true, pic: t.self.pic, status: STATUS_LABELS_[t.self.status] || t.self.status, sprint: t.sprint_code });
      } else {
        // chỉ subtask đến hạn, nghiệp vụ cha thì chưa: cha là một dòng đầu mục mờ, chỉ có tên + sprint
        html += row_({ name: t.task_name, dim: true, noPicCell: true, sprint: t.sprint_code });
      }
      t.subs.forEach(function (s) {
        html += row_({ name: s.name, sub: true, pic: s.pic, status: STATUS_LABELS_[s.status] || s.status });
      });
    });
  });

  html += '<tr><td colspan="' + COLS + '" style="padding:5px 10px;font-size:11px"><a href="' + esc_(appUrl) + '" style="color:' + MUTED_ + '">Mở hệ thống</a></td></tr>' +
    '</table></td></tr></table>';
  return html;
}

function buildText_(data, appUrl) {
  var lines = ['VIỆC SẮP ĐẾN HẠN — ' + weekdayDmy_(data.today) + ' · ' + data.items.length + ' việc', ''];
  groupByDue_(data.items).forEach(function (g) {
    lines.push('CÒN ' + g.days + ' NGÀY LÀM VIỆC · hạn ' + weekdayShort_(g.due_date));
    g.tasks.forEach(function (t) {
      var meta = function (parts) { return parts.map(function (p) { return p.text; }).filter(function (s) { return s; }).join(' · '); };
      lines.push('- ' + t.task_name + (t.self ? '  (' + meta(metaParts_(t.self, true)) + ')' : (t.sprint_code ? '  (' + t.sprint_code + ')' : '')));
      t.subs.forEach(function (s) { lines.push('    ↳ ' + s.name + '  (' + meta(metaParts_(s, false)) + ')'); });
    });
    lines.push('');
  });
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
