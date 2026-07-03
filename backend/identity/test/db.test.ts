const mockPoolQuery = jest.fn();
jest.mock("pg", () => ({ Pool: jest.fn(() => ({ query: mockPoolQuery })) }));

import { audit, query } from "../src/db";

describe("identity database adapter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns query rows", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: "u1" }] });
    await expect(query("SELECT $1", ["u1"])).resolves.toEqual([{ id: "u1" }]);
  });

  it("writes audit records", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    await audit("admin", "ORGANIZATION_VERIFIED", "ORGANIZATION", "o1", { status: "PENDING" }, { status: "VERIFIED" });
    expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_logs"), expect.any(Array));
  });
});
