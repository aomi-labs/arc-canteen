# Aomi × Circle Execution Kit

This package is the Node-first client for an existing agent or decision engine. It keeps three wallet authorities separate:

1. authorize one exact Task request;
2. purchase the immutable Aomi Task artifact;
3. review and execute the exact calls with Circle Agent Wallet.

Install the reviewed monorepo package from its immutable HTTPS source; it is not published to npm:

```sh
npm install https://github.com/aomi-labs/arc-canteen/archive/ab1e44dc8093f0edee104de327e91da43000c09b.tar.gz
```

This revision requires the server to advertise the absolute configured `/v1/task/build` payment resource URL. Update the client and payment service together; old relative quote-purchase URLs are rejected.

```ts
import { readFile } from "node:fs/promises";
import { ArcExecutionKit } from "arc-canteen/task-client";
import { CircleArcWallet } from "arc-canteen/circle-arc-wallet";

const wallet = new CircleArcWallet({ walletAddress: process.env.CIRCLE_WALLET_ADDRESS! });
const kit = ArcExecutionKit.arcTestnet({
  // Preview configuration: these values must come from the Aomi deployment
  // you independently trust. There are no production defaults yet.
  endpoint: "https://YOUR_AOMI_API/v1/task/build",
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
}, async (review) => showTaskAuthorizationReview(review));

// This first review signs only the exact Task request. It grants no spending
// or execution authority.

// Approval 2: buying the plan from Aomi with a separate Gateway signature.
const artifact = await quote.purchase(async (preview) => showAomiServiceQuote(preview));
if (artifact.status === "pending") throw new Error("Re-run purchase to reconcile the same authorization");

// Approval 3: paying the vendor. The package accepts only one simulated native
// USDC transfer whose sender, target and value match the original constraints.
const result = await artifact.execute(async (review) => showCircleTransferReview(review));
console.log(result.receipt.transactionHash);
```

The private state directory stores the Task purchase journal and a separate execution journal. Before a quote exists, an expiring Task authorization is refreshed with the same request hash and idempotency key. After a quote exists, recovery reuses its original authorization and payment proof rather than creating another purchase. The final record correlates the Aomi service-purchase receipt, Circle submission, and independently verified Arc transaction.

## V1 fail-closed scope

- Arc Testnet (`5042002`) only.
- One native-USDC transfer only.
- The Circle wallet must be both Task sender and payer.
- Exactly one allowlisted recipient and an explicit outgoing amount cap.
- A simulated Build, one successful report step, no approvals, and all Task constraints passed.
- The Arc RPC transaction must match the reviewed sender, recipient, value, empty calldata, successful receipt, and transaction hash.

Contract calls, ERC-20 approvals, batches, swaps, bridges, arbitrary calldata, mainnet, and autonomous signing are rejected or outside this client.

## Deployment status

The Task API is signature-only: Circle signs each exact EIP-712 Task request, then separately signs the Gateway payment and final execution. No login, OAuth resource, access token, refresh token, API key, or bearer is used. The staging runtime and `smart_account_calls` flow have passed a complete Arc Testnet acceptance run. Aomi must provision the routed staging endpoint, seller address, and trusted attestation JWKS; public self-service routing, production Task rollout, and mainnet Task payments remain disabled.
