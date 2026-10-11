# Báo cáo tuần → Google Slides (bấm nút trên web)

Trên web, vào **Báo cáo Snapshot** → bấm **✦ Tạo báo cáo tuần (Google Slides) ↗** (chỉ hiện với role **editor** trở lên). Một tab mới mở ra, và khoảng 30 giây sau:

1. một file **Google Slides** được tạo từ dữ liệu hiện tại, nằm trong **Drive của chính bạn**;
2. **link slide được gửi qua email** của bạn, và hiện luôn trên tab đó.

Mỗi lần bấm tạo một file mới (tên `[TTT] Báo cáo tuần 05/10 – 11/10/2026`) — không ghi đè bản cũ.

## Cách hoạt động

```
Web: nút bấm ──mở tab mới──▶ Apps Script Web app (chạy bằng TÀI KHOẢN CÔNG TY của người bấm)
                               ├─ GET <APP_URL>/api/reports/weekly.pptx   (kèm REPORT_SECRET lấy từ Script properties)
                               ├─ Drive API v3: đổi .pptx → Google Slides, lưu vào Drive của người bấm
                               └─ MailApp: gửi link cho người bấm
```

- Web app được triển khai kiểu **Execute as: User accessing the web app** + **Who has access: Anyone within <công ty>**. Đây là tùy chọn duy nhất
  nhiều công ty cho phép, và cũng an toàn nhất: chỉ tài khoản công ty mở được, slide và mail đều thuộc về chính người bấm.
- `REPORT_SECRET` chỉ nằm trong Script properties của script (và trên Render). Người bấm nút **không đọc được** nó; chỉ code script dùng.
- App không cầm token Google nào.
- Mỗi người dùng nút lần đầu sẽ thấy màn hình xin quyền của Google (Drive, gửi mail, kết nối ngoài) — bấm cho phép.

## Bộ slide gồm gì

Slide viết dạng highlight (cụm từ ngắn), font **Momo Trust Display**, một màu nhấn (magenta MoMo) + các mức xám, dùng từ dễ hiểu
(vd. "Đang test" thay cho "inTest UAT"). Số slide thay đổi theo số nghiệp vụ đang làm (thường 8–10):

| Slide | Nội dung |
|---|---|
| 1. Timeline | Trục thời gian theo tháng, các **mốc phase** (hình thoi, kèm ngày), vạch **hôm nay**. Bên dưới là các **làn** (Foundation / Cross Service / Nhóm khác), mỗi sprint một cột, mỗi việc chính là một ô: xám = đã xong, hồng nhạt = đang làm, viền đứt = chưa bắt đầu |
| 2. Từng mốc | **Bảng** mốc (vừa xong · đang/sắp làm · tiếp theo · sau đó) × nhóm: đang làm gì ở mỗi mốc |
| 3… Chi tiết | **Bảng** mọi nghiệp vụ đang làm (chưa Done) của các sprint đã qua, đang/sắp chạy và sprint kế tiếp, chia theo nhóm: **Sprint · Trạng thái · Hiện tại · Bước tiếp theo**. Chữ nhỏ để nhiều dòng trên một slide; tự sang trang khi hết chỗ |
| Cuối | **Bảng** tên các nghiệp vụ xếp sau (chưa bắt đầu), theo sprint |

Các trang 2, chi tiết và cuối là **bảng thật** của Google Slides: bạn thêm/bớt dòng, đổi độ rộng cột, đổi chữ đồng loạt mà không phải căn từng ô. (Cột Blocker tạm bỏ; dữ liệu blocker vẫn được tính sẵn nếu cần bật lại.)

**Dữ liệu lấy ở đâu:**
- *Phase / sprint / mốc:* màn Roadmap và Sprint của app (bảng `phases`, `sprints`).
- *Hiện tại* và *Bước tiếp theo*: dòng `Status:` và `Next action:` **mới nhất** trong Log hoạt động của từng nghiệp vụ (30 ngày gần nhất). Việc chưa có ghi chú thì "Hiện tại" để trống (—)
  và "Bước tiếp theo" dùng bước mặc định theo giai đoạn (vd. Đang test → "Chốt kết quả test"). **Ghi chú theo mẫu `Status:` / `Next action:` càng đều thì slide càng đúng.**
- *Blocker*: app chưa có trường blocker riêng, nên suy ra từ dữ liệu: quá hạn N ngày, bị dời lịch (kèm "Lý do dời ngày"), ghi chú đang chờ phản hồi ("chờ", "chưa phản hồi", "gửi lại"…),
  hoặc quá 7 ngày chưa có cập nhật. **Không suy ra được thì ghi "Không có"** — bạn sửa tay trong Google Slides nếu biết thêm.
- *Các nội dung ở trang 1–2* được gom tự động: các việc cùng tiền tố (vd. `[SOF] Thanh toán bằng Túi - …`) hoặc cùng cụm từ (vd. "Quỹ sinh lời") thành một dòng có số lượng.

Câu chữ và số liệu đều sinh từ dữ liệu, nên tuần nào cũng khác. Vì là Google Slides thật nên bạn sửa tay thoải mái trước khi gửi sếp.

## Cài đặt (một lần)

### 1. Đặt secret trên Render

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Render → service → **Environment** → thêm `REPORT_SECRET` = chuỗi đó.

