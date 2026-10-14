# Aomi × Circle Execution Kit

This package is the Node-first client for an existing agent or decision engine. It keeps three wallet authorities separate:

1. authorize one exact Task request;
2. purchase the immutable Aomi Task artifact;
3. review and execute the exact calls with Circle Agent Wallet.

Install the reviewed monorepo package from an immutable HTTPS source after the Mainnet-support PR is merged; it is not published to npm:

```sh
npm install https://github.com/aomi-labs/arc-canteen/archive/b6ef5a3c7e8ed60ca1f8b32a4ab870d474378f00.tar.gz
```

This revision requires the server to advertise the absolute configured `/v1/task/build` payment resource URL. Update the client and payment service together; old relative quote-purchase URLs are rejected.

```ts
import { ArcExecutionKit, fetchTrustedTaskJwks } from "arc-canteen/task-client";
import { CircleArcWallet } from "arc-canteen/circle-arc-wallet";

const wallet = new CircleArcWallet({
  walletAddress: process.env.CIRCLE_WALLET_ADDRESS!,
  // Supply your wallet provider's chain-5042 raw transaction signer. Keep its
  // key in the provider; this callback receives the exact reviewed envelope.
  transactionSigner: (transaction) => walletProvider.signArcTransaction(transaction),
});
const endpoint = "https://YOUR_AOMI_API/v1/task/build";
// Select and trust this HTTPS service origin out of band. The helper fetches
// only its origin's public JWKS and rejects redirects or private key material.
const trustedJwks = await fetchTrustedTaskJwks(endpoint);
// Mainnet is explicit; use arcTestnet() only for chain 5042002.
const kit = ArcExecutionKit.arcMainnet({
  // Preview configuration: these values must come from the Aomi deployment
  // you independently trust. There are no production defaults yet.
  endpoint,
  recipient: "YOUR_EXPECTED_AOMI_SELLER",
  trustedJwks,
  maxFeeMicrousd: 1_100_000n,
  stateDirectory: "/absolute/private/path/invoice-1042",
  wallet,
  rpcUrl: "https://rpc.mainnet.arc.io",
  // 0.1 USDC maximum gas paid by this wallet across approval, deposit,
  // business transfer, and any explicitly recorded prior wallet gas. Circle
  // Gateway settlement gas is independently verified and reported separately;
  // it counts toward this cap only when the payer wallet sent that transaction.
  gasBudget: {
    maxAggregateGasWei: 100_000_000_000_000_000n,
    alreadySpentGasWei: 0n,
    maxGasPriceWei: 100_000_000_000n,
  },
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
const artifact = await quote.purchase(async (preview) => {
  // On Mainnet this is one combined review of the signed quote, current
  // Gateway balance, exact one-use allowance/deposit, business transaction,
  // nonce and aggregate gas cap. Approve only after checking every field.
  return showAomiServiceQuote(preview);
});
if (artifact.status === "pending") throw new Error("Re-run purchase to reconcile the same authorization");

// Mainnet executes only the business transaction from that same approved
// preview after the paid artifact bytes match it exactly. Testnet still asks
// for a separate final transfer review.
const result = await artifact.execute(async (review) => showCircleTransferReview(review));
console.log(result.receipt.transactionHash);
```

The private state directory stores the Task purchase journal and a separate execution journal. Before a quote exists, an expiring Task authorization is refreshed with the same request hash and idempotency key. After a quote exists, recovery reuses its original authorization and payment proof rather than creating another purchase. The final record correlates the Aomi service-purchase receipt, Circle submission, and independently verified Arc transaction.

## V1 fail-closed scope

- Arc Mainnet (`5042`) and Arc Testnet (`5042002`) are supported through separate explicit factories: `arcMainnet()` and `arcTestnet()`.
- The selected factory binds the signed Task chain; Circle commands, Gateway contract validation, the execution plan, and RPC receipt verification must all use that chain. RPC verification checks `eth_chainId` before reading a receipt.
- One native-USDC transfer only.
- The Circle wallet must be both Task sender and payer.
- Exactly one allowlisted recipient and an explicit outgoing amount cap.
- A simulated Build, one successful report step, no approvals, and all Task constraints passed.
- The Arc RPC transaction must match the reviewed sender, recipient, value, empty calldata, successful receipt, and transaction hash.
- Arc Mainnet EOA transfers require one pre-spend review covering the service quote, exact one-use USDC allowance and Gateway deposit (only when required), the business transaction and all nonces. The deposit is simulated after the approved allowance is mined; its fixed gas ceiling is included in the preview.
- The Task API payment must be independently confirmed by Circle and Arc before the paid artifact can authorize the one reviewed business transaction.

Arbitrary contract calls, other ERC-20 approvals, batches, swaps, bridges, arbitrary calldata, and autonomous signing are rejected or outside this client. The only Mainnet approval is the exact USDC amount required for the official Gateway deposit; the kit verifies the Gateway consumes it. Arc Mainnet moves real USDC; callers must independently check balances and caps before approving.

## Deployment status

The Task API is signature-only: Circle signs each exact EIP-712 Task request, then separately signs the Gateway payment and final execution. No login, OAuth resource, access token, refresh token, API key, or bearer is used. Production r151 serves a public-only JWKS and advertises Arc Mainnet payments. Production paid acceptance and the one-transfer Mainnet Execution Kit flow remain unverified until the bounded QA E2E completes. Public Bazaar/self-service marketplace routing is outside this Task API release.

## Crash recovery and state locks

The Execution Kit requires local POSIX storage on Linux/macOS and the `fs-ext` native module (a C++ compiler, Python and node-gyp at install time; pnpm permits its build in `pnpm-workspace.yaml`). Unsupported platforms or failed kernel locking fail closed. Purchase and execution each use a persistent private regular lock file, held by the Node process with nonblocking `flock`. A busy lock rejects the call; retry after its owner exits. SIGKILL, normal exit and thrown operations release ownership automatically. The lock inode remains on disk and must never be deleted while clients may be running. PID reuse and lock age cannot cause takeover; there is no timeout-based reclamation. All clients sharing a state directory must use this implementation. Do not place journals on network filesystems or run older clients concurrently.

Legacy `lock/` or `execution-lock/` directories have no trustworthy owner identity and are refused, as are symlinks, hard-linked locks and non-private files. To migrate a legacy directory, stop **all** old and new clients using that private state directory, verify none remain, and remove only the empty legacy directory with `rmdir /absolute/state/directory/lock` (or `execution-lock`). If ownership is uncertain, leave it intact and investigate. Do not remove `state.json`, `execution.json` or any authorization; restart recovery with the same state directory so the original payment signature, nonce and idempotency key are reused. An empty regular lock file left by a crash needs no manual cleanup.
