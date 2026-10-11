/**
 * Túi Thần Tài — báo cáo tuần cho sếp, tự tạo thành file GOOGLE SLIDES.
 *
 * Script này chạy TRONG Google Workspace của bạn (script.google.com). Mỗi tuần nó:
 *   1. gọi app (GET /api/reports/weekly.pptx) — app tự dựng bộ slide 2 trang từ dữ liệu hiện tại;
 *   2. đổi file .pptx đó thành Google Slides trong Drive của bạn (có thể vào một thư mục chỉ định);
 *   3. (tùy chọn) gửi một email có link tới REPORT_TO.
 * Ngoài ra script còn là một Web app (doGet): nút "Tạo báo cáo tuần" trên web mở trang đó ở tab mới; nó chạy bằng tài khoản
 * công ty của CHÍNH người bấm (slide trong Drive của họ, mail gửi tới họ).
 *
 * Cài đặt từng bước: xem README.md cùng thư mục. Cần bật dịch vụ nâng cao "Drive API" (v3).
 *
 * Script properties (Project Settings → Script properties):
 *   APP_URL           bắt buộc  vd. https://ttt-planning.onrender.com
 *   REPORT_SECRET     bắt buộc  trùng REPORT_SECRET trên Render
 *   FOLDER_ID         tùy chọn  ID thư mục Drive (phần cuối của link thư mục) cho slide do CHỦ script chạy tay / theo lịch.
 *                               Nút trên web luôn lưu ở Drive của người bấm, bỏ qua thư mục này.
 *   REPORT_TO         tùy chọn  email nhận link slide (nhiều địa chỉ: cách nhau bằng dấu phẩy). Trống = không gửi mail.
 *   SHARE_WITH_DOMAIN tùy chọn  "true" = ai trong công ty có link đều XEM được file vừa tạo. Mặc định: chỉ người tạo thấy.
 *   ALLOWED_EMAILS    tùy chọn  email được phép dùng nút trên web (cách nhau bằng dấu phẩy). Trống = mọi người trong công ty
 *                               có link đều tạo được báo cáo.
 *   REPORT_DAY        tùy chọn  thứ tạo tự động, mặc định "FRIDAY" (MONDAY…SUNDAY)
 *   REPORT_HOUR       tùy chọn  giờ tạo tự động (0–23, theo múi giờ của project), mặc định "9"
 *   TODAY             chỉ để THỬ: YYYY-MM-DD — giả vờ hôm nay là ngày đó. Nhớ xóa đi sau khi thử xong.
 */

var PPTX_TYPE_ = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
var SLIDES_TYPE_ = 'application/vnd.google-apps.presentation';

/** Chỉ kiểm tra kết nối: tải bộ slide về và ghi dung lượng vào Execution log. KHÔNG tạo file, KHÔNG gửi mail. */
function testConnection() {
  var p = props_();
  var res = fetchDeck_(p.appUrl, p.secret, p.today);
  Logger.log('OK: ' + res.blob.getBytes().length + ' bytes, kỳ báo cáo ' + res.weekStart + ' → ' + res.weekEnd + '.');
}

/** Tạo slide NGAY BÂY GIỜ nhưng chỉ gửi link cho chủ script (bỏ qua REPORT_TO) — để thử lần đầu. */
function createWeeklyReportToMeOnly() {
  run_(true);
}

/** Tạo slide NGAY BÂY GIỜ (chạy tay); gửi link tới REPORT_TO nếu có. Tạo tự động hằng tuần là installWeeklyTrigger. */
function createWeeklyReport() {
  run_(false);
}

/** Chạy MỘT LẦN để bật tạo slide tự động mỗi tuần (mặc định thứ Sáu 9h). Gọi lại để đổi ngày/giờ. */
function installWeeklyTrigger() {
  removeWeeklyTrigger();
  var props = PropertiesService.getScriptProperties();
  var day = String(props.getProperty('REPORT_DAY') || 'FRIDAY').trim().toUpperCase();
  if (!ScriptApp.WeekDay[day]) throw new Error('REPORT_DAY không hợp lệ: ' + day + ' (MONDAY … SUNDAY).');
  var hour = Number(props.getProperty('REPORT_HOUR') || 9);
  if (!(hour >= 0 && hour <= 23)) throw new Error('REPORT_HOUR phải từ 0 đến 23.');
  ScriptApp.newTrigger('createWeeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay[day]).atHour(hour).create();
  Logger.log('Đã bật tạo slide tự động: ' + day + ' lúc ' + hour + 'h (múi giờ ' + Session.getScriptTimeZone() + ', lệch tối đa ~15 phút).');
}

/** Tắt tạo slide tự động. */
function removeWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'createWeeklyReport') ScriptApp.deleteTrigger(t);
  });
}

