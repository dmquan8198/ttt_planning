/**
 * Túi Thần Tài — báo cáo tuần cho sếp, tự tạo thành file GOOGLE SLIDES.
 *
 * Script này chạy TRONG Google Workspace của bạn (script.google.com). Mỗi tuần nó:
 *   1. gọi app (GET /api/reports/weekly.pptx) — app tự dựng bộ slide 4 trang từ dữ liệu hiện tại;
 *   2. đổi file .pptx đó thành Google Slides trong Drive của bạn (có thể vào một thư mục chỉ định);
 *   3. (tùy chọn) gửi một email có link tới REPORT_TO.
 * Ngoài ra script còn là một Web app (doPost): nút "Tạo báo cáo tuần" trên web gọi vào đó để tạo slide NGAY, chia sẻ và gửi
 * link qua email cho chính người bấm nút.
 *
 * Cài đặt từng bước: xem README.md cùng thư mục. Cần bật dịch vụ nâng cao "Drive API" (v3).
 *
 * Script properties (Project Settings → Script properties):
 *   APP_URL           bắt buộc  vd. https://ttt-planning.onrender.com
 *   REPORT_SECRET     bắt buộc  trùng REPORT_SECRET trên Render
 *   FOLDER_ID         tùy chọn  ID thư mục Drive để lưu slide (phần cuối của link thư mục). Trống = Drive gốc.
 *   REPORT_TO         tùy chọn  email nhận link slide (nhiều địa chỉ: cách nhau bằng dấu phẩy). Trống = không gửi mail.
 *   SHARE_WITH_DOMAIN tùy chọn  "true" = ai trong công ty có link đều XEM được (cần để người nhận mở được file).
 *                               Mặc định: không chia sẻ, chỉ bạn thấy.
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
 * Nút trên web (app gọi vào đây): tạo slide, CHIA SẺ cho người bấm nút (xem được) và gửi link qua email cho
 * chính họ. Cần triển khai script thành Web app — xem README.md. Bảo vệ bằng REPORT_SECRET trong nội dung yêu cầu.
 */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var p = props_();
    if (!body.secret || body.secret !== p.secret) throw new Error('Không có quyền.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.to || ''))) throw new Error('Thiếu email người nhận.');
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Đang có một báo cáo khác được tạo — thử lại sau ít phút.');
    try {
      out = create_(p, { to: String(body.to), shareWith: String(body.to), useToday: false }); // luôn là hôm nay thật, bỏ qua TODAY
      out.ok = true;
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Tải slide từ app → Google Slides → (chia sẻ) → (gửi mail). Trả về { url, title, to, shared }. */
function create_(p, opts) {
  var res = fetchDeck_(p.appUrl, p.secret, opts.useToday ? p.today : null);
  var title = '[TTT] Báo cáo tuần ' + formatDm_(res.weekStart) + ' – ' + formatDmy_(res.weekEnd);

  // Drive v3 chuyển .pptx thành Google Slides khi đặt mimeType đích của file mới là Slides.
  var resource = { name: title, mimeType: SLIDES_TYPE_ };
  if (p.folderId) resource.parents = [p.folderId];
  var file = Drive.Files.create(resource, res.blob, { supportsAllDrives: true });
  var url = 'https://docs.google.com/presentation/d/' + file.id + '/edit';

  if (p.shareDomain) {
    DriveApp.getFileById(file.id).setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  }
  var shared = null;
  if (opts.shareWith) {
    try {
      DriveApp.getFileById(file.id).addViewer(opts.shareWith);
      shared = true;
    } catch (e) {
      shared = false; // vd. chính sách Workspace chặn chia sẻ ra ngoài công ty — link vẫn gửi, người nhận cần xin quyền
      Logger.log('Không chia sẻ được cho ' + opts.shareWith + ': ' + e);
    }
  }
  Logger.log('Đã tạo: ' + title + ' → ' + url);

  if (opts.to) {
    MailApp.sendEmail({
      to: opts.to,
      subject: title,
      htmlBody: '<p>Báo cáo tuần ' + formatDm_(res.weekStart) + ' – ' + formatDmy_(res.weekEnd) + ' đã sẵn sàng:</p>' +
        '<p><a href="' + url + '">Mở Google Slides</a></p>' +
        (shared === false ? '<p style="color:#b45309">Chưa chia sẻ được file cho email này — nếu không mở được, hãy xin quyền xem.</p>' : '') +
        '<p style="color:#888;font-size:12px">Bộ slide tự tạo từ dữ liệu TTT Planning lúc ' + formatDmy_(res.weekEnd) + '.</p>',
      body: 'Báo cáo tuần ' + formatDm_(res.weekStart) + ' – ' + formatDmy_(res.weekEnd) + ': ' + url,
      name: 'Túi Thần Tài'
    });
    Logger.log('Đã gửi link → ' + opts.to);
  }
  return { url: url, title: title, to: opts.to || null, shared: shared };
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
