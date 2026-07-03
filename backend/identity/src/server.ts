import { app } from "./app";
import { startNotificationWorkers } from "./notifications";

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => process.stdout.write(`identity-service:${port}\n`));

void startNotificationWorkers().catch((error) => process.stderr.write(`identity-workers:${String(error)}\n`));
