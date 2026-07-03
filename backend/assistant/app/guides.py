"""Role-based feature guide for CharityConnect.

Pure data + builder, no network or OpenAI dependency. Powers the
GET /assistant/role-guide endpoint and the frontend "Bạn có thể làm gì?" panel
so every account type sees exactly the features it is allowed to use, plus the
features that are locked behind another role / login.
"""
from dataclasses import dataclass, field
from typing import Literal

from .knowledge import KNOWLEDGE_VERSION

RoleGuideRole = Literal["PUBLIC", "DONOR", "ORGANIZATION", "ADMIN"]
ROLES: tuple[str, ...] = ("PUBLIC", "DONOR", "ORGANIZATION", "ADMIN")


@dataclass(frozen=True)
class GuideAction:
    label: str
    path: str
    description: str
    roles: tuple[str, ...]
    requires_login: bool = False

    def visible_to(self, role: str) -> bool:
        # PUBLIC actions are visible to everyone; role actions stay scoped to
        # their owning role so menus/guides do not mix client capabilities.
        if "PUBLIC" in self.roles:
            return True
        return role in self.roles


# Single source of truth for every navigable feature and who may use it.
ACTIONS: tuple[GuideAction, ...] = (
    # ---- Chung (mọi người) ----
    GuideAction("Chiến dịch", "/", "Xem và tìm các chiến dịch đã được duyệt.", ("PUBLIC",)),
    GuideAction("Minh bạch", "/minh-bach", "Kiểm tra sổ cái hash-chain, Merkle proof và điểm neo.", ("PUBLIC",)),
    GuideAction("Thống kê", "/thong-ke", "Tổng quyên góp, lượt đóng góp, quỹ đã dùng và số dư minh bạch.", ("PUBLIC",)),
    GuideAction("Xác minh biên nhận", "/xac-minh-bien-nhan", "Nhập mã CC-... để kiểm tra biên nhận công khai.", ("PUBLIC",)),
    # ---- Người quyên góp ----
    GuideAction("Tài khoản", "/tai-khoan", "Thông tin cá nhân, đổi mật khẩu, phiên đăng nhập và nhật ký cá nhân.", ("DONOR", "ORGANIZATION", "ADMIN"), True),
    GuideAction("Lịch sử quyên góp", "/lich-su", "Danh sách giao dịch mô phỏng đã thực hiện.", ("DONOR",), True),
    GuideAction("Yêu thích", "/yeu-thich", "Các chiến dịch bạn đã lưu để theo dõi.", ("DONOR",), True),
    GuideAction("Thông báo", "/thong-bao", "Cập nhật về chiến dịch và biên nhận của bạn.", ("DONOR",), True),
    # ---- Tổ chức ----
    GuideAction("Dashboard tổ chức", "/to-chuc", "Quản lý chiến dịch nháp và nộp duyệt.", ("ORGANIZATION",), True),
    GuideAction("Ngân sách & milestone", "/to-chuc?tab=finance", "Lập ngân sách và các mốc milestone cho chiến dịch.", ("ORGANIZATION",), True),
    GuideAction("Báo cáo sử dụng quỹ", "/to-chuc?tab=reports", "Nộp báo cáo kèm 1–5 ảnh/PDF làm bằng chứng.", ("ORGANIZATION",), True),
    # ---- Quản trị ----
    GuideAction("Quản lý tài khoản", "/quan-tri?tab=users", "Khóa/mở và phân quyền tài khoản người dùng.", ("ADMIN",), True),
    GuideAction("Kiểm duyệt", "/quan-tri", "Duyệt/từ chối tổ chức, chiến dịch và báo cáo tác động.", ("ADMIN",), True),
    GuideAction("Risk Score", "/quan-tri?tab=risk", "Xếp hạng rủi ro chiến dịch theo tín hiệu bất thường.", ("ADMIN",), True),
    GuideAction("Audit Log", "/quan-tri?tab=audit", "Nhật ký các hành động quan trọng của hệ thống.", ("ADMIN",), True),
    GuideAction("TrustChain anchor", "/quan-tri?tab=trustchain", "Tạo điểm neo Merkle cho các ledger entry chưa anchor.", ("ADMIN",), True),
)


@dataclass(frozen=True)
class GuideSection:
    title: str
    description: str
    actions: list[GuideAction] = field(default_factory=list)


def _serialize_action(action: GuideAction) -> dict:
    return {
        "label": action.label,
        "path": action.path,
        "description": action.description,
        "roles": list(action.roles),
        "requires_login": action.requires_login,
    }


COMMON_TIPS = [
    "Mọi giao dịch chỉ là mô phỏng VND, không trừ tiền thật.",
    "Hash-chain/Merkle anchor là bằng chứng chống sửa dữ liệu, không phải tiền mã hóa.",
]

ROLE_TIPS: dict[str, list[str]] = {
    "PUBLIC": ["Đăng nhập bằng tài khoản demo (mật khẩu Demo@123) để mở khóa chức năng theo vai trò."],
    "DONOR": ["Tài khoản donor có thể quyên góp, xem biên nhận, lịch sử và theo dõi chiến dịch."],
    "ORGANIZATION": ["Chỉ tổ chức đã xác minh (VERIFIED) mới được nộp chiến dịch và báo cáo."],
    "ADMIN": ["Admin kiểm duyệt nội dung, chấm Risk Score và vận hành TrustChain; mọi hành động vào Audit Log."],
}

ROLE_TITLES: dict[str, tuple[str, str]] = {
    "DONOR": ("Người quyên góp", "Quản lý đóng góp, biên nhận và theo dõi của bạn."),
    "ORGANIZATION": ("Tổ chức", "Vận hành chiến dịch và minh bạch sử dụng quỹ."),
    "ADMIN": ("Quản trị", "Kiểm duyệt nội dung và vận hành TrustChain."),
}


def normalize_role(role: str | None) -> str:
    value = (role or "PUBLIC").upper()
    return value if value in ROLES else "PUBLIC"


def role_guide(role: str | None = "PUBLIC", path: str = "/") -> dict:
    """Build the role guide: visible sections, locked actions, and tips.

    locked_actions lists features the current role cannot use (wrong role or
    login required) so the UI can disable them or redirect to login.
    """
    role = normalize_role(role)
    common = [a for a in ACTIONS if "PUBLIC" in a.roles]
    sections: list[dict] = [{
        "title": "Chức năng chung",
        "description": "Chức năng ai cũng dùng được, không cần đăng nhập.",
        "actions": [_serialize_action(a) for a in common],
    }]

    if role in ROLE_TITLES:
        title, description = ROLE_TITLES[role]
        owned = [a for a in ACTIONS if "PUBLIC" not in a.roles and a.visible_to(role)]
        sections.append({
            "title": title,
            "description": description,
            "actions": [_serialize_action(a) for a in owned],
        })

    locked = [_serialize_action(a) for a in ACTIONS if not a.visible_to(role)]
    tips = COMMON_TIPS + ROLE_TIPS.get(role, [])
    return {
        "role": role,
        "path": path[:160],
        "sections": sections,
        "locked_actions": locked,
        "tips": tips,
        "knowledge_version": KNOWLEDGE_VERSION,
    }


# Backward-compatible alias.
build_role_guide = role_guide
