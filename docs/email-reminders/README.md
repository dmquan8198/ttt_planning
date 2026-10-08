# Báo cáo việc sắp đến hạn qua email

Mỗi ngày lúc **9h30** (giờ Việt Nam) **một email báo cáo duy nhất** gửi tới **một group mail**, liệt kê nghiệp vụ / subtask
**còn đúng 1 và 3 ngày làm việc** nữa là đến hạn. Không có email riêng cho từng người, từng task hay subtask.

## Email trông thế nào

Mỗi việc **một dòng** trong một bảng, không có ô thống kê. Việc được gom **ba tầng, đúng thứ tự**:

1. **Analyst hoặc Development** (theo trạng thái của nghiệp vụ; nhóm trống thì không hiện):
   - **Analyst:** Backlog, In Analyst, Ready for Dev
   - **Development:** In Dev, inTest UAT, Done UAT, Done
   (việc `Done` không bao giờ có trong báo cáo vì việc đã xong không cần nhắc; nhóm này chỉ có để đủ ánh xạ)
2. **Sprint**, tăng dần (S9 trước S10), việc không có sprint ở cuối. Tiêu đề sprint kèm **thời gian của sprint**:
   `S19 · 28/09 – 09/10`.
3. **Category**, theo thứ tự màn Sprint Overview của app (TTT New - Product Foundation, Cross Service Integration,
   Internal Features, Convert & Scale; category khác xếp sau, theo A–Z).

Sprint và category đã là tiêu đề nên không lặp trên từng dòng.

- **Tiêu đề thư:** `[TTT] Báo cáo việc sắp đến hạn — 08/10/2026 (12 việc)`
- **Đầu báo cáo:** "Việc sắp đến hạn · Thứ Năm, 08/10/2026 · 12 việc" — đúng một con số: tổng số việc.
- **Mỗi dòng:** `tên | PIC | status | hạn`. Hạn ghi **ngày + số ngày làm việc còn lại**, ví dụ `09/10 · còn 1 ngày`;
  còn 1 ngày thì chữ **đỏ**, nhiều hơn thì xám. Nghiệp vụ in đậm; subtask nằm ngay dưới nghiệp vụ cha, thụt vào với "↳", và
  theo nhóm / sprint / category của nghiệp vụ cha. Nếu chỉ subtask đến hạn còn nghiệp vụ cha thì chưa, nghiệp vụ cha là một
  dòng đầu mục mờ, không đậm, không có hạn.
- **Status của subtask khác hẳn status của nghiệp vụ:** status nghiệp vụ (In Dev, inTest UAT…) là chữ thường; status
  subtask (TODO / WIP / Done) là một **viên thuốc viền nhỏ, thụt vào** dưới status của cha — để không đọc nhầm hai thứ
  ngang hàng. (Bản chữ thường ghi rõ "subtask WIP".)
- **Ít chữ lặp lại:** thiếu PIC chỉ là dấu **—** (đỏ); sprint và category là tiêu đề nên không lặp trên từng dòng.
- Nền ngoài xám nhạt, thẻ giữa trắng; dùng `<table>` nên Outlook bản desktop cũng hiển thị đúng.
- Có bản chữ thường (plain text) cùng cấu trúc, ghi rõ "còn N ngày" cho từng việc.

**Vì sao không có tương tác (thu gọn/mở rộng) hay hai cột Analyst | Development:** mail client như Gmail/Outlook không chạy
script và bỏ hầu hết CSS tương tác, nên email chỉ đọc được, không bấm thu gọn được. Hai cột cạnh nhau cũng không gọn hơn khi hai
nhóm lệch nhau (ví dụ 3 việc Analyst so với 29 việc Development): cột trái gần như trống, cột phải dài gấp đôi vì mỗi việc
phải xuống hai dòng cho vừa chiều ngang.

## Cách hoạt động

```
Google Apps Script (trong Workspace công ty, 9h30 mỗi ngày)
   └─ GET https://ttt-planning.onrender.com/api/reminders/due   (kèm REMINDER_SECRET)
         └─ app trả danh sách việc sắp đến hạn (kèm PIC, sprint, status)
   └─ MailApp.sendEmail(...)  → 1 email tới group, gửi TỪ hộp thư công ty của bạn
```

Vì mail do chính Google Workspace của công ty gửi nên:

- **không cần SMTP** (Render gói free chặn cổng SMTP 25/465/587);
- **không để mật khẩu mail** ở Render hay GitHub;
- mail xuất phát từ domain công ty, **ít bị spam / bị cách ly**; bạn thấy nó trong thư mục Đã gửi.

## Quy tắc

