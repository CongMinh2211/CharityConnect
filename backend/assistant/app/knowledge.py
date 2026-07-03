import unicodedata
from dataclasses import dataclass


KNOWLEDGE_VERSION = "charityconnect-2026.06"

KNOWLEDGE_BASE = """
CharityConnect là website tiếng Việt kết nối người quyên góp, tổ chức từ thiện
và quản trị viên. Hệ thống ghi nhận đóng góp bằng VND, phát hành biên nhận,
không có ví, token, NFT, gas, tiền số, chat cộng đồng hay quyên góp định kỳ.

Luồng người quyên góp: đăng nhập, xem chiến dịch đã duyệt còn hạn, chọn số tiền,
có thể chọn ẩn danh với tổ chức, xác nhận đóng góp, nhận biên nhận có mã CC-...,
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
chủ động tạo anchor nội bộ hoặc Sepolia. Biên nhận chỉ CONFIRMED khi hash-chain,
Merkle Proof và anchor đều hợp lệ. Escrow là state machine theo dõi quỹ khóa/giải
ngân. Trang /minh-bach kiểm tra chuỗi, proof và các điểm neo.

Thống kê: /thong-ke tổng hợp tiền và lượt quyên góp, người đóng góp, quỹ đã dùng,
số dư minh bạch, tiến độ và danh mục. Donation Service là nguồn chuẩn về tiền.
Email chào mừng/cảm ơn được xếp vào outbox; thiếu Gmail OAuth không làm lỗi luồng chính.

Trạng thái: OrganizationStatus PENDING/VERIFIED/REJECTED; CampaignStatus
DRAFT/PENDING_REVIEW/APPROVED/REJECTED/CLOSED; ImpactReportStatus
PENDING_REVIEW/VERIFIED/REJECTED; LedgerProofStatus CONFIRMED/PENDING/INVALID.

Tài khoản mẫu có thể chọn nhanh trên trang đăng nhập theo ba vai trò: người quyên góp,
tổ chức và quản trị viên.
Chiến dịch mẫu gồm phòng học vùng cao, bữa ăn cho bệnh nhi, nước sạch Nậm Lành và
tủ thuốc cho điểm trường. Số tiền có thể thay đổi theo dữ liệu hệ thống.
""".strip()


def fold(text: str) -> str:
    """Lowercase and strip Vietnamese diacritics so input typed without accents
    ("quyen gop", "bien nhan", "minh bach") still matches keywords. đ/Đ are
    normalised to d because NFD does not decompose them."""
    text = text.casefold().replace("đ", "d").replace("Đ", "d")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


IN_SCOPE_TERMS = (
    "charityconnect", "quyên góp", "ủng hộ", "chiến dịch", "tổ chức", "quản trị",
    "admin", "đăng nhập", "đăng ký", "tài khoản", "biên nhận", "receipt", "qr",
    "minh bạch", "hash", "blockchain", "sổ cái", "ledger", "báo cáo", "bằng chứng",
    "kiểm duyệt", "xác minh", "ẩn danh", "vnd", "trang này", "chức năng",
    "merkle", "trustchain", "anchor", "điểm neo", "escrow", "quỹ khóa", "giải ngân",
    "thống kê", "biểu đồ", "analytics", "gmail", "email", "thư cảm ơn", "lịch sử",
    "từ thiện", "hướng dẫn", "cách dùng", "vai trò",
)

OUT_OF_SCOPE_TERMS = (
    "thời tiết", "bóng đá", "chứng khoán", "giá vàng", "tỷ giá", "tin tức",
    "du lịch", "nấu ăn", "viết code", "làm bài tập", "dịch tiếng", "tra google",
)

_IN_SCOPE_FOLDED = tuple(fold(t) for t in IN_SCOPE_TERMS)
_OUT_OF_SCOPE_FOLDED = tuple(fold(t) for t in OUT_OF_SCOPE_TERMS)
_GREETINGS = {fold(g) for g in ("chào", "xin chào", "hello", "hi", "alo", "giúp tôi", "bạn làm được gì", "trợ giúp")}


@dataclass(frozen=True)
class Grounding:
    sources: list[str]
    actions: list[dict[str, str]]
    suggestions: list[str]


@dataclass(frozen=True)
class Intent:
    name: str
    keywords: tuple[str, ...]
    grounding: Grounding


DEFAULT_GROUNDING = Grounding(
    sources=["Hướng dẫn sử dụng CharityConnect"],
    actions=[{"label": "Xem chiến dịch", "path": "/"}],
    suggestions=["Cách quyên góp?", "Cách xác minh biên nhận?", "Hash-chain là gì?"],
)

