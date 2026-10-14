# Aomi × Circle Execution Kit

This package is the Node-first client for an existing agent or decision engine. It keeps three wallet authorities separate:

1. authorize one exact Task request;
2. purchase the immutable Aomi Task artifact;
3. review and execute the exact calls with Circle Agent Wallet.

Install the reviewed monorepo package from its immutable HTTPS source; it is not published to npm:

```sh
npm install https://github.com/aomi-labs/arc-canteen/archive/45612bba3480a35b2038e88b17c0584136f32a3b.tar.gz
```

This revision requires the server to advertise the absolute configured `/v1/task/build` payment resource URL. Update the client and payment service together; old relative quote-purchase URLs are rejected.

```ts
import { ArcExecutionKit, fetchTrustedTaskJwks } from "arc-canteen/task-client";
import { CircleArcWallet } from "arc-canteen/circle-arc-wallet";

const wallet = new CircleArcWallet({ walletAddress: process.env.CIRCLE_WALLET_ADDRESS! });
const endpoint = "https://YOUR_AOMI_API/v1/task/build";
// Select and trust this HTTPS service origin out of band. The helper fetches
// only its origin's public JWKS and rejects redirects or private key material.
const trustedJwks = await fetchTrustedTaskJwks(endpoint);
const kit = ArcExecutionKit.arcTestnet({
  // Preview configuration: these values must come from the Aomi deployment
  // you independently trust. There are no production defaults yet.
  endpoint,
  recipient: "YOUR_EXPECTED_AOMI_SELLER",
  trustedJwks,
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

The Task API is signature-only: Circle signs each exact EIP-712 Task request, then separately signs the Gateway payment and final execution. No login, OAuth resource, access token, refresh token, API key, or bearer is used. The Task API production endpoint `https://api.aomi.dev` advertises Arc Mainnet payments from r150, but production paid acceptance is still unverified. This Execution Kit remains Arc Testnet-only: `arcTestnet()` is not a Mainnet client and must not be used with a Mainnet wallet. Product-mono #1347 and this client PR #49 prepare JWKS discovery; production `/.well-known/jwks.json` still returns 404, so independently provision the trusted JWKS until #1347 is deployed. Public Bazaar/self-service marketplace routing is outside this Task API release.

## Crash recovery and state locks

The Execution Kit requires local POSIX storage on Linux/macOS and the `fs-ext` native module (a C++ compiler, Python and node-gyp at install time; pnpm permits its build in `pnpm-workspace.yaml`). Unsupported platforms or failed kernel locking fail closed. Purchase and execution each use a persistent private regular lock file, held by the Node process with nonblocking `flock`. A busy lock rejects the call; retry after its owner exits. SIGKILL, normal exit and thrown operations release ownership automatically. The lock inode remains on disk and must never be deleted while clients may be running. PID reuse and lock age cannot cause takeover; there is no timeout-based reclamation. All clients sharing a state directory must use this implementation. Do not place journals on network filesystems or run older clients concurrently.

Legacy `lock/` or `execution-lock/` directories have no trustworthy owner identity and are refused, as are symlinks, hard-linked locks and non-private files. To migrate a legacy directory, stop **all** old and new clients using that private state directory, verify none remain, and remove only the empty legacy directory with `rmdir /absolute/state/directory/lock` (or `execution-lock`). If ownership is uncertain, leave it intact and investigate. Do not remove `state.json`, `execution.json` or any authorization; restart recovery with the same state directory so the original payment signature, nonce and idempotency key are reused. An empty regular lock file left by a crash needs no manual cleanup.