> `REPORT_SECRET` là secret riêng của báo cáo này, không dùng chung với `REMINDER_SECRET` / `CRON_SECRET`: ai có nó đọc được toàn bộ tình hình dự án.

### 2. Tạo Apps Script

1. Vào <https://script.google.com> bằng **tài khoản Workspace công ty** → **Dự án mới**.
2. Dán toàn bộ [`Code.gs`](Code.gs) vào file `Code.gs`.
3. Cột **Services** → **+** → **Drive API** → phiên bản **v3** → Add
   (hoặc **Project Settings** → bật *Show "appsscript.json" manifest file* → thay nội dung bằng [`appsscript.json`](appsscript.json)).
4. **Project Settings → Script properties**:

| Property | Bắt buộc | Ý nghĩa |
|---|---|---|
| `APP_URL` | có | vd. `https://ttt-planning.onrender.com` (không có `/` ở cuối) |
| `REPORT_SECRET` | có | đúng chuỗi ở bước 1 |
| `ALLOWED_EMAILS` | không | email được phép dùng nút (cách nhau bằng dấu phẩy). Trống = mọi người trong công ty có link đều tạo được |
| `SHARE_WITH_DOMAIN` | không | `true` = ai trong công ty có link đều **xem** được file vừa tạo (mặc định chỉ người tạo thấy) |
| `FOLDER_ID` | không | chỉ dùng khi **chủ script** chạy tay/theo lịch; nút web luôn lưu ở Drive của người bấm. Là **ID** thư mục (đoạn sau `/folders/` trong URL), không phải tên |

### 3. Thử trong trình soạn thảo

Chọn hàm rồi bấm **▶ Run** (lần đầu Google hỏi quyền: Review permissions → chọn tài khoản → Advanced → Go to … (unsafe) → Allow):

1. `testConnection` — chỉ tải bộ slide về và ghi dung lượng vào **Execution log**. 401 = sai secret; 500 = Render chưa có `REPORT_SECRET`.
   Lần đầu app có thể "ngủ" nên mất tới ~1 phút (script tự thử lại).
2. `createWeeklyReportToMeOnly` — tạo Google Slides thật và gửi link cho bạn. Mở ra xem một lượt.

### 4. Triển khai Web app và nối vào app

1. Trong Apps Script: **Deploy → New deployment** → ⚙ **Select type: Web app**.
   - *Execute as*: **User accessing the web app**
   - *Who has access*: **Anyone within <công ty>**
2. **Deploy**, copy **Web app URL** (dạng `https://script.google.com/a/macros/<công-ty>/s/…/exec`).
3. Render → **Environment** → thêm `APPS_SCRIPT_URL` = URL đó → lưu (Render tự deploy lại).
4. Mở web → **Báo cáo Snapshot** → bấm nút. Một tab mới mở ra, lần đầu Google xin quyền (Cho phép), rồi hiện kết quả sau ~30 giây.

> Mỗi lần **sửa `Code.gs`** phải **Deploy → Manage deployments → ✎ → Version: New version → Deploy** thì Web app mới dùng bản mới (URL không đổi).

## Gặp lỗi?

| Thông báo | Cách xử lý |
|---|---|
| Web báo "Chưa cấu hình APPS_SCRIPT_URL…" | Thiếu `APPS_SCRIPT_URL` trên Render, hoặc chưa deploy lại sau khi thêm |
| Tab mới hiện "Script function not found: doGet" | Web app đang dùng bản `Code.gs` cũ → tạo **New version** (xem ghi chú trên) |
| "Tài khoản … chưa được phép tạo báo cáo" | Email của bạn không nằm trong `ALLOWED_EMAILS` |
| "Không xác định được tài khoản của bạn" | Đăng nhập Google công ty trong trình duyệt rồi mở lại |
| "Đang có một báo cáo khác được tạo" | Đang có người khác tạo; đợi ~30 giây rồi bấm lại |
| `App trả về 401` | `REPORT_SECRET` ở Apps Script khác ở Render |
| `App trả về 500 … chưa được cấu hình` | Render chưa có `REPORT_SECRET`, hoặc chưa deploy xong |
| `Drive is not defined` | Chưa bật dịch vụ **Drive API v3** (bước 2.3) |
| Trình duyệt chặn tab mới | Web hiện sẵn một link "Bấm vào đây để tạo báo cáo" |

## Lưu ý

- **So với tuần trước** dùng snapshot hằng đêm (`.github/workflows/nightly-snapshot.yml`). Nếu snapshot ngừng chạy, trang 1 sẽ thiếu số tuần trước.
- **"Quá hạn"** tính theo mốc **Done UAT** (khớp email nhắc việc): việc đã tới Done UAT hoặc Done không còn bị tính là trễ. Trang 4 có nêu thêm con số theo mốc Done.
- **Xem số liệu thô / thử layout ở máy:** `node scripts/weekly_report_data.js > report.json` rồi `node scripts/weekly_report_deck.js report.json out.pptx`.

## (Tùy chọn) Tự động hằng tuần cho chủ script

Cùng script đó còn có chế độ theo lịch, không liên quan tới nút: đặt `REPORT_TO` (email nhận link; nhiều địa chỉ cách nhau bằng dấu phẩy) rồi chạy
`installWeeklyTrigger` — mặc định thứ Sáu 9h (`REPORT_DAY` / `REPORT_HOUR` để đổi). Tắt bằng `removeWeeklyTrigger`. Nếu chỉ dùng nút thì bỏ qua phần này.
