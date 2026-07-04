from fastapi.testclient import TestClient

from app import main
from app.main import app

client = TestClient(app)


def test_content_verify_public_api_serves_seed_data():
    main.rate_buckets.clear()
    home = client.get("/content/home").json()
    assert home["kpis"]["sources_total"] >= 5
    assert home["alerts"]
    articles = client.get("/content/articles?type=ALERT").json()
    assert articles["total"] == home["kpis"]["alert_cases"]
    detail = client.get(f"/content/articles/{articles['items'][0]['slug']}").json()
    assert detail["source_url"].startswith("https://")


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


def test_admin_ingest_rejects_non_whitelisted_url():
    payload = client.post("/admin/content/ingest", json={"urls": ["https://example.com/random"]}).json()
    assert payload["ingested"] == 0
    assert payload["results"][0]["accepted"] is False


def test_chat_answers_verify_kpis_from_internal_content(monkeypatch):
    main.rate_buckets.clear()
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = client.post("/assistant/chat", json={"message": "thống kê hỗ trợ trẻ em vùng cao và nguồn chính thống"}).json()
    assert response["scope"] == "INTERNAL"
    assert "Nguồn đang theo dõi" in response["answer"]
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
