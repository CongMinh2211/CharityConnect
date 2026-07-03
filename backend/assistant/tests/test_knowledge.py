import pytest

from app.knowledge import grounding_for, is_in_scope


@pytest.mark.parametrize("question", ["Cách quyên góp?", "Hash-chain là gì?", "Xin chào", "Trang này có chức năng gì?"])
def test_internal_questions_are_in_scope(question):
    assert is_in_scope(question)


@pytest.mark.parametrize("question", ["Thời tiết hôm nay?", "Giá vàng", "Tin bóng đá"])
def test_external_questions_are_out_of_scope(question):
    assert not is_in_scope(question)


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
