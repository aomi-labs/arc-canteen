import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, parseAbiItem } from "viem";
import { ARC_TESTNET_CHAIN_ID, CircleArcWallet, normalizeCircleTransferResult, verifyArcCallReceipt, verifyArcReceipt, verifyArcTransferReceipt } from "./index.ts";

const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const recipient = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("builds a bounded Arc Testnet transfer and requires review", async () => {
  let reviewed = false;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (command, args) => {
      assert.equal(command, "circle");
      assert.deepEqual(args.slice(0, 8), [
        "wallet", "transfer", recipient, "--amount", "1", "--address", wallet,
        "--chain",
      ]);
      assert.match(args[args.indexOf("--idempotency-key") + 1], /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
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

test("resolves the distinct Gateway payer behind a Circle Agent Wallet", async () => {
  const payer = "0xcccccccccccccccccccccccccccccccccccccccc";
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (command, args) => {
      assert.equal(command, "circle");
      assert.deepEqual(args, [
        "gateway", "balance", "--address", wallet,
        "--chain", "ARC-TESTNET", "--output", "json",
      ]);
      return { stdout: JSON.stringify({ data: { address: wallet, backingEOA: payer } }), stderr: "" };
    },
  });
  assert.equal(await client.gatewayPayer(), payer);
});

test("rejects a Gateway balance response without a backing EOA", async () => {
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => ({ stdout: JSON.stringify({ data: { address: wallet } }), stderr: "" }),
  });
  await assert.rejects(client.gatewayPayer(), /backing EOA/);
});

test("rejects a Gateway payer response for a different wallet", async () => {
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => ({
      stdout: JSON.stringify({
        data: {
          address: "0xdddddddddddddddddddddddddddddddddddddddd",
          backingEOA: "0xcccccccccccccccccccccccccccccccccccccccc",
        },
      }),
      stderr: "",
    }),
  });
  await assert.rejects(client.gatewayPayer(), /does not match the agent wallet/);
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
  assert.deepEqual(receipt.logs, []);
});

test("binds the confirmed Arc transaction to the exact reviewed transfer", async () => {
  const hash = `0x${"78".repeat(32)}`;
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    calls.push(method);
    if (method === "eth_getTransactionReceipt") {
      return new Response(JSON.stringify({ result: { transactionHash: hash, blockNumber: "0x2b", status: "0x1" } }));
    }
    return new Response(JSON.stringify({ result: { hash, from: wallet, to: recipient, value: "0xde0b6b3a7640000", input: "0x" } }));
  };
  const receipt = await verifyArcTransferReceipt(hash, "https://rpc.example", {
    from: wallet,
    to: recipient,
    valueWei: "1000000000000000000",
  }, fetchImpl);
  assert.equal(receipt.to, recipient);
  assert.deepEqual(calls, ["eth_getTransactionReceipt", "eth_getTransactionByHash"]);
  await assert.rejects(
    verifyArcTransferReceipt(hash, "https://rpc.example", { from: wallet, to: payerAddress(), valueWei: "1000000000000000000" }, fetchImpl),
    /does not match/,
  );
});

function payerAddress() {
  return "0xcccccccccccccccccccccccccccccccccccccccc";
}

test("executes only ABI parameters that reproduce the exact Aomi calldata", async () => {
  const target = "0xcccccccccccccccccccccccccccccccccccccccc" as const;
  const inner = "0x12345678" as const;
  const item = parseAbiItem("function execute(address target, bytes data)");
  const data = encodeFunctionData({ abi: [item], args: [target, inner] });
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (_command, args) => {
      assert.deepEqual(args.slice(0, 5), ["wallet", "execute", "execute(address,bytes)", target, inner]);
      assert.equal(args[args.indexOf("--amount") + 1], "0.000000000000000001");
      assert.match(args[args.indexOf("--idempotency-key") + 1], /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      return { stdout: JSON.stringify({ id: "circle-call-1", state: "initiated" }), stderr: "" };
    },
  });
  const plan = {
    chainId: ARC_TESTNET_CHAIN_ID,
    to: recipient as `0x${string}`,
    data,
    value: "1",
    abiFunctionSignature: "execute(address,bytes)",
    abiParameters: [target, inner],
    idempotencyKey: "mandate-call-0001",
    label: "Execute Mandate plan",
  } as const;
  await client.executeContractCall(plan, () => true);
  await assert.rejects(
    client.executeContractCall({ ...plan, abiParameters: [wallet, inner] }, () => true),
    /do not reproduce/,
  );
});

test("asks Circle to sign the exact EIP-712 object without a bearer or local key", async () => {
  const signature = `0x${"11".repeat(65)}`;
  const typedData = {
    domain: { name: "Aomi Task API", version: "1", chainId: ARC_TESTNET_CHAIN_ID, salt: `0x${"22".repeat(32)}` },
    types: { TaskAuthorization: [{ name: "chainId", type: "uint256" }] },
    primaryType: "TaskAuthorization",
    message: { chainId: BigInt(ARC_TESTNET_CHAIN_ID) },
  };
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (_command, args) => {
      assert.deepEqual(args.slice(0, 3), ["wallet", "sign", "typed-data"]);
      assert.deepEqual(JSON.parse(args[3]), {
        ...typedData,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "salt", type: "bytes32" },
          ],
          ...typedData.types,
        },
        message: { chainId: String(ARC_TESTNET_CHAIN_ID) },
      });
      assert.deepEqual(args.slice(4), ["--address", wallet, "--chain", "ARC-TESTNET", "--quiet"]);
      return { stdout: `${signature}\n`, stderr: "" };
    },
  });
  assert.equal(await client.signTypedData(typedData, () => true), signature);
});

test("rejects malformed odd-length signatures and receipt logs", async () => {
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => ({ stdout: `0x${"11".repeat(65)}1`, stderr: "" }),
  });
  await assert.rejects(client.signTypedData({
    domain: { name: "Aomi Task API", chainId: ARC_TESTNET_CHAIN_ID },
    types: { TaskAuthorization: [] },
    primaryType: "TaskAuthorization",
    message: {},
  }, () => true), /invalid EIP-712 signature/);
  const hash = `0x${"77".repeat(32)}`;
  await assert.rejects(verifyArcReceipt(hash, "https://rpc.example", async () => new Response(JSON.stringify({
    result: { transactionHash: hash, blockNumber: "0x2c", status: "0x1", logs: [null] },
  }))), /malformed logs/);
});

test("rejects malformed typed data before invoking Circle", async () => {
  let invoked = false;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => {
      invoked = true;
      return { stdout: "", stderr: "" };
    },
  });
  await assert.rejects(client.signTypedData({ primaryType: "TaskAuthorization" }, () => true), /requires domain and types objects/);
  assert.equal(invoked, false);
});

test("verifies a smart-account receipt independently and preserves application logs", async () => {
  const hash = `0x${"88".repeat(32)}`;
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    calls.push(method);
    return new Response(JSON.stringify({ result: { transactionHash: hash, blockNumber: "0x2d", status: "0x1", logs: [{ address: recipient }] } }));
  };
  const receipt = await verifyArcCallReceipt(hash, "https://rpc.example", fetchImpl);
  assert.equal(receipt.logs.length, 1);
  assert.deepEqual(calls, ["eth_getTransactionReceipt"]);
});
