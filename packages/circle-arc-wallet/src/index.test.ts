import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbiItem, parseAbiParameters, stringToHex } from "viem";
import { ARC_MAINNET, ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID, CircleArcWallet, arcNetwork, normalizeCircleTransferResult, verifyArcCallReceipt, verifyArcGatewaySettlement, verifyArcReceipt, verifyArcTransferReceipt } from "./index.ts";

const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const recipient = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("builds a bounded Arc Testnet transfer and requires review", async () => {
  let reviewed = false;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (command, args) => {
      assert.equal(command, "circle");
      assert.deepEqual(args.slice(0, 9), [
        "wallet", "transfer", recipient, "--amount", "1", "--address", wallet,
        "--chain", "ARC-TESTNET",
      ]);
      assert.match(args[args.indexOf("--idempotency-key") + 1], /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.deepEqual(args.slice(-2), ["--output", "json"]);
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

test("selects Arc Mainnet explicitly for Circle and its Gateway contract", async () => {
  assert.equal(arcNetwork(ARC_MAINNET_CHAIN_ID).circleChain, ARC_MAINNET);
  assert.equal(arcNetwork(ARC_MAINNET_CHAIN_ID).gatewayWallet, "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee");
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async (_command, args) => {
      assert.equal(args[args.indexOf("--chain") + 1], "ARC");
      return { stdout: JSON.stringify({ id: "mainnet-tx", state: "initiated" }), stderr: "" };
    },
  });
  const review = client.reviewTransfer({
    chainId: ARC_MAINNET_CHAIN_ID,
    recipient,
    amountUsdc: "0.01",
    invoiceId: "MAINNET-PREVIEW",
    idempotencyKey: "mainnet-preview-1",
  });
  assert.match(review.summary, /Arc Mainnet/);
});

test("refuses the unbounded Circle transfer shortcut on Arc Mainnet", async () => {
  let reviewed = false;
  let invoked = false;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => {
      invoked = true;
      return { stdout: JSON.stringify({ id: "mainnet-tx", state: "initiated" }), stderr: "" };
    },
  });
  await assert.rejects(client.transfer({
    chainId: ARC_MAINNET_CHAIN_ID,
    recipient,
    amountUsdc: "0.01",
    invoiceId: "MAINNET-PREVIEW",
    idempotencyKey: "mainnet-preview-1",
  }, () => { reviewed = true; return true; }), /bounded Execution Kit path/);
  assert.equal(reviewed, false);
  assert.equal(invoked, false);
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
  assert.equal(await client.gatewayPayer(ARC_TESTNET_CHAIN_ID), payer);
});

test("rejects a Gateway balance response without a backing EOA", async () => {
  const client = new CircleArcWallet({
    walletAddress: wallet,
    runner: async () => ({ stdout: JSON.stringify({ data: { address: wallet } }), stderr: "" }),
  });
  await assert.rejects(client.gatewayPayer(ARC_TESTNET_CHAIN_ID), /backing EOA/);
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
  await assert.rejects(client.gatewayPayer(ARC_TESTNET_CHAIN_ID), /does not match the agent wallet/);
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
  const result = await client.waitForConfirmation("tx-1", ARC_TESTNET_CHAIN_ID, { sleep: async () => undefined });
  assert.equal(result.transactionHash, hash);
  assert.equal(polls, 2);
});

