import assert from "node:assert/strict";
import test from "node:test";
import type { HexAddress, PaymentIntent } from "../packages/payment-core/src/index";
import {
  PolicyBlockedSigningError,
  assertSigningAllowed,
  evaluateFixture,
  fixtureFromJson,
  hasPrivateKey,
  isLiveRequested,
  isSigningCommand,
  loadApprovedFixture,
  planAomiCommands,
  redactSecrets,
  runEoaLane,
  sanitizeCapturedText,
  withRecipient,
  type CommandRunner,
} from "./live-execution";

function recordingRunner(replies: Record<string, string> = {}): {
  runner: CommandRunner;
  calls: Array<{ executable: string; args: readonly string[] }>;
} {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  return {
    calls,
    runner: {
      async run(executable, args) {
        calls.push({ executable, args });
        const step = args[1] ?? args[0] ?? "";
        return { stdout: replies[step] ?? `${args.join(" ")} ok`, stderr: "" };
      },
    },
  };
}

test("wrong recipient is refused before any signing command", async () => {
  const fixture = await loadApprovedFixture();
  const { runner, calls } = recordingRunner();
  const invalid = withRecipient(fixture.intent, fixture.unapprovedRecipient);

  const result = await runEoaLane({
    intent: invalid,
    policy: fixture.policy,
    mode: "live",
    runner,
    env: { PRIVATE_KEY: "0xshould-never-be-used" },
  });

  assert.equal(result.status, "refused");
  assert.equal(result.reason, "unapproved_recipient");
  assert.equal(calls.length, 0);
  assert.ok(!result.planned.some((command) => isSigningCommand(command.args)));
  assert.ok(!result.executed.some((command) => isSigningCommand(command.args)));
  assert.throws(
    () =>
      assertSigningAllowed(
        evaluateFixture(invalid, fixture.policy),
      ),
    PolicyBlockedSigningError,
  );
});

test("approved dry-run plans the documented Aomi sequence without invoking it", async () => {
  const fixture = await loadApprovedFixture();
  const { runner, calls } = recordingRunner();
  const planned = planAomiCommands(fixture.intent);

  const result = await runEoaLane({
    intent: fixture.intent,
    policy: fixture.policy,
    mode: "dry-run",
    runner,
    env: {},
  });

  assert.equal(result.status, "approved-dry-run");
  assert.equal(evaluateFixture(fixture.intent, fixture.policy).status, "approved");
  assert.deepEqual(
    result.planned.map((command) => command.step),
    ["chat", "list", "simulate", "sign"],
  );
  assert.deepEqual(result.planned[0], planned[0]);
  assert.ok(result.planned.at(-1)?.args.includes("--eoa"));
  assert.equal(calls.length, 0);
  assert.equal(result.executed.length, 0);
});

test("live on-chain steps stay gated unless RUN_LIVE_E2E=1", () => {
  assert.equal(isLiveRequested({}), false);
  assert.equal(isLiveRequested({ RUN_LIVE_E2E: "0" }), false);
  assert.equal(isLiveRequested({ RUN_LIVE_E2E: "1" }, ["--dry-run"]), false);
  assert.equal(isLiveRequested({ RUN_LIVE_E2E: "1" }), true);
  assert.equal(hasPrivateKey({}), false);
  assert.equal(hasPrivateKey({ PRIVATE_KEY: "0xabc" }), true);
});

test("captured output never keeps a private key value", () => {
  const key =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const sanitized = sanitizeCapturedText(
    `export PRIVATE_KEY=${key}\naomi tx sign action-1 --eoa`,
    { PRIVATE_KEY: key },
  );
  assert.equal(sanitized.includes(key), false);
  assert.match(sanitized, /PRIVATE_KEY=\[redacted\]/);
  assert.equal(
    redactSecrets("aomi tx sign action-1 --private-key 0xdeadbeef", []).includes(
      "0xdeadbeef",
    ),
    false,
  );
});

test("fixture loader keeps amounts as integer micros", () => {
  const fixture = fixtureFromJson({
    intent: {
      id: "9e8f0a12-4b3c-4d5e-a678-90abcdef1234",
      invoiceId: "eoa-approved-001",
      chain: "ARC-TESTNET",
      source: "0x1111111111111111111111111111111111111111",
      recipient: "0x2222222222222222222222222222222222222222",
      amountUsdcMicros: "10000",
    },
    policy: {
      chain: "ARC-TESTNET",
      source: "0x1111111111111111111111111111111111111111",
      approvedRecipients: ["0x2222222222222222222222222222222222222222"],
      paidInvoiceIds: [],
      maxAmountUsdcMicros: "1000000",
    },
    unapprovedRecipient: "0x3333333333333333333333333333333333333333",
  });

  assert.equal(fixture.intent.amountUsdcMicros, 10_000n);
  const intent: PaymentIntent = fixture.intent;
  const recipient = fixture.unapprovedRecipient as HexAddress;
  assert.equal(intent.recipient.startsWith("0x"), true);
  assert.equal(recipient.toLowerCase().endsWith("3333"), true);
});
