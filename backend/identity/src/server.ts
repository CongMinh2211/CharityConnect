import { app } from "./app";
import { bootstrapAdmin } from "./bootstrap";
import { runMigrations } from "./migrations";
import { startNotificationWorkers } from "./notifications";

const port = Number(process.env.PORT ?? 3001);

void (async () => {
  await runMigrations();
  await bootstrapAdmin();
  app.listen(port, () => process.stdout.write(`identity-service:${port}\n`));
  void startNotificationWorkers().catch((error) => process.stderr.write(`identity-workers:${String(error)}\n`));
})().catch((error) => {
  process.stderr.write(`identity-start:${String(error)}\n`);
  process.exit(1);
});
