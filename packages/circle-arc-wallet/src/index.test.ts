import assert from "node:assert/strict";
import test from "node:test";
import { ARC_TESTNET_CHAIN_ID, CircleArcWallet, normalizeCircleTransferResult, verifyArcReceipt } from "./index.ts";

const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const recipient = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("builds a bounded Arc Testnet transfer and requires review", async () => {
  let reviewed = false;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (command, args) => {
      assert.equal(command, "circle");
      assert.deepEqual(args, [
        "wallet", "transfer", recipient, "--amount", "1", "--address", wallet,
        "--chain", "ARC-TESTNET", "--idempotency-key", "invoice-INV-1042", "--output", "json",
      ]);
      return { stdout: JSON.stringify({ id: "circle-transaction-1", state: "initiated" }), stderr: "" };
    },
  });
  const result = await client.transfer(
    {
      chainId: ARC_TESTNET_CHAIN_ID,
      recipient,
      amountUsdc: "1",
      invoiceId: "INV-1042",
      idempotencyKey: "invoice-INV-1042",
    },
    (review) => {
      reviewed = true;
      assert.match(review.summary, /1 native USDC/);
      return true;
    },
  );
  assert.equal(reviewed, true);
  assert.equal(result.transactionId, "circle-transaction-1");
});

test("never invokes Circle after rejection", async () => {
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => {
      throw new Error("runner must not be called");
    },
  });
  await assert.rejects(
    client.transfer(
      {
        chainId: ARC_TESTNET_CHAIN_ID,
        recipient,
        amountUsdc: "1",
        invoiceId: "INV-1042",
        idempotencyKey: "invoice-INV-1042",
      },
      () => false,
    ),
    /rejected by the reviewer/,
  );
});

test("normalizes nested Circle transaction results", () => {
  const hash = `0x${"12".repeat(32)}`;
  assert.deepEqual(normalizeCircleTransferResult({ data: { transaction: { id: "tx-1", txHash: hash, state: "complete" } } }), {
    transactionId: "tx-1",
    transactionHash: hash,
    state: "complete",
    raw: { data: { transaction: { id: "tx-1", txHash: hash, state: "complete" } } },
  });
});

test("waits for the same Circle transaction and requires its Arc hash", async () => {
  const hash = `0x${"34".repeat(32)}`;
  let polls = 0;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (_command, args) => {
      assert.deepEqual(args.slice(0, 2), ["transaction", "list"]);
      polls += 1;
      return {
        stdout: JSON.stringify({ transactions: [{ id: "tx-1", state: polls === 1 ? "sent" : "complete", transactionHash: polls === 1 ? undefined : hash }] }),
        stderr: "",
      };
    },
  });
  const result = await client.waitForConfirmation("tx-1", { sleep: async () => undefined });
  assert.equal(result.transactionHash, hash);
  assert.equal(polls, 2);
});

test("verifies a successful receipt through an independent Arc RPC", async () => {
  const hash = `0x${"56".repeat(32)}`;
  const receipt = await verifyArcReceipt(hash, "https://rpc.example", async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).method, "eth_getTransactionReceipt");
    return new Response(JSON.stringify({ result: { transactionHash: hash, blockNumber: "0x2a", status: "0x1" } }));
  });
  assert.equal(receipt.blockNumber, "0x2a");
});