function props_() {
  var p = PropertiesService.getScriptProperties();
  var appUrl = (p.getProperty('APP_URL') || '').replace(/\/+$/, '');
  var secret = p.getProperty('REPORT_SECRET');
  if (!appUrl || !secret) throw new Error('Thiếu APP_URL hoặc REPORT_SECRET trong Script properties.');
  return {
    appUrl: appUrl, secret: secret, today: p.getProperty('TODAY'),
    folderId: (p.getProperty('FOLDER_ID') || '').trim(),
    to: (p.getProperty('REPORT_TO') || '').trim(),
    shareDomain: /^(true|1|yes|on)$/i.test(String(p.getProperty('SHARE_WITH_DOMAIN') || '').trim())
  };
}

/** Tạo theo lịch / chạy tay: gửi link tới REPORT_TO (hoặc chỉ chủ script nếu onlyOwner). */
function run_(onlyOwner) {
  var p = props_();
  create_(p, { to: onlyOwner ? Session.getEffectiveUser().getEmail() : p.to, useToday: true });
}

/**
 * Nút "Tạo báo cáo tuần" trên web mở trang này ở tab mới. Script được triển khai thành Web app với
 *   Execute as: User accessing the web app · Who has access: Anyone within <công ty>
 * nên mọi thứ chạy bằng CHÍNH tài khoản công ty của người bấm: slide nằm trong Drive của họ, mail gửi tới họ.
 * Lần đầu mỗi người sẽ thấy màn hình xin quyền của Google (Drive, gửi mail, kết nối ngoài).
 * REPORT_SECRET nằm trong Script properties — người bấm không đọc được, chỉ code script dùng.
 */
function doGet() {
  return HtmlService.createHtmlOutput(PAGE_HTML_).setTitle('Báo cáo tuần TTT');
}

