import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { createClient } from "redis";
import { pool } from "./db";

const stream = "donation.completed";
const group = "campaign-service";
const consumer = `campaign-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const batchSize = 20;
const blockMilliseconds = 5_000;
const claimIdleMilliseconds = Number(process.env.DONATION_CLAIM_IDLE_MS ?? 30_000);
const reconnectMilliseconds = Number(process.env.REDIS_RECONNECT_MS ?? 2_000);

type RedisConnection = ReturnType<typeof createClient>;
type StreamEntry = [messageId: string, flatFields: string[]];

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseEntries(value: unknown): StreamEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StreamEntry => (
    Array.isArray(entry) && typeof entry[0] === "string" && Array.isArray(entry[1])
  ));
}

function parseReadResponse(response: unknown): StreamEntry[] {
  if (!Array.isArray(response)) return [];
  return response.flatMap((streamItem) => (
    Array.isArray(streamItem) ? parseEntries(streamItem[1]) : []
  ));
}

function fieldsFromFlatArray(flatFields: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let index = 0; index < flatFields.length; index += 2) {
    if (flatFields[index + 1] !== undefined) fields[flatFields[index]] = flatFields[index + 1];
  }
  return fields;
}

function validateDonationFields(fields: Record<string, string>): void {
  const amount = Number(fields.amount);
  if (!fields.event_id || !fields.campaign_id || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Invalid donation.completed event");
  }
}

async function invalidateCampaignCache(redis: RedisConnection, campaignId: string): Promise<void> {
  try {
    const cacheKeys: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: "campaigns:public:*", COUNT: 100 })) {
      cacheKeys.push(String(key));
    }
    if (cacheKeys.length) await redis.del(cacheKeys);
    await redis.del(`campaign:${campaignId}`);
  } catch (error) {
    // The database transaction and stream acknowledgement are already durable.
    // Public cache entries also expire after 60 seconds, so cache cleanup must not
    // cause a completed donation event to be retried indefinitely.
    process.stderr.write(`donation-cache-invalidation:${String(error)}\n`);
  }
}

export async function processDonationMessage(
  redis: RedisConnection,
  messageId: string,
  flatFields: string[],
): Promise<void> {
  const fields = fieldsFromFlatArray(flatFields);
  validateDonationFields(fields);
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO processed_donation_events(event_id,campaign_id,amount) VALUES($1,$2,$3)
       ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
      [fields.event_id, fields.campaign_id, fields.amount],
    );
    if (inserted.rowCount === 1) {
      await client.query(
        "UPDATE campaigns SET raised_amount=raised_amount+$1,updated_at=now() WHERE id=$2",
        [fields.amount, fields.campaign_id],
      );
      await client.query(
        `INSERT INTO campaign_escrows(campaign_id,total_donated,locked_amount,contract_state)
         VALUES($1,$2,$2,'DONATION_OPEN')
         ON CONFLICT(campaign_id) DO UPDATE SET total_donated=campaign_escrows.total_donated+EXCLUDED.total_donated,
           locked_amount=campaign_escrows.locked_amount+EXCLUDED.locked_amount,
           contract_state='DONATION_OPEN',updated_at=now()`,
        [fields.campaign_id, fields.amount],
      );
      await client.query(
        `INSERT INTO escrow_state_history(campaign_id,state,amount,source_event_id)
         VALUES($1,'DONATION_OPEN',$2,$3) ON CONFLICT(source_event_id,state) DO NOTHING`,
        [fields.campaign_id, fields.amount, fields.event_id],
      );
    }
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // A failure here leaves the entry pending. XAUTOCLAIM will deliver it again;
  // processed_donation_events makes that retry financially idempotent.
  await redis.xAck(stream, group, messageId);
  await invalidateCampaignCache(redis, fields.campaign_id);
}

async function processEntries(redis: RedisConnection, entries: StreamEntry[]): Promise<void> {
  for (const [messageId, flatFields] of entries) {
    try {
      await processDonationMessage(redis, messageId, flatFields);
    } catch (error) {
      // Do not acknowledge failures. The message becomes eligible for XAUTOCLAIM
      // after DONATION_CLAIM_IDLE_MS and is retried safely.
      process.stderr.write(`donation-consumer:${String(error)}\n`);
    }
  }
}

export async function consumeDonationBatch(redis: RedisConnection): Promise<void> {
  const claimedResponse = await redis.sendCommand([
    "XAUTOCLAIM", stream, group, consumer, String(claimIdleMilliseconds), "0-0",
    "COUNT", String(batchSize),
  ]) as unknown;
  const claimedEntries = Array.isArray(claimedResponse) ? parseEntries(claimedResponse[1]) : [];
  if (claimedEntries.length) {
    await processEntries(redis, claimedEntries);
    return;
  }

  const response = await redis.sendCommand([
    "XREADGROUP", "GROUP", group, consumer, "COUNT", String(batchSize),
    "BLOCK", String(blockMilliseconds), "STREAMS", stream, ">",
  ]) as unknown;
  await processEntries(redis, parseReadResponse(response));
}

async function consumeConnected(redis: RedisConnection, signal?: AbortSignal): Promise<void> {
  while (redis.isOpen && !signal?.aborted) await consumeDonationBatch(redis);
}

type DonationConsumerOptions = {
  signal?: AbortSignal;
  createRedis?: () => RedisConnection;
  reconnectDelayMs?: number;
};

export async function startDonationConsumer(options: DonationConsumerOptions = {}): Promise<void> {
  while (!options.signal?.aborted) {
    const redis = options.createRedis?.() ?? createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
    redis.on("error", (error) => process.stderr.write(`redis:${String(error)}\n`));
    try {
      await redis.connect();
      try {
        await redis.xGroupCreate(stream, group, "0", { MKSTREAM: true });
      } catch (error) {
        if (!String(error).includes("BUSYGROUP")) throw error;
      }
      await consumeConnected(redis, options.signal);
    } catch (error) {
      process.stderr.write(`donation-consumer-connection:${String(error)}\n`);
    } finally {
      if (redis.isOpen) {
        try { await redis.disconnect(); } catch { /* connection is already unusable */ }
      }
    }
    if (!options.signal?.aborted) await delay(options.reconnectDelayMs ?? reconnectMilliseconds);
  }
}

export async function startImpactOutboxPublisher(): Promise<void> {
  const publisher = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  publisher.on("error", (error) => process.stderr.write(`impact-publisher:${String(error)}\n`));
  await publisher.connect();
  while (publisher.isOpen) {
    try {
      const rows = await pool.query<{ id: string; event_type: string; payload: Record<string, unknown> }>(
        "SELECT id,event_type,payload FROM campaign_outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 50",
      );
      for (const row of rows.rows) {
        const fields = Object.fromEntries(Object.entries(row.payload).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
        await publisher.xAdd(row.event_type === "campaign.update" ? "campaign.updates" : "transparency.record", "*", fields);
        await pool.query("UPDATE campaign_outbox_events SET published_at=now() WHERE id=$1", [row.id]);
      }
    } catch (error) {
      process.stderr.write(`impact-outbox:${String(error)}\n`);
    }
    await delay(1_000);
  }
}
