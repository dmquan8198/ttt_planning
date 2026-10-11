# Báo cáo tuần → Google Slides (bấm nút trên web)

Trên web, vào **Báo cáo Snapshot** → bấm **✦ Tạo báo cáo tuần (Google Slides)** (chỉ hiện với role **editor** trở lên). Khoảng 30 giây sau:

1. một file **Google Slides** 4 trang được tạo từ dữ liệu hiện tại;
2. file được **chia sẻ (quyền xem) cho email bạn đang đăng nhập**;
3. **link slide được gửi qua email** tới chính email đó, và hiện luôn ngay dưới nút.

Mỗi lần bấm tạo một file mới (tên `[TTT] Báo cáo tuần 05/10 – 11/10/2026`) — không ghi đè bản cũ.

## Cách hoạt động

```
Web: nút bấm
  └─ POST /api/reports/weekly/send           (app trên Render; người bấm phải là editor+)
        └─ POST <APPS_SCRIPT_URL>             (Google Apps Script chạy trong Workspace công ty)
              ├─ GET /api/reports/weekly.pptx  (app dựng bộ slide từ dữ liệu, kèm REPORT_SECRET)
              ├─ Drive API v3: đổi .pptx → Google Slides, lưu vào Drive (thư mục FOLDER_ID nếu có)
              ├─ chia sẻ quyền xem cho người bấm
              └─ MailApp: gửi link cho người bấm
```

- Slide nằm trong **Drive của chủ script** (không phải của người bấm), chia sẻ cho người bấm; mail gửi từ hộp thư của chủ script.
- App **không bao giờ cầm token Google nào** — mọi quyền Drive/Mail nằm trong Apps Script của bạn.
- Người nhận luôn là **email đã đăng nhập** của người bấm — không nhận địa chỉ nào từ trình duyệt gửi lên, nên không dùng nút này để gửi mail cho người khác được.

## Bộ slide gồm gì

| Trang | Nội dung |
|---|---|
| 1. Tổng quan & thay đổi | Số liệu chính; pipeline 7 giai đoạn, cột nét đứt = tuần trước, cột đặc = hiện tại |
| 2. Chi tiết nghiệp vụ | Tiến độ từng category (thanh xếp chồng), Done tuần này, quá hạn |
| 3. Sprint & nút thắt | Sprint vừa qua / đang chạy so với sprint kế tiếp, hàng chờ UAT so với tuần trước |
| 4. Rủi ro & đề xuất | Bảng: rủi ro, dấu hiệu bằng số liệu, hậu quả, đề xuất |

Câu chữ và số liệu đều sinh từ dữ liệu, nên tuần nào cũng khác. **Cột "Đề xuất" ở trang 4 là gợi ý theo quy tắc chung** — vì là Google Slides
thật nên bạn sửa tay thoải mái trước khi gửi sếp.

## Cài đặt (một lần)

### 1. Đặt secret trên Render

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Render → service → **Environment** → thêm `REPORT_SECRET` = chuỗi đó. (Bước 4 sẽ thêm `APPS_SCRIPT_URL`.)

> `REPORT_SECRET` là secret riêng của báo cáo này, không dùng chung với `REMINDER_SECRET` / `CRON_SECRET`: ai có nó đọc được toàn bộ tình hình dự án.

### 2. Tạo Apps Script

1. Vào <https://script.google.com> → **Dự án mới** (nên tạo riêng, không gộp với script email nhắc việc).
2. Dán toàn bộ [`Code.gs`](Code.gs) vào file `Code.gs`.
3. **Project Settings** → bật *Show "appsscript.json" manifest file* → thay nội dung bằng [`appsscript.json`](appsscript.json)
   (hoặc: cột **Services** → **+** → **Drive API** → phiên bản **v3** → Add).
4. **Project Settings → Script properties**:

