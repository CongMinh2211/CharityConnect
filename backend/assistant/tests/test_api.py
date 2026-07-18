from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import ChatRequest, app, offline_answer, openai_answer, sanitize_text, web_answer

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_rate_limits(monkeypatch):
    main.rate_buckets.clear()
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ASSISTANT_PROVIDER", raising=False)


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


def test_source_check_conversation_prompts_for_url_and_analyzes_it():
    prompt = client.post("/assistant/chat", json={"message": "Kiểm tra một link kêu gọi"}).json()
    assert prompt["scope"] == "INTERNAL"
    assert "dán URL đầy đủ" in prompt["answer"]
    assert prompt["actions"][0]["path"] == "/kiem-tra-nguon"

    checked = client.post("/assistant/chat", json={
        "message": "Kiểm tra https://charityconnect-7kep.onrender.com/"
    }).json()
    assert checked["scope"] == "INTERNAL"
    assert checked["searched_web"] is False
    assert "98/100" in checked["answer"]
    assert any((source.get("url") or "").startswith("https://charityconnect-7kep") for source in checked["sources"])


@pytest.mark.parametrize(
    ("choice", "expected"),
    [("1", "dán URL đầy đủ"), ("2", "Đăng nhập người quyên góp"), ("3", "QR")],
)
def test_numbered_choices_resolve_to_internal_actions(choice, expected):
    payload = client.post("/assistant/chat", json={"message": choice}).json()
    assert payload["scope"] == "INTERNAL"
    assert expected in payload["answer"]


def test_external_question_after_internal_history_stays_external(monkeypatch):
    async def fake_public_external_answer(_payload):
        return main.ChatResponse(
            answer="External answer.",
            mode="DEMO",
            scope="EXTERNAL_WEB",
            searched_web=True,
            sources=[main.AssistantSource(kind="WEB", title="Public source", url="https://example.org/")],
            actions=[],
            suggestions=[],
        )

    monkeypatch.setattr(main, "public_external_answer", fake_public_external_answer)
    payload = client.post("/assistant/chat", json={
        "message": "Cách trồng rau thủy canh?",
        "history": [
            {"role": "user", "content": "Tóm tắt thống kê CharityConnect"},
            {"role": "assistant", "content": "Bạn có thể mở trang Thống kê."},
        ],
    }).json()
    assert payload["scope"] == "EXTERNAL_WEB"
    assert payload["searched_web"] is True


def test_external_question_without_key_does_not_hallucinate(monkeypatch):
    main.rate_buckets.clear()
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    async def fake_public_external_answer(_payload):
        return main.ChatResponse(
            answer="Weather answer from public source.",
            mode="DEMO",
            scope="EXTERNAL_WEB",
            searched_web=True,
            sources=[main.AssistantSource(kind="WEB", title="Open-Meteo", url="https://open-meteo.com/")],
            actions=[],
            suggestions=[],
        )

    monkeypatch.setattr(main, "public_external_answer", fake_public_external_answer)
    payload = client.post("/assistant/chat", json={"message": "thoi tiet Ha Noi hom nay?"}).json()
    assert payload["scope"] == "EXTERNAL_WEB"
    assert payload["searched_web"] is True
    assert payload["sources"][0]["kind"] == "WEB"
    assert "public source" in payload["answer"]


def test_public_weather_answer_uses_open_meteo(monkeypatch):
    class FakeResponse:
        def __init__(self, url, data):
            self.url = url
            self._data = data

        def raise_for_status(self):
            return None

        def json(self):
            return self._data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, url, params=None):
            if "geocoding-api" in url:
                return FakeResponse(
                    f"{url}?name=Ha+Noi",
                    {"results": [{"name": "Ha Noi", "admin1": "Ha Noi", "country": "Viet Nam", "latitude": 21.03, "longitude": 105.85}]},
                )
            return FakeResponse(
                f"{url}?latitude=21.03&longitude=105.85",
                {
                    "current": {"temperature_2m": 30, "apparent_temperature": 34, "relative_humidity_2m": 70, "weather_code": 61, "wind_speed_10m": 8},
                    "daily": {"temperature_2m_max": [33], "temperature_2m_min": [26], "precipitation_sum": [5]},
                    "current_units": {"temperature_2m": "C"},
                    "daily_units": {"precipitation_sum": "mm"},
                },
            )

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    payload = main.asyncio.run(main.public_weather_answer(main.ChatRequest(message="thoi tiet Ha Noi hom nay?")))
    assert payload is not None
    assert payload.searched_web is True
    assert "Ha Noi" in payload.answer
    assert "30" in payload.answer
    assert payload.sources[0].kind == "WEB"


def test_public_wikipedia_answer_uses_summary(monkeypatch):
    class FakeResponse:
        def __init__(self, url, data):
            self.url = url
            self._data = data

        def raise_for_status(self):
            return None

        def json(self):
            return self._data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, url, params=None):
            if "w/api.php" in url:
                return FakeResponse(str(url), ["UNICEF", ["UNICEF"], [""], ["https://vi.wikipedia.org/wiki/UNICEF"]])
            return FakeResponse(
                str(url),
                {"extract": "UNICEF is a public organization summary.", "content_urls": {"desktop": {"page": "https://vi.wikipedia.org/wiki/UNICEF"}}},
            )

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    payload = main.asyncio.run(main.public_wikipedia_answer(main.ChatRequest(message="UNICEF la gi?")))
    assert payload is not None
    assert payload.scope == "EXTERNAL_WEB"
    assert payload.searched_web is True
    assert "UNICEF" in payload.answer
    assert payload.sources[0].url == "https://vi.wikipedia.org/wiki/UNICEF"



def test_public_external_helpers_cover_branches():
    assert main.normalize_vietnamese("Da Nang") == "da nang"
    assert main.weather_code_label(0)
    assert main.weather_code_label(2)
    assert main.weather_code_label(45)
    assert main.weather_code_label(53)
    assert main.weather_code_label(73)
    assert main.weather_code_label(95)
    assert main.weather_code_label(-1)
    assert main.extract_weather_location("thoi tiet o Quy Nhon hom nay?") == "Quy Nhon"
    assert main.extract_weather_location("thoi tiet")
    assert main.extract_wikipedia_query("UNICEF la gi?") == "UNICEF"
    assert main.asyncio.run(main.public_weather_answer(main.ChatRequest(message="hello"))) is None
    assert main.asyncio.run(main.public_wikipedia_answer(main.ChatRequest(message="hi"))) is None

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
        ("tài khoản đăng nhập", "chọn nhanh"),
        ("quyên góp", "ghi nhận"),
        ("QR biên nhận", "QR"),
        ("Merkle minh bạch", "SHA-256"),
        ("thống kê biểu đồ", "Thống kê"),
        ("báo cáo tổ chức", "1–5"),
        ("admin kiểm duyệt", "Merkle"),
        ("xin chào", "trợ lý CharityConnect"),
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


def test_chat_uses_anthropic_internal_provider_when_key_exists(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only")
    monkeypatch.setattr(main, "load_internal_context", lambda _path: main.asyncio.sleep(0, result="facts"))

    async def fake_anthropic_answer(*_args):
        return "Câu trả lời từ Claude"

    monkeypatch.setattr(main, "anthropic_answer", fake_anthropic_answer)
    payload = client.post("/assistant/chat", json={"message": "Xin hướng dẫn quyên góp"}).json()
    assert payload["mode"] == "ANTHROPIC"
    assert payload["scope"] == "INTERNAL"
    assert "Claude" in payload["answer"]


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