/** Được trang trên gọi (google.script.run): tạo slide cho người đang truy cập. Trả về { url, title, to } hoặc ném lỗi. */
function createForMe() {
  var user = Session.getActiveUser().getEmail();
  if (!user) throw new Error('Không xác định được tài khoản của bạn — hãy đăng nhập Google công ty rồi thử lại.');
  var allowed = String(PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (allowed.length && allowed.indexOf(user.toLowerCase()) < 0) throw new Error('Tài khoản ' + user + ' chưa được phép tạo báo cáo.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Đang có một báo cáo khác được tạo — thử lại sau ít phút.');
  try {
    // thư mục FOLDER_ID là của chủ script, người khác không ghi vào được → lưu ở Drive của chính người bấm
    return create_(props_(), { to: user, useToday: false, useFolder: false });
  } finally {
    lock.releaseLock();
  }
}

var PAGE_HTML_ = '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">' +
  '<style>body{font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#262626}' +
  'h1{font-size:20px;color:#A50064}.box{border:1px solid #e6d5de;border-radius:10px;padding:18px 20px;margin-top:18px}' +
  'a.btn{display:inline-block;margin-top:12px;background:#A50064;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold}' +
  '.err{color:#b42318}.mute{color:#6b6b6b;font-size:13px}</style></head><body>' +
  '<h1>Báo cáo tuần TTT</h1><div class="box" id="out">Đang lấy dữ liệu, dựng slide và chuyển sang Google Slides… (khoảng 30 giây — đừng đóng tab)</div>' +
  '<p class="mute">Slide được lưu trong Drive của bạn và link được gửi qua email của bạn.</p>' +
  '<script>' +
  'function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}' +
  'google.script.run.withSuccessHandler(function(r){' +
  'document.getElementById("out").innerHTML="✓ Đã tạo <b>"+esc(r.title)+"</b> và gửi link tới <b>"+esc(r.to)+"</b>.<br><a class=\\"btn\\" target=\\"_blank\\" href=\\""+esc(r.url)+"\\">Mở Google Slides</a>";' +
  '}).withFailureHandler(function(e){' +
  'document.getElementById("out").innerHTML="<span class=\\"err\\">Không tạo được báo cáo: "+esc(e&&e.message?e.message:e)+"</span>";' +
  '}).createForMe();' +
  '</script></body></html>';

/** Tải slide từ app → Google Slides (Drive của người chạy) → gửi mail. Trả về { url, title, to }. */
function create_(p, opts) {
  var res = fetchDeck_(p.appUrl, p.secret, opts.useToday ? p.today : null);
  var title = '[TTT] Báo cáo tuần ' + formatDm_(res.weekStart) + ' – ' + formatDmy_(res.weekEnd);

  // Drive v3 chuyển .pptx thành Google Slides khi đặt mimeType đích của file mới là Slides.
  var resource = { name: title, mimeType: SLIDES_TYPE_ };
  if (p.folderId && opts.useFolder !== false) resource.parents = [p.folderId];
  var file = Drive.Files.create(resource, res.blob, { supportsAllDrives: true });
  var url = 'https://docs.google.com/presentation/d/' + file.id + '/edit';

  if (p.shareDomain) {
    DriveApp.getFileById(file.id).setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  }
  Logger.log('Đã tạo: ' + title + ' → ' + url);

  if (opts.to) {
    MailApp.sendEmail({
      to: opts.to,
      subject: title,
      htmlBody: '<p>Báo cáo tuần ' + formatDm_(res.weekStart) + ' – ' + formatDmy_(res.weekEnd) + ' đã sẵn sàng:</p>' +
        '<p><a href="' + url + '">Mở Google Slides</a></p>' +
        '<p style="color:#888;font-size:12px">Bộ slide tự tạo từ dữ liệu TTT Planning lúc ' + formatDmy_(res.weekEnd) + '.</p>',
      body: 'Báo cáo tuần ' + formatDm_(res.weekStart) + ' – ' + formatDmy_(res.weekEnd) + ': ' + url,
      name: 'Túi Thần Tài'
    });
    Logger.log('Đã gửi link → ' + opts.to);
  }
  return { url: url, title: title, to: opts.to || null };
}

/** Tải bộ slide từ app; Render gói free ngủ khi rảnh nên lần đầu có thể mất ~1 phút → thử lại. */
function fetchDeck_(appUrl, secret, todayOverride) {
  var url = appUrl + '/api/reports/weekly.pptx' + (todayOverride ? '?today=' + encodeURIComponent(todayOverride) : '');
  var lastError;
  for (var attempt = 1; attempt <= 4; attempt++) {
    try {
      var res = UrlFetchApp.fetch(url, { headers: { 'X-Report-Secret': secret }, muteHttpExceptions: true });
      var code = res.getResponseCode();
      if (code === 200) {
        var m = /bao-cao-tuan_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.pptx/.exec(headerValue_(res.getHeaders(), 'Content-Disposition') || '');
        if (!m) throw new Error('App trả về 200 nhưng thiếu tên file kỳ báo cáo — kiểm tra phiên bản app.');
        return {
          blob: res.getBlob().setContentType(PPTX_TYPE_).setName('bao-cao-tuan.pptx'),
          weekStart: addDays_(m[1], 1), // m[1] là ngày cuối tuần trước; tuần báo cáo bắt đầu hôm sau
          weekEnd: m[2]
        };
      }
      if (code === 400 || code === 401 || code === 500) {
        // cấu hình sai — thử lại cũng vô ích
        throw new Error('App trả về ' + code + ': ' + res.getContentText().slice(0, 200));
      }
      lastError = new Error('App trả về ' + code + ' (đang khởi động?)');
    } catch (e) {
      if (/App trả về (400|401|500)|thiếu tên file/.test(String(e.message))) throw e;
      lastError = e;
    }
    if (attempt < 4) Utilities.sleep(15000);
  }
  throw lastError;
}

function headerValue_(headers, name) {
  for (var k in headers) if (k.toLowerCase() === name.toLowerCase()) return headers[k];
  return null;
}
function addDays_(iso, n) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}
function formatDm_(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
function formatDmy_(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
