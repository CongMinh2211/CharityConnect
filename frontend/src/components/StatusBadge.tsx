const labels: Record<string, string> = {
  DRAFT: "Bản nháp", PENDING_REVIEW: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Bị từ chối", CLOSED: "Đã đóng",
  PENDING: "Chờ xác minh", VERIFIED: "Đã xác minh", COMPLETED: "Hoàn tất", FAILED: "Thất bại"
};

interface StatusBadgeProps { status: string }

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const tone = status === "APPROVED" || status === "VERIFIED" || status === "COMPLETED"
    ? "bg-emerald-100 text-emerald-800"
    : status === "REJECTED" || status === "FAILED"
      ? "bg-rose-100 text-rose-800"
      : "bg-amber-100 text-amber-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{labels[status] ?? status}</span>;
}