| | |
|---|---|
| Khi nào | Còn đúng **1** hoặc **3** ngày làm việc trước hạn (đổi bằng property `DAYS`, vd `1,2,5`) |
| Ngày làm việc | Thứ Hai–thứ Sáu. **Chưa tính ngày lễ.** Hạn rơi vào cuối tuần được tính như thứ Sáu liền trước |
| Cuối tuần | Không gửi gì, kể cả khi trigger vẫn chạy (thứ Bảy, Chủ nhật không có "ngày làm việc" nào để đếm) |
| Giờ gửi | **9h30** mỗi ngày (đổi bằng property `SEND_AT`, dạng `HH:mm`, vd `08:45`). Script kiểm tra mỗi 5 phút nên mail đến lúc 9h30–9h35 |
| Việc nào | Nghiệp vụ chưa `6. Done`; subtask chưa `Done` **và** nghiệp vụ cha chưa Done; subtask phải có Due |
| Hạn của nghiệp vụ | Ngày Due hiển thị trên app: ngày tự chỉnh nếu có, không thì **cuối sprint** |
| Không có gì để báo cáo | Không gửi email nào |

Quá hạn và đúng ngày đến hạn **không** được đưa vào báo cáo (chỉ 1 và 3 ngày trước hạn).

> Vì nghiệp vụ không tự chỉnh ngày có hạn là cuối sprint, ở ngày còn 1 hoặc 3 ngày làm việc trước khi sprint kết thúc,
> báo cáo sẽ liệt kê **mọi** nghiệp vụ chưa xong của sprint đó — có thể rất dài.

## Thử trước khi deploy (không cần push, không cần secret)

Chỉ cần phần Google, không đụng tới app:

1. Làm bước **5.1–5.3** bên dưới (tạo project, dán `Code.gs`, đặt múi giờ). Chưa cần Script properties.
2. Chạy hàm **`sendSampleReportToMeOnly`** → bạn nhận ngay một email báo cáo với **dữ liệu mẫu** (tên "[Mẫu] …")
   trong hộp thư công ty thật. Từ đó bạn thấy được: email trông thế nào trong Outlook/Gmail của công ty, Google có cho script gửi mail không,
   và mail có bị đưa vào spam không.
3. Muốn thử luôn quyền đăng bài vào group: thêm tạm địa chỉ group vào đối số `to` trong hàm này (hoặc nhờ ai trong group xác nhận đã nhận).

Phần còn lại (script gọi app lấy dữ liệu thật) chỉ chạy được sau khi code đã deploy và có `REMINDER_SECRET`; phần đó đã được kiểm tra bằng test tự động.

## Cài đặt (làm một lần)

### 1. Đặt secret trên Render

1. Tạo một chuỗi ngẫu nhiên dài, ví dụ chạy: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
2. Render dashboard → service **ttt-planning** → **Environment** → thêm biến `REMINDER_SECRET` = chuỗi đó → lưu (Render tự deploy lại).

Secret này **riêng** với `CRON_SECRET` của báo cáo snapshot (cái đó GitHub cũng giữ).

### 2. Database

`npm run migrate` thêm cột `tasks.pic` (người phụ trách nghiệp vụ). Cột mới có thể để trống nên không ảnh hưởng bản app đang chạy.

### 3. Gắn PIC cho nghiệp vụ (nên làm)

Báo cáo hiện cột PIC. Subtask đã có ô PIC từ trước; **khung sửa nghiệp vụ** giờ cũng có ô **PIC** (chọn từ danh sách ở Resource → Quản lý PIC).
Việc nào chưa có PIC vẫn nằm trong báo cáo, chỉ là bị tô đỏ "— chưa có —".

### 4. Chuẩn bị group mail

Dùng một Google Group / distribution list của công ty, ví dụ `ttt-team@congty.com`.
**Group phải cho phép tài khoản chạy script gửi thư vào** (cài đặt *Who can post*: thành viên group hoặc cả tổ chức).
Nếu không, mail sẽ bị từ chối hoặc nằm chờ duyệt.

### 5. Tạo Google Apps Script

1. Đăng nhập **tài khoản Google công ty**, mở <https://script.google.com> → **New project**.
2. Xóa nội dung mặc định, dán toàn bộ [`Code.gs`](./Code.gs).
3. **Project Settings** (bánh răng) → **Time zone** = `(GMT+07:00) Asia/Ho_Chi_Minh`.
4. Vẫn trong Project Settings → **Script properties** → thêm:
   - `APP_URL` = `https://ttt-planning.onrender.com`
   - `REMINDER_SECRET` = chuỗi ở bước 1
   - `REPORT_TO` = địa chỉ group mail (nhiều địa chỉ thì cách nhau bằng dấu phẩy)
   - (tùy chọn) `DAYS` — xem phần đầu `Code.gs`
