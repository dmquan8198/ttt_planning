# Spec: TTT Project Manager (thay thế sheet "Nghiệp vụ")

Web app quản lý dự án cá nhân (single-user), thay thế file Excel `[TTT New] Planning.xlsx`, giữ nguyên nghiệp vụ hiện có và bổ sung các view timeline trực quan.

## Problem Statement

Hiện tại toàn bộ tiến độ ~108 nghiệp vụ của dự án TTT New được quản lý trên 1 sheet Excel duy nhất. Sheet phục vụ tốt việc nhập liệu thô nhưng không cho phép xem timeline theo ngày, không có view tổng thể theo Phase để đối chiếu deadline, và cơ chế ghi chú (đẻ thêm 1 cột mới mỗi lần cập nhật) không scale — sheet đã có 2 cột Note riêng theo 2 mốc thời gian khác nhau và sẽ tiếp tục phình ra theo thời gian. Không có nơi nào trả lời nhanh câu hỏi "hôm nay/sprint này cần làm gì" hay "tổng thể có kịp mốc go-live không" mà không phải tự lọc/tính tay trên Excel.

## Goals

1. Nhập liệu nghiệp vụ nhanh không chậm hơn Excel (tạo/sửa 1 task trong < 15 giây).
2. Trả lời được "tổng thể dự án đang ở đâu so với mốc Phase" chỉ bằng 1 lần nhìn (không cần lọc/tính tay).
3. Trả lời được "sprint này và sprint sau cần làm gì" mà không cần mở file, lọc cột Sprint.
4. Loại bỏ hoàn toàn cơ chế "đẻ cột Note theo ngày" — thay bằng activity log không giới hạn.
5. Toàn bộ dữ liệu nằm trong database thật, không phụ thuộc file cục bộ hay local storage của trình duyệt.

## Non-Goals

- **Multi-user / phân quyền** — chỉ 1 người dùng duy nhất (đã chốt khi brainstorm), không cần auth phức tạp, không cần real-time sync giữa nhiều người sửa cùng lúc.
- **Risk indicator tự động (on-track/at-risk theo velocity)** — gác lại sau khi có đủ lịch sử ngày hoàn thành thực tế; v1 chỉ hiển thị % và số ngày còn lại.
- **Auto-split ngày trong sprint theo từng task** — v1 dùng nguyên dải ngày của Sprint làm mặc định, override tay khi cần chính xác hơn; không xây thuật toán tự chia nhỏ.
- **Mobile app riêng** — web responsive là đủ, không cần app native.
- **Workflow automation** (auto-assign, nhắc việc qua Slack/email...) — không nằm trong nghiệp vụ cốt lõi của v1.

## User Stories

- Là PM, tôi muốn nhập 1 nghiệp vụ mới với đầy đủ Category/Platform/Phase/Sprint/Status để không mất thông tin so với sheet hiện tại.
- Là PM, tôi muốn sửa lại 1 nghiệp vụ đã có (đổi status, đổi sprint, thêm ghi chú) mà không phải tạo dòng mới.
- Là PM, tôi muốn mở app và thấy ngay % hoàn thành + số ngày còn lại của từng Phase để biết có đang trễ mốc go-live không.
- Là PM, tôi muốn xem danh sách nghiệp vụ của sprint hiện tại và sprint kế tiếp để lên kế hoạch tuần.
- Là PM, tôi muốn xem timeline theo ngày của các nghiệp vụ trong 1 khoảng thời gian để biết ngày nào đang có việc gì.
- Là PM, tôi muốn xem toàn bộ nghiệp vụ theo dạng Kanban (Backlog → Ready for Dev → In Test → Ready for Staging → Done) để thao tác nhanh khi review.
- Là PM, tôi muốn ghi chú cập nhật vào 1 nghiệp vụ theo dạng log (có ngày) thay vì phải thêm cột mới mỗi lần.
- Là PM, tôi muốn toàn bộ 108 nghiệp vụ hiện có được đưa vào hệ thống mới, không phải nhập tay lại từ đầu.

## Requirements

### P0 — Must-have

