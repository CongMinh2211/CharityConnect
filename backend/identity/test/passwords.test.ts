const queryMock = jest.fn();
jest.mock("../src/db", () => ({ query: queryMock }));

import { updatePasswordWithHistory } from "../src/passwords";

describe("password persistence", () => {
  beforeEach(() => queryMock.mockReset().mockResolvedValue([]));

  it("does not archive NULL when a Google-only user creates a local password", async () => {
    await updatePasswordWithHistory("google-user", "bcrypt-hash");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE password_hash IS NOT NULL"),
      ["google-user", "bcrypt-hash"],
    );
  });
});