5. Chọn hàm **`previewReport`** → **Run**. Lần đầu Google hỏi cấp quyền (gửi mail, gọi URL ngoài):
   chọn tài khoản → *Advanced* → *Go to … (unsafe)* → Allow. Đây là script của chính bạn nên cảnh báo "chưa xác minh" là bình thường.
   Xem **Execution log**: nó in ra nội dung báo cáo *sẽ* được gửi, chưa gửi gì.
6. Chạy **`sendReportToMeOnly`** → bạn nhận báo cáo (chỉ mình bạn) để kiểm tra giao diện.
7. Chạy **`installDailyTrigger`** một lần → bật gửi tự động mỗi ngày lúc **9h30**.
   - Trigger chạy **mỗi 5 phút**; hàm `sendReportAtScheduledTime` chỉ gửi **đúng một lần mỗi ngày**, từ 9h30 trở đi
     (nên mail đến lúc 9h30–9h35). Lý do không dùng "mỗi ngày lúc 9h30" có sẵn của Apps Script: nó chỉ cho chọn *giờ*, còn phút
     chỉ là "khoảng", lệch tới ±15 phút.
   - Cài sau 9h30 thì **không gửi bù hôm nay** (tránh báo cáo bất ngờ tới group lúc 11h); lần gửi đầu là sáng hôm sau.
     Muốn gửi ngay thì chạy `sendReport` (tới group) hoặc `sendReportToMeOnly` (chỉ bạn).
   - Xem hoặc xóa trigger ở menu **Triggers** (biểu tượng đồng hồ) bên trái; chạy lại `installDailyTrigger` sẽ thay trigger cũ.

Muốn thử khi hôm nay không có việc nào đến hạn: thêm tạm property `TODAY` = một ngày làm việc (`YYYY-MM-DD`) rồi chạy
`previewReport` — script sẽ hỏi app "nếu hôm nay là ngày đó thì có việc gì?". **Nhớ xóa property này sau khi thử.**

## Khi công ty dùng mail của họ — những chỗ có thể vướng

| Vấn đề | Chi tiết |
|---|---|
| IT chặn Apps Script | Admin Workspace có thể tắt Apps Script hoặc chặn gọi URL ngoài (`UrlFetchApp`). Nếu bước 5 báo lỗi quyền, nhờ IT bật |
| Quyền gửi vào group | Xem bước 4. Đây là lý do phổ biến nhất khiến mail "không đến nơi" |
| Hạn mức gửi | Mỗi ngày chỉ 1 email nên không đáng kể (Workspace cho khoảng 1.500 người nhận/ngày qua MailApp) |
| Nội dung đi qua đâu | Chỉ đi **app → Apps Script (Google, trong tenant công ty) → mail**. Không có dịch vụ gửi mail bên thứ ba |
| Người gửi | Mail hiện là **bạn** gửi (đúng tài khoản chạy script), tên hiển thị "Túi Thần Tài" |
| Muốn gửi lại báo cáo hôm nay | Xóa property `LAST_SENT` trong Script properties (hoặc chạy `sendReport`) |
| Bạn nghỉ việc / đổi quyền | Script và trigger gắn với tài khoản của bạn; tài khoản bị khóa thì báo cáo dừng. Nên có người thứ hai biết cách tạo lại |

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `App trả về 401` | `REMINDER_SECRET` trong Script properties khác trên Render |
| `App trả về 500 … REMINDER_SECRET chưa được cấu hình` | Chưa thêm biến trên Render, hoặc chưa deploy xong |
| `App trả về 400` | Property `DAYS` sai định dạng (cần dạng `1,3`, mỗi số 1–10) |
| `Thiếu REPORT_TO` | Chưa đặt địa chỉ group trong Script properties |
| Chạy chậm / báo "đang khởi động" | Render gói free ngủ khi rảnh; script tự thử lại 4 lần, mỗi lần cách 15 giây |
| Không nhận được gì | Hôm đó cuối tuần, hoặc không việc nào còn đúng 1/3 ngày làm việc — Execution log của `previewReport` cho biết |
| Group không nhận | Group chưa cho phép người gửi đăng bài (bước 4), hoặc mail đang chờ moderator duyệt |

## Đổi hoặc thu hồi secret

Đổi `REMINDER_SECRET` trên Render **và** trong Script properties. Ai có secret đều đọc được danh sách việc sắp đến hạn,
nên đừng gửi nó qua chat hay email.
