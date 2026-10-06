# Aomi × Circle Execution Kit

This package is the Node-first client for an existing agent or decision engine. It keeps the two financial approvals separate:

1. review and purchase the immutable Aomi Task plan;
2. review and execute the exact vendor transfer with Circle Agent Wallet.

```ts
import { readFile } from "node:fs/promises";
import { ArcExecutionKit } from "@arc-canteen/task-client";
import { CircleArcWallet } from "@arc-canteen/circle-arc-wallet";

const wallet = new CircleArcWallet({ walletAddress: process.env.CIRCLE_WALLET_ADDRESS! });
const kit = ArcExecutionKit.arcTestnet({
  // Preview configuration: these values must come from the Aomi deployment
  // you independently trust. There are no production defaults yet.
  endpoint: "https://YOUR_AOMI_API/v1/task/build",
  token: () => process.env.AOMI_TASK_TOKEN!,
  subject: "YOUR_AUTHENTICATED_SUBJECT",
  recipient: "YOUR_EXPECTED_AOMI_SELLER",
  trustedJwks: JSON.parse(await readFile("./trusted-aomi-jwks.json", "utf8")),
  maxFeeMicrousd: 1_100_000n,
  stateDirectory: "/absolute/private/path/invoice-1042",
  wallet,
  rpcUrl: "https://YOUR_ARC_TESTNET_RPC",
});

const quote = await kit.prepare({
  intent: "Pay approved invoice INV-1042",
  reference: "INV-1042",
  sender: wallet.walletAddress,
  recipient: "0x1111111111111111111111111111111111111111",
  amountUsdc: "1",
});

// Approval 1: buying the plan from Aomi.
const artifact = await quote.purchase(async (preview) => showAomiServiceQuote(preview));
if (artifact.status === "pending") throw new Error("Re-run purchase to reconcile the same authorization");

// Approval 2: paying the vendor. The package accepts only one simulated native
// USDC transfer whose sender, target and value match the original constraints.
const result = await artifact.execute(async (review) => showCircleTransferReview(review));
console.log(result.receipt.transactionHash);
```

The private state directory stores the Task purchase journal and a separate execution journal. Retries reuse the same Task authorization and Circle idempotency key. The final record correlates the Aomi service-purchase receipt, Circle submission, and independently verified Arc transaction.

## V1 fail-closed scope

- Arc Testnet (`5042002`) only.
- One native-USDC transfer only.
- The Circle wallet must be both Task sender and payer.
- Exactly one allowlisted recipient and an explicit outgoing amount cap.
- A simulated Build, one successful report step, no approvals, and all Task constraints passed.
- The Arc RPC transaction must match the reviewed sender, recipient, value, empty calldata, successful receipt, and transaction hash.

Contract calls, ERC-20 approvals, batches, swaps, bridges, arbitrary calldata, mainnet, and autonomous signing are rejected or outside this client.

## Preview status

There is no confirmed public hosted Task endpoint, OAuth resource, seller address, or trusted JWKS distribution for this kit today. The package is therefore a tested preview, not a runnable hosted quickstart. Do not substitute values learned from an untrusted quote.
