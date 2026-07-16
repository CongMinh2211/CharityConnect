jest.mock("../src/db", () => ({ query: jest.fn() }));

import { bootstrapAdmin } from "../src/bootstrap";
import { query } from "../src/db";

const queryMock = query as jest.MockedFunction<typeof query>;

describe("identity admin bootstrap", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; jest.clearAllMocks(); });

  it("does nothing when an admin already exists", async () => {
    queryMock.mockResolvedValueOnce([{ id: "admin-1" }] as never);
    await bootstrapAdmin();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("creates the only initial admin with a bcrypt hash", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ADMIN_INITIAL_PASSWORD = "StrongAdmin@123";
    queryMock.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
    await bootstrapAdmin();
    expect(queryMock.mock.calls[1][1]?.[0]).toBe("owner@example.com");
    expect(String(queryMock.mock.calls[1][1]?.[1])).toMatch(/^\$2[aby]\$/);
    expect(String(queryMock.mock.calls[1][1]?.[1])).not.toContain("StrongAdmin@123");
  });

  it("rejects production bootstrap without credentials", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_INITIAL_PASSWORD;
    queryMock.mockResolvedValueOnce([] as never);
    await expect(bootstrapAdmin()).rejects.toThrow("ADMIN_EMAIL");
  });
});
