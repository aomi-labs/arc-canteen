import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  evaluatePayment,
  formatUsdc,
  isHexAddress,
  isHexHash,
  sanitizeProviderPayload,
  type HexAddress,
  type HexHash,
  type JsonValue,
  type PaymentIntent,
  type PaymentPolicy,
  type PolicyDecision,
  type PolicyRejection,
} from "../packages/payment-core/src/index";

const execFileAsync = promisify(execFile);

export const ARC_TESTNET_CHAIN_ID = "5042002";
export const ARC_TESTNET_EXPLORER = "https://testnet.arcscan.app";
export const DOCUMENTED_ACTION_ID = "action-1";
export const LIVE_E2E_ENV = "RUN_LIVE_E2E";
export const UNAPPROVED_RECIPIENT =
  "0x3333333333333333333333333333333333333333" as HexAddress;

const AOMI_TIMEOUT_MS = 180_000;
const SENSITIVE_ENV_KEYS = [
  "PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
  "AOMI_ACCOUNT_BEARER",
  "AOMI_API_KEY",
  "AOMI_API_TOKEN",
] as const;

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export interface CommandRunner {
  run(
    executable: string,
    args: readonly string[],
    options?: { env?: NodeJS.ProcessEnv },
  ): Promise<CommandResult>;
}

export type ExecutionStep = "chat" | "list" | "simulate" | "sign";

export type PlannedCommand = {
  step: ExecutionStep;
  executable: "aomi";
  args: readonly string[];
};

export type EoaFixture = {
  intent: PaymentIntent;
  policy: PaymentPolicy;
  unapprovedRecipient: HexAddress;
};

export type EoaLaneMode = "dry-run" | "live";

export type EoaLaneResult = {
  status: "approved-dry-run" | "refused" | "confirmed" | "unresolved" | "blocked";
  mode: EoaLaneMode;
  reason?: PolicyRejection | "missing_private_key" | "missing_live_address";
  actionId?: string;
  planned: PlannedCommand[];
  executed: PlannedCommand[];
  simulation?: JsonValue;
  txHash?: HexHash;
  explorerUrl?: string;
  error?: string;
};

export class PolicyBlockedSigningError extends Error {
  readonly reason: PolicyRejection;

  constructor(reason: PolicyRejection) {
    super(`Signing blocked by payment policy: ${reason}`);
    this.name = "PolicyBlockedSigningError";
    this.reason = reason;
  }
}

export function isLiveRequested(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
) {
  if (argv.includes("--dry-run")) {
    return false;
  }
  return env[LIVE_E2E_ENV] === "1";
}

export function hasPrivateKey(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.PRIVATE_KEY);
}

export function isSigningCommand(args: readonly string[]) {
  return args[0] === "tx" && args[1] === "sign";
}

export function assertSigningAllowed(decision: PolicyDecision) {
  if (decision.status !== "approved") {
    throw new PolicyBlockedSigningError(decision.reason);
  }
  return decision.intent;
}

export function chatPrompt(intent: PaymentIntent) {
  return `Send ${formatUsdc(intent.amountUsdcMicros)} test USDC on Arc Testnet to ${intent.recipient}`;
}

export function planAomiCommands(
  intent: PaymentIntent,
  actionId = DOCUMENTED_ACTION_ID,
  options: { rpcUrl?: string } = {},
): PlannedCommand[] {
  const chat: PlannedCommand = {
    step: "chat",
    executable: "aomi",
    args: [
      "chat",
      chatPrompt(intent),
      "--new-session",
      "--public-key",
      intent.source,
      "--chain",
      ARC_TESTNET_CHAIN_ID,
    ],
  };
  const list: PlannedCommand = {
    step: "list",
    executable: "aomi",
    args: ["tx", "list"],
  };
  const simulate: PlannedCommand = {
    step: "simulate",
    executable: "aomi",
    args: ["tx", "simulate", actionId],
  };
  const signArgs = ["tx", "sign", actionId, "--eoa"];
  if (options.rpcUrl) {
    signArgs.push("--rpc-url", options.rpcUrl);
  }
  const sign: PlannedCommand = {
    step: "sign",
    executable: "aomi",
    args: signArgs,
  };
  return [chat, list, simulate, sign];
}

