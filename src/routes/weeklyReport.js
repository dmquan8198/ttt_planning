const crypto = require('crypto');
const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { getTodayVN } = require('../lib/today');
const { collectWeeklyReport } = require('../lib/weeklyReportData');
const { buildWeeklyDeck } = require('../lib/weeklyReportDeck');
const { requireRole } = require('../lib/requireRole');

// constant-time compare via fixed-length hashes (same approach as basicAuth.js)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// how long the app waits for the Apps Script (it fetches the deck back from this
// app, converts it to Slides and sends the mail — typically 10-30 s)
const APPS_SCRIPT_TIMEOUT_MS = 100000;

// fetchFn is injectable so tests never call Google (same DI idea as createApp's
// googleTokenVerifier / llmGenerateFn)
function weeklyReportRouter(pool, fetchFn = (...args) => fetch(...args)) {
  const router = Router();
  let sending = false; // one report at a time: a double click must not create two Slides files

  // Read by the Google Apps Script that turns the deck into a Google Slides
  // file (see docs/weekly-report/README.md) — machine-to-machine, so a shared
  // secret rather than requireRole, like /api/reminders/due. It has its OWN
  // secret (REPORT_SECRET): its holder can read the whole project's status.
  // Denied by default when the server has no secret configured.
  router.get('/weekly.pptx', asyncHandler(async (req, res) => {
    const secret = process.env.REPORT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'REPORT_SECRET chưa được cấu hình trên server' });
    }
    if (!safeEqual(req.headers['x-report-secret'] || '', secret)) {
      return res.status(401).json({ error: 'Không có quyền' });
    }
    const today = req.query.today || getTodayVN();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      return res.status(400).json({ error: 'today không hợp lệ (YYYY-MM-DD)' });
    }

    const report = await collectWeeklyReport(pool, today);
    const { buffer } = await buildWeeklyDeck(report);
    // the period rides in the file name (ASCII only — headers are latin1) so the
    // Apps Script can title the Slides file without parsing the deck
    res.set({
      'Content-Type': PPTX_TYPE,
      'Content-Disposition': `attachment; filename="bao-cao-tuan_${report.weekAgo}_${report.today}.pptx"`,
      'Cache-Control': 'no-store'
    });
    res.send(buffer);
  }));

  // The "Tạo báo cáo tuần" button on the web. The Google side runs in the
  // company's Google Workspace as an Apps Script web app (docs/weekly-report/Code.gs,
  // doPost): it pulls the deck from GET /weekly.pptx above, converts it to a Google
  // Slides file, shares it with the requester and mails them the link. This route
  // only asks it to do so — no Google token is ever handled by this app. The
  // recipient is the signed-in user's own email (never taken from the request body).
  router.post('/weekly/send', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const scriptUrl = process.env.APPS_SCRIPT_URL;
    const secret = process.env.REPORT_SECRET;
    if (!scriptUrl || !secret) {
      return res.status(503).json({ error: 'Chưa cấu hình APPS_SCRIPT_URL / REPORT_SECRET trên server — xem docs/weekly-report/README.md' });
    }
    const to = req.actorEmail;
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(400).json({ error: 'Không xác định được email của bạn — hãy đăng nhập lại bằng Google' });
    }
    if (sending) {
      return res.status(409).json({ error: 'Đang tạo báo cáo — đợi khoảng 30 giây rồi thử lại' });
    }

    sending = true;
    try {
      let body;
      try {
        const resp = await fetchFn(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, to }),
          redirect: 'follow',
          signal: AbortSignal.timeout(APPS_SCRIPT_TIMEOUT_MS)
        });
        const text = await resp.text();
        try { body = JSON.parse(text); } catch (e) { body = null; }
        if (!resp.ok && !body) throw new Error(`Apps Script trả về HTTP ${resp.status}`);
        if (!body) throw new Error('Apps Script trả về nội dung không đọc được (đã triển khai Web app chưa, quyền truy cập "Bất kỳ ai"?)');
      } catch (err) {
        console.error('weekly report: Apps Script call failed', err);
        const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        return res.status(502).json({ error: timedOut ? 'Apps Script phản hồi quá lâu — kiểm tra Drive xem slide đã được tạo chưa' : (err.message || 'Không gọi được Apps Script') });
      }
      if (!body.ok) {
        return res.status(502).json({ error: body.error || 'Apps Script báo lỗi' });
      }
      res.json({ url: body.url, title: body.title, to, shared: body.shared });
    } finally {
      sending = false;
    }
  }));

  return router;
}

module.exports = weeklyReportRouter;
