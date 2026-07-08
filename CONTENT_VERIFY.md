# CharityConnect Verify

CharityConnect hiện dùng hướng **Verify + Donate**: kiểm chứng nguồn từ thiện trước khi quyên góp, đồng thời giữ các luồng quyên góp, biên nhận, TrustChain và dashboard vai trò hiện có.

## API

- `GET /content/home`
- `GET /content/articles?q=&type=&source_level=&tag=&page=`
- `GET /content/articles/{slug}`
- `GET /content/alerts`
- `GET /content/sources`
- `GET /content/kpis`
- `POST /admin/content/ingest`
- `POST /assistant/analyze-source`

## Nguồn dữ liệu

Dữ liệu mặc định là seed đã duyệt để bản preview chạy ổn định: Nuôi Em, Từ Thiện Thật, Bộ Công an, Nhân Dân, VnEconomy, Cổng Thông tin điện tử Chính phủ và VTV/VTV24.

Hệ thống chỉ lưu tóm tắt, claim/số liệu, URL nguồn, nhãn căn cứ và ảnh minh họa local; không copy nguyên bài báo.

## Điểm minh bạch

Điểm 100 gồm:

- 30 điểm nguồn chính thống.
- 25 điểm báo cáo tài chính/sao kê.
- 20 điểm xác minh tổ chức/người đại diện.
- 15 điểm bằng chứng ảnh/video.
- 10 điểm độ mới dữ liệu.

Phân loại: `A`, `B`, `C`, `D`, `X` cho cảnh báo/xử lý.

## Chatbot

Chatbot ưu tiên dữ liệu nội bộ CharityConnect: campaign, analytics, TrustChain và Content Verify. Câu ngoài phạm vi mới dùng Anthropic hoặc OpenAI web search có citation URL nếu API key được cấu hình trong `.env`.
