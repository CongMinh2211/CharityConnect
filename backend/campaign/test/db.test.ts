const mockPoolQuery = jest.fn();
jest.mock("pg", () => ({ Pool: jest.fn(() => ({ query: mockPoolQuery })) }));

import { audit, query } from "../src/db";

describe("campaign database adapter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns rows from parameterized queries", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: "c1" }] });
    await expect(query("SELECT $1", ["c1"])).resolves.toEqual([{ id: "c1" }]);
  });

  it("writes audit records", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    await audit("admin", "CAMPAIGN_APPROVED", "c1", { status: "PENDING_REVIEW" }, { status: "APPROVED" });
    expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_logs"), expect.any(Array));
  });
});
