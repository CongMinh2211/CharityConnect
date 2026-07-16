from fastapi.testclient import TestClient

from app import main
from app.main import app

client = TestClient(app)


def test_content_verify_public_api_serves_seed_data():
    main.rate_buckets.clear()
    home = client.get("/content/home").json()
    assert home["kpis"]["sources_total"] >= 8
    assert home["alerts"]
    assert home["projects"]
    assert home["statistics"]["metric_claims"] >= 8
    articles = client.get("/content/articles?type=ALERT").json()
    assert articles["total"] == home["kpis"]["alert_cases"]
    detail = client.get(f"/content/articles/{articles['items'][0]['slug']}").json()
    assert detail["source_url"].startswith("https://")


def test_content_projects_metrics_and_statistics():
    projects = client.get("/content/projects?source=UNICEF").json()
    assert projects
    assert projects[0]["source_name"] == "UNICEF Việt Nam"
    metrics = client.get("/content/metrics?type=COST&source=Nuôi%20Em").json()
    assert metrics[0]["numeric_value"] == 1450000
    statistics = client.get("/content/statistics").json()
    assert statistics["total_reported_amount"] > 0
    assert statistics["official_source_rate"] > 0


def test_analyze_source_scores_whitelist_and_evidence():
    payload = client.post("/assistant/analyze-source", json={
        "url": "https://www.nuoiem.com/",
        "has_financial_report": True,
        "has_legal_identity": True,
        "has_media": True,
    }).json()
    assert payload["allowed"] is True
    assert payload["score"]["total"] >= 80
    blocked = client.post("/assistant/analyze-source", json={"url": "https://example.com/random"}).json()
    assert blocked["allowed"] is False

    own_site = client.post("/assistant/analyze-source", json={"url": "https://charityconnect-7kep.onrender.com/"}).json()
    assert own_site["allowed"] is True
    assert own_site["source_name"] == "CharityConnect"
    assert own_site["score"]["total"] == 98
    assert own_site["verdict"] == "TRUSTED"
    assert own_site["signals"] == []


def test_analyze_source_detects_scam_signals_and_verdict():
    # Lời kêu gọi lừa đảo điển hình -> HIGH_RISK với nhiều dấu hiệu.
    scam = client.post("/assistant/analyze-source", json={
        "url": "https://facebook.com/fanpage-gia",
        "text": "Kêu gọi GẤP! Cần cứu giúp ngay, chuyển khoản cá nhân hoặc thẻ cào, inbox page để chuyển",
        "bank_account_type": "personal",
    }).json()
    assert scam["verdict"] == "HIGH_RISK"
    codes = {s["code"] for s in scam["signals"]}
    assert {"SOURCE_NOT_WHITELISTED", "PERSONAL_ACCOUNT", "PAYMENT_RED_FLAG", "URGENCY_PRESSURE"} <= codes
    assert any(s["severity"] == "HIGH" for s in scam["signals"])

    # Nguồn cơ quan nhà nước + đủ bằng chứng -> TRUSTED, không có dấu hiệu.
    trusted = client.post("/assistant/analyze-source", json={
        "url": "https://mps.gov.vn/tin-canh-bao",
        "has_financial_report": True, "has_legal_identity": True, "has_media": True,
    }).json()
    assert trusted["verdict"] == "TRUSTED"
    assert trusted["signals"] == []


def test_admin_ingest_rejects_non_whitelisted_url():
    payload = client.post("/admin/content/ingest", json={"urls": ["https://example.com/random"]}).json()
    assert payload["ingested"] == 0
    assert payload["results"][0]["accepted"] is False


def test_admin_review_unknown_article_returns_404():
    response = client.patch("/admin/content/articles/missing/review", json={"status": "PUBLISHED"})
    assert response.status_code == 404


def test_chat_answers_verify_kpis_from_internal_content(monkeypatch):
    main.rate_buckets.clear()
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = client.post("/assistant/chat", json={"message": "thống kê hỗ trợ trẻ em vùng cao và nguồn chính thống"}).json()
    assert response["scope"] == "INTERNAL"
    assert "claim số liệu" in response["answer"]
    assert "Nuôi Em" in response["answer"]


def test_chat_returns_anthropic_cited_external_result(monkeypatch):
    main.rate_buckets.clear()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only")
    monkeypatch.setenv("ASSISTANT_PROVIDER", "anthropic")
    source = main.AssistantSource(kind="WEB", title="Nguồn Claude", url="https://example.com/claude")

    async def fake_anthropic_web_answer(_request):
        return "Đã tra cứu bằng Claude", [source]

    monkeypatch.setattr(main, "anthropic_web_answer", fake_anthropic_web_answer)
    payload = client.post("/assistant/chat", json={"message": "Thời tiết Hà Nội hôm nay?"}).json()
    assert payload["mode"] == "ANTHROPIC"
    assert payload["scope"] == "EXTERNAL_WEB"
    assert payload["searched_web"] is True
    assert payload["sources"][0]["url"] == "https://example.com/claude"


def test_anthropic_sources_reads_tool_results_and_citations():
    sources = main.anthropic_sources([
        {
            "type": "web_search_tool_result",
            "content": [{"type": "web_search_result", "title": "Kết quả", "url": "https://example.org/a"}],
        },
        {
            "type": "text",
            "text": "Nguồn khác",
            "citations": [{"type": "web_search_result_location", "title": "Trích dẫn", "url": "https://example.org/b"}],
        },
    ])
    assert [source.url for source in sources] == ["https://example.org/a", "https://example.org/b"]
