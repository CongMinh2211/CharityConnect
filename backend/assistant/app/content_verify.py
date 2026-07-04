from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx


NOW = "2026-07-03T00:00:00.000Z"

SOURCES: list[dict[str, Any]] = [
    {"id": "source-nuoiem", "name": "Nuôi Em", "url": "https://www.nuoiem.com/", "level": "C", "kind": "OFFICIAL_ORG", "description": "Website chính thức của dự án Nuôi Em; dùng làm nguồn tự công bố về mô hình nhận mã, tài chính và hình ảnh hoạt động."},
    {"id": "source-tuthienthat", "name": "Từ Thiện Thật", "url": "https://tuthienthat.vn/", "level": "C", "kind": "OFFICIAL_ORG", "description": "Website chuyên mục hoàn cảnh, báo cáo tài chính, video và hoạt động thiện nguyện; dùng làm nguồn tổ chức tự công bố."},
    {"id": "source-mps", "name": "Bộ Công an", "url": "https://mps.gov.vn/", "level": "A", "kind": "GOVERNMENT", "description": "Nguồn cơ quan nhà nước cấp A cho các cảnh báo, vụ việc xử lý và số liệu về lừa đảo."},
    {"id": "source-nhandan", "name": "Nhân Dân", "url": "https://nhandan.vn/", "level": "B", "kind": "PRESS", "description": "Báo chí chính thống; dùng cho các bài cảnh báo có nguồn tin được biên tập."},
    {"id": "source-vneconomy", "name": "VnEconomy", "url": "https://vneconomy.vn/", "level": "B", "kind": "PRESS", "description": "Báo chí chính thống về kinh tế - xã hội; dùng làm nguồn cảnh báo và đối chiếu."},
    {"id": "source-chinhphu", "name": "Cổng Thông tin điện tử Chính phủ", "url": "https://chinhphu.vn/", "level": "A", "kind": "GOVERNMENT", "description": "Nguồn cấp A cho chính sách, số liệu và cảnh báo được công bố chính thức."},
    {"id": "source-vtv", "name": "VTV/VTV24", "url": "https://vtv.vn/", "level": "B", "kind": "VIDEO", "description": "Nguồn video/bản tin chính thống; dùng làm media minh bạch và cảnh báo."},
]

SOURCE_BY_ID = {source["id"]: source for source in SOURCES}
WHITELIST_HOSTS = {
    "www.nuoiem.com", "nuoiem.com", "tuthienthat.vn", "www.tuthienthat.vn",
    "mps.gov.vn", "www.mps.gov.vn", "nhandan.vn", "www.nhandan.vn",
    "vneconomy.vn", "www.vneconomy.vn", "chinhphu.vn", "www.chinhphu.vn",
    "vtv.vn", "www.vtv.vn",
}


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