INTENTS: tuple[Intent, ...] = (
    Intent(
        "receipt",
        ("biên nhận", "receipt", "qr", "mã cc", "confirmed", "xác minh biên nhận"),
        Grounding(
            ["Quy trình biên nhận & LedgerProofStatus"],
            [{"label": "Xác minh biên nhận", "path": "/xac-minh-bien-nhan"}],
            ["Mã biên nhận ở đâu?", "CONFIRMED nghĩa là gì?", "Hash dùng để làm gì?"],
        ),
    ),
    Intent(
        "transparency",
        ("minh bạch", "hash", "blockchain", "sổ cái", "ledger", "merkle", "trustchain",
         "anchor", "điểm neo", "escrow", "quỹ khóa", "giải ngân", "chống sửa"),
        Grounding(
            ["Đặc tả sổ cái SHA-256", "Quy tắc payload công khai"],
            [{"label": "Mở sổ cái minh bạch", "path": "/minh-bach"}],
            ["Chuỗi phát hiện sửa dữ liệu thế nào?", "Dữ liệu nào được công khai?", "Xác minh biên nhận ra sao?"],
        ),
    ),
    Intent(
        "statistics",
        ("thống kê", "biểu đồ", "analytics", "tổng quyên góp", "bao nhiêu tiền",
         "số liệu", "báo cáo tài chính", "số dư"),
        Grounding(
            ["Bảng thống kê /thong-ke", "Donation Service là nguồn chuẩn về tiền"],
            [{"label": "Xem thống kê", "path": "/thong-ke"}],
            ["Tổng quyên góp hiện tại?", "Quỹ đã giải ngân bao nhiêu?", "Số dư minh bạch là gì?"],
        ),
    ),
    Intent(
        "organization",
        ("tổ chức", "báo cáo", "bằng chứng", "sử dụng quỹ", "hồ sơ pháp lý", "verified"),
        Grounding(
            ["Quy trình tổ chức & báo cáo tác động"],
            [{"label": "Dashboard tổ chức", "path": "/to-chuc"}],
            ["Điều kiện nộp chiến dịch?", "File bằng chứng hợp lệ?", "Vì sao báo cáo bị từ chối?"],
        ),
    ),
    Intent(
        "admin",
        ("admin", "quản trị", "kiểm duyệt", "duyệt", "từ chối", "audit log", "phê duyệt"),
        Grounding(
            ["Quy trình kiểm duyệt CharityConnect"],
            [{"label": "Hàng đợi kiểm duyệt", "path": "/quan-tri"}],
            ["Admin duyệt những gì?", "Khi nào cần lý do từ chối?", "Audit log ghi gì?"],
        ),
    ),
    Intent(
        "account",
        ("đăng nhập", "tài khoản", "đăng ký", "mật khẩu", "quên mật khẩu", "vai trò", "phân quyền"),
        Grounding(
            ["Tài khoản và phân quyền"],
            [{"label": "Đăng nhập", "path": "/dang-nhap"}],
            ["Tài khoản donor là gì?", "Tổ chức làm được gì?", "Admin làm được gì?"],
        ),
    ),
    Intent(
        "donation",
        ("quyên góp", "ủng hộ", "chiến dịch", "gây quỹ", "đóng góp", "ẩn danh", "từ thiện"),
        Grounding(
            ["Quy trình quyên góp", "Danh sách chiến dịch đã duyệt"],
            [{"label": "Chọn chiến dịch", "path": "/"}],
            ["Quyên góp có mất tiền thật không?", "Có thể ẩn danh không?", "Sau quyên góp nhận gì?"],
        ),
    ),
)


def is_in_scope(message: str, history: list[str] | None = None) -> bool:
    folded = fold(message)
    if any(term in folded for term in _OUT_OF_SCOPE_FOLDED):
        return False
    combined = " ".join([folded, *(fold(item) for item in (history or []))])
    if any(term in combined for term in _IN_SCOPE_FOLDED):
        return True
    return folded.strip(" !?.") in _GREETINGS


def classify_intent(message: str) -> str:
    """Return the best-matching intent name, or "default". Scoring counts how
    many accent-insensitive keywords each intent matches and prefers the highest
    score; ties keep the earlier, more specific intent."""
    folded = fold(message)
    best_name = "default"
    best_score = 0
    for intent in INTENTS:
        score = sum(1 for kw in intent.keywords if fold(kw) in folded)
        if score > best_score:
            best_score = score
            best_name = intent.name
    return best_name


def grounding_for(message: str) -> Grounding:
    name = classify_intent(message)
    for intent in INTENTS:
        if intent.name == name:
            return intent.grounding
    return DEFAULT_GROUNDING