test("verifies a successful receipt through an independent Arc RPC", async () => {
  const hash = `0x${"56".repeat(32)}`;
  const receipt = await verifyArcReceipt(hash, "https://rpc.example", ARC_TESTNET_CHAIN_ID, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ result: body.method === "eth_chainId"
      ? "0x4cef52"
      : { transactionHash: hash, blockNumber: "0x2a", status: "0x1" } }));
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
    if (method === "eth_chainId") return new Response(JSON.stringify({ result: "0x4cef52" }));
    if (method === "eth_getTransactionReceipt") {
      return new Response(JSON.stringify({ result: { transactionHash: hash, blockNumber: "0x2b", status: "0x1" } }));
    }
    return new Response(JSON.stringify({ result: { hash, from: wallet, to: recipient, value: "0xde0b6b3a7640000", input: "0x" } }));
  };
  const receipt = await verifyArcTransferReceipt(hash, "https://rpc.example", ARC_TESTNET_CHAIN_ID, {
    from: wallet,
    to: recipient,
    valueWei: "1000000000000000000",
  }, fetchImpl);
  assert.equal(receipt.to, recipient);
  assert.deepEqual(calls, ["eth_chainId", "eth_getTransactionReceipt", "eth_getTransactionByHash"]);
  await assert.rejects(
    verifyArcTransferReceipt(hash, "https://rpc.example", ARC_TESTNET_CHAIN_ID, { from: wallet, to: payerAddress(), valueWei: "1000000000000000000" }, fetchImpl),
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

test("freezes the reviewed Arc Mainnet transaction before handing it to the raw signer", async () => {
  let signerInvoked = false;
  const client = new CircleArcWallet({
    walletAddress: wallet,
    transactionSigner: async (transaction) => {
      signerInvoked = true;
      assert.equal(Object.isFrozen(transaction), true);
      (transaction as any).to = recipient;
      return `0x${"11".repeat(65)}`;
    },
  });
  await assert.rejects(client.signTransaction({
    chainId: ARC_MAINNET_CHAIN_ID,
    nonce: 7n,
    gas: 21_000n,
    gasPrice: 1n,
    to: wallet,
    value: 1n,
    data: "0x",
  }), TypeError);
  assert.equal(signerInvoked, true);
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
  await assert.rejects(verifyArcReceipt(hash, "https://rpc.example", ARC_TESTNET_CHAIN_ID, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ result: body.method === "eth_chainId"
      ? "0x4cef52"
      : { transactionHash: hash, blockNumber: "0x2c", status: "0x1", logs: [null] } }));
  }), /malformed logs/);
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
    if (method === "eth_chainId") return new Response(JSON.stringify({ result: "0x13b2" }));
    return new Response(JSON.stringify({ result: { transactionHash: hash, blockNumber: "0x2d", status: "0x1", logs: [{ address: recipient }] } }));
  };
  const receipt = await verifyArcCallReceipt(hash, "https://rpc.example", ARC_MAINNET_CHAIN_ID, fetchImpl);
  assert.equal(receipt.logs.length, 1);
  assert.deepEqual(calls, ["eth_chainId", "eth_getTransactionReceipt"]);
});

test("rejects an RPC that belongs to the other Arc network", async () => {
  const hash = `0x${"99".repeat(32)}`;
  let receiptRequested = false;
  await assert.rejects(verifyArcReceipt(hash, "https://rpc.example", ARC_MAINNET_CHAIN_ID, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === "eth_getTransactionReceipt") receiptRequested = true;
    return new Response(JSON.stringify({ result: "0x4cef52" }));
  }), /does not match the selected chain/);
  assert.equal(receiptRequested, false);
});

test("keeps an unbatched Gateway payment pending", async () => {
  const result = await verifyArcGatewaySettlement({
    chainId: ARC_MAINNET_CHAIN_ID, rpcUrl: "https://rpc.example", nonce: `0x${"12".repeat(32)}`,
    transferId: "circle-transfer-1", payer: wallet, merchant: recipient, amountMicrousd: "1000000",
  }, {
    gatewayFetch: async () => new Response(JSON.stringify({ transfers: [{
      id: "circle-transfer-1", nonce: `0x${"12".repeat(32)}`, fromAddress: wallet, toAddress: recipient,
      sendingNetwork: "eip155:5042", recipientNetwork: "eip155:5042", token: "USDC", amount: "1000000", status: "received",
    }] })),
    rpcFetch: async () => { throw new Error("Unbatched payment must not be treated as settled"); },
  });
  assert.deepEqual(result, { status: "pending", transferId: "circle-transfer-1" });
});

