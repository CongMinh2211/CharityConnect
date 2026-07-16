import asyncio
import json
import os
import time
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import AsyncIterator
from uuid import UUID, uuid4

import asyncpg
import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from redis.asyncio import Redis
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .auth import UserClaims, require_role, require_user
from .config import APPROVAL_THRESHOLD_VND, CAMPAIGN_SERVICE_URL, DATABASE_URL, INTERNAL_SERVICE_TOKEN, REDIS_URL
from .diagnostics import build_diagnostics, recommendation
from .domain import GENESIS_HASH, append_ledger_entry, ledger_hash, make_receipt_number, public_donor_name
from .migrations import run_migrations
from .schemas import DonationCreate, DonationReject
from .trustchain import create_anchor, proof_for_position, verify_onchain_anchor

REQUESTS = Counter("donation_http_requests_total", "HTTP requests", ["method", "path", "status"])
LATENCY = Histogram("donation_http_request_duration_seconds", "HTTP latency", ["method", "path"])
COMPLETED = Counter("donation_completed_total", "Completed donations")
PENDING_REVIEW = Counter("donation_pending_review_total", "Donations held for admin review")
REVIEW_DECISIONS = Counter("donation_review_decisions_total", "Admin review decisions", ["decision"])
FAILED = Counter("donation_failed_total", "Failed donation attempts", ["reason"])
LEDGER_APPENDS = Counter("donation_ledger_appends_total", "Ledger entries appended", ["event_type"])
LEDGER_FAILURES = Counter("donation_ledger_append_failures_total", "Failed ledger appends")
CHAIN_INTEGRITY = Gauge("donation_ledger_chain_integrity", "1 when the public hash-chain is valid")


async def publish_outbox(app: FastAPI) -> None:
    while True:
        try:
            rows = await app.state.db.fetch(
                "SELECT id,payload FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 50"
            )
            for row in rows:
                payload = row["payload"]
                if isinstance(payload, str):
                    payload = json.loads(payload)
                await app.state.redis.xadd("donation.completed", {key: str(value) for key, value in payload.items()})
                await app.state.db.execute("UPDATE outbox_events SET published_at=now() WHERE id=$1", row["id"])
        except Exception as error:  # background loop must survive dependency restarts
            print(f"outbox-publisher:{error}", flush=True)
        await asyncio.sleep(1)


async def consume_transparency_events(app: FastAPI) -> None:
    stream, group, consumer = "transparency.record", "donation-ledger", "donation-ledger-1"
    try:
        await app.state.redis.xgroup_create(stream, group, id="0", mkstream=True)
    except Exception as error:
        if "BUSYGROUP" not in str(error):
            raise
    while True:
        try:
            messages = await app.state.redis.xreadgroup(
                group, consumer, {stream: "0"}, count=25, block=100
            )
            if not messages:
                messages = await app.state.redis.xreadgroup(
                    group, consumer, {stream: ">"}, count=25, block=1000
                )
            for _, entries in messages:
                for message_id, fields in entries:
                    payload = json.loads(fields["public_payload"])
                    created_at = datetime.fromisoformat(fields["created_at"].replace("Z", "+00:00"))
                    async with app.state.db.acquire() as connection:
                        async with connection.transaction():
                            proof = await append_ledger_entry(
                                connection,
                                event_id=fields["event_id"],
                                event_type=fields["event_type"],
                                campaign_id=fields["campaign_id"],
                                entity_id=fields["entity_id"],
                                public_payload=payload,
                                created_at=created_at,
                            )
                    if not proof["duplicate"]:
                        LEDGER_APPENDS.labels(fields["event_type"]).inc()
                    await app.state.redis.xack(stream, group, message_id)
        except Exception as error:
            LEDGER_FAILURES.inc()
            print(f"transparency-consumer:{error}", flush=True)
            await asyncio.sleep(1)


async def auto_anchor(app: FastAPI) -> None:
    """Scheduler tự động neo Merkle root: khi số entry chưa neo đạt ngưỡng hoặc entry
    cũ nhất chờ quá lâu thì tạo anchor mới. Advisory lock trong create_anchor chống trùng."""
    if os.getenv("AUTO_ANCHOR_ENABLED", "1") != "1":
        return
    threshold = int(os.getenv("AUTO_ANCHOR_THRESHOLD", "50"))
    max_age_hours = int(os.getenv("AUTO_ANCHOR_MAX_AGE_HOURS", "24"))
    interval = int(os.getenv("AUTO_ANCHOR_CHECK_SECONDS", "600"))
    while True:
        await asyncio.sleep(interval)
        try:
            row = await app.state.db.fetchrow(
                """SELECT count(*) AS unanchored, min(l.created_at) AS oldest
                   FROM ledger_entries l LEFT JOIN anchor_entries ae ON ae.ledger_position=l.position
                   WHERE ae.ledger_position IS NULL"""
            )
            unanchored = int(row["unanchored"] or 0)
            oldest = row["oldest"]
            too_old = oldest is not None and (datetime.now(timezone.utc) - oldest) > timedelta(hours=max_age_hours)
            if unanchored >= threshold or (unanchored > 0 and too_old):
                anchor = await create_anchor(app.state.db, None)
                await record_anchor_audit(app.state.db, anchor, actor_id=None, actor_role="SYSTEM", reason="AUTO_ANCHOR_SCHEDULER")
        except Exception as error:  # scheduler phải sống sót qua lỗi tạm thời
            print(f"auto-anchor:{error}", flush=True)


