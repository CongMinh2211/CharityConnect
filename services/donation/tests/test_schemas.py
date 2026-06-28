import pytest
from pydantic import ValidationError

from app.schemas import DonationCreate


def test_donation_schema_accepts_vnd_and_rejects_too_small_amounts():
    valid = DonationCreate(campaign_id="00000000-0000-0000-0000-000000000001", amount=50_000, anonymous=True)
    assert valid.amount == 50_000
    with pytest.raises(ValidationError):
        DonationCreate(campaign_id="00000000-0000-0000-0000-000000000001", amount=999)