export function commandsBeforeSign(commands: readonly PlannedCommand[]) {
  return commands.filter((command) => command.step !== "sign");
}

export function withRecipient(
  intent: PaymentIntent,
  recipient: HexAddress,
): PaymentIntent {
  return { ...intent, recipient };
}

export function parseActionId(text: string, fallback = DOCUMENTED_ACTION_ID) {
  const qualified = text.match(/\b(?:(?:evm|svm):)?(?:action|tx)-\d+\b/i);
  return qualified?.[0] ?? fallback;
}

export function parseTxHash(text: string): HexHash | undefined {
  const match = text.match(/\b0x[a-fA-F0-9]{64}\b/);
  return match && isHexHash(match[0]) ? match[0] : undefined;
}

export function explorerUrlFor(txHash: HexHash) {
  return `${ARC_TESTNET_EXPLORER}/tx/${txHash}`;
}

export function redactSecrets(text: string, secrets: readonly string[] = []) {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out
    .replace(/PRIVATE_KEY\s*=\s*\S+/gi, "PRIVATE_KEY=[redacted]")
    .replace(/--private-key\s+\S+/gi, "--private-key [redacted]");
}

export function secretsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return SENSITIVE_ENV_KEYS.flatMap((key) => {
    const value = env[key];
    return value ? [value] : [];
  });
}

export function sanitizeCapturedText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return redactSecrets(text, secretsFromEnv(env));
}

export function formatCommand(command: PlannedCommand) {
  return [command.executable, ...command.args.map(quoteArg)].join(" ");
}

function quoteArg(value: string) {
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function parseAmount(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`Fixture ${label} must be an integer string`);
}

function requireAddress(value: unknown, label: string): HexAddress {
  if (typeof value !== "string" || !isHexAddress(value)) {
    throw new Error(`Fixture ${label} must be a 20-byte hex address`);
  }
  return value;
}

export function fixtureFromJson(value: unknown): EoaFixture {
  if (!value || typeof value !== "object") {
    throw new Error("Approved fixture must be an object");
  }
  const raw = value as {
    intent?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    unapprovedRecipient?: unknown;
  };
  if (!raw.intent || !raw.policy) {
    throw new Error("Approved fixture is missing intent or policy");
  }

  const intent: PaymentIntent = {
    id: String(raw.intent.id) as PaymentIntent["id"],
    invoiceId: String(raw.intent.invoiceId),
    chain: raw.intent.chain === "ARC" ? "ARC" : "ARC-TESTNET",
    source: requireAddress(raw.intent.source, "intent.source"),
    recipient: requireAddress(raw.intent.recipient, "intent.recipient"),
    amountUsdcMicros: parseAmount(
      raw.intent.amountUsdcMicros,
      "intent.amountUsdcMicros",
    ),
  };

  const approvedRecipients = Array.isArray(raw.policy.approvedRecipients)
    ? raw.policy.approvedRecipients.map((entry) =>
        requireAddress(entry, "policy.approvedRecipients").toLowerCase(),
      )
    : [];

  const policy: PaymentPolicy = {
    chain: raw.policy.chain === "ARC" ? "ARC" : "ARC-TESTNET",
    source: requireAddress(raw.policy.source, "policy.source"),
    approvedRecipients: new Set(approvedRecipients),
    paidInvoiceIds: new Set(
      Array.isArray(raw.policy.paidInvoiceIds)
        ? raw.policy.paidInvoiceIds.map((entry) => String(entry))
        : [],
    ),
    maxAmountUsdcMicros: parseAmount(
      raw.policy.maxAmountUsdcMicros,
      "policy.maxAmountUsdcMicros",
    ),
  };

  return {
    intent,
    policy,
    unapprovedRecipient: requireAddress(
      raw.unapprovedRecipient ?? UNAPPROVED_RECIPIENT,
      "unapprovedRecipient",
    ),
  };
}

