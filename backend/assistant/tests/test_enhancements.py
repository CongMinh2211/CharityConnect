import json

import pytest

from app.knowledge import classify_intent, fold, is_in_scope
from app.main import offline_answer, smart_offline_answer


def test_fold_strips_vietnamese_diacritics():
    assert fold("Quyên Góp") == "quyen gop"
    assert fold("biên nhận") == "bien nhan"
    assert fold("đăng ký") == "dang ky"


@pytest.mark.parametrize(
    ("question", "intent"),
    [
        ("quyen gop the nao", "donation"),
        ("xem bien nhan o dau", "receipt"),
        ("hash minh bach la gi", "transparency"),
        ("tong quyen gop bao nhieu tien", "statistics"),
        ("admin kiem duyet gi", "admin"),
        ("dang nhap tai khoan", "account"),
    ],
)
def test_classify_intent_without_diacritics(question, intent):
    assert classify_intent(question) == intent


def test_no_diacritic_question_is_in_scope():
    assert is_in_scope("quyen gop the nao")
    assert not is_in_scope("thoi tiet hom nay")


def test_offline_answer_handles_greeting_and_thanks():
    assert "trợ lý CharityConnect" in offline_answer("chào bạn")
    assert "Rất vui" in offline_answer("cảm ơn nhé")


def _facts():
    return "DỮ LIỆU WEBSITE HIỆN TẠI:\n" + json.dumps(
        {
            "campaigns": [
                {"title": "Phòng học vùng cao", "status": "APPROVED",
                 "goal_amount": 100000000, "raised_amount": 45000000}
            ],
            "donation_analytics": {"totals": {
                "donation_amount": 45000000, "donation_count": 12, "unique_donors": 9,
                "verified_fund_usage": 10000000, "transparent_balance": 35000000,
            }},
        },
        ensure_ascii=False,
    )


def test_smart_offline_named_campaign_lookup_no_accent():
    answer = smart_offline_answer("phong hoc vung cao tien the nao", _facts())
    assert "Phòng học vùng cao" in answer
    assert "45,000,000" in answer


def test_smart_offline_statistics_uses_live_totals():
    answer = smart_offline_answer("tong quyen gop", _facts())
    assert "45,000,000 VND" in answer
    assert "9 nhà hảo tâm" in answer
