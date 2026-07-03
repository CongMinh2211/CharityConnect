import jwt from "jsonwebtoken";
import { authenticate, authorize, internalOnly } from "../src/auth";

const secret = "local-charityconnect-secret";
const token = jwt.sign({ sub: "u1", email: "a@test.vn", name: "A", role: "ADMIN" }, secret);

describe("campaign authorization", () => {
  it("authenticates valid tokens", () => {
    const next = jest.fn();
    authenticate({ headers: { authorization: `Bearer ${token}` } } as never, {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects invalid tokens and roles", () => {
    const status = jest.fn().mockReturnThis(); const json = jest.fn();
    authenticate({ headers: {} } as never, { status, json } as never, jest.fn());
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
});