export function applyLiveAddresses(
  fixture: EoaFixture,
  env: NodeJS.ProcessEnv = process.env,
): EoaFixture {
  const source = env.EOA_ADDRESS ?? env.AOMI_PUBLIC_KEY;
  const recipient = env.PAYMENT_RECIPIENT;
  const unapproved = env.WRONG_RECIPIENT;
  if (!source && !recipient && !unapproved) {
    return fixture;
  }

  const nextSource = source
    ? requireAddress(source, "EOA_ADDRESS")
    : fixture.intent.source;
  const nextRecipient = recipient
    ? requireAddress(recipient, "PAYMENT_RECIPIENT")
    : fixture.intent.recipient;
  const approved = new Set(fixture.policy.approvedRecipients);
  if (recipient) {
    approved.clear();
    approved.add(nextRecipient.toLowerCase());
  }

  return {
    intent: {
      ...fixture.intent,
      source: nextSource,
      recipient: nextRecipient,
    },
    policy: {
      ...fixture.policy,
      source: nextSource,
      approvedRecipients: approved,
    },
    unapprovedRecipient: unapproved
      ? requireAddress(unapproved, "WRONG_RECIPIENT")
      : fixture.unapprovedRecipient,
  };
}

export async function loadApprovedFixture(
  fixturePath = new URL("./fixtures/approved-eoa-invoice.json", import.meta.url),
): Promise<EoaFixture> {
  const raw = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
  return fixtureFromJson(raw);
}

export function evaluateFixture(intent: PaymentIntent, policy: PaymentPolicy) {
  return evaluatePayment(intent, policy);
}

export async function runEoaLane(options: {
  intent: PaymentIntent;
  policy: PaymentPolicy;
  mode: EoaLaneMode;
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  actionId?: string;
  rpcUrl?: string;
}): Promise<EoaLaneResult> {
  const env = options.env ?? process.env;
  const decision = evaluatePayment(options.intent, options.policy);
  const planned = planAomiCommands(
    options.intent,
    options.actionId ?? DOCUMENTED_ACTION_ID,
    { rpcUrl: options.rpcUrl },
  );

  if (decision.status === "rejected") {
    return {
      status: "refused",
      mode: options.mode,
      reason: decision.reason,
      planned: commandsBeforeSign(planned),
      executed: [],
    };
  }

  if (options.mode === "dry-run") {
    return {
      status: "approved-dry-run",
      mode: "dry-run",
      planned,
      executed: [],
    };
  }

  if (!hasPrivateKey(env)) {
    return {
      status: "blocked",
      mode: "live",
      reason: "missing_private_key",
      planned,
      executed: [],
      error: "PRIVATE_KEY must be set in the environment before a live sign",
    };
  }

  const runner = options.runner;
  if (!runner) {
    throw new Error("A command runner is required for live execution");
  }

  const executed: PlannedCommand[] = [];
  let actionId = options.actionId ?? DOCUMENTED_ACTION_ID;
  let simulation: JsonValue | undefined;

  try {
    for (const command of commandsBeforeSign(planned)) {
      const result = await runner.run(command.executable, command.args, {
        env: childEnv(env, command.step),
      });
      executed.push(command);
      if (command.step === "list") {
        actionId = parseActionId(result.stdout || result.stderr, actionId);
      }
      if (command.step === "simulate") {
        simulation = captureSimulation(result.stdout || result.stderr, env);
      }
    }

    const approved = assertSigningAllowed(decision);
    const signCommand: PlannedCommand = {
      step: "sign",
      executable: "aomi",
      args: planAomiCommands(approved, actionId, { rpcUrl: options.rpcUrl }).find(
        (command) => command.step === "sign",
      )!.args,
    };
    const signResult = await runner.run(signCommand.executable, signCommand.args, {
      env: childEnv(env, "sign"),
    });
    executed.push(signCommand);

    const txHash = parseTxHash(
      sanitizeCapturedText(`${signResult.stdout}\n${signResult.stderr}`, env),
    );
    if (!txHash) {
      return {
        status: "unresolved",
        mode: "live",
        actionId,
        planned: planAomiCommands(approved, actionId, { rpcUrl: options.rpcUrl }),
        executed,
        simulation,
        error: "Live sign completed without a parseable transaction hash",
      };
    }

    return {
      status: "confirmed",
      mode: "live",
      actionId,
      planned: planAomiCommands(approved, actionId, { rpcUrl: options.rpcUrl }),
      executed,
      simulation,
      txHash,
      explorerUrl: explorerUrlFor(txHash),
    };
  } catch (error) {
    if (error instanceof PolicyBlockedSigningError) {
      return {
        status: "refused",
        mode: "live",
        reason: error.reason,
        actionId,
        planned: commandsBeforeSign(planned),
        executed,
        simulation,
      };
    }
    return {
      status: "unresolved",
      mode: "live",
      actionId,
      planned,
      executed,
      simulation,
      error: sanitizeCapturedText(
        error instanceof Error ? error.message : String(error),
        env,
      ),
    };
  }
}

