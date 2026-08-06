# TTT Project Manager

Thay thế sheet "Nghiệp vụ" trong `[TTT New] Planning.xlsx` — xem `SPEC.md` để biết đầy đủ yêu cầu.

## Chạy local

1. Copy `.env.example` thành `.env`, điền `DATABASE_URL` (connection string Neon) và `EXCEL_SOURCE` (đường dẫn tới file Excel gốc, chỉ cần cho lần import đầu).
2. `npm install`
3. `npm run migrate` — tạo bảng trong DB.
4. `npm run import:excel` — nhập nghiệp vụ hiện có từ file Excel (chỉ chạy 1 lần trên DB trống — script không idempotent cho bảng `tasks`/`activity_logs`, chạy lại sẽ tạo trùng dữ liệu).
5. `npm run dev` — mở `http://localhost:3000`.

## Test

`npm test` — chạy toàn bộ unit test (logic thuần) và integration test (API, dùng `pg-mem`, không cần DB thật).

## Deploy

Xem phần "Hosting & Deployment" trong `SPEC.md` và `render.yaml`. Tóm tắt: Neon (Postgres free) + Render (web service free).
