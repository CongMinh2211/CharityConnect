from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DonationCreate(BaseModel):
    campaign_id: UUID
    amount: int = Field(ge=1_000, le=100_000_000_000)
    anonymous: bool = False


class DonationResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    campaign_title: str
    amount: int
    anonymous: bool
    status: str
    created_at: datetime
    receipt_number: str
    ledger_hash: str | None = None
    ledger_position: int | None = None
    proof_status: str = "PENDING"


class OrganizationDonationResponse(BaseModel):
    id: UUID
    donor_name: str
    amount: int
    anonymous: bool
    status: str
    created_at: datetime
