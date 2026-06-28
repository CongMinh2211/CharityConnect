from dataclasses import dataclass


KNOWLEDGE_VERSION = "charityconnect-2026.06"

KNOWLEDGE_BASE = """
CharityConnect là website đồ án tiếng Việt kết nối người quyên góp, tổ chức từ thiện
và quản trị viên. Hệ thống chỉ mô phỏng thanh toán bằng VND, không trừ tiền thật,
không có ví, token, NFT, gas, tiền số, chat cộng đồng hay quyên góp định kỳ.

Luồng người quyên góp: đăng nhập, xem chiến dịch đã duyệt còn hạn, chọn số tiền,
có thể chọn ẩn danh với tổ chức, xác nhận mô phỏng, nhận biên nhận có mã CC-...,
QR, ledger hash và vị trí chuỗi; sau đó xem lịch sử hoặc xác minh công khai.

Luồng tổ chức: nộp hồ sơ pháp lý; chỉ tổ chức VERIFIED được nộp chiến dịch; tạo bản
nháp, nộp duyệt, sửa chiến dịch bị từ chối, đóng chiến dịch; xem giao dịch của chiến
dịch mình; nộp báo cáo sử dụng quỹ gồm tiêu đề, mô tả, số tiền, ngày thực hiện và
1–5 file JPG/PNG/PDF tối đa 10 MB mỗi file. Tổng tiền báo cáo chờ duyệt và đã duyệt
không vượt số tiền chiến dịch đã nhận.

Luồng quản trị: duyệt hoặc từ chối hồ sơ tổ chức, chiến dịch và báo cáo tác động.
Từ chối báo cáo phải có lý do. Các hành động quan trọng được ghi audit log.

Minh bạch: Donation Service nối các sự kiện DONATION_COMPLETED và
FUND_USAGE_VERIFIED bằng SHA-256 trên canonical JSON và previous_hash; bản ghi đầu
dùng 64 số 0. event_id duy nhất chống cộng trùng. Đây là hash-chain chống sửa dữ
liệu, không phải blockchain phi tập trung. Payload công khai không chứa tên, email
hay donor ID. TrustChain gom tối đa 100 ledger hash liên tục thành Merkle root; admin
chủ động tạo anchor mô phỏng hoặc Sepolia. Biên nhận chỉ CONFIRMED khi hash-chain,
Merkle Proof và anchor đều hợp lệ. Escrow là state machine mô phỏng quỹ khóa/giải
ngân, không giữ tiền thật. Trang /minh-bach kiểm tra chuỗi, proof và các điểm neo.

Thống kê: /thong-ke tổng hợp tiền và lượt quyên góp, người đóng góp, quỹ đã dùng,
số dư minh bạch, tiến độ và danh mục. Donation Service là nguồn chuẩn về tiền.
Email chào mừng/cảm ơn được xếp vào outbox; thiếu Gmail OAuth không làm lỗi luồng chính.

Trạng thái: OrganizationStatus PENDING/VERIFIED/REJECTED; CampaignStatus
DRAFT/PENDING_REVIEW/APPROVED/REJECTED/CLOSED; ImpactReportStatus
PENDING_REVIEW/VERIFIED/REJECTED; LedgerProofStatus CONFIRMED/PENDING/INVALID.

Tài khoản demo dùng mật khẩu Demo@123: donor@demo.vn, org@demo.vn và admin@demo.vn.
Chiến dịch mẫu gồm phòng học vùng cao, bữa ăn cho bệnh nhi, nước sạch Nậm Lành và
tủ thuốc cho điểm trường. Số tiền có thể thay đổi khi người dùng chạy demo.
""".strip()

IN_SCOPE_TERMS = (
    "charityconnect", "quyên góp", "ủng hộ", "chiến dịch", "tổ chức", "quản trị",
    "admin", "đăng nhập", "đăng ký", "tài khoản", "biên nhận", "receipt", "qr",
    "minh bạch", "hash", "blockchain", "sổ cái", "ledger", "báo cáo", "bằng chứng",
    "kiểm duyệt", "xác minh", "ẩn danh", "vnd", "demo", "trang này", "chức năng",
    "merkle", "trustchain", "anchor", "điểm neo", "escrow", "quỹ khóa", "giải ngân",
    "thống kê", "biểu đồ", "analytics", "gmail", "email", "thư cảm ơn",
)