export class NodeAomiCommandRunner implements CommandRunner {
  constructor(private readonly timeoutMs = AOMI_TIMEOUT_MS) {}

  async run(
    executable: string,
    args: readonly string[],
    options: { env?: NodeJS.ProcessEnv } = {},
  ) {
    const { stdout, stderr } = await execFileAsync(executable, [...args], {
      encoding: "utf8",
      timeout: this.timeoutMs,
      env: options.env,
    });
    return {
      stdout: sanitizeCapturedText(String(stdout), options.env),
      stderr: sanitizeCapturedText(String(stderr), options.env),
    };
  }
}

export function evidenceDirFor(
  runDate = new Date(),
  root = path.resolve(fileURLToPath(new URL("..", import.meta.url))),
) {
  const day = runDate.toISOString().slice(0, 10);
  return path.join(root, "evidence", "arc-testnet", day);
}

export async function writeSanitizedEvidence(
  directory: string,
  bundle: Record<string, JsonValue>,
) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, "eoa-execution.json");
  const sanitized = sanitizeProviderPayload(bundle) ?? null;
  await writeFile(target, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  return target;
}

function childEnv(env: NodeJS.ProcessEnv, step: ExecutionStep): NodeJS.ProcessEnv {
  const next = { ...env };
  if (step !== "sign") {
    delete next.PRIVATE_KEY;
    delete next.SOLANA_PRIVATE_KEY;
  }
  return next;
}

function captureSimulation(text: string, env: NodeJS.ProcessEnv): JsonValue {
  const sanitized = sanitizeCapturedText(text, env);
  const start = sanitized.indexOf("{");
  const end = sanitized.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return sanitizeProviderPayload(
        JSON.parse(sanitized.slice(start, end + 1)) as JsonValue,
      );
    } catch {
      // Fall through to the truncated text capture.
    }
  }
  return sanitized.length <= 2_000 ? sanitized : `${sanitized.slice(0, 2_000)}…`;
}

function resultToJson(result: EoaLaneResult): Record<string, JsonValue> {
  return {
    status: result.status,
    mode: result.mode,
    reason: result.reason ?? null,
    actionId: result.actionId ?? null,
    planned: result.planned.map((command) => formatCommand(command)),
    executed: result.executed.map((command) => formatCommand(command)),
    simulation: result.simulation ?? null,
    txHash: result.txHash ?? null,
    explorerUrl: result.explorerUrl ?? null,
    error: result.error ?? null,
  };
}

