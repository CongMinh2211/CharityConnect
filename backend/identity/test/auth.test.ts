import jwt from "jsonwebtoken";
import { authenticate, authorize, internalOnly, signToken } from "../src/auth";

describe("identity authorization", () => {
  it("signs a token with the required role claims", () => {
    const token = signToken({ sub: "u1", email: "a@b.vn", name: "A", role: "DONOR" });
    const claims = jwt.decode(token) as { sub: string; role: string };
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("DONOR");
  });

  it("rejects a role outside the allow-list", () => {
    const middleware = authorize("ADMIN");
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    middleware({ user: { sub: "u1", email: "a", name: "A", role: "DONOR" } } as never, { status, json } as never, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
  });

  it("authenticates a valid bearer token", () => {
    const token = signToken({ sub: "u1", email: "a@b.vn", name: "A", role: "DONOR" });
    const next = jest.fn();
    authenticate({ headers: { authorization: `Bearer ${token}` } } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects missing and invalid bearer tokens", () => {
    for (const authorization of [undefined, "Bearer invalid"]) {
      const status = jest.fn().mockReturnThis(); const json = jest.fn();
      authenticate({ headers: { authorization } } as never, { status, json } as never, jest.fn());
      expect(status).toHaveBeenCalledWith(401);
    }
  });

  it("allows matching roles and protects internal routes", () => {
    const next = jest.fn();
    authorize("ADMIN")({ user: { sub: "u1", email: "a", name: "A", role: "ADMIN" } } as never, {} as never, next);
    expect(next).toHaveBeenCalled();
    const status = jest.fn().mockReturnThis(); const json = jest.fn();
    internalOnly({ headers: { "x-internal-token": "wrong" } } as never, { status, json } as never, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
  });
});
