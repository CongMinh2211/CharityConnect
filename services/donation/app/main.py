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
from .config import CAMPAIGN_SERVICE_URL, DATABASE_URL, INTERNAL_SERVICE_TOKEN, REDIS_URL
from .domain import GENESIS_HASH, append_ledger_entry, ledger_hash, make_receipt_number, public_donor_name
from .schemas import DonationCreate
from .trustchain import create_anchor, proof_for_position

REQUESTS = Counter("donation_http_requests_total", "HTTP requests", ["method", "path", "status"])
LATENCY = Histogram("donation_http_request_duration_seconds", "HTTP latency", ["method", "path"])
COMPLETED = Counter("donation_completed_total", "Completed donations")
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.db = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    app.state.redis = Redis.from_url(REDIS_URL, decode_responses=True)
    app.state.http = httpx.AsyncClient(timeout=5)
    tasks = [
        asyncio.create_task(publish_outbox(app)),
        asyncio.create_task(consume_transparency_events(app)),
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
    event_payload = {
        "event_id": donation_id,
        "donor_id": user.id,
        "campaign_id": input.campaign_id,
        "campaign_title": campaign["title"],
        "amount": input.amount,
        "receipt_number": receipt_number,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            row = await connection.fetchrow(
                """INSERT INTO donations(id,donor_id,donor_name,campaign_id,campaign_title,amount,anonymous,status)
                   VALUES($1,$2,$3,$4,$5,$6,$7,'COMPLETED')
                   RETURNING id,campaign_id,campaign_title,amount,anonymous,status,created_at""",
                donation_id, UUID(user.id), user.name, input.campaign_id, campaign["title"], input.amount, input.anonymous,
            )
            await connection.execute(
                "INSERT INTO receipts(receipt_number,donation_id) VALUES($1,$2)", receipt_number, donation_id
            )
            await connection.execute(
                "INSERT INTO outbox_events(id,event_type,payload) VALUES($1,'donation.completed',$2::jsonb)",
                donation_id, json.dumps({key: str(value) for key, value in event_payload.items()}),
            )
            public_payload = {
                "amount": input.amount,
                "campaign_id": str(input.campaign_id),
                "campaign_title": campaign["title"],
                "completed_at": row["created_at"].isoformat(),
                "receipt_number": receipt_number,
            }
            proof = await append_ledger_entry(
                connection,
                event_id=str(donation_id),
                event_type="DONATION_COMPLETED",
                campaign_id=str(input.campaign_id),
                entity_id=str(donation_id),
                public_payload=public_payload,
                created_at=row["created_at"],
            )
    COMPLETED.inc()
    LEDGER_APPENDS.labels("DONATION_COMPLETED").inc()
    return {
        **dict(row),
        "receipt_number": receipt_number,
        "ledger_hash": proof["entry_hash"],
        "ledger_position": proof["position"],
        "proof_status": "CONFIRMED",
    }


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
        Paragraph("<i>Báo cáo mô phỏng học thuật · Không xử lý giao dịch tài chính thật.</i>", right_align_style)
    ]
    document.build(story)
    return Response(output.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="charityconnect-{year}.pdf"'})


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


@app.post("/admin/transparency/anchors", status_code=201)
async def create_transparency_anchor(request: Request, user: UserClaims = Depends(require_user)) -> dict:
    require_role(user, "ADMIN")
    try:
        return await create_anchor(request.app.state.db, UUID(user.id))
    except ValueError as error:
        if str(error) == "NO_UNANCHORED_ENTRIES":
            raise HTTPException(status_code=409, detail="Tất cả bản ghi đã được neo") from error
        raise


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


@app.get("/transparency/proofs/{ledger_position}")
async def public_merkle_proof(ledger_position: int, request: Request) -> dict:
    proof = await proof_for_position(request.app.state.db, ledger_position)
    if not proof: raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi sổ cái")
    return proof


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
