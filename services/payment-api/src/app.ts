import type { IncomingMessage, ServerResponse } from "node:http";
import type { CommandRunner, ReconciliationAdapter } from "@arc-canteen/payment-core";
import { bearerMatches, extractBearerToken } from "./auth";
import {
  inspectCircleSession,
  type CircleExecutable,
  type CircleSessionStatus,
} from "./circle";
import type { ServiceConfig } from "./config";
import { sendError, sendJson, requestPath } from "./http";
import type { InvoiceStore } from "./invoices";
import {
  createPaymentService,
  PaymentServiceError,
} from "./payments";
import type { PaymentStore } from "./store";

export type AppDeps = {
  config: ServiceConfig;
  invoices: InvoiceStore;
  store: PaymentStore;
  adapter: ReconciliationAdapter;
  runner: CommandRunner;
  circleExecutable: CircleExecutable;
  databaseReady?: () => Promise<boolean>;
  now?: () => Date;
};

const INVOICE_PAY = /^\/v1\/invoices\/([^/]+)\/pay$/;
const PAYMENT = /^\/v1\/payments\/([^/]+)$/;
const PAYMENT_RECONCILE = /^\/v1\/payments\/([^/]+)\/reconcile$/;

export function createPaymentHandler(deps: AppDeps) {
  const payments = createPaymentService(deps);

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path = requestPath(req);
      const method = req.method ?? "GET";

      if (method === "GET" && path === "/health") {
        const session = await inspectCircleSession(deps.runner, deps.circleExecutable);
        if (!session.ok) {
          sendJson(res, 503, healthBody("unavailable", session));
          return;
        }
        sendJson(res, 200, healthBody("ok", session));
        return;
      }

      if (method === "GET" && path === "/ready") {
        const [session, database] = await Promise.all([
          inspectCircleSession(deps.runner, deps.circleExecutable),
          deps.databaseReady ? deps.databaseReady() : Promise.resolve(true),
        ]);
        const ready = session.ok && database;
        sendJson(res, ready ? 200 : 503, {
          status: ready ? "ready" : "not_ready",
          database: database ? "ok" : "unavailable",
          circleSession: session.ok ? "ok" : session.reason,
          detail: session.ok ? undefined : session.detail,
        });
        return;
      }

      if (!authorize(req, deps.config.bearerToken)) {
        sendError(res, 401, "unauthorized", "Missing or invalid bearer token");
        return;
      }

      const invoicePay = path.match(INVOICE_PAY);
      if (method === "POST" && invoicePay?.[1]) {
        sendJson(res, 200, await payments.pay(invoicePay[1]));
        return;
      }

      const reconcile = path.match(PAYMENT_RECONCILE);
      if (method === "POST" && reconcile?.[1]) {
        sendJson(res, 200, await payments.reconcile(reconcile[1]));
        return;
      }

      const payment = path.match(PAYMENT);
      if (method === "GET" && payment?.[1]) {
        sendJson(res, 200, await payments.status(payment[1]));
        return;
      }

      sendError(res, 404, "not_found", "Route not found");
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        sendError(res, error.status, error.code, error.message);
        return;
      }
      sendError(res, 500, "internal_error", "Internal error");
    }
  };
}

function authorize(req: IncomingMessage, expected: string) {
  const token = extractBearerToken(req);
  return Boolean(token && bearerMatches(token, expected));
}

function healthBody(status: "ok" | "unavailable", session: CircleSessionStatus) {
  return {
    status,
    circleSession: session.ok ? "ok" : session.reason,
    detail: session.ok ? undefined : session.detail,
  };
}
