import { app } from "./app";
import { startDonationConsumer, startImpactOutboxPublisher } from "./stream";

const port = Number(process.env.PORT ?? 3002);
app.listen(port, () => process.stdout.write(`campaign-service:${port}\n`));
void startDonationConsumer().catch((error) => process.stderr.write(`consumer-start:${String(error)}\n`));
void startImpactOutboxPublisher().catch((error) => process.stderr.write(`publisher-start:${String(error)}\n`));
