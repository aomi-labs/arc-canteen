import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  CIRCLE_CLI_PACKAGE,
  CIRCLE_CLI_VERSION,
  parseJsonOutput,
  type CommandRunner,
  type JsonValue,
} from "@arc-canteen/payment-core";

export type CircleSessionStatus =
  | {
      ok: true;
      environment: "testnet" | "mainnet" | "unknown";
      email?: string;
      expiresAt?: string;
    }
  | {
      ok: false;
      reason: "absent" | "expired" | "not_testnet" | "error";
      detail: string;
    };

export type CircleExecutable = {
  executable: string;
  prefixArgs: string[];
};

export function resolveCircleExecutable(
  override?: string,
  execPath = process.execPath,
): CircleExecutable {
  if (override) {
    return override.endsWith(".js")
      ? { executable: execPath, prefixArgs: [override] }
      : { executable: override, prefixArgs: [] };
  }

  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve(`${CIRCLE_CLI_PACKAGE}/package.json`);
  const pkg = require(pkgPath) as { version?: string };
  if (pkg.version !== CIRCLE_CLI_VERSION) {
    throw new Error(
      `Expected ${CIRCLE_CLI_PACKAGE}@${CIRCLE_CLI_VERSION}, found ${pkg.version ?? "unknown"}`,
    );
  }
  return {
    executable: execPath,
    prefixArgs: [join(dirname(pkgPath), "dist", "index.js")],
  };
}

export function circleProcessEnv(
  home = process.env.CIRCLE_CLI_HOME,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    CIRCLE_VERSION_CHECK: env.CIRCLE_VERSION_CHECK ?? "off",
    ...(home
      ? {
          CIRCLE_CLI_HOME: home,
          HOME: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_STATE_HOME: join(home, ".local", "state"),
          XDG_DATA_HOME: join(home, ".local", "share"),
        }
      : {}),
  };
}

export async function inspectCircleSession(
  runner: CommandRunner,
  executable: CircleExecutable,
): Promise<CircleSessionStatus> {
  let stdout = "";
  let stderr = "";
  try {
    const result = await runner.run(executable.executable, [
      ...executable.prefixArgs,
      "wallet",
      "status",
      "--type",
      "agent",
      "--output",
      "json",
    ]);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return classifySessionText(message);
  }

  const combined = `${stdout}\n${stderr}`;
  const fromText = classifySessionText(combined);
  if (!fromText.ok && fromText.reason !== "error") {
    return fromText;
  }

  try {
    return classifySessionJson(parseJsonOutput(stdout));
  } catch {
    return fromText.ok
      ? fromText
      : { ok: false, reason: "error", detail: "Circle session status was not JSON" };
  }
}

export function classifySessionText(text: string): CircleSessionStatus {
  if (/not logged in/i.test(text) || /no (active )?session/i.test(text)) {
    return { ok: false, reason: "absent", detail: "Circle testnet session is absent" };
  }
  if (/session (has )?expired/i.test(text) || /expired session/i.test(text)) {
    return { ok: false, reason: "expired", detail: "Circle testnet session is expired" };
  }
  return { ok: false, reason: "error", detail: text.trim().slice(0, 300) || "unknown" };
}

export function classifySessionJson(value: JsonValue): CircleSessionStatus {
  const root = asObject(value);
  const data = asObject(root?.data) ?? root;
  if (!data) {
    return { ok: false, reason: "error", detail: "Circle session status was empty" };
  }

  const message = stringify(data.error) ?? stringify(root?.error) ?? "";
  if (message) {
    return classifySessionText(message);
  }

  const authenticated = readBoolean(
    data.authenticated ?? data.loggedIn ?? data.logged_in,
  );
  if (authenticated === false) {
    return { ok: false, reason: "absent", detail: "Circle testnet session is absent" };
  }

  const expiresAt = readString(
    data.expiresAt ?? data.expires_at ?? asObject(data.session)?.expiresAt,
  );
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    return { ok: false, reason: "expired", detail: "Circle testnet session is expired" };
  }

  const environment = readEnvironment(data);
  if (environment === "mainnet") {
    return {
      ok: false,
      reason: "not_testnet",
      detail: "Circle session is not a testnet session",
    };
  }

  if (authenticated !== true && !readString(data.email)) {
    return { ok: false, reason: "absent", detail: "Circle testnet session is absent" };
  }

  return {
    ok: true,
    environment,
    email: readString(data.email),
    expiresAt,
  };
}

function readEnvironment(
  data: { [key: string]: JsonValue },
): "testnet" | "mainnet" | "unknown" {
  if (data.testnet === true) {
    return "testnet";
  }
  if (data.testnet === false) {
    return "mainnet";
  }
  const raw = (
    readString(data.environment) ??
    readString(data.network) ??
    readString(data.mode) ??
    ""
  ).toLowerCase();
  if (raw.includes("test")) {
    return "testnet";
  }
  if (raw.includes("main")) {
    return "mainnet";
  }
  return "unknown";
}

function asObject(value: JsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function readBoolean(value: JsonValue | undefined) {
  return typeof value === "boolean" ? value : undefined;
}

function readString(value: JsonValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringify(value: JsonValue | undefined) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return readString(value.message) ?? readString(value.code);
  }
  return undefined;
}
