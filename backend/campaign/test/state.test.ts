import { canTransition, isDonationEligible } from "../src/state";

describe("campaign state machine", () => {
  it("allows the review lifecycle and resubmission", () => {
    expect(canTransition("DRAFT", "PENDING_REVIEW")).toBe(true);
    expect(canTransition("PENDING_REVIEW", "REJECTED")).toBe(true);
    expect(canTransition("REJECTED", "PENDING_REVIEW")).toBe(true);
    expect(canTransition("PENDING_REVIEW", "APPROVED")).toBe(true);
  });

  it("blocks donations for closed or expired campaigns", () => {
    expect(isDonationEligible("CLOSED", new Date(Date.now() + 1000))).toBe(false);
    expect(isDonationEligible("APPROVED", new Date(Date.now() - 1000))).toBe(false);
    expect(isDonationEligible("APPROVED", new Date(Date.now() + 1000))).toBe(true);
  });
});

