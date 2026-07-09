jest.mock("../src/db", () => ({ query: jest.fn() }));

import { query } from "../src/db";
import { issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken } from "../src/tokens";

const queryMock = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockResolvedValue([] as never);
});

describe("refresh token lifecycle", () => {
  it("issues opaque refresh tokens and stores only a hash", async () => {
    const token = await issueRefreshToken("user-1", "session-1");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO refresh_tokens"), [
      "user-1",
      "session-1",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      "7",
    ]);
    expect(queryMock.mock.calls[0][1]?.[2]).not.toBe(token);
  });

  it("returns null when a refresh token is missing, expired or belongs to a disabled user", async () => {
    await expect(rotateRefreshToken("missing-token")).resolves.toBeNull();

    queryMock.mockResolvedValueOnce([{ id: "rt-1", user_id: "user-1", session_id: null, revoked_at: null, expired: true, email: "a@test.vn", name: "A", role: "DONOR", status: "ACTIVE" }] as never);
    await expect(rotateRefreshToken("expired-token")).resolves.toBeNull();

    queryMock.mockResolvedValueOnce([{ id: "rt-2", user_id: "user-1", session_id: null, revoked_at: null, expired: false, email: "a@test.vn", name: "A", role: "DONOR", status: "DISABLED" }] as never);
    await expect(rotateRefreshToken("disabled-token")).resolves.toBeNull();
  });

  it("revokes every active token when refresh token reuse is detected", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "rt-1", user_id: "user-1", session_id: "session-1", revoked_at: "2026-01-01T00:00:00Z", expired: false, email: "a@test.vn", name: "A", role: "DONOR", status: "ACTIVE" }] as never)
      .mockResolvedValueOnce([] as never);

    await expect(rotateRefreshToken("reused-token")).resolves.toBe("REUSED");
    expect(queryMock.mock.calls[1][0]).toContain("UPDATE refresh_tokens SET revoked_at=now()");
    expect(queryMock.mock.calls[1][1]).toEqual(["user-1"]);
  });

  it("rotates an active refresh token and links the replacement", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "rt-1", user_id: "user-1", session_id: "session-1", revoked_at: null, expired: false, email: "a@test.vn", name: "A", role: "DONOR", status: "ACTIVE" }] as never)
      .mockResolvedValueOnce([{ id: "rt-2" }] as never)
      .mockResolvedValueOnce([] as never);

    const result = await rotateRefreshToken("active-token");

    expect(result).toEqual(expect.objectContaining({ userId: "user-1", sessionId: "session-1", email: "a@test.vn", name: "A", role: "DONOR" }));
    expect(result && result !== "REUSED" ? result.refreshToken : "").toMatch(/^[a-f0-9]{64}$/);
    expect(queryMock.mock.calls[2][0]).toContain("replaced_by=$2");
    expect(queryMock.mock.calls[2][1]).toEqual(["rt-1", "rt-2"]);
  });

  it("revokes one refresh token or all active tokens for a user", async () => {
    queryMock.mockResolvedValueOnce([{ user_id: "user-1" }] as never);
    await expect(revokeRefreshToken("token")).resolves.toBe("user-1");

    queryMock.mockResolvedValueOnce([] as never);
    await expect(revokeRefreshToken("missing")).resolves.toBeNull();

    await revokeAllRefreshTokens("user-1");
    expect(queryMock.mock.calls.at(-1)?.[0]).toContain("WHERE user_id=$1 AND revoked_at IS NULL");
    expect(queryMock.mock.calls.at(-1)?.[1]).toEqual(["user-1"]);
  });
});
