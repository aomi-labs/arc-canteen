import { createServer } from "node:http";
import {
  CircleCliSettlementAdapter,
  NodeCommandRunner,
} from "@arc-canteen/payment-core";
import { loadConfig } from "./config";
import { circleProcessEnv, resolveCircleExecutable } from "./circle";
import {
  InMemoryInvoiceStore,
  parseInvoiceFixtures,
  type InvoiceStore,
} from "./invoices";
import { InMemoryPaymentStore, type PaymentStore } from "./store";
import {
  createPool,
  migrate,
  PostgresInvoiceStore,
  PostgresPaymentStore,
} from "./postgres";
import { createPaymentHandler } from "./app";

const config = loadConfig();
if (process.env.NODE_ENV === "production" && !config.databaseUrl) {
  throw new Error("DATABASE_URL is required in production");
}
const fixtures = parseInvoiceFixtures(
  process.env.APPROVED_INVOICES_JSON,
  config.chain,
);

const pool = config.databaseUrl ? createPool(config.databaseUrl) : undefined;
if (pool) {
  await migrate(pool);
}

const invoices: InvoiceStore = pool
  ? new PostgresInvoiceStore(pool)
  : new InMemoryInvoiceStore(fixtures);
const store: PaymentStore = pool
  ? new PostgresPaymentStore(pool)
  : new InMemoryPaymentStore();

if (pool) {
  for (const invoice of fixtures) {
    await invoices.upsert(invoice);
  }
}

const circleExecutable = resolveCircleExecutable(config.circleCliBin);
const runner = new NodeCommandRunner({
  env: circleProcessEnv(config.circleCliHome),
});
const adapter = new CircleCliSettlementAdapter(config.circleWallet, runner, {
  token: config.usdcToken,
  executable: circleExecutable.executable,
  prefixArgs: circleExecutable.prefixArgs,
});

const handler = createPaymentHandler({
  config,
  invoices,
  store,
  adapter,
  runner,
  circleExecutable,
  databaseReady: pool
    ? async () => {
        try {
          await pool.query("SELECT 1");
          return true;
        } catch {
          return false;
        }
      }
    : undefined,
});

const server = createServer((req, res) => {
  void handler(req, res);
});

server.listen(config.port, config.host, () => {
  process.stdout.write(
    `payment-api listening on ${config.host}:${config.port}\n`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool?.end().finally(() => process.exit(0));
    });
  });
}
