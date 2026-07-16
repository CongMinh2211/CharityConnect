const connectMock = jest.fn();
jest.mock("../src/db", () => ({
  pool: {
    connect: (...args: unknown[]) => connectMock(...args),
    query: jest.fn(),
  },
}));

import { consumeDonationBatch, processDonationMessage, startDonationConsumer } from "../src/stream";

const eventId = "11111111-1111-1111-1111-111111111111";
const campaignId = "22222222-2222-2222-2222-222222222222";
const fields = ["event_id", eventId, "campaign_id", campaignId, "amount", "50000"];

function redisDouble(commandResponses: unknown[] = []) {
  return {
    isOpen: true,
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockImplementation(async function (this: { isOpen: boolean }) { this.isOpen = false; }),
    xGroupCreate: jest.fn().mockResolvedValue("OK"),
    sendCommand: jest.fn().mockImplementation(async () => commandResponses.shift() ?? null),
    xAck: jest.fn().mockResolvedValue(1),
    scanIterator: jest.fn().mockImplementation(async function* () { yield "campaigns:public:all"; }),
    del: jest.fn().mockResolvedValue(1),
  };
}

function databaseDouble(inserted = true) {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO processed_donation_events")) return { rowCount: inserted ? 1 : 0, rows: inserted ? [{ event_id: eventId }] : [] };
    return { rowCount: 1, rows: [] };
  });
  const release = jest.fn();
  connectMock.mockResolvedValue({ query, release });
  return { query, release };
}

describe("donation stream consumer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("applies a new event once and acknowledges it after commit", async () => {
    const database = databaseDouble(true);
    const redis = redisDouble([
      ["0-0", [], []],
      [["donation.completed", [["1-0", fields]]]],
    ]);

    await consumeDonationBatch(redis as never);

    expect(database.query).toHaveBeenCalledWith("COMMIT");
    expect(database.query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE campaigns SET raised_amount"))).toHaveLength(1);
    expect(redis.xAck).toHaveBeenCalledWith("donation.completed", "campaign-service", "1-0");
    expect(redis.del).toHaveBeenCalledWith(`campaign:${campaignId}`);
  });

  it("acknowledges a duplicate without adding campaign or escrow money again", async () => {
    const database = databaseDouble(false);
    const redis = redisDouble();

    await processDonationMessage(redis as never, "2-0", fields);

    expect(database.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE campaigns SET raised_amount"))).toBe(false);
    expect(database.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO campaign_escrows"))).toBe(false);
    expect(database.query).toHaveBeenCalledWith("COMMIT");
    expect(redis.xAck).toHaveBeenCalledWith("donation.completed", "campaign-service", "2-0");
  });

  it("processes stale pending entries returned by XAUTOCLAIM before new entries", async () => {
    databaseDouble(true);
    const redis = redisDouble([["0-0", [["3-0", fields]], []]]);

    await consumeDonationBatch(redis as never);

    expect(redis.sendCommand).toHaveBeenCalledTimes(1);
    expect(redis.sendCommand.mock.calls[0][0][0]).toBe("XAUTOCLAIM");
    expect(redis.xAck).toHaveBeenCalledWith("donation.completed", "campaign-service", "3-0");
  });

  it("rolls back and leaves a failed event pending for later recovery", async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO processed_donation_events")) throw new Error("database unavailable");
      return { rowCount: 1, rows: [] };
    });
    connectMock.mockResolvedValue({ query, release: jest.fn() });
    const redis = redisDouble();

    await expect(processDonationMessage(redis as never, "4-0", fields)).rejects.toThrow("database unavailable");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(redis.xAck).not.toHaveBeenCalled();
  });

  it("reconnects after an initial Redis connection failure", async () => {
    const abort = new AbortController();
    const failed = redisDouble();
    failed.isOpen = false;
    failed.connect.mockRejectedValueOnce(new Error("redis starting"));
    const recovered = redisDouble([["0-0", [], []], null]);
    recovered.sendCommand.mockImplementation(async () => {
      abort.abort();
      return ["0-0", [], []];
    });
    const createRedis = jest.fn()
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(recovered);
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);

    await startDonationConsumer({ signal: abort.signal, createRedis: createRedis as never, reconnectDelayMs: 0 });

    expect(createRedis).toHaveBeenCalledTimes(2);
    expect(recovered.connect).toHaveBeenCalledTimes(1);
    expect(recovered.xGroupCreate).toHaveBeenCalledWith("donation.completed", "campaign-service", "0", { MKSTREAM: true });
    stderr.mockRestore();
  });
});
