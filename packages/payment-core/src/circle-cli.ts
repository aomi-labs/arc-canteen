import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ARC_TESTNET_USDC,
  formatUsdc,
  isHexHash,
  sameAddress,
  type ApprovedPaymentIntent,
  type HexAddress,
  type JsonValue,
  type ReconciliationAdapter,
  type SettlementReceipt,
} from "./domain";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export interface CommandRunner {
  run(executable: string, args: readonly string[]): Promise<CommandResult>;
}

const execFileAsync = promisify(execFile);

export const CIRCLE_CLI_TIMEOUT_MS = 135_000;

export class CircleCliTimeoutError extends Error {
  readonly code = "ETIMEDOUT";

  constructor(message = "Circle CLI timed out") {
    super(message);
    this.name = "CircleCliTimeoutError";
  }
}

export function isExecTimeout(error: unknown): boolean {
  if (error instanceof CircleCliTimeoutError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as { code?: unknown; killed?: unknown; message?: unknown };
  return (
    err.code === "ETIMEDOUT" ||
    err.killed === true ||
    (typeof err.message === "string" && /timed out/i.test(err.message))
  );
}

export class NodeCommandRunner implements CommandRunner {
  constructor(
    private readonly options: {
      timeoutMs?: number;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) {}

  async run(executable: string, args: readonly string[]) {
    try {
      const { stdout, stderr } = await execFileAsync(executable, [...args], {
        encoding: "utf8",
        timeout: this.options.timeoutMs ?? CIRCLE_CLI_TIMEOUT_MS,
        env: this.options.env,
      });
      return { stdout: String(stdout), stderr: String(stderr) };
    } catch (error) {
      if (isExecTimeout(error)) {
        throw new CircleCliTimeoutError();
      }
      throw error;
    }
  }
}

type CircleTransferResult = {
  data?: {
    id?: string;
    state?: string;
    txHash?: string;
  };
  error?: { code?: string; message?: string } | string;
};

export type CircleCliAdapterOptions = {
  token?: HexAddress;
  executable?: string;
  prefixArgs?: readonly string[];
};

export class CircleCliSettlementAdapter implements ReconciliationAdapter {
  private readonly token: HexAddress;
  private readonly executable: string;
  private readonly prefixArgs: readonly string[];

  constructor(
    private readonly wallet: HexAddress,
    private readonly runner: CommandRunner,
    options: CircleCliAdapterOptions = {},
  ) {
    this.token = options.token ?? ARC_TESTNET_USDC;
    this.executable = options.executable ?? "circle";
    this.prefixArgs = options.prefixArgs ?? [];
  }

  async settle(intent: ApprovedPaymentIntent): Promise<SettlementReceipt> {
    return this.submit(intent);
  }

  async reconcile(intent: ApprovedPaymentIntent): Promise<SettlementReceipt> {
    return this.submit(intent);
  }

  transferArgs(intent: ApprovedPaymentIntent): string[] {
    return [
      ...this.prefixArgs,
      "wallet",
      "transfer",
      intent.recipient,
      "--amount",
      formatUsdc(intent.amountUsdcMicros),
      "--address",
      this.wallet,
      "--chain",
      intent.chain,
      "--token",
      this.token,
      "--idempotency-key",
      intent.id,
      "--output",
      "json",
    ];
  }

  private async submit(
    intent: ApprovedPaymentIntent,
  ): Promise<SettlementReceipt> {
    if (!sameAddress(intent.source, this.wallet)) {
      throw new Error("Approved source does not match the Circle agent wallet");
    }

    let result: CommandResult;
    try {
      result = await this.runner.run(this.executable, this.transferArgs(intent));
    } catch (error) {
      if (isExecTimeout(error)) {
        return unresolvedReceipt(intent, {
          providerStatus: "TIMEOUT",
          providerPayload: { error: "circle_cli_timeout" },
        });
      }
      throw error;
    }

    return receiptFromCircleOutput(intent, result.stdout);
  }
}

export function receiptFromCircleOutput(
  intent: ApprovedPaymentIntent,
  stdout: string,
): SettlementReceipt {
  let parsed: CircleTransferResult;
  try {
    parsed = parseJsonOutput(stdout) as CircleTransferResult;
  } catch {
    return unresolvedReceipt(intent, {
      providerStatus: "INVALID_OUTPUT",
      providerPayload: { raw: truncate(stdout) },
    });
  }

  const state = parsed.data?.state?.toUpperCase();
  const txHash = parsed.data?.txHash;
  const payload = sanitizeProviderPayload(parsed);
  const settled = state === "CONFIRMED" || state === "COMPLETE";

  if (!settled || !txHash || !isHexHash(txHash)) {
    return unresolvedReceipt(intent, {
      providerId: parsed.data?.id,
      providerStatus: state,
      providerPayload: payload,
    });
  }

  return {
    intentId: intent.id,
    provider: "circle-agent-wallet",
    providerId: parsed.data?.id,
    providerStatus: state,
    providerPayload: payload,
    status: "confirmed",
    txHash,
  };
}

export function parseJsonOutput(stdout: string): JsonValue {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as JsonValue;
    }
    throw new Error("invalid_circle_output");
  }
}

const SENSITIVE_KEY =
  /^(otp|one[_-]?time|private[_-]?key|secret|mnemonic|seed|password|authorization|keychain)$/i;

export function sanitizeProviderPayload(value: unknown): JsonValue {
  return sanitizeValue(value) ?? null;
}

function sanitizeValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry) ?? null);
  }
  if (value && typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        continue;
      }
      result[key] = sanitizeValue(entry) ?? null;
    }
    return result;
  }
  return undefined;
}

function unresolvedReceipt(
  intent: ApprovedPaymentIntent,
  details: Partial<SettlementReceipt>,
): SettlementReceipt {
  return {
    intentId: intent.id,
    provider: "circle-agent-wallet",
    status: "unresolved",
    ...details,
  };
}

function truncate(value: string, max = 2_000) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
