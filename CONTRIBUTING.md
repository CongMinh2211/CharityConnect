# Quy ước phát triển

- Nhánh: `feature/<ticket>-<slug>`, `fix/<ticket>-<slug>`, `docs/<slug>`.
- Commit: Conventional Commits, ví dụ `feat(campaign): enforce review state machine`.
- PR phải nhỏ, liên kết yêu cầu, có acceptance criteria và evidence test.
- Tối thiểu một approval; tác giả không tự duyệt PR của mình.
- Không merge khi CI/coverage/Sonar gate thất bại.
- Definition of Done: test pass, coverage không dưới 80%, không có Blocker/Critical mới, RBAC/audit/error handling được kiểm tra, OpenAPI/README cập nhật và Docker build không hỏng.

Retrospective cuối sprint ghi rõ metric baseline, actual, nguyên nhân, action, owner và due date; không dùng metric để xếp hạng cá nhân.

