import { createClient } from "redis";
import { pool } from "./db";

const stream = "donation.completed";
const group = "campaign-service";
const consumer = `campaign-${process.pid}`;

export async function startDonationConsumer(): Promise<void> {
  const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  redis.on("error", (error) => process.stderr.write(`redis:${String(error)}\n`));
  await redis.connect();
  try { await redis.xGroupCreate(stream, group, "0", { MKSTREAM: true }); } catch (error) {
    if (!String(error).includes("BUSYGROUP")) throw error;
  }

  const consume = async (): Promise<void> => {
    while (redis.isOpen) {
      const response = await redis.sendCommand([
        "XREADGROUP", "GROUP", group, consumer, "COUNT", "20", "BLOCK", "5000", "STREAMS", stream, ">"
      ]) as unknown;
      if (!Array.isArray(response)) continue;
      for (const streamItem of response as [string, [string, string[]][]][]) {
        for (const [messageId, flatFields] of streamItem[1]) {
          const fields: Record<string, string> = {};
          for (let i = 0; i < flatFields.length; i += 2) fields[flatFields[i]] = flatFields[i + 1];
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const inserted = await client.query(
              `INSERT INTO processed_donation_events(event_id,campaign_id,amount) VALUES($1,$2,$3)
               ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
              [fields.event_id, fields.campaign_id, fields.amount]
            );
            if (inserted.rowCount === 1) {
              await client.query("UPDATE campaigns SET raised_amount=raised_amount+$1,updated_at=now() WHERE id=$2", [fields.amount, fields.campaign_id]);
              await client.query(
                `INSERT INTO campaign_escrows(campaign_id,total_donated,locked_amount,contract_state)
                 VALUES($1,$2,$2,'DONATION_OPEN')
                 ON CONFLICT(campaign_id) DO UPDATE SET total_donated=campaign_escrows.total_donated+EXCLUDED.total_donated,
                   locked_amount=campaign_escrows.locked_amount+EXCLUDED.locked_amount,
                   contract_state='DONATION_OPEN',updated_at=now()`,
                [fields.campaign_id, fields.amount]
              );
              await client.query(
                `INSERT INTO escrow_state_history(campaign_id,state,amount,source_event_id)
                 VALUES($1,'DONATION_OPEN',$2,$3) ON CONFLICT(source_event_id,state) DO NOTHING`,
                [fields.campaign_id, fields.amount, fields.event_id]
              );
            }
            await client.query("COMMIT");
            await redis.xAck(stream, group, messageId);
            const cacheKeys: string[] = [];
            for await (const key of redis.scanIterator({ MATCH: "campaigns:public:*", COUNT: 100 })) cacheKeys.push(String(key));
            if (cacheKeys.length) await redis.del(cacheKeys);
            await redis.del(`campaign:${fields.campaign_id}`);
          } catch (error) {
            await client.query("ROLLBACK");
            process.stderr.write(`donation-consumer:${String(error)}\n`);
          } finally { client.release(); }
        }
      }
    }
  };
  void consume();
}

export async function startImpactOutboxPublisher(): Promise<void> {
  const publisher = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  publisher.on("error", (error) => process.stderr.write(`impact-publisher:${String(error)}\n`));
  await publisher.connect();
  while (publisher.isOpen) {
    try {
      const rows = await pool.query<{ id: string; event_type: string; payload: Record<string, unknown> }>(
        "SELECT id,event_type,payload FROM campaign_outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 50"
      );
      for (const row of rows.rows) {
        const fields = Object.fromEntries(Object.entries(row.payload).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
        await publisher.xAdd(row.event_type === "campaign.update" ? "campaign.updates" : "transparency.record", "*", fields);
        await pool.query("UPDATE campaign_outbox_events SET published_at=now() WHERE id=$1", [row.id]);
      }
    } catch (error) {
      process.stderr.write(`impact-outbox:${String(error)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