OUT_OF_SCOPE_TERMS = (
    "thời tiết", "bóng đá", "chứng khoán", "giá vàng", "tỷ giá", "tin tức",
    "du lịch", "nấu ăn", "viết code", "làm bài tập", "dịch tiếng", "tra google",
)


@dataclass(frozen=True)
class Grounding:
    sources: list[str]
    actions: list[dict[str, str]]
    suggestions: list[str]


DEFAULT_GROUNDING = Grounding(
    sources=["Hướng dẫn sử dụng CharityConnect"],
    actions=[{"label": "Xem chiến dịch", "path": "/"}],
    suggestions=["Cách quyên góp?", "Cách xác minh biên nhận?", "Hash-chain là gì?"],
)


def is_in_scope(message: str, history: list[str] | None = None) -> bool:
    text = message.casefold()
    if any(term in text for term in OUT_OF_SCOPE_TERMS):
        return False
    combined = " ".join([text, *(item.casefold() for item in (history or []))])
    if any(term in combined for term in IN_SCOPE_TERMS):
        return True
    return text.strip(" !?.") in {"chào", "xin chào", "hello", "hi", "giúp tôi", "bạn làm được gì"}


def grounding_for(message: str) -> Grounding:
    text = message.casefold()
    if "biên nhận" in text or "qr" in text:
        return Grounding(
            ["Quy trình biên nhận & LedgerProofStatus"],
            [{"label": "Xác minh biên nhận", "path": "/xac-minh-bien-nhan"}],
            ["Mã biên nhận ở đâu?", "CONFIRMED nghĩa là gì?", "Hash dùng để làm gì?"],
        )
    if any(term in text for term in ("minh bạch", "hash", "blockchain", "sổ cái", "merkle", "trustchain", "anchor", "điểm neo", "escrow")):
        return Grounding(
            ["Đặc tả sổ cái SHA-256", "Quy tắc payload công khai"],
            [{"label": "Mở sổ cái minh bạch", "path": "/minh-bach"}],
            ["Chuỗi phát hiện sửa dữ liệu thế nào?", "Dữ liệu nào được công khai?", "Xác minh biên nhận ra sao?"],
        )
    if "tổ chức" in text or "báo cáo" in text or "bằng chứng" in text:
        return Grounding(
            ["Quy trình tổ chức & báo cáo tác động"],
            [{"label": "Dashboard tổ chức", "path": "/to-chuc"}],
            ["Điều kiện nộp chiến dịch?", "File bằng chứng hợp lệ?", "Vì sao báo cáo bị từ chối?"],
        )
    if "admin" in text or "quản trị" in text or "kiểm duyệt" in text:
        return Grounding(
            ["Quy trình kiểm duyệt CharityConnect"],
            [{"label": "Hàng đợi kiểm duyệt", "path": "/quan-tri"}],
            ["Admin duyệt những gì?", "Khi nào cần lý do từ chối?", "Audit log ghi gì?"],
        )
    if "đăng nhập" in text or "tài khoản" in text or "đăng ký" in text:
        return Grounding(
            ["Tài khoản và phân quyền demo"],
            [{"label": "Đăng nhập", "path": "/dang-nhap"}],
            ["Tài khoản donor là gì?", "Tổ chức làm được gì?", "Admin làm được gì?"],
        )
    if "quyên góp" in text or "ủng hộ" in text or "chiến dịch" in text:
        return Grounding(
            ["Quy trình quyên góp mô phỏng", "Danh sách chiến dịch đã duyệt"],
            [{"label": "Chọn chiến dịch", "path": "/"}],
            ["Quyên góp có mất tiền thật không?", "Có thể ẩn danh không?", "Sau quyên góp nhận gì?"],
        )
    return DEFAULT_GROUNDING
