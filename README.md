# TTT Project Manager

Thay thế sheet "Nghiệp vụ" trong `[TTT New] Planning.xlsx` — xem `SPEC.md` để biết đầy đủ yêu cầu.

## Chạy local

1. Copy `.env.example` thành `.env`, điền `DATABASE_URL` (connection string Neon) và `EXCEL_SOURCE` (đường dẫn tới file Excel gốc, chỉ cần cho lần import đầu).
2. `npm install`
3. `npm run migrate` — tạo bảng trong DB.
4. `npm run import:excel` — nhập nghiệp vụ hiện có từ file Excel (chỉ chạy 1 lần trên DB trống — script không idempotent cho bảng `tasks`/`activity_logs`, chạy lại sẽ tạo trùng dữ liệu).
5. `npm run dev` — mở `http://localhost:3000`.

### Chatbot / Đánh giá AI chạy local bằng Ollama

Mặc định các tính năng AI gọi Gemini. Để chạy bằng LLM local (không phụ thuộc quota Gemini):

1. Cài [Ollama](https://ollama.com), `ollama pull qwen2.5:7b-instruct`.
2. Trong `.env`, set `LLM_PROVIDER=ollama` (và `OLLAMA_MODEL` nếu dùng model khác).
3. Chạy `ollama serve` (hoặc để app Ollama chạy nền), rồi `npm run dev` như bình thường.

Không set `LLM_PROVIDER` (hoặc set khác `ollama`) thì dùng Gemini như cũ.

### Dùng Ollama local cho app đang deploy trên Render

Vì cả website chỉ chạy trên máy nhà thì quá mong manh (tắt máy/máy ngủ là chết cả web), setup khuyên dùng là: **web chính chạy trên Render** (luôn sẵn sàng), chỉ riêng 3 tính năng AI (chatbot, "Đánh giá AI", gợi ý AI — dùng chung `generateText()`) mới gọi ra Ollama trên máy nhà. Máy nhà tắt thì chỉ AI lỗi, web vẫn chạy bình thường.

Ollama không có xác thực gì cả, nên **không expose thẳng port Ollama (11434) ra internet** — dùng `scripts/ollama-bridge.js`, một proxy nhỏ đứng trước Ollama, chỉ nhận request kèm đúng secret mới forward vào:

1. Trên máy nhà: điền `OLLAMA_BRIDGE_SECRET` trong `.env`, chạy `npm run bridge` (mặc định lắng nghe port `8787`, forward vào Ollama ở `localhost:11434`).
2. Expose bridge ra internet qua Tailscale Funnel (không expose app port 3000 nữa):
   ```bash
   tailscale funnel --bg --https=8443 8787
   ```
3. Trên Render, set các biến env:
   - `LLM_PROVIDER=ollama`
   - `OLLAMA_URL=https://<tên-máy>.<tailnet>.ts.net:8443`
   - `OLLAMA_BRIDGE_SECRET=` (giống hệt secret ở bước 1)
4. Deploy lại trên Render.

Máy nhà cần luôn bật (tắt sleep) + `ollama serve` + `npm run bridge` + `tailscaled` (funnel) chạy nền liên tục để AI hoạt động; nếu một trong các tiến trình đó tắt, chatbot/đánh giá AI sẽ báo lỗi nhưng phần còn lại của web trên Render không bị ảnh hưởng.

## Test

`npm test` — chạy toàn bộ unit test (logic thuần) và integration test (API, dùng `pg-mem`, không cần DB thật).

## Deploy

Xem phần "Hosting & Deployment" trong `SPEC.md` và `render.yaml`. Tóm tắt: Neon (Postgres free) + Render (web service free).