ARTICLES: list[dict[str, Any]] = [
    {
        "id": "article-nuoiem-model",
        "slug": "nuoi-em-mo-hinh-nhan-ma-va-minh-bach-tai-chinh",
        "type": "ORGANIZATION",
        "title": "Nuôi Em: mô hình nhận mã, theo dõi tài chính và cập nhật hoạt động",
        "excerpt": "Nguồn tự công bố của Nuôi Em cho thấy cách tổ chức trình bày mã em nuôi, tài chính và hình ảnh hoạt động theo từng giai đoạn.",
        "summary": "CharityConnect ghi nhận Nuôi Em là nguồn tổ chức tự công bố có quy trình tra cứu rõ ràng. Các con số như mục tiêu học sinh và chi phí theo năm học cần được dẫn đúng là dữ liệu do Nuôi Em công bố, không thay thế kiểm toán độc lập.",
        "body": [
            "Nuôi Em là ví dụ tốt để học cách trình bày landing page thiện nguyện: banner rõ, nút tra mã, tài chính, nhận mã và cập nhật hình ảnh theo kỳ.",
            "Khi đưa vào CharityConnect, dữ liệu từ Nuôi Em được xếp cấp C vì là nguồn chính thức của tổ chức. Điểm minh bạch tăng khi có báo cáo tài chính, sao kê, hình ảnh/video theo thời gian và nguồn đối chiếu độc lập.",
            "Khuyến nghị người dùng: đọc báo cáo tài chính, kiểm tra kênh chính thức và chỉ chuyển tiền qua tài khoản được tổ chức công bố.",
        ],
        "source": SOURCE_BY_ID["source-nuoiem"],
        "source_url": "https://www.nuoiem.com/",
        "source_title": "Nuôi Em",
        "source_published_at": "2026-06-01",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/education.jpg",
        "tags": ["trẻ em vùng cao", "giáo dục", "nguồn tổ chức"],
        "badges": ["Nguồn tổ chức", "Có số liệu", "Có hình ảnh"],
        "claims": [
            {"label": "Chi phí tham chiếu", "value": "1.450.000 VND/năm học", "note": "Số liệu do Nuôi Em tự công bố; cần đối chiếu báo cáo tài chính khi ra quyết định."},
            {"label": "Mục tiêu công bố", "value": "120.000+ học sinh", "note": "Dữ liệu dùng làm claim nguồn, không tuyên bố đã kiểm toán độc lập."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/education.jpg", "title": "Hỗ trợ giáo dục vùng cao", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(82, "B", 20, 22, 16, 15, 9, ["Có website chính thức", "Có trình bày tài chính và quy trình nhận mã", "Cần thêm nguồn đối chiếu độc lập"]),
        "status": "PUBLISHED",
    },
    {
        "id": "article-tuthienthat-categories",
        "slug": "tu-thien-that-chuyen-muc-video-va-bao-cao-minh-bach",
        "type": "TRANSPARENCY",
        "title": "Từ Thiện Thật: chuyên mục hoàn cảnh, video và báo cáo minh bạch",
        "excerpt": "Từ Thiện Thật tổ chức nội dung theo hoàn cảnh, tấm lòng vàng, video và báo cáo tài chính — phù hợp để tham khảo cách chia chuyên mục.",
        "summary": "Dữ liệu từ Từ Thiện Thật được sử dụng như nguồn tổ chức tự công bố. CharityConnect không sao chép nguyên bài mà chỉ lưu tóm tắt, link gốc, bằng chứng và chỉ số minh bạch.",
        "body": ["Điểm đáng học ở Từ Thiện Thật là cấu trúc thông tin rõ: hoàn cảnh thật, bài học đáng quý, video và báo cáo tài chính.", "Trên CharityConnect, các bài dạng này được hiển thị ngắn ở card, còn nội dung dài nằm trong trang chi tiết kèm nguồn gốc.", "Người dùng nên ưu tiên bài có báo cáo tài chính, video hoạt động, ngày cập nhật và đường dẫn về nguồn chính thức."],
        "source": SOURCE_BY_ID["source-tuthienthat"],
        "source_url": "https://tuthienthat.vn/",
        "source_title": "Từ Thiện Thật",
        "source_published_at": "2026-06-01",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/community.jpg",
        "tags": ["báo cáo tài chính", "video", "hoàn cảnh"],
        "badges": ["Có video", "Nguồn tổ chức", "Báo cáo minh bạch"],
        "claims": [{"label": "Nhóm nội dung", "value": "Hoàn cảnh, video, báo cáo", "note": "Dùng làm cơ sở thiết kế thông tin, không copy nguyên bài."}],
        "media": [{"type": "VIDEO", "url": "https://tuthienthat.vn/", "thumbnail_url": "/images/community.jpg", "title": "Video hoạt động thiện nguyện", "attribution": "Link video tại nguồn gốc"}],
        "score": score(76, "B", 20, 18, 14, 15, 9, ["Có chuyên mục báo cáo và video", "Nguồn tự công bố", "Cần đối chiếu thêm nguồn độc lập"]),
        "status": "PUBLISHED",
    },
    {
        "id": "article-cyber-scam-stats",
        "slug": "so-lieu-lua-dao-mang-va-ly-do-phai-kiem-chung-tu-thien",
        "type": "DATA",
        "title": "Số liệu lừa đảo mạng: lý do phải kiểm chứng trước khi quyên góp",
        "excerpt": "Các số liệu từ nguồn nhà nước về lừa đảo trên không gian mạng được dùng làm nền cảnh báo rủi ro giả mạo thiện nguyện.",
        "summary": "Nguồn cấp A cho thấy rủi ro lừa đảo trực tuyến rất lớn. CharityConnect dùng số liệu này để nhắc người dùng kiểm tra nguồn, tài khoản nhận tiền và bằng chứng trước khi ủng hộ.",
        "body": ["Cảnh báo lừa đảo trực tuyến là bối cảnh quan trọng của CharityConnect Verify: lòng tốt có thể bị lợi dụng nếu người dùng chuyển tiền chỉ dựa trên bài đăng mạng xã hội.", "Các số liệu chính thức về số vụ và thiệt hại giúp hệ thống xây dựng KPI niềm tin, theo dõi tỷ lệ bài có nguồn chính thống và tỷ lệ cảnh báo đã phân loại.", "Dữ liệu dạng này phải được trích dẫn rõ nguồn, ngày cập nhật và không dùng để quy kết một tổ chức cụ thể nếu chưa có kết luận."],
        "source": SOURCE_BY_ID["source-chinhphu"],
        "source_url": "https://chinhphu.vn/",
        "source_title": "Cổng Thông tin điện tử Chính phủ / Bộ Công an",
        "source_published_at": "2025-10-01",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": "/images/veo-charity-hero.jpg",
        "tags": ["số liệu", "lừa đảo mạng", "kiểm chứng"],
        "badges": ["Nguồn chính thống", "Có số liệu", "Cảnh báo rủi ro"],
        "claims": [
            {"label": "Giai đoạn 2020–2025", "value": "24.295 vụ", "note": "Số liệu trích từ nguồn nhà nước về lừa đảo chiếm đoạt tài sản trên không gian mạng."},
            {"label": "Thiệt hại công bố", "value": "Gần 40.000 tỷ đồng", "note": "Dùng làm KPI cảnh báo, không quy kết cho riêng lĩnh vực từ thiện."},
        ],
        "media": [{"type": "IMAGE", "url": "/images/veo-charity-hero.jpg", "title": "Kiểm chứng trước khi chuyển tiền", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(93, "A", 30, 20, 20, 13, 10, ["Nguồn cơ quan nhà nước", "Có số liệu định lượng", "Phù hợp làm bối cảnh cảnh báo"]),
        "status": "PUBLISHED",
    },
]

ALERTS: list[dict[str, Any]] = [
    ("article-mps-charity-impersonation", "canh-bao-gia-mao-thien-nguyen-loi-dung-hoan-canh-kho-khan", "Cảnh báo giả mạo thiện nguyện, lợi dụng hoàn cảnh khó khăn", SOURCE_BY_ID["source-mps"], "https://mps.gov.vn/", "OFFICIAL_ACTION", "/images/medical-support.jpg", "Nguồn Bộ Công an cảnh báo thủ đoạn giả danh cá nhân/tổ chức, lợi dụng bài thiện nguyện để lừa chuyển tiền."),
    ("article-nhandan-fake-nun", "canh-bao-gia-danh-ni-co-keu-goi-tu-thien", "Cảnh báo giả danh ni cô kêu gọi từ thiện", SOURCE_BY_ID["source-nhandan"], "https://nhandan.vn/", "PRESS_WARNING", "/images/food-support.jpg", "Bài báo chính thống phản ánh thủ đoạn giả danh để kêu gọi quyên góp, có số tiền giao dịch lớn và nhiều nạn nhân."),
    ("article-redcross-fake-fanpage", "canh-bao-fanpage-gia-mao-hoi-chu-thap-do-keu-goi-quyen-gop", "Cảnh báo fanpage giả mạo tổ chức từ thiện để kêu gọi quyên góp", SOURCE_BY_ID["source-vneconomy"], "https://vneconomy.vn/", "PRESS_WARNING", "/images/veo-charity-03.jpg", "Nguồn báo chí cảnh báo fanpage giả mạo tổ chức thiện nguyện, dùng tài khoản cá nhân để kêu gọi chuyển tiền."),
]

for item_id, slug, title, source, url, label, image, excerpt in ALERTS:
    ARTICLES.append({
        "id": item_id,
        "slug": slug,
        "type": "ALERT",
        "title": title,
        "excerpt": excerpt,
        "summary": "Đây là case cảnh báo có nguồn. CharityConnect chỉ hiển thị theo hướng phòng tránh, không tự quy kết ngoài nội dung nguồn chính thức.",
        "body": ["Thủ đoạn thường gặp là giả danh tổ chức/cá nhân có uy tín, dùng câu chuyện thương tâm và tài khoản nhận tiền không rõ ràng.", "Người dùng nên kiểm tra website gốc, tên chủ tài khoản, thông báo chính thức và bài báo đối chiếu trước khi chuyển tiền.", "Các cảnh báo trên hệ thống luôn gắn nhãn căn cứ để tránh lan truyền cáo buộc thiếu nguồn."],
        "source": source,
        "source_url": url,
        "source_title": source["name"],
        "source_published_at": "2025-01-01",
        "collected_at": NOW,
        "updated_at": NOW,
        "image_url": image,
        "tags": ["cảnh báo", "giả mạo", "lừa đảo"],
        "badges": ["Nguồn chính thống", "Cảnh báo", "Kiểm tra tài khoản"],
        "claims": [{"label": "Loại cảnh báo", "value": "Giả mạo kêu gọi thiện nguyện", "note": "Trích dẫn và tóm tắt theo nguồn chính thống."}],
        "media": [{"type": "IMAGE", "url": image, "title": "Cảnh báo kiểm chứng nguồn", "attribution": "Ảnh minh họa CharityConnect"}],
        "score": score(90 if source["level"] == "A" else 84, "X", 30 if source["level"] == "A" else 25, 20, 18, 13, 8, ["Nguồn chính thống", "Nêu dấu hiệu giả mạo", "Hiển thị để phòng tránh"]),
        "status": "PUBLISHED",
        "warning_label": label,
    })

ARTICLES.append({
    "id": "article-vtv-video-warning",
    "slug": "video-canh-bao-tu-thien-gia-va-kiem-tra-nguon-goc",
    "type": "VIDEO",
    "title": "Video cảnh báo: kiểm tra nguồn gốc trước khi quyên góp",
    "excerpt": "Khung video minh bạch giúp người dùng xem thêm bản tin/cảnh báo từ nguồn chính thống trước khi chuyển tiền.",
    "summary": "Video được dùng như bằng chứng truyền thông bổ sung. CharityConnect không tải lại video mà điều hướng người dùng đến nguồn gốc.",
    "body": ["Nội dung video minh bạch nên tập trung vào cách nhận diện giả mạo: tài khoản cá nhân lạ, thiếu thông tin pháp lý, ảnh cảm xúc nhưng không có báo cáo.", "Mỗi video cần có nguồn, ngày cập nhật, tổ chức phát hành và mức liên quan đến bài viết."],
    "source": SOURCE_BY_ID["source-vtv"],
    "source_url": "https://vtv.vn/",
    "source_title": "VTV/VTV24",
    "source_published_at": "2025-01-01",
    "collected_at": NOW,
    "updated_at": NOW,
    "image_url": "/images/veo-charity-02.jpg",
    "tags": ["video", "cảnh báo", "truyền thông"],
    "badges": ["Có video", "Nguồn chính thống", "Cảnh báo"],
    "claims": [{"label": "Loại media", "value": "Video nguồn chính thống", "note": "Ưu tiên link/nhúng hợp lệ thay vì tải lại video."}],
    "media": [{"type": "VIDEO", "url": "https://vtv.vn/", "thumbnail_url": "/images/veo-charity-02.jpg", "title": "Xem video cảnh báo tại nguồn chính thống", "attribution": "VTV/VTV24"}],
    "score": score(79, "B", 25, 12, 17, 15, 10, ["Nguồn video chính thống", "Phù hợp giáo dục phòng tránh", "Cần link video cụ thể khi ingest live"]),
    "status": "PUBLISHED",
})


def kpis() -> dict[str, Any]:
    published = [item for item in ARTICLES if item["status"] == "PUBLISHED"]
    distribution = {grade: 0 for grade in ["A", "B", "C", "D", "X"]}
    for item in published:
        distribution[item["score"]["grade"]] += 1
    with_evidence = [item for item in published if item.get("claims") and item.get("media")]
    return {
        "sources_total": len(SOURCES),
        "official_articles": len([item for item in published if item["source"]["level"] in {"A", "B"}]),
        "alert_cases": len([item for item in published if item["type"] == "ALERT"]),
        "evidence_rate": round(len(with_evidence) / max(1, len(published)) * 100),
        "live_source_rate": 100,
        "updated_30d": len(published),
        "original_clicks": 1284,
        "article_count": len(published),
        "grade_distribution": distribution,
    }


def home() -> dict[str, Any]:
    return {
        "hero": {
            "title": "Kiểm chứng trước khi quyên góp",
            "subtitle": "CharityConnect tổng hợp nguồn chính thống, báo cáo minh bạch và cảnh báo dấu hiệu từ thiện giả để bảo vệ lòng tốt của cộng đồng.",
            "primary_cta": "Tra cứu ngay",
            "secondary_cta": "Xem cảnh báo",
        },
        "kpis": kpis(),
        "featured": [item for item in ARTICLES if item["type"] in {"ORGANIZATION", "TRANSPARENCY", "DATA"}],
        "alerts": [item for item in ARTICLES if item["type"] == "ALERT"],
        "videos": [item for item in ARTICLES if item["type"] == "VIDEO"],
        "sources": SOURCES,
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
        if article_type and item["type"] != article_type:
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


def source_allowed(url: str) -> bool:
    hostname = urlparse(url).hostname or ""
    return hostname.casefold() in WHITELIST_HOSTS


async def ingest_url(url: str) -> dict[str, Any]:
    if not source_allowed(url):
        return {"accepted": False, "reason": "URL không thuộc whitelist nguồn chính thống.", "url": url}
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "CharityConnectVerify/1.0"})
            response.raise_for_status()
        title_match = re.search(r"<title[^>]*>(.*?)</title>", response.text, re.IGNORECASE | re.DOTALL)
        title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else url
        return {
            "accepted": True,
            "url": url,
            "title": title[:180],
            "status": "PENDING_REVIEW",
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "message": "Đã lấy tiêu đề và metadata; admin cần duyệt trước khi public.",
        }
    except Exception as exc:
        return {"accepted": False, "reason": f"Không thể lấy dữ liệu nguồn: {exc.__class__.__name__}", "url": url}


def analyze_source(url: str, has_financial_report: bool = False, has_legal_identity: bool = False, has_media: bool = False) -> dict[str, Any]:
    allowed = source_allowed(url)
    hostname = urlparse(url).hostname or ""
    source = next((item for item in SOURCES if urlparse(item["url"]).hostname in {hostname, hostname.replace("www.", "")}), None)
    authority = {"A": 30, "B": 25, "C": 20, "D": 8}.get((source or {}).get("level", "D"), 8) if allowed else 0
    financial = 25 if has_financial_report else 0
    legal = 20 if has_legal_identity else (10 if allowed else 0)
    media = 15 if has_media else 0
    freshness = 8 if allowed else 0
    total = min(100, authority + financial + legal + media + freshness)
    grade = "A" if total >= 90 else "B" if total >= 70 else "C" if total >= 50 else "D"
    return {
        "url": url,
        "allowed": allowed,
        "source_level": (source or {}).get("level", "D"),
        "score": score(total, grade, authority, financial, legal, media, freshness, ["Chấm điểm theo whitelist nguồn và bằng chứng được cung cấp"]),
    }
