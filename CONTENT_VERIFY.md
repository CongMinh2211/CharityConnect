# CharityConnect Verify

CharityConnect theo hướng **Verify + Donate**: kiểm chứng nguồn trước khi quyên góp, đồng thời giữ các luồng chiến dịch, biên nhận, TrustChain và dashboard theo vai trò.

## API

Public:

- `GET /content/home`
- `GET /content/articles?q=&type=&source_level=&tag=&page=`
- `GET /content/articles/{slug}`
- `GET /content/alerts`
- `GET /content/sources`
- `GET /content/kpis`
- `GET /content/projects?source=&category=&grade=`
- `GET /content/metrics?type=&source=&period=`
- `GET /content/statistics`

Admin:

- `POST /admin/content/ingest`
- `PATCH /admin/content/articles/{id}/review`
- `POST /assistant/analyze-source`

## Nguồn dữ liệu

Seed đã duyệt gồm Nuôi Em, Từ Thiện Thật, Hội Chữ thập đỏ Việt Nam, UNICEF Việt Nam, saigonchildren, Bộ Công an, Báo điện tử Chính phủ, Báo Nhân Dân và VTV/VTV24.

Nguồn cấp:

- A: cơ quan nhà nước hoặc tổ chức chính thức có độ tin cậy cao.
- B: báo chí chính thống.
- C: nguồn tổ chức tự công bố, cần đối chiếu thêm.
- D: nguồn chưa đủ căn cứ để công khai.

Hệ thống chỉ lưu tiêu đề, tóm tắt tự viết, claim/số liệu, metadata, URL nguồn và ảnh thumbnail hợp lệ; không copy nguyên bài báo.

## Dữ liệu định lượng

Mỗi claim được chuẩn hóa thành `ContentMetric`:

- Nhãn và giá trị số.
- Đơn vị, kỳ dữ liệu.
- URL/tên nguồn.
- Ngày thu thập.
- Cấp tin cậy A/B/C/D.

`GET /content/statistics` tính KPI từ các metric đã công khai, không hardcode số tổng:

- Số nguồn.
- Số dự án/tổ chức thật.
- Số claim định lượng.
- Tỷ lệ claim nguồn A/B.
- Tổng tiền theo nguồn công bố.
- Tổng người hưởng lợi/nhu cầu theo nguồn.
- Số cảnh báo đã phân loại.

## Quy trình ingest

1. Admin gửi tối đa 8 URL trong whitelist.
2. Backend lấy metadata, tiêu đề, excerpt ngắn, thumbnail và số liệu ứng viên.
3. Bài mới có trạng thái `PENDING_REVIEW`.
4. Admin duyệt `PUBLISHED` hoặc từ chối `REJECTED`.
5. Chỉ dữ liệu `PUBLISHED` xuất hiện trên frontend và chatbot.

## Điểm minh bạch

Điểm 100 gồm:

- 30 điểm nguồn chính thống.
- 25 điểm báo cáo tài chính/sao kê.
- 20 điểm xác minh tổ chức/người đại diện.
- 15 điểm bằng chứng ảnh/video.
- 10 điểm độ mới dữ liệu.

Phân loại: `A`, `B`, `C`, `D`; nhãn `X` dành cho cảnh báo/vụ việc đã có căn cứ xử lý.

## Chatbot

Chatbot ưu tiên dữ liệu nội bộ CharityConnect: campaign, analytics, TrustChain, dự án thật, metrics và cảnh báo. Câu hỏi ngoài phạm vi mới dùng Anthropic/OpenAI hoặc nguồn công khai có trích dẫn khi được cấu hình.