async def record_anchor_audit(db, anchor: dict, actor_id: str | None, actor_role: str, reason: str | None = None,
                              ip: str | None = None, user_agent: str | None = None) -> None:
    try:
        await db.execute(
            """INSERT INTO audit_logs(actor_id,actor_role,action,entity_type,entity_id,new_value,reason,ip_address,user_agent)
               VALUES($1,$2,'ANCHOR_CREATED','LEDGER_ANCHOR',$3,$4::jsonb,$5,$6,$7)""",
            actor_id, actor_role, str(anchor["id"]),
            json.dumps({"merkle_root": anchor["merkle_root"], "from": anchor["from_position"],
                        "to": anchor["to_position"], "status": anchor["status"]}, default=str),
            reason, ip, user_agent,
        )
    except Exception as error:  # audit không được làm hỏng nghiệp vụ chính
        print(f"anchor-audit:{error}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.db = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    await run_migrations(app.state.db)
    app.state.redis = Redis.from_url(REDIS_URL, decode_responses=True)
    app.state.http = httpx.AsyncClient(timeout=5)
    tasks = [
        asyncio.create_task(publish_outbox(app)),
        asyncio.create_task(consume_transparency_events(app)),
        asyncio.create_task(auto_anchor(app)),
    ]
    yield
    for task in tasks:
        task.cancel()
    for task in tasks:
        with suppress(asyncio.CancelledError):
            await task
    await app.state.http.aclose()
    await app.state.redis.aclose()
    await app.state.db.close()


app = FastAPI(title="CharityConnect Donation Service", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def observe_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    REQUESTS.labels(request.method, path, response.status_code).inc()
    LATENCY.labels(request.method, path).observe(time.perf_counter() - start)
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "donation"}


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


async def campaign_request(app: FastAPI, path: str) -> httpx.Response:
    return await app.state.http.get(
        f"{CAMPAIGN_SERVICE_URL}{path}", headers={"x-internal-token": INTERNAL_SERVICE_TOKEN}
    )


async def emit_completion(connection, *, donation_id: UUID, donor_id: str, campaign_id, campaign_title: str,
                          amount: int, receipt_number: str, created_at: datetime) -> dict:
    """Phát side-effect khi khoản quyên góp hoàn tất: outbox 'donation.completed'
    (campaign cộng tiền + identity gửi cảm ơn) và ghi sổ cái TrustChain. Dùng chung
    cho cả đường tự động lẫn đường admin duyệt."""
    event_payload = {
        "event_id": donation_id, "donor_id": donor_id, "campaign_id": campaign_id,
        "campaign_title": campaign_title, "amount": amount, "receipt_number": receipt_number,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    await connection.execute(
        "INSERT INTO outbox_events(id,event_type,payload) VALUES($1,'donation.completed',$2::jsonb)",
        donation_id, json.dumps({key: str(value) for key, value in event_payload.items()}),
    )
    public_payload = {
        "amount": amount, "campaign_id": str(campaign_id), "campaign_title": campaign_title,
        "completed_at": created_at.isoformat(), "receipt_number": receipt_number,
    }
    return await append_ledger_entry(
        connection, event_id=str(donation_id), event_type="DONATION_COMPLETED",
        campaign_id=str(campaign_id), entity_id=str(donation_id),
        public_payload=public_payload, created_at=created_at,
    )


@app.post("/donations", status_code=201)
async def create_donation(input: DonationCreate, request: Request, user: UserClaims = Depends(require_user)) -> dict:
    require_role(user, "DONOR")
    campaign_response = await campaign_request(request.app, f"/internal/campaigns/{input.campaign_id}/donation-eligibility")
    if campaign_response.status_code != 200:
        FAILED.labels("CAMPAIGN_NOT_FOUND").inc()
        raise HTTPException(status_code=404, detail="Không tìm thấy chiến dịch")
    campaign = campaign_response.json()
    if not campaign["eligible"]:
        FAILED.labels(campaign.get("reason") or "NOT_ACTIVE").inc()
        raise HTTPException(status_code=409, detail="Chiến dịch không còn nhận quyên góp")

    donation_id = uuid4()
    receipt_number = make_receipt_number(str(donation_id))
    # Duyệt 2 bước theo ngưỡng: khoản lớn giữ lại chờ admin, chưa cộng tiền/ghi sổ cái.
    requires_review = input.amount >= APPROVAL_THRESHOLD_VND
    status = "PENDING_REVIEW" if requires_review else "COMPLETED"
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            row = await connection.fetchrow(
                """INSERT INTO donations(id,donor_id,donor_name,campaign_id,campaign_title,amount,anonymous,honor_consent,status)
                   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
                   RETURNING id,campaign_id,campaign_title,amount,anonymous,status,created_at""",
                donation_id, UUID(user.id), user.name, input.campaign_id, campaign["title"],
                input.amount, input.anonymous, input.honor_consent, status,
            )
            await connection.execute(
                "INSERT INTO receipts(receipt_number,donation_id) VALUES($1,$2)", receipt_number, donation_id
            )
            proof = None
            if not requires_review:
                proof = await emit_completion(
                    connection, donation_id=donation_id, donor_id=user.id, campaign_id=input.campaign_id,
                    campaign_title=campaign["title"], amount=input.amount, receipt_number=receipt_number,
                    created_at=row["created_at"],
                )
    if requires_review:
        PENDING_REVIEW.inc()
        return {
            **dict(row), "receipt_number": receipt_number,
            "ledger_hash": None, "ledger_position": None, "proof_status": "PENDING_REVIEW",
            "review_threshold": APPROVAL_THRESHOLD_VND,
            "message": "Khoản quyên góp lớn đang chờ quản trị viên xác minh trước khi ghi nhận công khai.",
        }
    COMPLETED.inc()
    LEDGER_APPENDS.labels("DONATION_COMPLETED").inc()
    return {
        **dict(row),
        "receipt_number": receipt_number,
        "ledger_hash": proof["entry_hash"],
        "ledger_position": proof["position"],
        "proof_status": "CONFIRMED",
    }


@app.get("/admin/donations/pending")
async def list_pending_donations(request: Request, user: UserClaims = Depends(require_user)) -> list[dict]:
    require_role(user, "ADMIN")
    rows = await request.app.state.db.fetch(
        """SELECT d.id,d.donor_name,d.campaign_id,d.campaign_title,d.amount,d.anonymous,d.honor_consent,
                  d.status,d.created_at,r.receipt_number
           FROM donations d JOIN receipts r ON r.donation_id=d.id
           WHERE d.status='PENDING_REVIEW' ORDER BY d.created_at""",
    )
    return [{**dict(row), "donor_name": public_donor_name(row["donor_name"], row["anonymous"])} for row in rows]


@app.post("/admin/donations/{donation_id}/approve")
async def approve_donation(donation_id: UUID, request: Request, user: UserClaims = Depends(require_user)) -> dict:
    require_role(user, "ADMIN")
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            row = await connection.fetchrow(
                """SELECT d.id,d.donor_id,d.campaign_id,d.campaign_title,d.amount,d.anonymous,d.status,d.created_at,
                          r.receipt_number
                   FROM donations d JOIN receipts r ON r.donation_id=d.id
                   WHERE d.id=$1 FOR UPDATE OF d""",
                donation_id,
            )
            if not row:
                raise HTTPException(status_code=404, detail="Không tìm thấy khoản quyên góp")
            if row["status"] != "PENDING_REVIEW":
                raise HTTPException(status_code=409, detail="Khoản quyên góp không ở trạng thái chờ duyệt")
            completed_at = datetime.now(timezone.utc)
            await connection.execute(
                "UPDATE donations SET status='COMPLETED',reviewed_at=$2,reviewed_by=$3 WHERE id=$1",
                donation_id, completed_at, UUID(user.id),
            )
            proof = await emit_completion(
                connection, donation_id=donation_id, donor_id=str(row["donor_id"]), campaign_id=row["campaign_id"],
                campaign_title=row["campaign_title"], amount=row["amount"], receipt_number=row["receipt_number"],
                created_at=completed_at,
            )
    COMPLETED.inc()
    REVIEW_DECISIONS.labels("APPROVED").inc()
    LEDGER_APPENDS.labels("DONATION_COMPLETED").inc()
    return {
        "id": str(donation_id), "status": "COMPLETED", "receipt_number": row["receipt_number"],
        "ledger_hash": proof["entry_hash"], "ledger_position": proof["position"], "proof_status": "CONFIRMED",
    }


@app.post("/admin/donations/{donation_id}/reject")
async def reject_donation(donation_id: UUID, input: DonationReject, request: Request, user: UserClaims = Depends(require_user)) -> dict:
    require_role(user, "ADMIN")
    row = await request.app.state.db.fetchrow(
        """UPDATE donations SET status='REJECTED',review_reason=$2,reviewed_at=now(),reviewed_by=$3
           WHERE id=$1 AND status='PENDING_REVIEW'
           RETURNING id,status,amount""",
        donation_id, input.reason, UUID(user.id),
    )
    if not row:
        raise HTTPException(status_code=409, detail="Khoản quyên góp không ở trạng thái chờ duyệt")
    REVIEW_DECISIONS.labels("REJECTED").inc()
    return {"id": str(donation_id), "status": "REJECTED", "reason": input.reason}


def analytics_start(period: str) -> datetime | None:
    days = {"7d": 7, "30d": 30, "90d": 90}
    if period == "all":
        return None
    if period not in days:
        raise HTTPException(status_code=422, detail="Khoảng thời gian không hợp lệ")
    return datetime.now(timezone.utc) - timedelta(days=days[period])


async def donation_analytics(
    db,
    period: str,
    donor_id: UUID | None = None,
    campaign_ids: list[UUID] | None = None,
) -> dict:
    start = analytics_start(period)
    values: list[object] = []
    conditions = ["d.status='COMPLETED'"]
    if start:
        values.append(start)
        conditions.append(f"d.created_at>=${len(values)}")
    if donor_id:
        values.append(donor_id)
        conditions.append(f"d.donor_id=${len(values)}")
    if campaign_ids is not None:
        values.append(campaign_ids)
        conditions.append(f"d.campaign_id=ANY(${len(values)}::uuid[])")
    where = " AND ".join(conditions)
    totals = await db.fetchrow(
        f"""SELECT COALESCE(sum(d.amount),0)::bigint AS donation_amount,
                    count(*)::bigint AS donation_count,
                    count(DISTINCT d.donor_id)::bigint AS unique_donors,
                    count(DISTINCT d.campaign_id)::bigint AS campaign_count,
                    COALESCE(avg(d.amount),0)::bigint AS average_amount
             FROM donations d WHERE {where}""",
        *values,
    )
    granularity = "month" if period == "all" else "day"
    timeline = await db.fetch(
        f"""SELECT to_char(date_trunc('{granularity}',d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'),'YYYY-MM-DD') AS bucket,
                    COALESCE(sum(d.amount),0)::bigint AS donation_amount,count(*)::bigint AS donation_count
             FROM donations d WHERE {where}
             GROUP BY 1 ORDER BY 1""",
        *values,
    )
    top_campaigns = await db.fetch(
        f"""SELECT d.campaign_id,max(d.campaign_title) AS campaign_title,
                    sum(d.amount)::bigint AS donation_amount,count(*)::bigint AS donation_count
             FROM donations d WHERE {where}
             GROUP BY d.campaign_id ORDER BY donation_amount DESC LIMIT 8""",
        *values,
    )
    ledger_values: list[object] = []
    ledger_conditions = ["event_type='FUND_USAGE_VERIFIED'"]
    if start:
        ledger_values.append(start)
        ledger_conditions.append(f"created_at>=${len(ledger_values)}")
    if campaign_ids is not None:
        ledger_values.append(campaign_ids)
        ledger_conditions.append(f"campaign_id=ANY(${len(ledger_values)}::uuid[])")
    fund_usage = await db.fetchval(
        f"SELECT COALESCE(sum((public_payload->>'amount_used')::bigint),0)::bigint FROM ledger_entries WHERE {' AND '.join(ledger_conditions)}",
        *ledger_values,
    )
    data = dict(totals)
    data["verified_fund_usage"] = int(fund_usage or 0)
    data["transparent_balance"] = max(0, int(data["donation_amount"]) - int(fund_usage or 0))
    return {
        "period": period,
        "granularity": granularity,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "totals": data,
        "timeline": [dict(row) for row in timeline],
        "top_campaigns": [dict(row) for row in top_campaigns],
    }


@app.get("/analytics/donations/public")
async def public_donation_analytics(request: Request, period: str = "30d") -> dict:
    return await donation_analytics(request.app.state.db, period)


@app.get("/analytics/donations/me")
async def my_donation_analytics(
    request: Request, period: str = "30d", user: UserClaims = Depends(require_user)
) -> dict:
    require_role(user, "DONOR")
    return await donation_analytics(request.app.state.db, period, donor_id=UUID(user.id))


@app.get("/analytics/donations/organization")
async def organization_donation_analytics(
    request: Request, period: str = "30d", user: UserClaims = Depends(require_user)
) -> dict:
    require_role(user, "ORGANIZATION")
    response = await campaign_request(request.app, f"/internal/organizations/{user.id}/campaign-ids")
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="Không thể tải chiến dịch của tổ chức")
    campaign_ids = [UUID(item) for item in response.json().get("campaign_ids", [])]
    return await donation_analytics(request.app.state.db, period, campaign_ids=campaign_ids)


@app.get("/analytics/donations/admin")
async def admin_donation_analytics(
    request: Request, period: str = "30d", user: UserClaims = Depends(require_user)
) -> dict:
    require_role(user, "ADMIN")
    return await donation_analytics(request.app.state.db, period)


async def top_donors(db, period: str, limit: int = 10) -> dict:
    """Bảng vinh danh "Tấm lòng vàng": gom theo người quyên góp, xếp hạng theo tổng
    số tiền. Người chọn quyên góp ẩn danh hiển thị "Nhà hảo tâm ẩn danh" và không lộ
    danh tính. Không trả donor_id ra ngoài để tránh lộ thông tin cá nhân."""
    start = analytics_start(period)
    values: list[object] = ["COMPLETED"]
    conditions = ["status=$1"]
    if start:
        values.append(start)
        conditions.append(f"created_at>=${len(values)}")
    values.append(limit)
    rows = await db.fetch(
        f"""SELECT max(donor_name) FILTER (WHERE honor_consent AND NOT anonymous) AS revealed_name,
                   bool_or(honor_consent AND NOT anonymous) AS has_consent,
                   sum(amount)::bigint AS total_amount,
                   count(*)::bigint AS donation_count,
                   max(created_at) AS last_donation_at
            FROM donations WHERE {' AND '.join(conditions)}
            GROUP BY donor_id
            ORDER BY total_amount DESC, last_donation_at DESC
            LIMIT ${len(values)}""",
        *values,
    )
    donors = []
    for index, row in enumerate(rows, start=1):
        hidden = not row["has_consent"] or not row["revealed_name"]
        donors.append({
            "rank": index,
            "display_name": "Nhà hảo tâm ẩn danh" if hidden else row["revealed_name"],
            "anonymous": hidden,
            "total_amount": int(row["total_amount"] or 0),
            "donation_count": int(row["donation_count"] or 0),
            "last_donation_at": row["last_donation_at"].isoformat() if row["last_donation_at"] else None,
        })
    return {"period": period, "as_of": datetime.now(timezone.utc).isoformat(), "donors": donors}


@app.get("/analytics/donations/top-donors")
async def public_top_donors(request: Request, period: str = "all", limit: int = 10) -> dict:
    limit = max(1, min(limit, 50))
    return await top_donors(request.app.state.db, period, limit)


@app.get("/donations/history")
async def donation_history(request: Request, user: UserClaims = Depends(require_user)) -> list[dict]:
    require_role(user, "DONOR")
    rows = await request.app.state.db.fetch(
        """SELECT d.id,d.campaign_id,d.campaign_title,d.amount,d.anonymous,d.status,d.created_at,r.receipt_number,
                  l.entry_hash AS ledger_hash,l.position AS ledger_position,
                  CASE WHEN l.entry_hash IS NULL THEN 'PENDING' ELSE 'CONFIRMED' END AS proof_status
           FROM donations d JOIN receipts r ON r.donation_id=d.id
           LEFT JOIN ledger_entries l ON l.entity_id=d.id AND l.event_type='DONATION_COMPLETED'
           WHERE d.donor_id=$1 ORDER BY d.created_at DESC""",
        UUID(user.id),
    )
    return [dict(row) for row in rows]


def _statement_font() -> str:
    candidates = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("C:/Windows/Fonts/arial.ttf")]
    for candidate in candidates:
        if candidate.exists():
            if "CharityUnicode" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("CharityUnicode", str(candidate)))
            return "CharityUnicode"
    return "Helvetica"


