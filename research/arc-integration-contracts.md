# Live Aomi, Circle, and Arc integration contracts

Research snapshot: 2026-10-06. This records contracts that are supported by current primary documentation or code and separates them from deployment assumptions. It is planning evidence, not a launch or production-readiness claim.

## Decision

The two proposed products are technically coherent but have different readiness:

- **Arc Agent-in-a-Box** can be built on the live Aomi Agent API now for stateful conversation, tools, and typed action review. The missing product contract is a supported Circle wallet adapter and browser authentication path, not an agent runtime.
- **Aomi x Circle Execution Kit** has a merged, testnet-validated Task API design for selling immutable unsigned Arc plans through Circle Gateway. It is not an out-of-the-box hosted product today: the public Task auth/route is inconsistent, the safe client is only a repository example, and neither generic Circle service payment nor `circle wallet execute` preserves the full Task flow without an adapter.

The owned `arc-canteen` repository should therefore treat both as integration products with explicit adapters and golden paths. It must not present Task API as a live Marketplace service or Arc-mainnet execution product until the gaps below are closed and reverified.

## Verified contracts

| Boundary | What is verified now | Consequence for the products |
| --- | --- | --- |
| Aomi Agent API | The live SDK/REST contract owns stateful sessions. `POST /v1/agent/chat` starts a turn; durable event pages/SSE expose progress; callers can interrupt, reuse sessions, and resolve typed Actions. `UserState` carries strict wallet context, including EVM address and chain ID. Auto routing or Direct routing to a deployed Application ID is supported. | This is the runtime for **Arc Agent-in-a-Box**. A builder can add an agent without moving its backend or wallet into Aomi. |
| Aomi review/signing boundary | Aomi's wallet adapter remains in the builder application. Manual review is the default; the application verifies the current request and submits the wallet result. Durable Commit reviews exist, but require compatible client/deployment support and host-authenticated `/api/commits/*` access; a `/v1/agent` OAuth grant alone is insufficient. | Start the product contract around typed Actions unless a matching Commit deployment and auth path are proven. Circle remains the signer and Aomi remains non-custodial. |
| Aomi authentication | Guest sessions work for evaluation and public/default Apps, but action resolution can be restricted. Durable account-owned CLI/service access uses resource-bound OAuth. Cross-origin browsers need widget authentication or provisioned browser OAuth. Private Apps require an App key, and the widget has no App-key input. | A public builder starter needs an explicit browser auth decision. "Paste one API key into the frontend" is not a valid contract. |
| Published Aomi client | npm `latest` is `@aomi-labs/client` **0.9.4** on this snapshot; current docs say merged source is newer and warn that source availability does not prove package or deployment support. | Pin to published APIs and feature-detect the selected Aomi environment. Do not build the starter against unreleased source-only Commit behavior. |
| Aomi Task API implementation | Merged PR [Add Arc Task API with Circle Gateway x402 payments](https://github.com/aomi-labs/product-mono/pull/1133) defines `POST /v1/task/build`: natural-language intent becomes a pinned, simulated, immutable `TaskPrepared` artifact. Preparation returns a five-minute 402 quote without calldata; accepted payment releases the exact frozen bytes, recoverable for 30 days. Aomi never signs or broadcasts the intended transaction. | This is the planning/purchase core for **Aomi x Circle Execution Kit**, not another feature to invent. |
| Task constraints and scope | The contract accepts Arc `5042002` and `5042`, sender/payer, idempotency key, gross-USDC and gas caps, target allowlists, and USDC-only minimum-received assertions. Pricing is **1 USDC + 3% of verified gross outgoing USDC**. Mainnet payment is disabled by committed configuration. Cross-chain actions are rejected; arbitrary wrapper classification and live swap routing are not proven. | The first truthful product is Arc-testnet-first and narrowly scoped. "Any strategy" or "mainnet ready" would exceed evidence. |
| Task payment evidence | The merged validation record documents one local Arc-testnet Gateway purchase with exact-byte recovery across restarts and later independent settlement confirmation. It explicitly says this is not hosted deployment, customer adoption, or execution of the requested task. | Use it as engineering evidence only. The launch proof still needs a hosted end-to-end purchase and separately signed/executed Task artifact. |
| Circle Agent Stack | Circle CLI `1.1.4` exposes Agent Wallets, Gateway/x402 service payments, typed-data signing, transfers, swaps, bridges, and ABI-based contract execution. Agent Wallets support `ARC-TESTNET` and `ARC`; they are user-controlled 2-of-2 MPC wallets operated through the CLI. | Circle can own wallet custody, payment authorization, and Arc transaction submission. It does not supply Aomi's planning or semantic simulation. |
| Circle wallet policy | Agent Wallets expose transfer caps plus recipient/contract allowlists and blocklists, but Circle documents these policies as **mainnet-only**. Agent wallet transactions are gas-sponsored subject to caps and change. | Do not claim testnet policy enforcement in the hackathon golden path. Aomi constraints and explicit review remain required. |
| Circle Gateway/x402 | Gateway Nanopayments use x402: a buyer deposits USDC, receives a 402, signs an EIP-3009 authorization offchain, retries, and Gateway batches settlement. The x402 batch path requires an EOA signature and does not support ERC-1271. `circle services pay` supports POST bodies, headers, estimates, and maximum-amount caps. | A Circle Agent Wallet can fund/sign the Task service purchase, but the kit must preserve Task's quote binding, attestation verification, journal, and recovery semantics. |
| Circle onchain execution | `circle wallet execute` calls a contract using an ABI function signature and parameters, returning a terminal transaction result. The documented command has no raw-calldata input. | A paid Task artifact cannot simply be piped into this command while claiming byte identity. The kit needs a reviewed decode/re-encode equality check or a Circle SDK path that accepts the exact prepared call. |
| Arc testnet | Arc Testnet is chain `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`, and Circle wallet identifier `ARC-TESTNET`. USDC is native gas with 18-decimal native units; the optional ERC-20 interface at `0x3600000000000000000000000000000000000000` uses 6 decimals. The Gateway Wallet is `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`. Arc requires a 20 Gwei minimum `maxFeePerGas`, emits native-USDC system transfer logs, and finalizes on inclusion. | Both products must be Arc-aware rather than generic-EVM wrappers: unit conversion, gas floor, event interpretation, target checks, and one-confirmation finality belong in the integration contract. |

## Deployment and interoperability gaps

### Aomi x Circle Execution Kit

1. **Hosted Task access is not verified.** `https://chat.aomi.dev/openapi.json` advertises `/v1/task/build`, `task:build`, and the Task resource, but on this snapshot an unauthenticated POST to that route returns the portal's Next.js 404. The live OAuth metadata omits `task:build` from `scopes_supported`. There is no live Aomi Task guide at `/docs/integrate/task` or `/docs/api-reference/task`.
2. **The safe Task buyer is not a package.** The merged `examples/task-api` client verifies the Aomi attestation, exact Payment-Required hash, seller, fee cap, artifact SHA-256, and a durable private recovery journal. Builders cannot get those protections from `@aomi-labs/client` today.
3. **Generic Circle x402 payment is not proven compatible with Task's two-body protocol.** Circle documents retrying the paid resource request. Task preparation uses an intent body, but purchase/recovery uses `{quoteId, retrievalToken}` plus `Payment-Signature`. A thin orchestrator must perform and test that transition; `circle services pay` alone is not evidence.
4. **The Circle signing bridge is missing.** The Task example accepts a `signTypedData` callback, while Circle CLI can sign typed data. An owned adapter must connect them without printing or weakening the signed authorization and must retain Task's recovery journal.
5. **Exact execution is missing.** Circle's documented Agent Wallet command is ABI-based, while Task releases exact prepared calls. The adapter must prove the submitted chain, sender, target, value, and calldata equal the reviewed artifact, then reconcile the Circle transaction result with the Task intent.
6. **Marketplace listing is premature.** Circle describes its Agent Marketplace paid flow as no-account/no-API-key x402. Task presently requires resource-bound Aomi OAuth in addition to payment. Listing requirements and authenticated-service support need an explicit Circle decision.
7. **Mainnet remains a separate gate.** Arc itself is now on mainnet and Circle Agent Wallets list `ARC`, but Aomi Task payments remain disabled for mainnet and the merged record does not prove mainnet simulation, facilitation, or transaction execution.

### Arc Agent-in-a-Box

1. **No first-class Circle adapter is documented by Aomi.** The Aomi SDK documents a Viem-shaped `EvmWallet`; Circle Agent Wallets are documented as a CLI surface. A browser app using Circle user-controlled wallets has a separate server challenge and client authorization lifecycle. The starter needs one supported adapter rather than calling all of these interchangeable.
2. **Browser auth and App visibility must be chosen.** Guest mode is suitable for a demo but not guaranteed to resolve actions. Device OAuth is for CLI/service use. Cross-origin browser use requires widget auth or a provisioned browser OAuth integration, and private Apps cannot be reached through the widget.
3. **Commit support cannot be assumed.** Published client and deployed host support must match, and durable Commit routes use host authentication outside the Agent OAuth resource. Typed Actions are the currently documented portable boundary.
4. **The golden path still needs outcome proof.** Live chat endpoints and Circle wallet support do not prove the composed flow. Readiness requires a real Arc-testnet run showing prompt -> Agent events -> reviewed action -> Circle authorization -> transaction hash -> final Arc receipt -> action result returned to the same Aomi session.

## Product boundary to carry forward

```text
Arc Agent-in-a-Box
builder UI/API -> Aomi Agent session + App tools -> reviewed typed Action
               -> Circle wallet authorization -> Arc receipt -> action result

Aomi x Circle Execution Kit
agent/CLI -> authenticated Aomi Task preparation -> verified 402 quote
          -> Circle Gateway authorization -> exact frozen Task artifact
          -> independent review -> Circle wallet execution -> Arc receipt
```

In both flows, Aomi owns intent handling, tool/runtime coordination, transaction construction, and simulation evidence. Circle owns payment and wallet authorization. Arc owns finality. The builder owns product policy, user approval UX, and the decision to submit. These layers must remain independently visible in code and on the site.

## Primary sources

- Aomi: [Agent API](https://aomi.dev/docs/integrate/agent), [Agent REST API](https://aomi.dev/docs/api-reference/agent), [Authentication](https://aomi.dev/docs/integrate/authentication), [Wallet and signing](https://aomi.dev/docs/integrate/actions-and-signing), [Client SDK](https://aomi.dev/docs/integrate/client-sdk), [live OpenAPI](https://chat.aomi.dev/openapi.json)
- Task API: [merged PR](https://github.com/aomi-labs/product-mono/pull/1133), [authoritative merged contract](https://github.com/aomi-labs/product-mono/blob/8352c822106e92099aad35b61adb184eb3953b9a/docs/topics/pipeline/facts/task-api.md), [buyer example](https://github.com/aomi-labs/product-mono/tree/8352c822106e92099aad35b61adb184eb3953b9a/examples/task-api)
- Circle: [Agent Stack](https://developers.circle.com/agent-stack), [Circle CLI](https://developers.circle.com/agent-stack/circle-cli), [Agent Wallets](https://developers.circle.com/agent-stack/agent-wallets), [supported chains](https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains), [wallet operations](https://developers.circle.com/agent-stack/agent-wallets/wallet-operations), [Gateway Nanopayments](https://developers.circle.com/gateway-nanopayments), [pay for a service](https://developers.circle.com/agent-stack/agent-nanopayments/operations/pay-for-service), [Agent Marketplace](https://developers.circle.com/agent-stack/agent-marketplace)
- Arc: [RPC and network parameters](https://docs.arc.io/arc/references/rpc-endpoints), [EVM differences](https://docs.arc.io/arc/references/evm-differences), [contract addresses](https://docs.arc.io/arc/references/contract-addresses)
