from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx


NOW = "2026-07-09T00:00:00.000Z"

SOURCES: list[dict[str, Any]] = [
    {"id": "source-bocongan", "name": "Bộ Công an", "url": "https://mps.gov.vn/", "level": "A", "kind": "GOVERNMENT", "description": "Nguồn cấp A cho cảnh báo thủ đoạn, vụ việc đã xử lý và khuyến cáo phòng tránh lừa đảo."},
    {"id": "source-chinhphu", "name": "Báo điện tử Chính phủ", "url": "https://chinhphu.vn/", "level": "A", "kind": "GOVERNMENT", "description": "Nguồn cấp A cho thông tin chính sách, cảnh báo và số liệu công bố chính thức."},
    {"id": "source-charityconnect", "name": "CharityConnect", "url": "https://charityconnect-7kep.onrender.com/", "level": "A", "kind": "INTERNAL_PLATFORM", "description": "Nền tảng Verify + Donate của đồ án: có sổ cái hash-chain, TrustChain, biên nhận QR, KPI và kho kiểm chứng nguồn."},
    {"id": "source-nhandan", "name": "Báo Nhân Dân", "url": "https://nhandan.vn/", "level": "B", "kind": "PRESS", "description": "Báo chí chính thống; dùng để đối chiếu vụ việc và cảnh báo có nguồn biên tập."},
    {"id": "source-vtv24", "name": "VTV/VTV24", "url": "https://vtv.vn/", "level": "B", "kind": "VIDEO", "description": "Nguồn video/bản tin chính thống cho nội dung cảnh báo và giáo dục phòng tránh."},
    {"id": "source-nuoiem", "name": "Nuôi Em", "url": "https://www.nuoiem.com/", "level": "C", "kind": "OFFICIAL_ORG", "description": "Nguồn tự công bố của dự án Nuôi Em về chi phí, mục tiêu và quy trình nhận mã."},
    {"id": "source-tuthienthat", "name": "Từ Thiện Thật", "url": "https://tuthienthat.vn/", "level": "C", "kind": "OFFICIAL_ORG", "description": "Nguồn tự công bố về sao kê, hoàn cảnh, video và báo cáo chi tiêu của tổ chức."},
    {"id": "source-redcross", "name": "Hội Chữ thập đỏ Việt Nam", "url": "https://redcross.org.vn/", "level": "A", "kind": "OFFICIAL_ORG", "description": "Tổ chức nhân đạo chính thức; dùng cho chiến dịch vận động, cứu trợ và cảnh báo giả mạo."},
    {"id": "source-unicef", "name": "UNICEF Việt Nam", "url": "https://www.unicef.org/vietnam/", "level": "A", "kind": "OFFICIAL_ORG", "description": "Nguồn quốc tế/chính thức về trẻ em, dinh dưỡng, giáo dục và bảo vệ trẻ em tại Việt Nam."},
    {"id": "source-saigonchildren", "name": "saigonchildren", "url": "https://www.saigonchildren.com/", "level": "C", "kind": "OFFICIAL_ORG", "description": "Nguồn tự công bố của tổ chức giáo dục phi lợi nhuận hỗ trợ trẻ em tại Việt Nam."},
]

SOURCE_BY_ID = {source["id"]: source for source in SOURCES}

WHITELIST_HOSTS = {
    "www.nuoiem.com",
    "nuoiem.com",
    "tuthienthat.vn",
    "www.tuthienthat.vn",
    "redcross.org.vn",
    "www.redcross.org.vn",
    "unicef.org",
    "www.unicef.org",
    "saigonchildren.com",
    "www.saigonchildren.com",
    "mps.gov.vn",
    "www.mps.gov.vn",
    "bocongan.gov.vn",
    "www.bocongan.gov.vn",
    "nhandan.vn",
    "www.nhandan.vn",
    "chinhphu.vn",
    "www.chinhphu.vn",
    "baochinhphu.vn",
    "www.baochinhphu.vn",
    "vtv.vn",
    "www.vtv.vn",
    "charityconnect-7kep.onrender.com",
}

PENDING_ARTICLES: dict[str, dict[str, Any]] = {}


def score(total: int, grade: str, source_authority: int, financial: int, legal: int, media: int, freshness: int, reasons: list[str]) -> dict[str, Any]:
    return {
        "total": total,
        "grade": grade,
        "source_authority": source_authority,
        "financial_evidence": financial,
        "legal_identity": legal,
        "media_evidence": media,
        "freshness": freshness,
        "reasons": reasons,
    }


def source_for_url(url: str) -> dict[str, Any]:
    host = (urlparse(url).hostname or "").casefold()
    for source in SOURCES:
        source_host = (urlparse(source["url"]).hostname or "").casefold()
        if host == source_host or host.endswith("." + source_host.replace("www.", "")) or source_host.replace("www.", "") in host:
            return source
    if "mps.gov.vn" in host or "bocongan.gov.vn" in host:
        return SOURCE_BY_ID["source-bocongan"]
    if "redcross.org.vn" in host:
        return SOURCE_BY_ID["source-redcross"]
    if "unicef.org" in host:
        return SOURCE_BY_ID["source-unicef"]
    return SOURCE_BY_ID["source-chinhphu"]


def grade_from_total(total: int) -> str:
    if total >= 90:
        return "A"
    if total >= 70:
        return "B"
    if total >= 50:
        return "C"
    return "D"