@app.get("/donations/me/annual-statement")
async def annual_statement(year: int, request: Request, user: UserClaims = Depends(require_user)) -> Response:
    require_role(user, "DONOR")
    current_year = datetime.now(timezone.utc).year
    if year < 2000 or year > current_year:
        raise HTTPException(status_code=422, detail="Năm báo cáo không hợp lệ")
    rows = await request.app.state.db.fetch(
        """SELECT d.campaign_title,d.amount,d.created_at,r.receipt_number,
                  CASE WHEN l.entry_hash IS NULL THEN 'PENDING' ELSE 'CONFIRMED' END AS proof_status
           FROM donations d JOIN receipts r ON r.donation_id=d.id
           LEFT JOIN ledger_entries l ON l.entity_id=d.id AND l.event_type='DONATION_COMPLETED'
           WHERE d.donor_id=$1 AND EXTRACT(YEAR FROM d.created_at)=$2 AND d.status='COMPLETED'
           ORDER BY d.created_at""",
        UUID(user.id), year,
    )
    font = _statement_font()
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        style.fontName = font

    # Custom styles configuration
    title_style = styles["Title"].clone("ReportTitle")
    title_style.fontSize = 16
    title_style.leading = 20
    title_style.textColor = colors.HexColor("#10231d")
    title_style.alignment = 0  # Left align

    right_align_style = styles["Normal"].clone("RightAlignNormal")
    right_align_style.alignment = 2  # Right align
    right_align_style.fontSize = 8
    right_align_style.textColor = colors.HexColor("#64748b")

    left_heading_style = styles["Heading2"].clone("LeftHeading")
    left_heading_style.textColor = colors.HexColor("#10231d")
    left_heading_style.fontSize = 14

    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    total = sum(int(row["amount"]) for row in rows)

    # 1. Branding Header
    header_data = [
        [
            Paragraph("<b>CharityConnect</b>", left_heading_style),
            Paragraph(f"<b>BÁO CÁO QUYÊN GÓP THƯỜNG NIÊN</b>", right_align_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[85 * mm, 85 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    # 2. Divider Line
    divider_table = Table([[""]], colWidths=[170 * mm], rowHeights=[1.5])
    divider_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#10231d")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))

    # 3. Profile Information Card Box
    info_data = [
        [
            Paragraph(f"<b>Thành viên quyên góp:</b><br/>Họ và tên: {user.name}<br/>Email: {user.email}", styles["BodyText"]),
            Paragraph(f"<b>Tổng hợp tài chính năm {year}:</b><br/>Tổng tiền: <b>{total:,.0f} VND</b><br/>Lượt đóng góp: {len(rows)} lần", styles["BodyText"])
        ]
    ]
    info_table = Table(info_data, colWidths=[85 * mm, 85 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))

    # 4. Transactions Table
    table_data = [["Ngày giao dịch", "Chiến dịch nhận quyên góp", "Số tiền (VND)", "Mã biên nhận", "Xác thực Sổ cái"]]
    for row in rows:
        table_data.append([
            row["created_at"].strftime("%d/%m/%Y"),
            Paragraph(str(row["campaign_title"]), styles["BodyText"]),
            f'{int(row["amount"]):,.0f}',
            str(row["receipt_number"]),
            str(row["proof_status"]),
        ])
    if len(table_data) == 1:
        table_data.append(["—", "Chưa có giao dịch trong năm", "0", "—", "—"])
    table = Table(table_data, repeatRows=1, colWidths=[23 * mm, 59 * mm, 28 * mm, 32 * mm, 28 * mm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#10231d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (4, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))

    # 5. TrustChain verification info box
    trustchain_style = styles["BodyText"].clone("TrustChainStyle")
    trustchain_style.fontSize = 8
    trustchain_style.leading = 11

    trustchain_data = [
        [
            Paragraph(
                "<b>HỆ THỐNG ĐỐI SOÁT ĐIỆN TỬ TRUSTCHAIN</b><br/>"
                "Báo cáo này được kết xuất tự động từ hệ thống sổ cái phi lợi nhuận CharityConnect. "
                "Tất cả các giao dịch quyên góp đều được mã hóa liên kết SHA-256 (hash-chain) và neo Merkle Proof "
                "chống giả mạo. Bạn có thể sử dụng Mã biên nhận để tra cứu trực tuyến tại cổng xác minh công khai.",
                trustchain_style
            )
        ]
    ]
    trustchain_table = Table(trustchain_data, colWidths=[170 * mm])
    trustchain_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bbf7d0")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))

    web_url = os.getenv("PUBLIC_WEB_URL", "http://localhost:5173")
    story = [
        header_table,
        Spacer(1, 2 * mm),
        divider_table,
        Spacer(1, 6 * mm),
        Paragraph(f"BÁO CÁO CHI TIẾT TÀI TRỢ NĂM {year}", title_style),
        Spacer(1, 4 * mm),
        info_table,
        Spacer(1, 6 * mm),
        table,
        Spacer(1, 8 * mm),
        trustchain_table,
        Spacer(1, 6 * mm),
        Paragraph(f"<i>Tra cứu và xác minh biên nhận tại: {web_url}/xac-minh-bien-nhan</i>", right_align_style),
        Paragraph("<i>Báo cáo đóng góp CharityConnect · Dữ liệu được ghi nhận trên hệ thống minh bạch.</i>", right_align_style)
    ]
    document.build(story)
    return Response(output.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="charityconnect-{year}.pdf"'})


@app.get("/transparency/reconciliation-report")
async def reconciliation_report(year: int, month: int, request: Request) -> Response:
    """Báo cáo đối soát công khai theo tháng dưới dạng PDF: số dư đầu/cuối kỳ, tổng
    thu (nguồn chuẩn Donation Service) đối chiếu với sổ cái, tổng chi đã xác minh,
    tình trạng hash-chain và danh sách giao dịch trong kỳ. Không chứa dữ liệu cá nhân."""
    now = datetime.now(timezone.utc)
    if year < 2000 or year > now.year or month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Kỳ báo cáo không hợp lệ")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + (month // 12), (month % 12) + 1, 1, tzinfo=timezone.utc)
    db = request.app.state.db
    thu = await db.fetchrow(
        "SELECT COALESCE(sum(amount),0)::bigint AS total,count(*)::bigint AS count FROM donations WHERE status='COMPLETED' AND created_at>=$1 AND created_at<$2",
        start, end)
    ledger_thu = await db.fetchrow(
        "SELECT COALESCE(sum((public_payload->>'amount')::bigint),0)::bigint AS total,count(*)::bigint AS count FROM ledger_entries WHERE event_type='DONATION_COMPLETED' AND created_at>=$1 AND created_at<$2",
        start, end)
    chi = await db.fetchrow(
        "SELECT COALESCE(sum((public_payload->>'amount_used')::bigint),0)::bigint AS total,count(*)::bigint AS count FROM ledger_entries WHERE event_type='FUND_USAGE_VERIFIED' AND created_at>=$1 AND created_at<$2",
        start, end)
    opening_donations = await db.fetchval("SELECT COALESCE(sum(amount),0)::bigint FROM donations WHERE status='COMPLETED' AND created_at<$1", start)
    opening_usage = await db.fetchval("SELECT COALESCE(sum((public_payload->>'amount_used')::bigint),0)::bigint FROM ledger_entries WHERE event_type='FUND_USAGE_VERIFIED' AND created_at<$1", start)
    chain = await verify_ledger(db)
    rows = await db.fetch(
        "SELECT position,event_type,public_payload,created_at FROM ledger_entries WHERE created_at>=$1 AND created_at<$2 ORDER BY position LIMIT 200",
        start, end)

    opening_balance = int(opening_donations or 0) - int(opening_usage or 0)
    month_thu, month_chi = int(thu["total"]), int(chi["total"])
    closing_balance = opening_balance + month_thu - month_chi
    ledger_thu_total = int(ledger_thu["total"])
    reconciled = month_thu == ledger_thu_total

    font = _statement_font()
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        style.fontName = font
    title_style = styles["Title"].clone("ReconTitle"); title_style.fontSize = 15; title_style.alignment = 0; title_style.textColor = colors.HexColor("#10231d")
    small = styles["Normal"].clone("ReconSmall"); small.fontSize = 8; small.textColor = colors.HexColor("#64748b")

    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm)

    def money(value: int) -> str:
        return f"{value:,}".replace(",", ".") + " ₫"

    summary = Table([
        ["Số dư đầu kỳ", money(opening_balance)],
        [f"Tổng thu ({int(thu['count'])} lượt quyên góp)", money(month_thu)],
        [f"Tổng chi ({int(chi['count'])} khoản đã xác minh)", "- " + money(month_chi)],
        ["Số dư cuối kỳ", money(closing_balance)],
    ], colWidths=[110 * mm, 64 * mm])
    summary.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font), ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#f0fdf4")), ("FONTNAME", (0, 3), (-1, 3), font),
        ("TEXTCOLOR", (1, 2), (1, 2), colors.HexColor("#b91c1c")), ("TEXTCOLOR", (1, 3), (1, 3), colors.HexColor("#10231d")),
    ]))

    recon = Table([
        ["Hạng mục", "Kết quả"],
        ["Tổng thu theo Donation Service", money(month_thu)],
        ["Tổng thu theo Sổ cái TrustChain", money(ledger_thu_total)],
        ["Đối soát thu", "KHỚP" if reconciled else f"LỆCH {money(abs(month_thu - ledger_thu_total))}"],
        ["Hash-chain sổ cái", f"HỢP LỆ · {chain.get('entries', 0)} bản ghi" if chain["valid"] else f"KHÔNG HỢP LỆ tại #{chain.get('invalid_position')}"],
    ], colWidths=[110 * mm, 64 * mm])
    recon.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#10231d")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (1, 3), (1, 3), colors.HexColor("#10231d") if reconciled else colors.HexColor("#b91c1c")),
    ]))

    table_data = [["#", "Ngày", "Loại", "Chiến dịch", "Số tiền"]]
    for row in rows:
        payload = row["public_payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        income = row["event_type"] == "DONATION_COMPLETED"
        amount = int(payload.get("amount", payload.get("amount_used", 0)))
        table_data.append([
            str(row["position"]), row["created_at"].strftime("%d/%m"),
            "Thu" if income else "Chi",
            Paragraph(str(payload.get("campaign_title", "—")), styles["BodyText"]),
            ("+" if income else "-") + money(amount),
        ])
    if len(table_data) == 1:
        table_data.append(["—", "—", "—", "Không có giao dịch trong kỳ", "0 ₫"])
    ledger_table = Table(table_data, repeatRows=1, colWidths=[12 * mm, 18 * mm, 16 * mm, 92 * mm, 36 * mm])
    ledger_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#10231d")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")), ("ALIGN", (4, 0), (4, -1), "RIGHT"),
        ("ALIGN", (0, 0), (2, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))

    story = [
        Paragraph("<b>CharityConnect</b> · Quỹ minh bạch", styles["Heading2"]),
        Paragraph("TPBank · STK 10000233598 · TRẦN CÔNG MINH", small),
        Spacer(1, 4 * mm),
        Paragraph(f"BÁO CÁO ĐỐI SOÁT THÁNG {month:02d}/{year}", title_style),
        Spacer(1, 4 * mm),
        summary,
        Spacer(1, 6 * mm),
        Paragraph("ĐỐI SOÁT & TOÀN VẸN DỮ LIỆU", styles["Heading3"]),
        Spacer(1, 2 * mm),
        recon,
        Spacer(1, 6 * mm),
        Paragraph("GIAO DỊCH TRONG KỲ", styles["Heading3"]),
        Spacer(1, 2 * mm),
        ledger_table,
        Spacer(1, 6 * mm),
        Paragraph("Báo cáo kết xuất tự động từ hệ thống sổ cái CharityConnect. Mọi giao dịch được mã hóa SHA-256 và neo Merkle Proof chống giả mạo. Đối chiếu công khai tại cổng minh bạch.", small),
    ]
    document.build(story)
    return Response(output.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="doi-soat-{year}-{month:02d}.pdf"'})


@app.get("/donations/{donation_id}/receipt")
async def receipt(donation_id: UUID, request: Request, user: UserClaims = Depends(require_user)) -> dict:
    row = await request.app.state.db.fetchrow(
        """SELECT d.id,d.donor_name,d.campaign_id,d.campaign_title,d.amount,d.anonymous,d.status,d.created_at,
                  r.receipt_number,r.issued_at,l.entry_hash AS ledger_hash,l.position AS ledger_position,
                  CASE WHEN l.entry_hash IS NULL THEN 'PENDING' ELSE 'CONFIRMED' END AS proof_status
           FROM donations d JOIN receipts r ON r.donation_id=d.id
           LEFT JOIN ledger_entries l ON l.entity_id=d.id AND l.event_type='DONATION_COMPLETED'
           WHERE d.id=$1 AND d.donor_id=$2""",
        donation_id, UUID(user.id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy biên nhận")
    return dict(row)


@app.get("/organization/donations/{campaign_id}")
async def organization_donations(campaign_id: UUID, request: Request, user: UserClaims = Depends(require_user)) -> list[dict]:
    require_role(user, "ORGANIZATION")
    owner_response = await campaign_request(request.app, f"/internal/campaigns/{campaign_id}/owner")
    if owner_response.status_code != 200 or owner_response.json()["organization_id"] != user.id:
        raise HTTPException(status_code=403, detail="Bạn không sở hữu chiến dịch này")
    rows = await request.app.state.db.fetch(
        "SELECT id,donor_name,amount,anonymous,status,created_at FROM donations WHERE campaign_id=$1 ORDER BY created_at DESC",
        campaign_id,
    )
    return [
        {**dict(row), "donor_name": public_donor_name(row["donor_name"], row["anonymous"])} for row in rows
    ]


@app.get("/transparency/ledger")
async def public_ledger(
    request: Request,
    campaign_id: UUID | None = None,
    event_type: str | None = None,
    cursor: int | None = None,
    limit: int = 20,
) -> dict:
    if event_type and event_type not in {"DONATION_COMPLETED", "FUND_USAGE_VERIFIED"}:
        raise HTTPException(status_code=422, detail="Loại sự kiện không hợp lệ")
    limit = max(1, min(limit, 100))
    conditions, values = [], []
    if campaign_id:
        values.append(campaign_id)
        conditions.append(f"campaign_id=${len(values)}")
    if event_type:
        values.append(event_type)
        conditions.append(f"event_type=${len(values)}")
    if cursor:
        values.append(cursor)
        conditions.append(f"position<${len(values)}")
    values.append(limit + 1)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await request.app.state.db.fetch(
        f"""SELECT position,event_id,event_type,campaign_id,entity_id,public_payload,
                   previous_hash,entry_hash,created_at
            FROM ledger_entries {where} ORDER BY position DESC LIMIT ${len(values)}""",
        *values,
    )
    items = [dict(row) for row in rows[:limit]]
    return {"items": items, "next_cursor": items[-1]["position"] if len(rows) > limit else None}


async def verify_ledger(db) -> dict:
    rows = await db.fetch(
        """SELECT position,event_id,event_type,campaign_id,entity_id,public_payload,
                  previous_hash,entry_hash,created_at FROM ledger_entries ORDER BY position"""
    )
    previous_hash = GENESIS_HASH
    donation_total = fund_usage_total = 0
    for expected_position, row in enumerate(rows, start=1):
        payload = row["public_payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        expected_hash = ledger_hash(
            position=expected_position,
            event_id=str(row["event_id"]),
            event_type=row["event_type"],
            campaign_id=str(row["campaign_id"]),
            entity_id=str(row["entity_id"]),
            public_payload=payload,
            previous_hash=previous_hash,
            created_at=row["created_at"],
        )
        if row["position"] != expected_position or row["previous_hash"].strip() != previous_hash or row["entry_hash"].strip() != expected_hash:
            return {
                "valid": False, "status": "INVALID", "entries": len(rows),
                "invalid_position": row["position"],
                "donation_total": donation_total, "fund_usage_total": fund_usage_total,
            }
        amount = int(payload.get("amount", payload.get("amount_used", 0)))
        if row["event_type"] == "DONATION_COMPLETED":
            donation_total += amount
        else:
            fund_usage_total += amount
        previous_hash = row["entry_hash"].strip()
    return {
        "valid": True, "status": "CONFIRMED", "entries": len(rows),
        "head_hash": previous_hash, "invalid_position": None,
        "donation_total": donation_total, "fund_usage_total": fund_usage_total,
    }


@app.get("/transparency/verify")
async def verify_public_ledger(request: Request) -> dict:
    result = await verify_ledger(request.app.state.db)
    CHAIN_INTEGRITY.set(1 if result["valid"] else 0)
    return result


@app.get("/transparency/diagnostics")
async def transparency_diagnostics(request: Request) -> dict:
    chain = await verify_ledger(request.app.state.db)
    head = await request.app.state.db.fetchrow(
        "SELECT position,entry_hash,previous_hash FROM ledger_entries ORDER BY position DESC LIMIT 1"
    )
    unanchored_count = await request.app.state.db.fetchval(
        """SELECT count(*) FROM ledger_entries l
           LEFT JOIN anchor_entries ae ON ae.ledger_position=l.position
           WHERE ae.ledger_position IS NULL"""
    )
    latest_anchor = await request.app.state.db.fetchrow(
        """SELECT id AS anchor_id,network,anchor_tx_hash,block_number,explorer_url,status,anchored_at
           FROM ledger_anchors ORDER BY anchored_at DESC LIMIT 1"""
    )
    issues: list[str] = []
    if not chain["valid"]:
        issues.append(f"Hash-chain không hợp lệ tại vị trí {chain.get('invalid_position')}")
    if int(unanchored_count or 0) > 0:
        issues.append(f"Còn {int(unanchored_count)} ledger entry chưa neo TrustChain")
    return build_diagnostics(
        chain_valid=bool(chain["valid"]),
        ledger_position=head["position"] if head else None,
        entry_hash=head["entry_hash"] if head else None,
        previous_hash=head["previous_hash"] if head else None,
        anchor=dict(latest_anchor) if latest_anchor else None,
        issues=issues,
        extra={
            "entries": chain.get("entries", 0),
            "donation_total": chain.get("donation_total", 0),
            "fund_usage_total": chain.get("fund_usage_total", 0),
            "unanchored_count": int(unanchored_count or 0),
        },
    )


@app.post("/admin/transparency/anchors", status_code=201)
async def create_transparency_anchor(request: Request, user: UserClaims = Depends(require_user)) -> dict:
    require_role(user, "ADMIN")
    try:
        anchor = await create_anchor(request.app.state.db, UUID(user.id))
    except ValueError as error:
        if str(error) == "NO_UNANCHORED_ENTRIES":
            raise HTTPException(status_code=409, detail="Tất cả bản ghi đã được neo") from error
        raise
    await record_anchor_audit(
        request.app.state.db, anchor, actor_id=user.id, actor_role="ADMIN",
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return anchor


@app.get("/transparency/anchors")
async def public_anchors(request: Request, cursor: int = 0, limit: int = 20) -> dict:
    limit = max(1, min(limit, 100)); cursor = max(0, cursor)
    rows = await request.app.state.db.fetch(
        """SELECT id,merkle_root,from_position,to_position,network,anchor_tx_hash,block_number,
                  explorer_url,status,anchored_at,confirmed_at
           FROM ledger_anchors ORDER BY anchored_at DESC OFFSET $1 LIMIT $2""", cursor, limit + 1,
    )
    items = [dict(row) for row in rows[:limit]]
    return {"items": items, "next_cursor": cursor + limit if len(rows) > limit else None}


@app.get("/transparency/anchors/health")
async def anchors_health(request: Request) -> dict:
    """Aggregate TrustChain health for the admin dashboard: how many anchors are
    on-chain vs simulated, entries still waiting to be anchored, status breakdown
    and an overall recommendation. DB-level summary (no per-anchor RPC calls)."""
    db = request.app.state.db
    rows = await db.fetch("SELECT status, network, count(*) AS n FROM ledger_anchors GROUP BY status, network")
    total = 0
    statuses: dict[str, int] = {}
    networks: dict[str, int] = {}
    for row in rows:
        count = int(row["n"])
        total += count
        statuses[row["status"]] = statuses.get(row["status"], 0) + count
        networks[row["network"]] = networks.get(row["network"], 0) + count
    unanchored = int(await db.fetchval(
        """SELECT count(*) FROM ledger_entries l
           LEFT JOIN anchor_entries ae ON ae.ledger_position=l.position
           WHERE ae.ledger_position IS NULL"""
    ) or 0)
    latest = await db.fetchrow(
        """SELECT id AS anchor_id,network,status,anchor_tx_hash,block_number,explorer_url,anchored_at
           FROM ledger_anchors ORDER BY anchored_at DESC LIMIT 1"""
    )
    chain = await verify_ledger(db)
    issues: list[str] = []
    if not chain["valid"]:
        issues.append(f"Hash-chain không hợp lệ tại vị trí {chain.get('invalid_position')}")
    if unanchored > 0:
        issues.append(f"Còn {unanchored} ledger entry chưa neo TrustChain")
    if statuses.get("FAILED"):
        issues.append(f"{statuses['FAILED']} anchor ở trạng thái FAILED")
    return {
        "total_anchors": total,
        "onchain_anchors": networks.get("SEPOLIA", 0),
        "simulated_anchors": networks.get("LOCAL_SIMULATION", 0),
        "unanchored_entries": unanchored,
        "statuses": statuses,
        "chain_valid": bool(chain["valid"]),
        "latest_anchor": dict(latest) if latest else None,
        "issues": issues,
        "recommendation": recommendation(issues),
    }


@app.get("/transparency/proofs/{ledger_position}")
async def public_merkle_proof(ledger_position: int, request: Request) -> dict:
    proof = await proof_for_position(request.app.state.db, ledger_position)
    if not proof: raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi sổ cái")
    return proof


@app.get("/transparency/anchors/{anchor_id}/verify-onchain")
async def verify_anchor_onchain(anchor_id: UUID, request: Request) -> dict:
    """Independently re-verify a TrustChain anchor against the public chain:
    reads the Sepolia transaction back, decodes its calldata and confirms the
    on-chain Merkle root matches, plus confirmations. LOCAL_SIMULATION anchors
    report NOT_ON_CHAIN."""
    anchor = await request.app.state.db.fetchrow(
        """SELECT id,merkle_root,from_position,to_position,network,anchor_tx_hash,
                  block_number,explorer_url,status,anchored_at
           FROM ledger_anchors WHERE id=$1""", anchor_id,
    )
    if not anchor:
        raise HTTPException(status_code=404, detail="Không tìm thấy điểm neo")
    try:
        onchain = await verify_onchain_anchor(dict(anchor))
    except Exception as error:  # RPC/network problems must not crash the endpoint
        raise HTTPException(status_code=503, detail="Không thể truy vấn blockchain lúc này") from error
    return {
        "anchor_id": str(anchor["id"]),
        "network": anchor["network"],
        "status": anchor["status"],
        "from_position": anchor["from_position"],
        "to_position": anchor["to_position"],
        "onchain": onchain,
    }


@app.get("/transparency/proofs/{ledger_position}/export")
async def export_merkle_proof(ledger_position: int, request: Request) -> dict:
    """Self-contained, independently verifiable Merkle proof bundle. Anyone can
    fold leaf_hash with each proof node (SHA-256 of concatenated hex, ordered by
    direction) and check the result equals merkle_root, then match merkle_root to
    the on-chain anchor transaction. No personal data is included."""
    proof = await proof_for_position(request.app.state.db, ledger_position)
    if not proof:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi sổ cái")
    return {
        "schema": "charityconnect-merkle-proof-v1",
        "algorithm": "SHA-256",
        "ledger_position": proof["ledger_position"],
        "leaf_hash": proof["leaf_hash"],
        "leaf_index": proof.get("leaf_index"),
        "merkle_proof": proof["proof"],
        "merkle_root": proof["merkle_root"],
        "proof_valid": proof["proof_valid"],
        "anchor": proof.get("anchor"),
        "verify_instructions": (
            "Bắt đầu từ leaf_hash. Với mỗi node trong merkle_proof: nếu direction=LEFT thì "
            "nối node.hash + hash hiện tại, ngược lại nối hash hiện tại + node.hash, rồi lấy "
            "SHA-256 của chuỗi hex ghép. Kết quả cuối phải bằng merkle_root; sau đó đối chiếu "
            "merkle_root với calldata giao dịch anchor trên trình duyệt blockchain."
        ),
    }


@app.get("/transparency/receipts/{receipt_number}")
async def verify_public_receipt(receipt_number: str, request: Request) -> dict:
    row = await request.app.state.db.fetchrow(
        """SELECT position,event_type,campaign_id,public_payload,previous_hash,entry_hash,created_at
           FROM ledger_entries
           WHERE event_type='DONATION_COMPLETED' AND public_payload->>'receipt_number'=$1""",
        receipt_number,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bằng chứng biên nhận")
    payload = row["public_payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    chain = await verify_ledger(request.app.state.db)
    merkle = await proof_for_position(request.app.state.db, row["position"])
    verification_status = "INVALID"
    if chain["valid"] and merkle and merkle["proof_valid"]:
        verification_status = "CONFIRMED" if merkle.get("anchor") and merkle["anchor"]["status"] in {"SIMULATED", "CONFIRMED"} else "UNANCHORED"
    elif chain["valid"] and merkle and not merkle.get("anchor"):
        verification_status = "UNANCHORED"
    return {
        "receipt_number": receipt_number,
        "campaign_id": row["campaign_id"],
        "campaign_title": payload.get("campaign_title"),
        "amount": payload.get("amount"),
        "completed_at": payload.get("completed_at"),
        "ledger_hash": row["entry_hash"],
        "ledger_position": row["position"],
        "previous_hash": row["previous_hash"],
        "proof_status": "CONFIRMED" if chain["valid"] else "INVALID",
        "merkle_proof": merkle["proof"] if merkle else [],
        "merkle_root": merkle["merkle_root"] if merkle else None,
        "merkle_proof_valid": bool(merkle and merkle["proof_valid"]),
        "anchor": merkle.get("anchor") if merkle else None,
        "verification_status": verification_status,
    }


def _vnd(value: int) -> str:
    return f"{value:,}".replace(",", ".") + " ₫"


@app.get("/transparency/reconciliation/{receipt_number}")
async def public_reconciliation(receipt_number: str, request: Request) -> dict:
    """Hành trình đối soát công khai của một biên nhận qua 4 bước:
    đã nhận → đã cộng chiến dịch → đã khóa quỹ → đã ghi TrustChain. Bước 2–3 đối
    chiếu chéo với Campaign Service (best-effort); bước 1,4 nằm ở Donation Service."""
    db = request.app.state.db
    donation = await db.fetchrow(
        """SELECT d.id,d.campaign_id,d.campaign_title,d.amount,d.status,d.created_at
           FROM donations d JOIN receipts r ON r.donation_id=d.id WHERE r.receipt_number=$1""",
        receipt_number,
    )
    if not donation:
        raise HTTPException(status_code=404, detail="Không tìm thấy biên nhận")
    ledger = await db.fetchrow(
        "SELECT position,entry_hash,created_at FROM ledger_entries WHERE event_type='DONATION_COMPLETED' AND entity_id=$1",
        donation["id"],
    )
    chain = await verify_ledger(db)
    rejected = donation["status"] == "REJECTED"
    credited = locked = None
    contract_state = None
    campaign_reconciliation_available = False
    try:
        response = await campaign_request(request.app, f"/internal/donations/{donation['id']}/reconciliation")
        if response.status_code == 200:
            recon = response.json()
            credited, locked, contract_state = bool(recon.get("credited")), bool(recon.get("locked")), recon.get("contract_state")
            campaign_reconciliation_available = True
    except Exception:  # Campaign Service tạm lỗi không được làm hỏng trang đối soát
        pass
    # Đây là đối soát chéo. Không được suy diễn Campaign/Escrow đã ghi nhận
    # chỉ vì Donation Service đã chuyển giao dịch sang COMPLETED.
    credited_done = credited is True
    locked_done = locked is True
    created_at = donation["created_at"].isoformat()
    steps = [
        {"key": "RECEIVED", "label": "Đã nhận", "service": "Donation Service", "done": not rejected,
         "at": None if rejected else created_at,
         "detail": "Khoản quyên góp đã bị từ chối khi xác minh." if rejected else f"Ghi nhận {_vnd(int(donation['amount']))} · biên nhận {receipt_number}"},
        {"key": "CAMPAIGN_CREDITED", "label": "Đã cộng chiến dịch", "service": "Campaign Service", "done": credited_done,
         "at": created_at if credited_done else None,
         "detail": f"Đã cộng vào “{donation['campaign_title']}”" if credited_done else ("Chờ quản trị viên duyệt trước khi cộng tiền." if donation["status"] == "PENDING_REVIEW" else ("Campaign Service tạm thời không phản hồi; chưa thể xác nhận đã cộng tiền." if not campaign_reconciliation_available else "Chưa cộng vào chiến dịch."))},
        {"key": "FUNDS_LOCKED", "label": "Đã khóa quỹ", "service": "Escrow", "done": locked_done,
         "at": created_at if locked_done else None,
         "detail": f"Escrow khóa quỹ minh bạch · trạng thái {contract_state or 'DONATION_OPEN'}" if locked_done else ("Campaign Service tạm thời không phản hồi; chưa thể xác nhận escrow." if not campaign_reconciliation_available else "Chưa khóa quỹ.")},
        {"key": "TRUSTCHAIN", "label": "Đã ghi TrustChain", "service": "TrustChain", "done": ledger is not None,
         "at": ledger["created_at"].isoformat() if ledger else None,
         "detail": (f"Sổ cái #{ledger['position']} · hash {ledger['entry_hash'][:16]}…" + (" · chuỗi hợp lệ" if chain["valid"] else "")) if ledger else "Chưa ghi sổ cái."},
    ]
    return {
        "receipt_number": receipt_number, "amount": int(donation["amount"]),
        "campaign_id": str(donation["campaign_id"]), "campaign_title": donation["campaign_title"],
        "created_at": created_at, "status": donation["status"],
        "steps": steps, "reconciled": all(step["done"] for step in steps), "chain_valid": bool(chain["valid"]),
        "campaign_reconciliation_available": campaign_reconciliation_available,
    }


@app.get("/transparency/diagnostics/receipts/{receipt_number}")
async def receipt_diagnostics(receipt_number: str, request: Request) -> dict:
    receipt_payload = await verify_public_receipt(receipt_number, request)
    issues: list[str] = []
    if receipt_payload["proof_status"] != "CONFIRMED":
        issues.append("Hash-chain không xác nhận được biên nhận")
    if receipt_payload["verification_status"] == "UNANCHORED":
        issues.append("Biên nhận hợp lệ nhưng chưa neo TrustChain")
    if receipt_payload["verification_status"] == "INVALID":
        issues.append("Biên nhận hoặc Merkle proof không hợp lệ")
    return build_diagnostics(
        chain_valid=receipt_payload["proof_status"] == "CONFIRMED",
        receipt_valid=receipt_payload["verification_status"] == "CONFIRMED",
        ledger_position=receipt_payload["ledger_position"],
        entry_hash=receipt_payload["ledger_hash"],
        previous_hash=receipt_payload["previous_hash"],
        merkle_root=receipt_payload.get("merkle_root"),
        anchor=receipt_payload.get("anchor"),
        issues=issues,
        extra={
            "receipt_number": receipt_payload["receipt_number"],
            "campaign_title": receipt_payload.get("campaign_title"),
            "amount": receipt_payload.get("amount"),
            "verification_status": receipt_payload["verification_status"],
        },
    )


@app.get("/transparency/diagnostics/ledger/{ledger_position}")
async def ledger_entry_diagnostics(ledger_position: int, request: Request) -> dict:
    row = await request.app.state.db.fetchrow(
        """SELECT position,entry_hash,previous_hash,event_type,campaign_id,public_payload,created_at
           FROM ledger_entries WHERE position=$1""",
        ledger_position,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi sổ cái")
    chain = await verify_ledger(request.app.state.db)
    merkle = await proof_for_position(request.app.state.db, ledger_position)
    issues: list[str] = []
    if not chain["valid"]:
        issues.append(f"Hash-chain không hợp lệ tại vị trí {chain.get('invalid_position')}")
    if not merkle or not merkle.get("proof_valid"):
        issues.append("Merkle proof chưa hợp lệ hoặc chưa được tạo")
    if merkle and not merkle.get("anchor"):
        issues.append("Ledger entry chưa neo TrustChain")
    return build_diagnostics(
        chain_valid=bool(chain["valid"]),
        receipt_valid=None,
        ledger_position=row["position"],
        entry_hash=row["entry_hash"],
        previous_hash=row["previous_hash"],
        merkle_root=merkle.get("merkle_root") if merkle else None,
        anchor=merkle.get("anchor") if merkle else None,
        issues=issues,
        extra={
            "event_type": row["event_type"],
            "campaign_id": row["campaign_id"],
            "public_payload": row["public_payload"],
        },
    )
