import type { Role } from "../../types";

export type RoleGuideRole = Role | "PUBLIC";
export type FunctionAudience = "COMMON" | Role;
export type FunctionIcon =
  | "bar-chart"
  | "bell"
  | "bot"
  | "file-down"
  | "gauge"
  | "heart"
  | "history"
  | "landmark"
  | "layout"
  | "list"
  | "receipt"
  | "search"
  | "shield"
  | "user-cog"
  | "users"
  | "wallet";

export interface RoleFunctionItem {
  label: string;
  description: string;
  path: string;
  icon: FunctionIcon;
  roles?: Role[];
  requiresLogin?: boolean;
}

export interface RoleFunctionGroup {
  title: string;
  subtitle: string;
  audience: FunctionAudience;
  items: RoleFunctionItem[];
}

export const roleFunctionGroups: RoleFunctionGroup[] = [
  {
    title: "Chức năng chung",
    subtitle: "Ai cũng dùng được, không phụ thuộc vai trò.",
    audience: "COMMON",
    items: [
      { label: "Chiến dịch", description: "Tìm kiếm, lọc và xem chiến dịch đang gây quỹ.", path: "/", icon: "search" },
      { label: "Thống kê", description: "Tổng tiền, lượt quyên góp và biểu đồ toàn hệ thống.", path: "/thong-ke", icon: "bar-chart" },
      { label: "Sổ cái minh bạch", description: "Hash-chain, Merkle proof và TrustChain anchor.", path: "/minh-bach", icon: "landmark" },
      { label: "Xác minh biên nhận", description: "Kiểm tra mã hoặc QR biên nhận công khai.", path: "/xac-minh-bien-nhan", icon: "receipt" },
      { label: "Trợ lý AI", description: "Hỏi đáp nội dung CharityConnect, ưu tiên dữ liệu nội bộ.", path: "#tro-ly", icon: "bot" }
    ]
  },
  {
    title: "Người quyên góp",
    subtitle: "Quản lý đóng góp cá nhân, thông báo, biên nhận và báo cáo PDF.",
    audience: "DONOR",
    items: [
      { label: "Tài khoản", description: "Hồ sơ, đổi mật khẩu, phiên đăng nhập và audit cá nhân.", path: "/tai-khoan", icon: "user-cog", roles: ["DONOR"], requiresLogin: true },
      { label: "Chiến dịch đã lưu", description: "Danh sách yêu thích và bật/tắt theo dõi.", path: "/yeu-thich", icon: "heart", roles: ["DONOR"], requiresLogin: true },
      { label: "Thông báo", description: "Cập nhật chiến dịch và báo cáo tác động.", path: "/thong-bao", icon: "bell", roles: ["DONOR"], requiresLogin: true },
      { label: "Lịch sử & PDF", description: "Biên nhận, xác minh và báo cáo đóng góp năm.", path: "/lich-su", icon: "file-down", roles: ["DONOR"], requiresLogin: true }
    ]
  },
  {
    title: "Tổ chức từ thiện",
    subtitle: "Quản lý chiến dịch, ngân sách, milestone và báo cáo quỹ.",
    audience: "ORGANIZATION",
    items: [
      { label: "Tài khoản", description: "Hồ sơ, đổi mật khẩu và phiên đăng nhập tổ chức.", path: "/tai-khoan", icon: "user-cog", roles: ["ORGANIZATION"], requiresLogin: true },
      { label: "Dashboard tổ chức", description: "Tổng quan chiến dịch của tổ chức.", path: "/to-chuc", icon: "wallet", roles: ["ORGANIZATION"], requiresLogin: true },
      { label: "Ngân sách & mốc", description: "Kế hoạch tài chính, milestone và escrow.", path: "/to-chuc?tab=finance", icon: "list", roles: ["ORGANIZATION"], requiresLogin: true },
      { label: "Báo cáo quỹ", description: "Nộp bằng chứng sử dụng quỹ để admin duyệt.", path: "/to-chuc?tab=reports", icon: "history", roles: ["ORGANIZATION"], requiresLogin: true }
    ]
  },
  {
    title: "Quản trị viên",
    subtitle: "Kiểm soát tài khoản, kiểm duyệt, rủi ro, audit log và TrustChain anchor.",
    audience: "ADMIN",
    items: [
      { label: "Tài khoản", description: "Bảo mật tài khoản quản trị và audit cá nhân.", path: "/tai-khoan", icon: "user-cog", roles: ["ADMIN"], requiresLogin: true },
      { label: "Quản lý tài khoản", description: "Khóa/mở user và kiểm soát tài khoản theo vai trò.", path: "/quan-tri?tab=users", icon: "users", roles: ["ADMIN"], requiresLogin: true },
      { label: "Trung tâm quản trị", description: "Duyệt tổ chức, chiến dịch và báo cáo.", path: "/quan-tri", icon: "layout", roles: ["ADMIN"], requiresLogin: true },
      { label: "Risk Score", description: "Điểm rủi ro và Priority Rank tự động.", path: "/quan-tri?tab=risk", icon: "gauge", roles: ["ADMIN"], requiresLogin: true },
      { label: "Audit Log", description: "Dấu vết kiểm duyệt và thay đổi trạng thái.", path: "/quan-tri?tab=audit", icon: "list", roles: ["ADMIN"], requiresLogin: true },
      { label: "TrustChain Anchor", description: "Tạo điểm neo Merkle cho ledger.", path: "/quan-tri?tab=trustchain", icon: "landmark", roles: ["ADMIN"], requiresLogin: true }
    ]
  }
];

export function groupsForMenu(role?: Role): RoleFunctionGroup[] {
  // Only surface groups the current visitor can actually use: common functions
  // for everyone, plus the logged-in role's own group. No cross-role locked cards.
  if (!role) return roleFunctionGroups.filter((group) => group.audience === "COMMON");
  return roleFunctionGroups.filter((group) => group.audience === "COMMON" || group.audience === role);
}

export function canUseFunction(item: RoleFunctionItem, role?: Role): boolean {
  if (!item.roles) return true;
  return Boolean(role && item.roles.includes(role));
}