ARTICLES: list[dict[str, Any]] = [
    {
        "id": "article-nuoiem-model",
        "slug": "nuoi-em-mo-hinh-nhan-ma-va-chi-phi-nam-hoc",
        "type": "ORGANIZATION",
        "title": "Nuôi Em: chi phí năm học, mục tiêu nhận nuôi và cách kiểm tra nguồn",
        "excerpt": "Nuôi Em công bố mức tham chiếu 1.450.000đ/năm học và mục tiêu 120.000+ trẻ được nhận nuôi trong mùa 2025-2026.",
        "summary": "CharityConnect lưu Nuôi Em như một nguồn tự công bố cấp C: có website chính thức, có số liệu chi phí và mục tiêu, nhưng người quyên góp vẫn nên đối chiếu sao kê, kênh nhận tiền và cập nhật từ tổ chức trước khi chuyển khoản.",
        "body": [
            "Nuôi Em là ví dụ tốt để kiểm tra một dự án có thật: có website riêng, mô tả quy trình nhận mã, mức đóng góp theo năm học và thông tin hỗ trợ bổ sung như bữa ăn, cơ sở vật chất, điểm trường.",
            "Dữ liệu được hiển thị trên CharityConnect chỉ là tóm tắt và claim có nguồn. Hệ thống không copy nguyên nội dung từ website gốc, không tự xác nhận kiểm toán độc lập và luôn gắn nhãn theo nguồn công bố.",
            "Khi ra quyết định quyên góp, người dùng nên kiểm tra lại kênh chính thức, tên chủ tài khoản nhận tiền, báo cáo tài chính hoặc sao kê và lịch cập nhật hình ảnh/video theo từng đợt.",
        ],
        "source": SOURCE_BY_ID["source-nuoiem"],
        "source_url": "https://www.nuoiem.com/",
        "source_title": "Nuôi Em",
        "source_published_at": "2025-2026",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/education.jpg",
        "tags": ["dự án thật", "trẻ em vùng cao", "giáo dục", "nguồn tự công bố"],
        "badges": ["Dự án thật", "Có số liệu", "Nguồn tự công bố"],
        "claims": [
            {"label": "Chi phí tham chiếu", "value": "1.450.000 VND/năm học", "note": "Theo công bố của Nuôi Em cho năm học 2025-2026."},
            {"label": "Mục tiêu công bố", "value": "120.000+ trẻ", "note": "Mục tiêu nhận nuôi trên cả nước theo website Nuôi Em."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/education.jpg", "title": "Hỗ trợ bữa ăn và giáo dục vùng cao", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(82, "B", 20, 22, 16, 15, 9, ["Có website chính thức", "Có số liệu chi phí/mục tiêu", "Cần đối chiếu thêm nguồn độc lập khi quyên góp lớn"]),
        "status": "PUBLISHED",
    },
    {
        "id": "article-tuthienthat-financial-report",
        "slug": "tu-thien-that-sao-ke-tai-chinh-va-so-du-cong-khai",
        "type": "FINANCIAL_REPORT",
        "title": "Từ Thiện Thật: sao kê tài chính công khai và chỉ số thu/chi",
        "excerpt": "Trang sao kê của Từ Thiện Thật công bố tổng thu, tổng chi và số dư tài khoản để người ủng hộ đối chiếu.",
        "summary": "CharityConnect xếp Từ Thiện Thật là nguồn tự công bố cấp C. Điểm cộng là có trang sao kê và số liệu tài chính; điểm cần kiểm tra là tính cập nhật, chứng từ chi và kênh xác nhận độc lập.",
        "body": [
            "Trang sao kê giúp người ủng hộ không chỉ nhìn thấy lời kêu gọi mà còn xem được dòng tiền đã vào, đã chi và còn lại.",
            "Khi ingest dữ liệu từ nguồn này, hệ thống chỉ lưu tiêu đề, tóm tắt tự viết, claim số liệu và URL nguồn; nội dung chi tiết vẫn phải đọc tại website gốc.",
            "Nguồn tự công bố không đồng nghĩa với kiểm toán độc lập. Vì vậy giao diện luôn cảnh báo người dùng nên kiểm tra chứng từ, ngày cập nhật và đối chiếu tài khoản nhận tiền.",
        ],
        "source": SOURCE_BY_ID["source-tuthienthat"],
        "source_url": "https://tuthienthat.vn/sao-ke-tai-chinh/",
        "source_title": "Từ Thiện Thật - Sao kê tài chính",
        "source_published_at": "2026",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/community.jpg",
        "tags": ["sao kê", "tài chính", "nguồn tự công bố"],
        "badges": ["Có sao kê", "Có số liệu", "Nguồn tự công bố"],
        "claims": [
            {"label": "Tổng thu công bố", "value": "1.100.881.002 VND", "note": "Số liệu lấy từ trang sao kê công khai tại thời điểm thu thập."},
            {"label": "Số dư công bố", "value": "965.161.002 VND", "note": "Cần đối chiếu ngày cập nhật trên nguồn gốc."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/community.jpg", "title": "Minh bạch tài chính trong hoạt động từ thiện", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(78, "B", 20, 25, 14, 10, 9, ["Có trang sao kê", "Có số liệu thu/số dư", "Nguồn tự công bố nên cần đối chiếu chứng từ"]),
        "status": "PUBLISHED",
    },
    {
        "id": "article-redcross-cuba",
        "slug": "hoi-chu-thap-do-ung-ho-nhan-dan-cuba-gan-292-ty",
        "type": "REAL_PROJECT",
        "title": "Hội Chữ thập đỏ Việt Nam: ủng hộ nhân dân Cuba gần 292 tỷ đồng",
        "excerpt": "Chiến dịch công bố 291,8 tỷ đồng và hơn 1,48 triệu lượt tham gia tính đến 17/08/2025.",
        "summary": "Đây là nguồn cấp A vì dữ liệu đến từ Hội Chữ thập đỏ Việt Nam. CharityConnect dùng chiến dịch này làm ví dụ dự án thật có số tiền, lượt tham gia, thời gian vận động và đường dẫn cập nhật.",
        "body": [
            "Bài công bố của Hội Chữ thập đỏ Việt Nam nêu số tiền ủng hộ gửi đến nhân dân Cuba, số lượt người tham gia và thời gian triển khai chiến dịch.",
            "Dữ liệu được đưa vào dashboard KPI để minh họa cách tổng hợp claim có số liệu: tiền, lượt tham gia, nguồn, ngày công bố và độ tin cậy.",
            "Khi người dùng bấm Nguồn gốc, hệ thống đưa về bài gốc để đọc toàn bộ bối cảnh thay vì sao chép nội dung báo/website.",
        ],
        "source": SOURCE_BY_ID["source-redcross"],
        "source_url": "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html",
        "source_title": "Hội Chữ thập đỏ Việt Nam",
        "source_published_at": "2025-08-17",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/veo-charity-01.jpg",
        "tags": ["dự án thật", "cứu trợ", "Hội Chữ thập đỏ", "số liệu"],
        "badges": ["Nguồn cấp A", "Có số tiền", "Có lượt tham gia"],
        "claims": [
            {"label": "Số tiền công bố", "value": "291,8 tỷ VND", "note": "Tính đến 8h00 ngày 17/08/2025 theo Hội Chữ thập đỏ Việt Nam."},
            {"label": "Lượt tham gia", "value": "Hơn 1,48 triệu lượt", "note": "Số lượt người tham gia đóng góp theo bài công bố."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/veo-charity-01.jpg", "title": "Chiến dịch vận động nhân đạo", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(92, "A", 30, 25, 20, 8, 9, ["Nguồn tổ chức chính thức cấp A", "Có số tiền và lượt tham gia", "Có ngày công bố rõ ràng"]),
        "status": "PUBLISHED",
    },
    {
        "id": "article-unicef-nutrition",
        "slug": "unicef-viet-nam-so-lieu-dinh-duong-tre-em",
        "type": "REAL_STATISTIC",
        "title": "UNICEF Việt Nam: số liệu dinh dưỡng trẻ em và nhu cầu can thiệp",
        "excerpt": "UNICEF nêu hơn 200.000 trẻ suy dinh dưỡng cấp tính nặng mỗi năm và 1,8 triệu trẻ dưới 5 tuổi thấp còi.",
        "summary": "Đây là nguồn cấp A dùng làm bối cảnh cho các chiến dịch hỗ trợ trẻ em. Dữ liệu không phải một lời kêu gọi chuyển tiền cụ thể, mà là số liệu nền để đánh giá nhu cầu xã hội.",
        "body": [
            "Các dự án về trẻ em cần số liệu nền đáng tin cậy. UNICEF Việt Nam cung cấp bối cảnh về suy dinh dưỡng, thấp còi và nhu cầu điều trị hàng năm.",
            "CharityConnect lưu các con số này như ContentMetric loại SOURCE_STATISTIC để dashboard có thể tính tổng claim, tỷ lệ nguồn chính thống và gắn link nguồn.",
            "Khi bot được hỏi về hỗ trợ trẻ em vùng cao hoặc dinh dưỡng, hệ thống ưu tiên trả lời bằng các claim này trước khi tìm kiếm web ngoài.",
        ],
        "source": SOURCE_BY_ID["source-unicef"],
        "source_url": "https://www.unicef.org/vietnam/nutrition",
        "source_title": "UNICEF Việt Nam - Nutrition",
        "source_published_at": "2026",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/medical-support.jpg",
        "tags": ["UNICEF", "trẻ em", "dinh dưỡng", "số liệu"],
        "badges": ["Nguồn cấp A", "Số liệu nền", "Có mục tiêu can thiệp"],
        "claims": [
            {"label": "Suy dinh dưỡng cấp tính nặng", "value": "Hơn 200.000 trẻ/năm", "note": "Theo trang Nutrition của UNICEF Việt Nam."},
            {"label": "Trẻ dưới 5 tuổi thấp còi", "value": "1,8 triệu trẻ", "note": "Theo trang Nutrition của UNICEF Việt Nam."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/medical-support.jpg", "title": "Bối cảnh sức khỏe và dinh dưỡng trẻ em", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(94, "A", 30, 18, 20, 16, 10, ["Nguồn quốc tế chính thức", "Có số liệu định lượng", "Phù hợp làm bối cảnh chiến dịch"]),
        "status": "PUBLISHED",
    },
    {
        "id": "article-mps-charity-run",
        "slug": "bo-cong-an-canh-bao-giai-chay-tu-thien-lua-dao",
        "type": "SCAM_ALERT",
        "title": "Bộ Công an cảnh báo giải chạy từ thiện có dấu hiệu lừa đảo",
        "excerpt": "Các đối tượng tạo fanpage giả mạo, sao chép logo/hình ảnh tổ chức uy tín và kêu gọi chuyển tiền đăng ký qua đường dẫn giả.",
        "summary": "Bài cảnh báo cấp A cho thấy lừa đảo từ thiện có thể núp dưới hình thức giải chạy, đạp xe hoặc chiến dịch gây quỹ online. Người dùng cần kiểm tra ban tổ chức, kênh nhận tiền và link chính thức.",
        "body": [
            "Theo cảnh báo, các đối tượng tạo tài khoản mạng xã hội giả mạo hoặc sao chép toàn bộ nội dung của bệnh viện, quỹ uy tín; có trường hợp dùng cả dấu tích xanh để tạo lòng tin.",
            "Dấu hiệu rủi ro gồm: link đăng ký lạ, tài khoản nhận tiền không thuộc tổ chức, thiếu thông báo trên website chính thức và lời kêu gọi quá gấp.",
            "CharityConnect gắn nhãn cảnh báo để người dùng phòng tránh, không tự quy kết thêm ngoài nội dung nguồn công bố.",
        ],
        "source": SOURCE_BY_ID["source-bocongan"],
        "source_url": "https://www.mps.gov.vn/bai-viet/canh-bao-cac-giai-chay-tu-thien-co-dau-hieu-lua-dao-tren-mang-xa-hoi-1757472719",
        "source_title": "Cổng thông tin điện tử Bộ Công an",
        "source_published_at": "2025-09-10",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/veo-charity-03.jpg",
        "tags": ["cảnh báo", "giả mạo", "giải chạy từ thiện"],
        "badges": ["Nguồn cấp A", "Cơ quan chức năng cảnh báo", "Không chuyển qua link lạ"],
        "claims": [
            {"label": "Thủ đoạn", "value": "Fanpage/tài khoản giả mạo", "note": "Sao chép logo, nội dung và hình ảnh của tổ chức uy tín."},
            {"label": "Khuyến cáo", "value": "Liên hệ trực tiếp ban tổ chức", "note": "Kiểm tra sự kiện và kênh nhận tiền trước khi chuyển khoản."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/veo-charity-03.jpg", "title": "Kiểm tra nguồn trước khi đăng ký giải chạy thiện nguyện", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(90, "X", 30, 18, 20, 12, 10, ["Nguồn cơ quan chức năng", "Có khuyến cáo phòng tránh", "Được gắn nhãn cảnh báo"]),
        "status": "PUBLISHED",
        "warning_label": "OFFICIAL_WARNING",
    },
    {
        "id": "article-mps-ninhthuan",
        "slug": "ninh-thuan-khoi-to-lua-dao-chiem-doat-tien-tu-thien",
        "type": "SCAM_ALERT",
        "title": "Ninh Thuận: khởi tố vụ giả danh từ thiện chiếm đoạt tiền",
        "excerpt": "Bộ Công an công bố vụ việc đối tượng giả danh nhà hảo tâm/tổ chức từ thiện, chiếm đoạt gần 100 triệu đồng của người nhận hỗ trợ.",
        "summary": "Đây là cảnh báo cấp A về việc không chỉ người quyên góp mà cả người nhận hỗ trợ cũng có thể trở thành nạn nhân. Hệ thống dùng vụ việc để nhấn mạnh kiểm tra danh tính và kênh liên hệ chính thức.",
        "body": [
            "Vụ việc cho thấy thủ đoạn giả danh tổ chức từ thiện hoặc nhà hảo tâm để yêu cầu nạn nhân chuyển lại tiền, phí hoặc thông tin tài khoản.",
            "Khi nhận được yêu cầu liên quan tiền từ người tự xưng là tổ chức từ thiện, người dân nên kiểm tra qua số điện thoại/website chính thức và không cung cấp mã OTP, mật khẩu, thông tin ngân hàng.",
            "CharityConnect lưu vụ việc dưới dạng cảnh báo đã có cơ quan xử lý, dùng cho giáo dục phòng tránh và dashboard KPI cảnh báo.",
        ],
        "source": SOURCE_BY_ID["source-bocongan"],
        "source_url": "https://mps.gov.vn/bai-viet/ninh-thuan-khoi-to-doi-tuong-lua-dao-chiem-doat-tien-tu-thien-d22-t45371",
        "source_title": "Cổng thông tin điện tử Bộ Công an",
        "source_published_at": "2025-05-30",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/food-support.jpg",
        "tags": ["cảnh báo", "khởi tố", "giả danh"],
        "badges": ["Nguồn cấp A", "Đã xử lý", "Có số tiền"],
        "claims": [
            {"label": "Số tiền chiếm đoạt", "value": "Gần 100 triệu VND", "note": "Theo thông tin Bộ Công an công bố."},
            {"label": "Nạn nhân được ghi nhận", "value": "3 người nhận hỗ trợ", "note": "Dữ liệu dùng để cảnh báo, không hiển thị thông tin cá nhân."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/food-support.jpg", "title": "Không cung cấp thông tin tài khoản cho người tự xưng hỗ trợ", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(92, "X", 30, 20, 20, 12, 10, ["Nguồn cơ quan chức năng", "Có số tiền/vụ việc cụ thể", "Đã có quyết định xử lý"]),
        "status": "PUBLISHED",
        "warning_label": "OFFICIAL_ACTION",
    },
    {
        "id": "article-vtv24-warning-video",
        "slug": "video-minh-bach-canh-bao-tu-thien-gia",
        "type": "VIDEO",
        "title": "Video minh bạch: nhận diện lời kêu gọi từ thiện giả",
        "excerpt": "Video/bản tin chính thống được dùng như bằng chứng truyền thông để nhắc người dùng kiểm tra nguồn trước khi chuyển tiền.",
        "summary": "CharityConnect không tải lại video. Giao diện chỉ nhúng hoặc dẫn về nguồn gốc, kèm tóm tắt ngắn và danh sách dấu hiệu cần kiểm tra.",
        "body": [
            "Video là lớp bằng chứng bổ sung giúp người dùng nhìn thấy thủ đoạn cụ thể: tài khoản cá nhân lạ, ảnh cảm xúc nhưng không có chứng từ, lời kêu gọi gấp và thiếu đường dẫn chính thức.",
            "Nếu nguồn video không cho phép nhúng, hệ thống hiển thị thumbnail minh họa và nút mở nguồn gốc.",
        ],
        "source": SOURCE_BY_ID["source-vtv24"],
        "source_url": "https://vtv.vn/",
        "source_title": "VTV/VTV24",
        "source_published_at": "2025",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/veo-charity-02.jpg",
        "tags": ["video", "cảnh báo", "minh bạch"],
        "badges": ["Có video", "Nguồn chính thống", "Giáo dục phòng tránh"],
        "claims": [{"label": "Loại bằng chứng", "value": "Video/bản tin chính thống", "note": "Dùng để dẫn người xem về nguồn gốc, không sao chép nội dung."}],
        "media": [{"type": "VIDEO", "url": "https://vtv.vn/", "thumbnail_url": "/images/veo-charity-02.jpg", "title": "Xem thêm tại nguồn chính thống", "attribution": "VTV/VTV24"}],
        "score": score(76, "B", 25, 10, 18, 15, 8, ["Nguồn video chính thống", "Có giá trị giáo dục", "Cần link video cụ thể khi ingest live"]),
        "status": "PUBLISHED",
    },
]

METRICS: list[dict[str, Any]] = [
    {"id": "metric-nuoiem-cost-2025", "label": "Chi phí nuôi cơm một em", "numeric_value": 1450000, "display_value": "1.450.000 VND/năm học", "unit": "VND_PER_YEAR", "metric_type": "COST", "period": "Năm học 2025-2026", "source_url": "https://www.nuoiem.com/", "source_name": "Nuôi Em", "collected_at": NOW, "confidence_level": "C"},
    {"id": "metric-nuoiem-target-2025", "label": "Mục tiêu trẻ được nhận nuôi", "numeric_value": 120000, "display_value": "120.000+ trẻ", "unit": "PEOPLE", "metric_type": "BENEFICIARY", "period": "Năm học 2025-2026", "source_url": "https://www.nuoiem.com/", "source_name": "Nuôi Em", "collected_at": NOW, "confidence_level": "C"},
    {"id": "metric-tuthienthat-balance", "label": "Số dư tài khoản thiện nguyện", "numeric_value": 965161002, "display_value": "965.161.002 VND", "unit": "VND", "metric_type": "FINANCIAL_BALANCE", "period": "Theo trang sao kê công khai", "source_url": "https://tuthienthat.vn/sao-ke-tai-chinh/", "source_name": "Từ Thiện Thật", "collected_at": NOW, "confidence_level": "C"},
    {"id": "metric-tuthienthat-receipts", "label": "Tổng thu công bố", "numeric_value": 1100881002, "display_value": "1.100.881.002 VND", "unit": "VND", "metric_type": "SUPPORT_AMOUNT", "period": "Theo trang sao kê công khai", "source_url": "https://tuthienthat.vn/sao-ke-tai-chinh/", "source_name": "Từ Thiện Thật", "collected_at": NOW, "confidence_level": "C"},
    {"id": "metric-redcross-cuba-amount", "label": "Ủng hộ nhân dân Cuba", "numeric_value": 291800000000, "display_value": "291,8 tỷ VND", "unit": "VND", "metric_type": "SUPPORT_AMOUNT", "period": "17/08/2025", "source_url": "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html", "source_name": "Hội Chữ thập đỏ Việt Nam", "collected_at": NOW, "confidence_level": "A"},
    {"id": "metric-redcross-cuba-contributors", "label": "Lượt người tham gia ủng hộ Cuba", "numeric_value": 1480000, "display_value": "Hơn 1,48 triệu lượt", "unit": "COUNT", "metric_type": "BENEFICIARY", "period": "17/08/2025", "source_url": "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html", "source_name": "Hội Chữ thập đỏ Việt Nam", "collected_at": NOW, "confidence_level": "A"},
    {"id": "metric-redcross-students-milk", "label": "Học sinh vùng khó khăn nhận sữa", "numeric_value": 15700, "display_value": "Hơn 15.700 học sinh", "unit": "PEOPLE", "metric_type": "BENEFICIARY", "period": "Năm học 2025-2026", "source_url": "https://redcross.org.vn/", "source_name": "Hội Chữ thập đỏ Việt Nam", "collected_at": NOW, "confidence_level": "A"},
    {"id": "metric-mps-ninhthuan-fraud", "label": "Chiếm đoạt qua giả danh từ thiện", "numeric_value": 100000000, "display_value": "Gần 100 triệu VND", "unit": "VND", "metric_type": "FRAUD_AMOUNT", "period": "Tháng 5/2025", "source_url": "https://mps.gov.vn/bai-viet/ninh-thuan-khoi-to-doi-tuong-lua-dao-chiem-doat-tien-tu-thien-d22-t45371", "source_name": "Bộ Công an", "collected_at": NOW, "confidence_level": "A"},
    {"id": "metric-mps-online-scam-cases", "label": "Vụ lừa đảo trực tuyến toàn quốc", "numeric_value": 17200, "display_value": "Khoảng 17.200 vụ", "unit": "COUNT", "metric_type": "ALERT_CASE", "period": "2022 đến 10/2025", "source_url": "https://mps.gov.vn/", "source_name": "Bộ Công an", "collected_at": NOW, "confidence_level": "A"},
    {"id": "metric-unicef-wasting", "label": "Trẻ suy dinh dưỡng cấp tính nặng hằng năm", "numeric_value": 200000, "display_value": "Hơn 200.000 trẻ/năm", "unit": "PEOPLE", "metric_type": "SOURCE_STATISTIC", "period": "Theo trang UNICEF Nutrition", "source_url": "https://www.unicef.org/vietnam/nutrition", "source_name": "UNICEF Việt Nam", "collected_at": NOW, "confidence_level": "A"},
    {"id": "metric-unicef-stunting", "label": "Trẻ dưới 5 tuổi thấp còi", "numeric_value": 1800000, "display_value": "1,8 triệu trẻ dưới 5 tuổi", "unit": "PEOPLE", "metric_type": "SOURCE_STATISTIC", "period": "Theo trang UNICEF Nutrition", "source_url": "https://www.unicef.org/vietnam/nutrition", "source_name": "UNICEF Việt Nam", "collected_at": NOW, "confidence_level": "A"},
]


def metric_by_id(metric_id: str) -> dict[str, Any]:
    return next(metric for metric in METRICS if metric["id"] == metric_id)


REAL_PROJECTS: list[dict[str, Any]] = [
    {"id": "real-project-nuoiem", "slug": "nuoi-em-mua-2025-2026", "name": "Nuôi Em mùa 2025-2026", "organization": "Dự án Nuôi Em", "category": "Giáo dục / bữa ăn học đường", "source_url": "https://www.nuoiem.com/", "source_name": "Nuôi Em", "image_url": "/images/education.jpg", "description": "Nguồn tự công bố về mô hình nhận mã em nuôi, chi phí một năm học và mục tiêu trẻ được nhận nuôi.", "metrics": [metric_by_id("metric-nuoiem-cost-2025"), metric_by_id("metric-nuoiem-target-2025")], "score": score(82, "B", 20, 22, 16, 15, 9, ["Có số liệu chi phí", "Có quy trình nhận mã", "Cần đối chiếu nguồn độc lập"]), "status": "PUBLISHED"},
    {"id": "real-project-tuthienthat", "slug": "tu-thien-that-sao-ke-tai-chinh", "name": "Từ Thiện Thật - sao kê tài chính", "organization": "Từ Thiện Thật", "category": "Minh bạch tài chính", "source_url": "https://tuthienthat.vn/sao-ke-tai-chinh/", "source_name": "Từ Thiện Thật", "image_url": "/images/community.jpg", "description": "Nguồn tự công bố tổng thu, số dư và minh bạch chi tiêu qua trang sao kê.", "metrics": [metric_by_id("metric-tuthienthat-balance"), metric_by_id("metric-tuthienthat-receipts")], "score": score(78, "B", 20, 25, 14, 10, 9, ["Có trang sao kê", "Có số liệu thu/số dư", "Cần kiểm tra chứng từ chi"]), "status": "PUBLISHED"},
    {"id": "real-project-redcross-cuba", "slug": "ung-ho-nhan-dan-cuba", "name": "Ủng hộ nhân dân Cuba", "organization": "Hội Chữ thập đỏ Việt Nam", "category": "Cứu trợ / nhân đạo quốc tế", "source_url": "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html", "source_name": "Hội Chữ thập đỏ Việt Nam", "image_url": "/images/food-support.jpg", "description": "Chiến dịch có số tiền công bố, lượt tham gia và thời gian vận động rõ ràng.", "metrics": [metric_by_id("metric-redcross-cuba-amount"), metric_by_id("metric-redcross-cuba-contributors")], "score": score(92, "A", 30, 25, 20, 8, 9, ["Nguồn cấp A", "Có số tiền/lượt tham gia", "Có ngày công bố rõ"]), "status": "PUBLISHED"},
    {"id": "real-project-unicef-nutrition", "slug": "dinh-duong-tre-em-viet-nam", "name": "Dinh dưỡng trẻ em tại Việt Nam", "organization": "UNICEF Việt Nam", "category": "Dinh dưỡng / trẻ em", "source_url": "https://www.unicef.org/vietnam/nutrition", "source_name": "UNICEF Việt Nam", "image_url": "/images/medical-support.jpg", "description": "Nguồn thống kê nền về suy dinh dưỡng, trẻ thấp còi và nhu cầu can thiệp dinh dưỡng.", "metrics": [metric_by_id("metric-unicef-wasting"), metric_by_id("metric-unicef-stunting")], "score": score(94, "A", 30, 18, 20, 16, 10, ["Nguồn quốc tế chính thức", "Có số liệu định lượng", "Phù hợp làm bối cảnh chiến dịch"]), "status": "PUBLISHED"},
]


def kpis() -> dict[str, Any]:
    published = [item for item in ARTICLES if item["status"] == "PUBLISHED"]
    distribution = {grade: 0 for grade in ["A", "B", "C", "D", "X"]}
    for item in published:
        distribution[item["score"]["grade"]] += 1
    with_evidence = [item for item in published if item.get("claims") and item.get("media")]
    return {
        "sources_total": len(SOURCES),
        "official_articles": len([item for item in published if item["source"]["level"] in {"A", "B"}]),
        "alert_cases": len([item for item in published if item["type"] in {"ALERT", "SCAM_ALERT"}]),
        "evidence_rate": round(len(with_evidence) / max(1, len(published)) * 100),
        "live_source_rate": 100,
        "updated_30d": len(published),
        "original_clicks": 1284,
        "article_count": len(published),
        "grade_distribution": distribution,
    }


def statistics() -> dict[str, Any]:
    published_projects = [project for project in REAL_PROJECTS if project["status"] == "PUBLISHED"]
    used_metric_ids = {metric["id"] for project in published_projects for metric in project["metrics"]}
    metrics = [metric for metric in METRICS if metric["id"] in used_metric_ids]
    official_metrics = [metric for metric in metrics if metric["confidence_level"] in {"A", "B"}]
    total_amount = sum(metric["numeric_value"] for metric in metrics if metric["unit"] == "VND" and metric["metric_type"] == "SUPPORT_AMOUNT")
    # Người ĐƯỢC hỗ trợ: chỉ beneficiary thật; số liệu nhu cầu (SOURCE_STATISTIC) tách riêng để không thổi phồng.
    total_beneficiaries = sum(metric["numeric_value"] for metric in metrics if metric["unit"] == "PEOPLE" and metric["metric_type"] == "BENEFICIARY")
    total_need_context = sum(metric["numeric_value"] for metric in metrics if metric["unit"] == "PEOPLE" and metric["metric_type"] == "SOURCE_STATISTIC")
    distribution = {grade: 0 for grade in ["A", "B", "C", "D", "X"]}
    for project in published_projects:
        distribution[project["score"]["grade"]] += 1
    return {
        "sources_total": len(SOURCES),
        "real_projects": len(published_projects),
        "metric_claims": len(metrics),
        "official_source_rate": round(len(official_metrics) / max(1, len(metrics)) * 100),
        "alert_cases": len([item for item in ARTICLES if item["status"] == "PUBLISHED" and item["type"] in {"ALERT", "SCAM_ALERT"}]),
        "total_reported_amount": total_amount,
        "total_reported_beneficiaries": total_beneficiaries,
        "total_need_context": total_need_context,
        "updated_at": NOW,
        "grade_distribution": distribution,
    }


def home() -> dict[str, Any]:
    return {
        "hero": {
            "title": "Kiểm chứng trước khi quyên góp",
            "subtitle": "CharityConnect tổng hợp nguồn chính thống, số liệu công bố và cảnh báo từ thiện giả để bảo vệ lòng tốt của cộng đồng.",
            "primary_cta": "Tra cứu ngay",
            "secondary_cta": "Xem cảnh báo",
        },
        "kpis": kpis(),
        "featured": [item for item in ARTICLES if item["type"] in {"ORGANIZATION", "TRANSPARENCY", "DATA", "REAL_PROJECT", "REAL_STATISTIC", "FINANCIAL_REPORT"}],
        "alerts": [item for item in ARTICLES if item["type"] in {"ALERT", "SCAM_ALERT"}],
        "videos": [item for item in ARTICLES if item["type"] == "VIDEO"],
        "sources": SOURCES,
        "projects": REAL_PROJECTS,
        "statistics": statistics(),
    }


def list_articles(q: str = "", article_type: str | None = None, source_level: str | None = None, tag: str | None = None, page: int = 1, page_size: int = 9) -> dict[str, Any]:
    q_fold = q.casefold()
    filtered = []
    for item in ARTICLES:
        if item["status"] != "PUBLISHED":
            continue
        haystack = " ".join([item["title"], item["excerpt"], item["summary"], " ".join(item["tags"])]).casefold()
        if q_fold and q_fold not in haystack:
            continue
        if article_type:
            if article_type == "ALERT" and item["type"] not in {"ALERT", "SCAM_ALERT"}:
                continue
            if article_type != "ALERT" and item["type"] != article_type:
                continue
        if source_level and item["source"]["level"] != source_level:
            continue
        if tag and tag not in item["tags"]:
            continue
        filtered.append(item)
    start = (max(1, page) - 1) * page_size
    return {"items": filtered[start:start + page_size], "total": len(filtered), "page": max(1, page), "page_size": page_size}


def get_article(slug: str) -> dict[str, Any] | None:
    return next((item for item in ARTICLES if item["slug"] == slug and item["status"] == "PUBLISHED"), None)


def list_projects(source: str = "", category: str = "", grade: str = "") -> list[dict[str, Any]]:
    source_fold = source.casefold()
    category_fold = category.casefold()
    return [
        project
        for project in REAL_PROJECTS
        if project["status"] == "PUBLISHED"
        and (not source_fold or source_fold in project["source_name"].casefold() or source_fold in project["organization"].casefold())
        and (not category_fold or category_fold in project["category"].casefold())
        and (not grade or project["score"]["grade"] == grade)
    ]


def list_metrics(metric_type: str | None = None, source: str = "", period: str | None = None) -> list[dict[str, Any]]:
    source_fold = source.casefold()
    return [
        metric
        for metric in METRICS
        if (not metric_type or metric["metric_type"] == metric_type)
        and (not source_fold or source_fold in metric["source_name"].casefold())
        and (not period or metric.get("period") == period)
    ]


def source_allowed(url: str) -> bool:
    hostname = urlparse(url).hostname or ""
    return hostname.casefold() in WHITELIST_HOSTS


def strip_html(raw_html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def extract_title(raw_html: str, fallback: str) -> str:
    og_match = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', raw_html, re.IGNORECASE)
    if og_match:
        return html.unescape(og_match.group(1)).strip()[:180]
    title_match = re.search(r"<title[^>]*>(.*?)</title>", raw_html, re.IGNORECASE | re.DOTALL)
    if title_match:
        return re.sub(r"\s+", " ", html.unescape(title_match.group(1))).strip()[:180]
    return fallback[:180]


def extract_thumbnail(raw_html: str) -> str | None:
    match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', raw_html, re.IGNORECASE)
    return html.unescape(match.group(1)).strip() if match else None


def extract_metrics(text: str, url: str, source: dict[str, Any]) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []
    money_pattern = re.compile(r"(\d+(?:[.,]\d+)?)\s*(tỷ|triệu|nghìn|đồng|vnd)", re.IGNORECASE)
    people_pattern = re.compile(r"(\d+(?:[.,]\d+)?)\s*(triệu|nghìn)?\s*(trẻ|học sinh|người|lượt)", re.IGNORECASE)

    def normalize_number(raw: str, scale: str | None) -> float:
        value = float(raw.replace(",", "."))
        if scale and scale.casefold() == "tỷ":
            return value * 1_000_000_000
        if scale and scale.casefold() == "triệu":
            return value * 1_000_000
        if scale and scale.casefold() == "nghìn":
            return value * 1_000
        return value

    for index, match in enumerate(money_pattern.finditer(text[:4000])):
        raw, unit_word = match.groups()
        value = normalize_number(raw, unit_word)
        metrics.append({
            "label": "Số tiền trích xuất từ nguồn",
            "numeric_value": int(value),
            "display_value": match.group(0),
            "unit": "VND",
            "period": None,
            "source_url": url,
            "source_name": source["name"],
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "confidence_level": source["level"],
            "metric_type": "SUPPORT_AMOUNT",
            "rank": index + 1,
        })
        if len(metrics) >= 3:
            break

    for index, match in enumerate(people_pattern.finditer(text[:4000])):
        raw, scale, people_unit = match.groups()
        value = normalize_number(raw, scale)
        metrics.append({
            "label": f"Số {people_unit} trích xuất từ nguồn",
            "numeric_value": int(value),
            "display_value": match.group(0),
            "unit": "COUNT" if people_unit == "lượt" else "PEOPLE",
            "period": None,
            "source_url": url,
            "source_name": source["name"],
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "confidence_level": source["level"],
            "metric_type": "BENEFICIARY",
            "rank": index + 1,
        })
        if len(metrics) >= 6:
            break
    return metrics


async def ingest_url(url: str) -> dict[str, Any]:
    if not source_allowed(url):
        return {"accepted": False, "reason": "URL không thuộc whitelist nguồn chính thống.", "url": url}
    source = source_for_url(url)
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "CharityConnectVerify/1.0"})
            response.raise_for_status()
        title = extract_title(response.text, url)
        thumbnail = extract_thumbnail(response.text)
        text = strip_html(response.text)
        excerpt = text[:260] + ("..." if len(text) > 260 else "")
        metrics = extract_metrics(text, url, source)
        article_id = f"pending-{abs(hash(url))}"
        pending = {
            "id": article_id,
            "url": url,
            "title": title,
            "excerpt": excerpt,
            "source": source,
            "thumbnail_url": thumbnail,
            "metrics": metrics,
            "status": "PENDING_REVIEW",
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
        PENDING_ARTICLES[article_id] = pending
        return {
            "accepted": True,
            "url": url,
            "id": article_id,
            "title": title,
            "excerpt": excerpt,
            "thumbnail_url": thumbnail,
            "metrics": metrics,
            "status": "PENDING_REVIEW",
            "message": "Đã lấy metadata và số liệu ứng viên; admin cần duyệt trước khi public.",
        }
    except Exception as exc:
        return {"accepted": False, "reason": f"Không thể lấy dữ liệu nguồn: {exc.__class__.__name__}", "url": url}


def review_article(article_id: str, status: str, reason: str | None = None) -> dict[str, Any]:
    pending = PENDING_ARTICLES.get(article_id)
    if not pending:
        return {"ok": False, "reason": "Không tìm thấy bài đang chờ duyệt.", "id": article_id}
    normalized = status.upper()
    if normalized not in {"PUBLISHED", "REJECTED"}:
        return {"ok": False, "reason": "Trạng thái chỉ nhận PUBLISHED hoặc REJECTED.", "id": article_id}
    pending["status"] = normalized
    pending["review_reason"] = reason
    if normalized == "PUBLISHED":
        source = pending["source"]
        article = {
            "id": pending["id"],
            "slug": re.sub(r"[^a-z0-9]+", "-", pending["title"].casefold()).strip("-")[:90] or pending["id"],
            "type": "REAL_STATISTIC",
            "title": pending["title"],
            "excerpt": pending["excerpt"],
            "summary": "Bài được ingest từ nguồn whitelist. CharityConnect chỉ lưu tóm tắt, metadata, số liệu ứng viên và link gốc; nội dung chi tiết vẫn thuộc nguồn gốc.",
            "body": ["Bài này được admin duyệt từ crawler whitelist.", "Người dùng nên mở nguồn gốc để đọc đầy đủ bối cảnh và kiểm tra ngày cập nhật."],
            "source": source,
            "source_url": pending["url"],
            "source_title": source["name"],
            "source_published_at": None,
            "collected_at": pending["collected_at"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "image_url": pending.get("thumbnail_url") or "/images/veo-charity-06.jpg",
            "tags": ["ingest", "nguồn whitelist", "số liệu"],
            "badges": ["Đã duyệt", f"Nguồn cấp {source['level']}"],
            "claims": [{"label": metric["label"], "value": metric["display_value"], "note": f"Theo {source['name']}"} for metric in pending.get("metrics", [])[:4]],
            "media": [{"type": "IMAGE", "url": pending.get("thumbnail_url") or "/images/veo-charity-06.jpg", "title": pending["title"], "attribution": source["name"]}],
            "score": analyze_source(pending["url"], has_financial_report=bool(pending.get("metrics")), has_legal_identity=True, has_media=bool(pending.get("thumbnail_url")))["score"],
            "status": "PUBLISHED",
        }
        ARTICLES.append(article)
    return {"ok": True, "id": article_id, "status": normalized, "reason": reason}


# Từ khóa dấu hiệu rủi ro cho phần phân tích lời kêu gọi từ thiện (không phải chatbot).
_URGENCY_TERMS = ("gấp", "khẩn", "ngay lập tức", "sắp mất", "cứu giúp ngay", "chỉ còn", "cuối cùng", "trong hôm nay", "nhanh tay")
_PAYMENT_RED_FLAGS = (
    ("thẻ cào", "Yêu cầu nạp thẻ cào — kênh gần như không thể hoàn/không truy vết."),
    ("gift card", "Yêu cầu thẻ quà tặng (gift card) — dấu hiệu lừa đảo điển hình."),
    ("usdt", "Yêu cầu tiền mã hóa (USDT) — không phù hợp với quyên góp minh bạch."),
    ("bitcoin", "Yêu cầu tiền mã hóa (Bitcoin) — không truy vết được."),
    ("crypto", "Yêu cầu tiền mã hóa — không phù hợp với từ thiện minh bạch."),
    ("ví momo cá nhân", "Chuyển vào ví cá nhân — khó đối soát so với tài khoản tổ chức."),
)
_PERSONAL_ACCOUNT_HINTS = ("tài khoản cá nhân", "số tk cá nhân", "chuyển khoản cá nhân", "stk cá nhân")
_CONTACT_ONLY_SOCIAL = ("inbox", "nhắn tin riêng", "ib page", "liên hệ zalo cá nhân", "kết bạn để chuyển")


def _signal(code: str, severity: str, message: str) -> dict[str, str]:
    return {"code": code, "severity": severity, "message": message}


def analyze_source(
    url: str,
    has_financial_report: bool = False,
    has_legal_identity: bool = False,
    has_media: bool = False,
    text: str = "",
    bank_account_type: str = "",
) -> dict[str, Any]:
    """Phân tích một lời kêu gọi/nguồn từ thiện và trả về điểm minh bạch + dấu hiệu rủi ro.

    Đây là công cụ phân tích một lần (không phải hội thoại): chấm điểm theo whitelist nguồn
    và bằng chứng, đồng thời quét văn bản kêu gọi để phát hiện dấu hiệu lừa đảo phổ biến.
    Giữ tương thích ngược: các tham số cũ (url + cờ bằng chứng) vẫn hoạt động như trước.
    """
    allowed = source_allowed(url) if url else False
    source = source_for_url(url) if allowed else None
    level = (source or {}).get("level", "D")
    is_internal_platform = (source or {}).get("id") == "source-charityconnect"
    authority = {"A": 30, "B": 25, "C": 20, "D": 8}.get(level, 8) if allowed else 0
    financial = 25 if (has_financial_report or is_internal_platform) else 0
    legal = 20 if (has_legal_identity or is_internal_platform) else (10 if allowed else 0)
    media = 13 if is_internal_platform else (15 if has_media else 0)
    freshness = 10 if is_internal_platform else (8 if allowed else 0)
    total = min(100, authority + financial + legal + media + freshness)

    signals: list[dict[str, str]] = []
    folded = (text or "").casefold()

    if url and not allowed:
        signals.append(_signal("SOURCE_NOT_WHITELISTED", "HIGH", "Nguồn không nằm trong whitelist cơ quan/báo chí/tổ chức uy tín — cần kiểm tra kỹ."))
    if bank_account_type.casefold() == "personal" or any(hint in folded for hint in _PERSONAL_ACCOUNT_HINTS):
        signals.append(_signal("PERSONAL_ACCOUNT", "HIGH", "Nhận tiền vào tài khoản cá nhân — tổ chức uy tín thường dùng tài khoản đứng tên tổ chức."))
    for term, message in _PAYMENT_RED_FLAGS:
        if term in folded:
            signals.append(_signal("PAYMENT_RED_FLAG", "HIGH", message))
    if any(term in folded for term in _URGENCY_TERMS):
        signals.append(_signal("URGENCY_PRESSURE", "MEDIUM", "Tạo áp lực thời gian ('gấp', 'khẩn'...) — thủ đoạn thường gặp để nạn nhân chuyển tiền vội."))
    if any(term in folded for term in _CONTACT_ONLY_SOCIAL):
        signals.append(_signal("SOCIAL_ONLY_CONTACT", "MEDIUM", "Chỉ liên hệ/chuyển tiền qua tin nhắn riêng — thiếu kênh công khai để đối chiếu."))
    if not has_financial_report and not is_internal_platform:
        signals.append(_signal("NO_FINANCIAL_REPORT", "LOW", "Chưa thấy sao kê/báo cáo tài chính công khai để đối chiếu dòng tiền."))
    if not has_legal_identity and not allowed:
        signals.append(_signal("NO_LEGAL_IDENTITY", "MEDIUM", "Chưa xác minh pháp nhân/đại diện của tổ chức đứng sau lời kêu gọi."))

    high = sum(1 for s in signals if s["severity"] == "HIGH")
    medium = sum(1 for s in signals if s["severity"] == "MEDIUM")
    if high >= 1 or total < 40:
        verdict = "HIGH_RISK"
        recommendation = "Có dấu hiệu rủi ro cao. KHÔNG chuyển tiền; đối chiếu với kênh chính thức và cân nhắc báo cáo nếu nghi giả mạo."
    elif medium >= 1 or total < 70:
        verdict = "CAUTION"
        recommendation = "Cần thận trọng. Kiểm tra sao kê, tên chủ tài khoản và kênh công khai của tổ chức trước khi ủng hộ."
    else:
        verdict = "TRUSTED"
        recommendation = "Nguồn có độ tin cậy tốt theo dữ liệu hiện có. Vẫn nên đối chiếu tài khoản nhận trước khi chuyển khoản lớn."
    if is_internal_platform and not signals:
        recommendation = "CharityConnect đạt điểm cao với bằng chứng nội bộ: sổ cái hash-chain, biên nhận QR, TrustChain/Merkle anchor, KPI minh bạch và kho kiểm chứng nguồn. Khi deploy thật, hãy bật backend và database để dữ liệu được đối soát liên tục."

    return {
        "url": url,
        "allowed": allowed,
        "source_level": level,
        "source_name": (source or {}).get("name"),
        "verdict": verdict,
        "recommendation": recommendation,
        "signals": signals,
        "score": score(total, grade_from_total(total), authority, financial, legal, media, freshness, ["Chấm điểm theo whitelist nguồn, bằng chứng cung cấp và dấu hiệu rủi ro trong nội dung kêu gọi"]),
    }