function printLane(label: string, result: EoaLaneResult) {
  console.log(`[${label}] ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
  if (result.status === "refused") {
    console.log("signing command skipped");
  }
  const commands =
    result.mode === "dry-run" || result.executed.length === 0
      ? result.planned
      : result.executed;
  for (const command of commands) {
    console.log(`  ${formatCommand(command)}`);
  }
  if (result.actionId) {
    console.log(`  actionId ${result.actionId}`);
  }
  if (result.txHash && result.explorerUrl) {
    console.log(`  tx ${result.txHash}`);
    console.log(`  ${result.explorerUrl}`);
  }
  if (result.error) {
    console.log(`  ${result.error}`);
  }
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const live = isLiveRequested(env, argv);
  const fixture = applyLiveAddresses(await loadApprovedFixture(), env);
  const rpcUrl = env.CHAIN_RPC_URL ?? env.AOMI_RPC_URL;
  const runner = live ? new NodeAomiCommandRunner() : undefined;

  console.log("EOA execution harness");
  console.log(
    live
      ? "mode: live (Aomi CLI on-chain steps enabled)"
      : `mode: dry-run (set ${LIVE_E2E_ENV}=1 for live on-chain steps)`,
  );

  const refused = await runEoaLane({
    intent: withRecipient(fixture.intent, fixture.unapprovedRecipient),
    policy: fixture.policy,
    mode: live ? "live" : "dry-run",
    runner,
    env,
    rpcUrl,
  });
  printLane("wrong-recipient", refused);

  if (refused.status !== "refused") {
    throw new Error("Wrong-recipient fixture must be refused before signing");
  }
  if (refused.executed.some((command) => isSigningCommand(command.args))) {
    throw new Error("Wrong-recipient path executed a signing command");
  }

  if (live && !(env.EOA_ADDRESS || env.AOMI_PUBLIC_KEY) && !env.PAYMENT_RECIPIENT) {
    const blocked: EoaLaneResult = {
      status: "blocked",
      mode: "live",
      reason: "missing_live_address",
      planned: planAomiCommands(fixture.intent, DOCUMENTED_ACTION_ID, { rpcUrl }),
      executed: [],
      error:
        "Set EOA_ADDRESS or AOMI_PUBLIC_KEY and PAYMENT_RECIPIENT before a live approved run",
    };
    printLane("approved", blocked);
    if (argv.includes("--write-evidence") || live) {
      const directory = evidenceDirFor();
      const target = await writeSanitizedEvidence(directory, {
        generatedAt: new Date().toISOString(),
        lane: "aomi-eoa",
        wrongRecipient: resultToJson(refused),
        approved: resultToJson(blocked),
      });
      console.log(`evidence ${target}`);
    }
    process.exitCode = 2;
    return { refused, approved: blocked };
  }

  const approved = await runEoaLane({
    intent: fixture.intent,
    policy: fixture.policy,
    mode: live ? "live" : "dry-run",
    runner,
    env,
    rpcUrl,
  });
  printLane("approved", approved);

  if (live) {
    const directory = evidenceDirFor();
    const target = await writeSanitizedEvidence(directory, {
      generatedAt: new Date().toISOString(),
      lane: "aomi-eoa",
      invoiceId: fixture.intent.invoiceId,
      chain: fixture.intent.chain,
      chainId: ARC_TESTNET_CHAIN_ID,
      wrongRecipient: resultToJson(refused),
      approved: resultToJson(approved),
    });
    console.log(`evidence ${target}`);
  } else {
    console.log("dry-run complete; no Aomi CLI invoked, no evidence written");
  }

  if (approved.status === "blocked" || approved.status === "unresolved") {
    process.exitCode = 2;
  }

  return { refused, approved };
}

function isDirectInvocation() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return fileURLToPath(import.meta.url) === path.resolve(entry);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main().catch((error) => {
    console.error(
      sanitizeCapturedText(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  });
}
