from __future__ import annotations

from typing import Any


def anchor_status(anchor: dict[str, Any] | None) -> str:
    if not anchor:
        return "UNANCHORED"
    return str(anchor.get("status") or "UNKNOWN")


def recommendation(issues: list[str]) -> str:
    if not issues:
        return "Dữ liệu minh bạch đang hợp lệ. Có thể dùng proof này để đối chiếu công khai."
    if any("chain" in issue.lower() or "hash" in issue.lower() for issue in issues):
        return "Dừng xác nhận công khai và kiểm tra lại ledger gốc trước khi công bố."
    if any("anchor" in issue.lower() or "chưa neo" in issue.lower() for issue in issues):
        return "Tạo TrustChain anchor trong màn hình quản trị để hoàn tất xác minh Merkle."
    return "Kiểm tra lại dữ liệu nguồn hoặc thử tạo proof mới."


def build_diagnostics(
    *,
    chain_valid: bool,
    receipt_valid: bool | None = None,
    ledger_position: int | None = None,
    entry_hash: str | None = None,
    previous_hash: str | None = None,
    merkle_root: str | None = None,
    anchor: dict[str, Any] | None = None,
    issues: list[str] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    issue_list = issues or []
    payload: dict[str, Any] = {
        "chain_valid": chain_valid,
        "receipt_valid": receipt_valid,
        "ledger_position": ledger_position,
        "entry_hash": entry_hash,
        "previous_hash": previous_hash,
        "merkle_root": merkle_root,
        "anchor_status": anchor_status(anchor),
        "issues": issue_list,
        "recommendation": recommendation(issue_list),
    }
    if anchor:
        payload["anchor"] = anchor
    if extra:
        payload.update(extra)
    return payload
