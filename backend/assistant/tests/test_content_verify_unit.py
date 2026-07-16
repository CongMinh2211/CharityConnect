import asyncio

from app import content_verify as cv


def test_content_helpers_cover_source_filters_and_html_parsing():
    assert cv.source_allowed("https://mps.gov.vn/canh-bao") is True
    assert cv.source_allowed("https://charityconnect-7kep.onrender.com/kiem-tra-nguon") is True
    assert cv.source_allowed("https://example.invalid/canh-bao") is False
    assert cv.source_for_url("https://mps.gov.vn/canh-bao")["id"] == "source-bocongan"
    assert cv.source_for_url("https://redcross.org.vn/tin-tuc")["id"] == "source-redcross"
    assert cv.source_for_url("https://www.unicef.org/vietnam/vi")["id"] == "source-unicef"
    assert cv.source_for_url("https://charityconnect-7kep.onrender.com/")["id"] == "source-charityconnect"
    assert cv.source_for_url("https://unknown.invalid/")["id"] == "source-chinhphu"
    assert [cv.grade_from_total(value) for value in (90, 70, 50, 49)] == ["A", "B", "C", "D"]

    raw = """<html><head>
      <meta property="og:title" content="Tin &amp; số liệu">
      <meta property="og:image" content="https://mps.gov.vn/cover.jpg">
      <style>.hidden { display: none }</style><script>bad()</script>
      </head><body><h1>Nội dung công khai</h1></body></html>"""
    assert cv.extract_title(raw, "fallback") == "Tin & số liệu"
    assert cv.extract_thumbnail(raw) == "https://mps.gov.vn/cover.jpg"
    assert cv.strip_html(raw) == "Nội dung công khai"
    assert cv.extract_title("<title> Tiêu đề dự phòng </title>", "fallback") == "Tiêu đề dự phòng"
    assert cv.extract_title("<p>không có tiêu đề</p>", "fallback") == "fallback"
    assert cv.extract_thumbnail("<html></html>") is None


def test_content_list_filters_and_pagination_cover_public_only():
    all_items = cv.list_articles(page=0, page_size=2)
    assert all_items["page"] == 1
    assert len(all_items["items"]) <= 2
    assert cv.list_articles(q="chuỗi-không-tồn-tại")["total"] == 0
    assert all(item["type"] in {"ALERT", "SCAM_ALERT"} for item in cv.list_articles(article_type="ALERT")["items"])
    assert all(item["source"]["level"] == "A" for item in cv.list_articles(source_level="A")["items"])
    first_tag = cv.ARTICLES[0]["tags"][0]
    assert cv.list_articles(tag=first_tag)["total"] >= 1
    assert cv.get_article(cv.ARTICLES[0]["slug"])["id"] == cv.ARTICLES[0]["id"]
    assert cv.get_article("khong-ton-tai") is None
    assert cv.list_projects(source="UNICEF")
    assert cv.list_projects(category="chuỗi-không-tồn-tại") == []
    assert cv.list_metrics(source="Nu")
    assert cv.list_metrics(period="chuỗi-không-tồn-tại") == []


class _FakeResponse:
    text = (
        '<meta property="og:title" content="Bản tin kiểm chứng">'
        '<meta property="og:image" content="https://mps.gov.vn/image.jpg">'
        '<p>Nội dung ngắn từ nguồn chính thức.</p>'
    )

    def raise_for_status(self):
        return None


class _FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def get(self, *_args, **_kwargs):
        return _FakeResponse()


class _FailingClient(_FakeClient):
    async def get(self, *_args, **_kwargs):
        raise TimeoutError("source unavailable")


def test_ingest_success_review_publish_and_reject(monkeypatch):
    monkeypatch.setattr(cv.httpx, "AsyncClient", _FakeClient)
    url = "https://mps.gov.vn/kiem-chung-test"
    result = asyncio.run(cv.ingest_url(url))
    assert result["accepted"] is True
    assert result["status"] == "PENDING_REVIEW"
    assert result["thumbnail_url"].endswith("image.jpg")

    article_id = result["id"]
    before = len(cv.ARTICLES)
    invalid = cv.review_article(article_id, "INVALID")
    assert invalid["ok"] is False
    published = cv.review_article(article_id, "PUBLISHED", "Đã đối chiếu")
    assert published["ok"] is True
    assert len(cv.ARTICLES) == before + 1
    assert cv.ARTICLES[-1]["source_url"] == url

    rejected_id = "pending-rejected-unit-test"
    cv.PENDING_ARTICLES[rejected_id] = dict(cv.PENDING_ARTICLES[article_id])
    rejected = cv.review_article(rejected_id, "REJECTED", "Nguồn chưa đủ rõ")
    assert rejected == {"ok": True, "id": rejected_id, "status": "REJECTED", "reason": "Nguồn chưa đủ rõ"}

    cv.ARTICLES.pop()
    cv.PENDING_ARTICLES.pop(article_id, None)
    cv.PENDING_ARTICLES.pop(rejected_id, None)


def test_ingest_rejects_non_whitelist_and_handles_source_failure(monkeypatch):
    rejected = asyncio.run(cv.ingest_url("https://example.invalid/article"))
    assert rejected["accepted"] is False

    monkeypatch.setattr(cv.httpx, "AsyncClient", _FailingClient)
    failed = asyncio.run(cv.ingest_url("https://mps.gov.vn/source-down"))
    assert failed["accepted"] is False
    assert "TimeoutError" in failed["reason"]
    assert cv.review_article("missing-unit-test", "PUBLISHED")["ok"] is False


def test_metric_extraction_and_caution_verdict_cover_numeric_claims():
    source = cv.source_for_url("https://mps.gov.vn/so-lieu")
    metrics = cv.extract_metrics(
        "Chương trình công bố 2 tỷ đồng hỗ trợ 3 nghìn người và 250 lượt tiếp nhận.",
        "https://mps.gov.vn/so-lieu",
        source,
    )
    assert any(item["unit"] == "VND" and item["numeric_value"] == 2_000_000_000 for item in metrics)
    assert any(item["unit"] in {"PEOPLE", "COUNT"} for item in metrics)

    caution = cv.analyze_source("https://www.nuoiem.com/", has_legal_identity=True)
    assert caution["verdict"] == "CAUTION"


def test_remaining_filter_and_metric_limits(monkeypatch):
    # Exercise the explicit host fallbacks independently from the generic source loop.
    monkeypatch.setattr(cv, "SOURCES", [])
    assert cv.source_for_url("https://mps.gov.vn/a")["id"] == "source-bocongan"
    assert cv.source_for_url("https://redcross.org.vn/a")["id"] == "source-redcross"
    assert cv.source_for_url("https://unicef.org/a")["id"] == "source-unicef"

    cv.ARTICLES.append({"status": "DRAFT"})
    try:
        assert all(item["status"] == "PUBLISHED" for item in cv.list_articles()["items"])
        assert cv.list_articles(article_type="ORGANIZATION")["total"] >= 1
    finally:
        cv.ARTICLES.pop()

    source = cv.SOURCE_BY_ID["source-bocongan"]
    metrics = cv.extract_metrics(
        "1 triệu đồng, 2 triệu đồng, 3 triệu đồng, 4 triệu đồng; "
        "1 nghìn người, 2 nghìn học sinh, 3 nghìn lượt, 4 nghìn trẻ.",
        "https://mps.gov.vn/limits",
        source,
    )
    assert len(metrics) == 6
    assert metrics[0]["numeric_value"] == 1_000_000
