import jwt from "jsonwebtoken";
import { authenticate, authorize, internalOnly } from "../src/auth";

const secret = "local-charityconnect-secret";
const token = jwt.sign({ sub: "u1", email: "a@test.vn", name: "A", role: "ADMIN" }, secret);

describe("campaign authorization", () => {
  it("authenticates valid tokens", async () => {
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${token}` } } as never, {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects invalid tokens and roles", async () => {
    const status = jest.fn().mockReturnThis(); const json = jest.fn();
    await authenticate({ headers: {} } as never, { status, json } as never, jest.fn());
    expect(status).toHaveBeenCalledWith(401);
    authorize("DONOR")({ user: { sub: "u1", email: "a", name: "A", role: "ADMIN" } } as never, { status, json } as never, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
  });

  it("allows matching roles and internal tokens", () => {
    const next = jest.fn();
    authorize("ADMIN")({ user: { sub: "u1", email: "a", name: "A", role: "ADMIN" } } as never, {} as never, next);
    internalOnly({ headers: { "x-internal-token": "local-internal-token" } } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("checks a session with Identity Service and fails closed when revoked", async () => {
    const previousUrl = process.env.IDENTITY_SERVICE_URL;
    process.env.IDENTITY_SERVICE_URL = "identity:3001";
    const sessionToken = jwt.sign({ sub: "u1", email: "a@test.vn", name: "A", role: "ADMIN", session_id: "s1" }, secret);
    const next = jest.fn();
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce({ ok: true, json: async () => ({ active: true }) } as Response);
    await authenticate({ headers: { authorization: `Bearer ${sessionToken}` } } as never, {} as never, next);
    expect(next).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("http://identity:3001/internal/sessions/s1/status"), expect.any(Object));

    const status = jest.fn().mockReturnThis(); const json = jest.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ active: false }) } as Response);
    await authenticate({ headers: { authorization: `Bearer ${sessionToken}` } } as never, { status, json } as never, jest.fn());
    expect(status).toHaveBeenCalledWith(401);
    fetchMock.mockRestore();
    if (previousUrl === undefined) delete process.env.IDENTITY_SERVICE_URL; else process.env.IDENTITY_SERVICE_URL = previousUrl;
  });
});