**Data & lưu trữ**
- [ ] Toàn bộ dữ liệu nghiệp vụ lưu trong **database quan hệ** (không phải localStorage/IndexedDB của trình duyệt, không phải file JSON tĩnh) — xem [Data Model](#data-model--database) bên dưới.
- [ ] Script import 1 lần: đọc 108 dòng từ sheet `Nghiệp vụ` hiện tại và nạp vào DB, giữ nguyên STT/Category/Task/Platform/Phase/Sprint/Status/4 cờ Done.
- Given dữ liệu đã import, When mở app lần đầu, Then thấy đủ 108 nghiệp vụ đúng như sheet gốc.

**CRUD nghiệp vụ**
- [ ] Tạo nghiệp vụ mới với: Category, Tên, Platform, Phase, Sprint, Status, Start/Due (mặc định = dải ngày Sprint, cho override tay), Ghi chú đầu tiên (optional).
- [ ] Sửa nghiệp vụ đã có — mọi trường ở trên đều sửa được, kể cả đổi Sprint/Phase.
- [ ] Xoá nghiệp vụ (có xác nhận, vì đây là action khó hoàn tác).
- Given 1 nghiệp vụ tồn tại, When bấm vào nó ở bất kỳ view nào (Timeline/Board/Sprint), Then mở đúng form sửa với dữ liệu điền sẵn.

**Views**
- [ ] **Roadmap theo Phase** (home): mỗi Phase hiển thị % hoàn thành theo phễu Analyst/Dev/UAT/Staging, số ngày còn lại tới mốc đích, có marker "hôm nay" trên trục thời gian tổng.
- [ ] **Sprint hiện tại & sprint tiếp theo**: 2 danh sách song song, lọc theo ngày hệ thống hiện tại để xác định sprint nào là "hiện tại".
- [ ] **Timeline theo ngày**: mỗi task là 1 thanh ngang trải theo Start–Due, nhóm theo Category, có đường kẻ "hôm nay".
- [ ] **Board theo Status**: 5 cột cố định (Backlog, Ready for Dev, In Test, Ready for Staging, Done), đếm số lượng mỗi cột.

**Activity log**
- [ ] Mỗi nghiệp vụ có 1 danh sách log không giới hạn (ngày + nội dung), thay cho các cột Note theo ngày trong Excel.
- [ ] Log cũ (từ 2 cột Note hiện có trong sheet) được import thành các log-entry ban đầu khi migrate dữ liệu.

### P1 — Nice-to-have (fast-follow)

- [ ] Filter thật sự hoạt động trên Timeline (Phase/Category/Platform) — hiện mockup mới có dropdown trang trí.
- [ ] Xem sprint đã qua gần nhất (không chỉ hiện tại + tiếp theo) để đối chiếu lịch sử.
- [ ] Export dữ liệu ra Excel/CSV khi cần chia sẻ với người khác ngoài hệ thống.
- [ ] Sửa nhanh Status ngay trên Board bằng kéo-thả giữa các cột (thay vì phải mở form sửa).

### P2 — Future considerations

- [ ] Risk indicator tự động (on-track/at-risk) dựa trên tốc độ hoàn thành gần đây so với ngày còn lại.
- [ ] Nhắc việc khi sprint sắp hết mà vẫn còn task chưa Done.
- [ ] Multi-user nếu sau này có thêm người cùng cập nhật.

## Data Model / Database

### Hosting & Deployment (đã chốt)

Bạn đã quyết 3 câu hỏi mở ban đầu:

1. **Cần deploy để truy cập từ máy khác** (không chỉ chạy local) → app phải chạy như 1 server luôn bật, có URL truy cập được từ điện thoại/máy khác.
2. **Không cần mật khẩu** → app không có màn hình đăng nhập. *Đánh đổi cần biết: vì có deploy public, ai có link đều vào sửa được dữ liệu; do liên quan đối tác TVAM/Finsight/VCB, mức tối thiểu nên làm là dùng URL khó đoán (không index bởi Google) thay vì để hoàn toàn mở — không phải auth, chỉ là URL không công khai.*
3. **Có backup nếu miễn phí** → chọn giải pháp có backup sẵn trong gói free, không tự dựng thêm hạ tầng riêng.

**Vì phải deploy** (không còn chạy local nữa), quyết định DB thay đổi so với bản nháp đầu: nhiều nền tảng hosting free (Render, Railway, Fly.io free tier) có **ổ đĩa tạm thời** — nếu dùng SQLite dạng file, dữ liệu có thể mất khi server redeploy/restart. Vì vậy:

**Đề xuất: Neon** (Postgres serverless, free tier) thay vì SQLite.
- Free tier không cần thẻ tín dụng, đủ dùng cho 1 người dùng nội bộ.
- Có sẵn point-in-time restore trong thời gian lưu giữ của gói free → **thoả điều kiện #3 (backup miễn phí) mà không cần tự dựng cron job**.
- Là Postgres chuẩn, không khác gì schema đã thiết kế — chỉ đổi nơi lưu, không đổi cấu trúc bảng.

**Đề xuất phần server/hosting:** 1 web service nhỏ (Node/Express hoặc Python/FastAPI) deploy trên **Render free web service** — kết nối tới Neon qua connection string. Nhược điểm free tier: server "ngủ" sau ~15 phút không dùng, lần truy cập đầu tiên sau đó chậm vài giây — chấp nhận được với 1 người dùng, không phải hệ thống realtime.

### Schema

```
phases
  id            INTEGER PRIMARY KEY
  code          TEXT UNIQUE      -- 'P1'..'P4'
  name          TEXT             -- 'Lived', 'Rollout', 'Convert', 'Booming'
  target_date   DATE             -- mốc go-live

sprints
  id            INTEGER PRIMARY KEY
  code          TEXT UNIQUE      -- 'S13'..'S25'
  start_date    DATE
  end_date      DATE

tasks
  id              INTEGER PRIMARY KEY
  stt             INTEGER          -- số thứ tự, giữ tương thích với sheet cũ
  category        TEXT             -- 'Product Foundation' | 'Cross Service Integration' | 'Internal features' | 'Convert & Scale'
  name            TEXT NOT NULL
  platform        TEXT             -- 'Web' | 'App' | 'BE' | 'App/Auto'
  phase_id        INTEGER REFERENCES phases(id)
  sprint_id       INTEGER REFERENCES sprints(id)
  status          TEXT             -- '0.backlog' | '1.ready_for_dev' | '2.in_test' | '3.ready_for_staging' | '4.done'
  done_analyst    BOOLEAN DEFAULT FALSE
  done_dev        BOOLEAN DEFAULT FALSE
  done_uat        BOOLEAN DEFAULT FALSE
  done_staging    BOOLEAN DEFAULT FALSE
  start_date      DATE             -- mặc định = sprints.start_date, override được
  due_date        DATE             -- mặc định = sprints.end_date, override được
  date_overridden BOOLEAN DEFAULT FALSE   -- true nếu start/due đã bị sửa tay khỏi mặc định sprint
  created_at      TIMESTAMP DEFAULT now
  updated_at      TIMESTAMP DEFAULT now

activity_logs
  id            INTEGER PRIMARY KEY
  task_id       INTEGER REFERENCES tasks(id) ON DELETE CASCADE
  note          TEXT NOT NULL
  created_at    TIMESTAMP DEFAULT now
```

Ghi chú thiết kế:
- `category` và `platform` giữ dạng text tự do (không tách bảng riêng) vì danh sách giá trị nhỏ và ít đổi — validate ở tầng ứng dụng, giống cơ chế data-validation dropdown hiện tại trong Excel. Nếu danh sách category tăng nhiều và cần quản lý tập trung, tách thành bảng `categories` sau, không ảnh hưởng dữ liệu cũ.
- `phases`/`sprints` tách bảng riêng (không phải text) vì `target_date`/`start_date`/`end_date` được nhiều task dùng chung — sửa 1 lần ở đây áp dụng cho mọi task liên quan, tránh lệch dữ liệu.
- `date_overridden` cho phép UI phân biệt "ngày mặc định suy ra từ sprint" và "ngày đã chỉnh tay", phục vụ đúng quyết định hybrid đã chốt khi brainstorm.
- `done_analyst/dev/uat/staging` giữ riêng biệt với `status` vì dữ liệu gốc cho thấy 2 khái niệm không luôn khớp tuyến tính (có task `status = Ready for Staging` nhưng `done_staging = false`) — 4 cờ này phục vụ tính % phễu trên Roadmap, `status` phục vụ Kanban.

## Success Metrics

- **Leading**: 100% của 108 nghiệp vụ cũ được import đúng (đối chiếu số lượng theo Category/Phase/Status với sheet gốc) — đo ngay sau migrate.
- **Leading**: Thời gian tạo/sửa 1 nghiệp vụ ≤ 15 giây (đo bằng quan sát trực tiếp trong tuần đầu dùng).
- **Lagging**: Sau 4 tuần, không còn quay lại mở file Excel để tra cứu tiến độ (tự theo dõi tần suất mở file cũ).

## Open Questions

Cả 3 câu hỏi mở ban đầu đã được quyết — xem [Hosting & Deployment](#hosting--deployment-đã-chốt). Không còn câu hỏi chặn (blocking) nào trước khi bắt đầu implement.

## Timeline Considerations

- Không có deadline ngoại cảnh cho việc build tool này — nhưng Phase P1 (go-live 10/08) chỉ còn 4 ngày, nên **không nên migrate dữ liệu đang dùng dở sang hệ thống mới ngay giữa lúc P1 sắp live**; đề xuất bắt đầu implement sau khi P1 qua mốc go-live để tránh gián đoạn theo dõi giai đoạn nước rút.
- Đề xuất phase hoá: (1) DB + import dữ liệu cũ + CRUD cơ bản, (2) 4 view (Roadmap/Sprint/Timeline/Board), (3) P1 fast-follow (filter thật, export).