test("independently verifies the exact Arc Mainnet Gateway batch and Circle nonce record", async () => {
  const nonce = `0x${"12".repeat(32)}`;
  const merchant = recipient;
  const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
  const transactionHash = `0x${"34".repeat(32)}`;
  const batchId = `0x${"56".repeat(32)}`;
  const batchSigner = "0xcccccccccccccccccccccccccccccccccccccccc";
  const signature = `0x${"aa".repeat(65)}`;
  const calldataBytes = encodeAbiParameters(
    parseAbiParameters("(address depositor, int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress"),
    [[{ depositor: wallet as `0x${string}`, value: -1_000_000n }, { depositor: merchant, value: 1_000_000n }], batchId as `0x${string}`, 26, network.usdc, network.gatewayWallet],
  );
  let input = encodeFunctionData({
    abi: [parseAbiItem("function submitBatch(bytes calldataBytes, bytes signature)")],
    functionName: "submitBatch",
    args: [calldataBytes, signature as `0x${string}`],
  });
  const transfer = {
    id: "circle-transfer-1", nonce, fromAddress: wallet, toAddress: merchant,
    sendingNetwork: "eip155:5042", recipientNetwork: "eip155:5042", token: "USDC",
    amount: "1000000", status: "confirmed", txHash: transactionHash,
  };
  const transferTopic = keccak256(stringToHex("BatchProcessed(bytes32,address,address)"));
  const insufficientBalanceTopic = keccak256(stringToHex("InsufficientBalance(address,address,uint256,uint256,uint256)"));
  const topicAddress = (value: string) => `0x${value.slice(2).toLowerCase().padStart(64, "0")}`;
  const gatewayFetch: typeof fetch = async () => new Response(JSON.stringify({ transfers: [transfer] }));
  let receiptLogs: Record<string, unknown>[] = [
    { address: network.gatewayWallet, topics: [transferTopic, batchId, topicAddress(batchSigner), topicAddress(network.usdc)], data: "0x" },
  ];
  const rpcFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result = body.method === "eth_chainId" ? "0x13b2"
      : body.method === "eth_getTransactionByHash" ? { hash: transactionHash, chainId: "0x13b2", from: batchSigner, to: network.gatewayWallet, input, gasPrice: "0x3b9aca00" }
        : body.method === "eth_getTransactionReceipt" ? {
            transactionHash, blockNumber: "0x2a", status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00",
            logs: receiptLogs,
          }
          : body.method === "eth_call" ? "0x1" : undefined;
    return new Response(JSON.stringify({ result }));
  };
  const result = await verifyArcGatewaySettlement({
    chainId: ARC_MAINNET_CHAIN_ID, rpcUrl: "https://rpc.example", nonce,
    transferId: "circle-transfer-1", payer: wallet, merchant, amountMicrousd: "1000000",
  }, { gatewayFetch, rpcFetch });
  assert.deepEqual(result, {
    status: "confirmed", transferId: "circle-transfer-1", transactionHash,
    transactionSender: batchSigner,
    blockNumber: "42", gasCostWei: (21_000n * 1_000_000_000n).toString(), batchId,
  });
  const exactInput = input;

  // Gateway nets separate x402 transfers between the same payer and merchant
  // into a single batch delta. The default exact verifier stays strict; the
  // Task client opts into a lower-bound batch corroboration for this case.
  const coalescedBytes = encodeAbiParameters(
    parseAbiParameters("(address depositor, int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress"),
    [[{ depositor: wallet as `0x${string}`, value: -1_000_300n }, { depositor: merchant, value: 1_000_300n }], batchId as `0x${string}`, 26, network.usdc, network.gatewayWallet],
  );
  input = encodeFunctionData({
    abi: [parseAbiItem("function submitBatch(bytes calldataBytes, bytes signature)")],
    functionName: "submitBatch", args: [coalescedBytes, signature as `0x${string}`],
  });
  await assert.rejects(verifyArcGatewaySettlement({
    chainId: ARC_MAINNET_CHAIN_ID, rpcUrl: "https://rpc.example", nonce,
    transferId: "circle-transfer-1", payer: wallet, merchant, amountMicrousd: "1000000",
  }, { gatewayFetch, rpcFetch }), /batch deltas do not cover/);
  const aggregate = await verifyArcGatewaySettlement({
    chainId: ARC_MAINNET_CHAIN_ID, rpcUrl: "https://rpc.example", nonce,
    transferId: "circle-transfer-1", payer: wallet, merchant, amountMicrousd: "1000000",
    allowAggregatedBatch: true,
  }, { gatewayFetch, rpcFetch });
  assert.equal(aggregate.status, "confirmed");
  if (aggregate.status === "confirmed") assert.equal(aggregate.amountVerification, "batch_lower_bound");
  input = exactInput;

  receiptLogs = [...receiptLogs, {
    address: network.gatewayWallet,
    topics: [insufficientBalanceTopic, topicAddress(network.usdc), topicAddress(wallet)],
    data: encodeAbiParameters(parseAbiParameters("uint256 value,uint256 availableBalance,uint256 withdrawingBalance"), [1_000_000n, 0n, 0n]),
  }];
  await assert.rejects(verifyArcGatewaySettlement({
    chainId: ARC_MAINNET_CHAIN_ID, rpcUrl: "https://rpc.example", nonce,
    transferId: "circle-transfer-1", payer: wallet, merchant, amountMicrousd: "1000000",
  }, { gatewayFetch, rpcFetch }), /insufficient USDC balance/);

  const altered = { ...transfer, amount: "1000001" };
  await assert.rejects(verifyArcGatewaySettlement({
    chainId: ARC_MAINNET_CHAIN_ID, rpcUrl: "https://rpc.example", nonce,
    transferId: "circle-transfer-1", payer: wallet, merchant, amountMicrousd: "1000000",
  }, { gatewayFetch: async () => new Response(JSON.stringify({ transfers: [altered] })), rpcFetch }), /differs from the signed Task payment/);
});
