from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import ChatRequest, app, offline_answer, openai_answer, sanitize_text, web_answer

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_rate_limits():
    main.rate_buckets.clear()


def test_health_and_capabilities_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    health = client.get("/health").json()
    assert health["status"] == "ok"
    assert health["mode"] == "DEMO"
    assert health["scope"] == "INTERNAL_FIRST_WITH_WEB_FALLBACK"
    assert health["external_search"] is False
    assert client.get("/assistant/capabilities").json()["sensitive_data_redaction"] is True


def test_role_guide_public_exposes_common_and_locks_private_actions():
    payload = client.get("/assistant/role-guide?role=PUBLIC&path=/").json()
    assert payload["role"] == "PUBLIC"
    assert payload["knowledge_version"]
    assert [section["title"] for section in payload["sections"]] == ["Chức năng chung"]
    assert any(action["path"] == "/minh-bach" for action in payload["sections"][0]["actions"])
    assert any(action["path"] == "/tai-khoan" for action in payload["locked_actions"])
    assert any("Đăng nhập" in tip for tip in payload["tips"])


@pytest.mark.parametrize(
    ("role", "expected_path", "expected_tip"),
    [
        ("DONOR", "/lich-su", "donor"),
        ("ORGANIZATION", "/to-chuc?tab=finance", "tổ chức"),
        ("ADMIN", "/quan-tri?tab=trustchain", "admin"),
    ],
)
def test_role_guide_returns_role_specific_actions(role, expected_path, expected_tip):
    payload = client.get(f"/assistant/role-guide?role={role}&path=/tai-khoan").json()
    assert payload["role"] == role
    assert any(
        action["path"] == expected_path
        for section in payload["sections"]
        for action in section["actions"]
    )
    assert any(expected_tip in tip.casefold() for tip in payload["tips"])


def test_role_guide_does_not_mix_admin_with_client_actions():
    payload = client.get("/assistant/role-guide?role=ADMIN&path=/quan-tri").json()
    visible_paths = {
        action["path"]
        for section in payload["sections"]
        for action in section["actions"]
    }
    assert "/quan-tri?tab=users" in visible_paths
    assert "/lich-su" not in visible_paths
    assert "/to-chuc" not in visible_paths