| Property | Bắt buộc | Ý nghĩa |
|---|---|---|
| `APP_URL` | có | vd. `https://ttt-planning.onrender.com` |
| `REPORT_SECRET` | có | đúng chuỗi ở bước 1 |
| `FOLDER_ID` | không | thư mục Drive lưu slide (phần cuối của link thư mục). Trống = Drive gốc |
| `SHARE_WITH_DOMAIN` | không | `true` = ai trong công ty có link đều **xem** được (ngoài việc chia sẻ riêng cho người bấm) |
| `REPORT_TO`, `REPORT_DAY`, `REPORT_HOUR` | không | chỉ cho chế độ **tự động hằng tuần** (xem cuối trang), nút trên web không dùng |

### 3. Thử Apps Script trước khi nối với web

Chạy trong trình soạn thảo (lần đầu Google hỏi quyền: Drive, kết nối ngoài, gửi mail, Web app — bấm cho phép):

1. `testConnection` — chỉ tải bộ slide về và ghi dung lượng vào **Execution log**. 401 = sai secret; 500 = Render chưa có `REPORT_SECRET`.
   Lần đầu app có thể "ngủ" nên mất tới ~1 phút (script tự thử lại).
2. `createWeeklyReportToMeOnly` — tạo Google Slides thật và gửi link **chỉ cho bạn**. Mở ra xem một lượt.

### 4. Triển khai thành Web app và nối vào app

1. Trong Apps Script: **Deploy → New deployment → loại "Web app"**.
   - *Execute as*: **Me** (chủ script)
   - *Who has access*: **Anyone** (để server Render gọi được mà không cần đăng nhập Google; **bảo vệ bằng `REPORT_SECRET`** trong nội dung yêu cầu — sai secret là bị từ chối)
2. Copy **Web app URL** (dạng `https://script.google.com/macros/s/…/exec`).
3. Render → **Environment** → thêm `APPS_SCRIPT_URL` = URL đó → lưu (Render tự deploy lại).
4. Mở web → **Báo cáo Snapshot** → bấm nút. Lỗi 503 = chưa đặt `APPS_SCRIPT_URL` / `REPORT_SECRET`; 502 = Apps Script báo lỗi (thông báo hiện ngay dưới nút).

> Mỗi lần **sửa `Code.gs`** phải **Deploy → Manage deployments → ✎ → New version** thì Web app mới dùng bản mới.

## Lưu ý

- **Chia sẻ ra ngoài công ty:** nếu đăng nhập web bằng email ngoài (vd. `@gmail.com`) mà chính sách Workspace chặn chia sẻ ra ngoài, file vẫn được tạo
  và link vẫn được gửi, nhưng web sẽ báo "chưa chia sẻ được" — khi đó mở bằng tài khoản công ty, hoặc đặt `SHARE_WITH_DOMAIN=true`.
- **Bấm hai lần liên tiếp** không tạo hai file: server từ chối lượt thứ hai (409) cho tới khi lượt đầu xong.
- **So với tuần trước** dùng snapshot hằng đêm (`.github/workflows/nightly-snapshot.yml`). Nếu snapshot ngừng chạy, trang 1 sẽ thiếu số tuần trước.
- **"Quá hạn"** tính theo mốc **Done UAT** (khớp email nhắc việc): việc đã tới Done UAT hoặc Done không còn bị tính là trễ. Trang 4 có nêu thêm con số theo mốc Done.
- **Xem số liệu thô / thử layout ở máy:** `node scripts/weekly_report_data.js > report.json` rồi
  `node scripts/weekly_report_deck.js report.json out.pptx`.

## (Tùy chọn) Vẫn muốn tự động hằng tuần

Cùng script đó còn có chế độ theo lịch, không liên quan tới nút: đặt `REPORT_TO` (email nhận link; nhiều địa chỉ cách nhau bằng dấu phẩy) rồi chạy
`installWeeklyTrigger` — mặc định thứ Sáu 9h (`REPORT_DAY` / `REPORT_HOUR` để đổi). Tắt bằng `removeWeeklyTrigger`. Nếu chỉ dùng nút thì bỏ qua phần này.
