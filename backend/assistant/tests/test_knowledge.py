import pytest

from app.knowledge import classify_intent, grounding_for, is_in_scope, resolve_follow_up


@pytest.mark.parametrize("question", ["Cách quyên góp?", "Hash-chain là gì?", "Xin chào", "Trang này có chức năng gì?"])
def test_internal_questions_are_in_scope(question):
    assert is_in_scope(question)


@pytest.mark.parametrize("question", ["Thời tiết hôm nay?", "Giá vàng", "Tin bóng đá"])
def test_external_questions_are_out_of_scope(question):
    assert not is_in_scope(question)


def test_source_check_suggestion_is_internal_and_has_a_dedicated_intent():
    message = "Kiểm tra một link kêu gọi"
    assert is_in_scope(message)
    assert classify_intent(message) == "source_check"
    assert grounding_for(message).actions[0]["path"] == "/kiem-tra-nguon"


def test_history_does_not_force_a_new_external_question_into_internal_scope():
    assert not is_in_scope(
        "Cách trồng rau thủy canh?",
        ["Tóm tắt thống kê CharityConnect", "Bạn có thể mở trang Thống kê."],
    )


@pytest.mark.parametrize(
    ("message", "resolved"),
    [
        ("1", "kiểm tra một link kêu gọi"),
        ("2", "hướng dẫn quyên góp"),
        ("3", "xác minh biên nhận"),
    ],
)
def test_numbered_follow_up_choices_are_resolved(message, resolved):
    assert resolve_follow_up(message) == resolved


@pytest.mark.parametrize(
    ("question", "path"),
    [
        ("QR biên nhận", "/xac-minh-bien-nhan"),
        ("hash minh bạch", "/minh-bach"),
        ("báo cáo tổ chức", "/to-chuc"),
        ("admin kiểm duyệt", "/quan-tri"),
        ("tài khoản đăng nhập", "/dang-nhap"),
        ("quyên góp chiến dịch", "/"),
        ("xin chào", "/"),
    ],
)
def test_grounding_returns_internal_actions(question, path):
    result = grounding_for(question)
    assert result.actions[0]["path"] == path
    assert result.sources