def test_internal_question_never_searches_web_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post("/assistant/chat", json={"message": "Cách xác minh QR biên nhận?"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "DEMO"
    assert payload["scope"] == "INTERNAL"
    assert payload["searched_web"] is False
    assert payload["sources"][0]["kind"] == "INTERNAL"
    assert payload["actions"][0]["path"] == "/xac-minh-bien-nhan"


@pytest.mark.parametrize("message", ["Merkle Proof dùng để làm gì?", "Escrow đang khóa bao nhiêu?", "Xem biểu đồ thống kê ở đâu?", "Email cảm ơn gửi lúc nào?"])
def test_new_charityconnect_topics_are_internal(monkeypatch, message):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    payload = client.post("/assistant/chat", json={"message": message}).json()
    assert payload["scope"] == "INTERNAL"
    assert payload["searched_web"] is False


def test_external_question_without_key_does_not_hallucinate(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    payload = client.post("/assistant/chat", json={"message": "Thời tiết Hà Nội hôm nay?"}).json()
    assert payload["scope"] == "EXTERNAL_WEB"
    assert payload["searched_web"] is False
    assert payload["sources"] == []
    assert "OPENAI_API_KEY" in payload["answer"]


def test_accepts_short_history_and_page_context(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    payload = client.post("/assistant/chat", json={
        "message": "Vậy biên nhận ở đâu?",
        "history": [{"role": "user", "content": "Tôi vừa quyên góp"}, {"role": "assistant", "content": "Bạn sẽ nhận biên nhận."}],
        "page": {"path": "/chien-dich/campaign-school", "role": "DONOR"},
    }).json()
    assert payload["scope"] == "INTERNAL"
    assert "QR" in payload["answer"]


def test_rejects_invalid_payload_limits():
    assert client.post("/assistant/chat", json={"message": ""}).status_code == 422
    assert client.post("/assistant/chat", json={"message": "x" * 501}).status_code == 422
    history = [{"role": "user", "content": "quyên góp"}] * 7
    assert client.post("/assistant/chat", json={"message": "quyên góp", "history": history}).status_code == 422


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("tài khoản đăng nhập", "Demo@123"),
        ("quyên góp", "mô phỏng"),
        ("QR biên nhận", "QR"),
        ("Merkle minh bạch", "SHA-256"),
        ("thống kê biểu đồ", "Thống kê"),
        ("báo cáo tổ chức", "1–5"),
        ("admin kiểm duyệt", "Merkle"),
        ("xin chào", "Mình có thể"),
    ],
)
def test_offline_topics_cover_core_roles(question, expected):
    assert expected in offline_answer(question)


def test_sensitive_text_is_sanitized():
    text = sanitize_text("email an@example.vn key sk-example123456789 phone 0901234567")
    assert "an@example.vn" not in text
    assert "sk-example" not in text
    assert "0901234567" not in text


def test_openai_internal_request_has_no_tools_and_disables_storage(monkeypatch):
    captured = {}

    class FakeResponses:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text="Câu trả lời nội bộ")

    monkeypatch.setattr(main, "create_openai_client", lambda: SimpleNamespace(responses=FakeResponses()))
    request = ChatRequest(message="Cách quyên góp?", page={"path": "/", "role": "DONOR"})
    assert openai_answer(request, "Dữ liệu website") == "Câu trả lời nội bộ"
    assert captured["store"] is False
    assert "tools" not in captured
    assert "Dữ liệu website" in captured["input"][-1]["content"]


def test_web_answer_requires_search_and_returns_citation(monkeypatch):
    captured = {}
    annotation = SimpleNamespace(type="url_citation", title="Nguồn chính thức", url="https://example.org/source")
    content = SimpleNamespace(type="output_text", annotations=[annotation])
    output = SimpleNamespace(type="message", content=[content])

    class FakeResponses:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text="Câu trả lời ngoài", output=[output])

    monkeypatch.setattr(main, "create_openai_client", lambda: SimpleNamespace(responses=FakeResponses()))
    answer, sources = web_answer(ChatRequest(message="Một câu hỏi ngoài phạm vi"))
    assert answer == "Câu trả lời ngoài"
    assert captured["tools"][0]["type"] == "web_search"
    assert captured["store"] is False
    assert sources[0].url == "https://example.org/source"


def test_chat_uses_internal_provider_when_key_exists(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    monkeypatch.setattr(main, "load_internal_context", lambda _path: main.asyncio.sleep(0, result="facts"))
    monkeypatch.setattr(main, "openai_answer", lambda *_args: "Câu trả lời từ mô hình")
    payload = client.post("/assistant/chat", json={"message": "Xin hướng dẫn quyên góp"}).json()
    assert payload["mode"] == "OPENAI"
    assert payload["scope"] == "INTERNAL"


def test_chat_returns_cited_external_provider_result(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    source = main.AssistantSource(kind="WEB", title="Nguồn", url="https://example.org")
    monkeypatch.setattr(main, "web_answer", lambda _request: ("Đã tra cứu", [source]))
    payload = client.post("/assistant/chat", json={"message": "Thời tiết Hà Nội hôm nay?"}).json()
    assert payload["mode"] == "OPENAI"
    assert payload["scope"] == "EXTERNAL_WEB"
    assert payload["searched_web"] is True
    assert payload["sources"][0]["url"] == "https://example.org"


def test_chat_falls_back_if_internal_provider_fails(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    monkeypatch.setattr(main, "load_internal_context", lambda _path: main.asyncio.sleep(0, result="facts"))
    monkeypatch.setattr(main, "openai_answer", lambda *_args: (_ for _ in ()).throw(RuntimeError("down")))
    payload = client.post("/assistant/chat", json={"message": "Cách quyên góp?"}).json()
    assert payload["mode"] == "DEMO"
    assert payload["scope"] == "INTERNAL"


def test_rate_limit_rejects_excess_requests(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    for _ in range(main.RATE_LIMIT):
        assert client.post("/assistant/chat", json={"message": "Cách quyên góp?"}).status_code == 200
    assert client.post("/assistant/chat", json={"message": "Cách quyên góp?"}).status_code == 429
