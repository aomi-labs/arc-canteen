# Aomi × Arc builder products

This monorepo gives Tameion hackathon builders two focused ways to add AI to an Arc application.

| If the builder… | Use | Source |
| --- | --- | --- |
| already has an agent or decision engine | **Aomi × Circle Execution Kit** | `packages/task-client`, `packages/circle-arc-wallet` |
| needs to build and embed the agent | **Arc Agent-in-a-Box** | `templates/invoice-agent`, `apps/invoice-dashboard` |

The public site in `apps/site` is a launcher for these products. It intentionally links to the canonical [Aomi Build](https://aomi.dev/docs/build) and [Agent API](https://aomi.dev/docs/integrate/agent) documentation instead of duplicating it.

## Repository map

- `apps/site` — product-first Tameion landing site.
- `apps/invoice-dashboard` — headless Aomi agent plus explicit Circle Wallet execution review.
- `templates/invoice-agent` — Rust Aomi App with custom invoice and vendor API tools.
- `fixtures/invoice-workflow` — deterministic approved, changed-address, and already-paid cases.
- `packages/task-client` — hardened client for the Aomi Task API contract.
- `packages/circle-arc-wallet` — Circle CLI adapter and independent Arc receipt verifier.
- `proof/manifest.json` — machine-readable readiness claims. Unverified gates stay unverified.

## Run locally

```bash
pnpm install
pnpm check
pnpm dev
```

The site runs on port 3000. The invoice dashboard runs on port 3001 with `pnpm dev:dashboard`.

Copy `apps/invoice-dashboard/.env.example` to `.env.local` to connect a deployed Aomi App. Live wallet execution additionally needs an authenticated Circle CLI, a wallet address, and an Arc Testnet RPC URL. Never put wallet credentials in this repository.

## Status and trust boundaries

- **Execution Kit: Preview.** The client implements the expected `/v1/task/build` validation and recovery contract, but Aomi does not currently expose a confirmed public hosted Task endpoint. Do not present it as live until that endpoint passes the proof manifest gates.
- **Agent-in-a-Box: local starter.** The app tools, policy, dashboard, and wallet adapter are implemented. Hosted readiness requires deploying through Aomi Build, configuring the Application ID, and completing the live receipt proof.
- Circle Agent Wallet retains signing authority. Aomi prepares and orchestrates execution; it is not the custodian, trader, counterparty, or compliance principal.
- A successful API response is not settlement. The live path records payment only after Circle confirmation and an independent `eth_getTransactionReceipt` check against Arc.

## Invoice proof

`INV-1042` is the only fixture eligible for preparation. `INV-1043` must refuse because the vendor wallet changed. `INV-1044` must refuse because payment is already confirmed. These are local fixtures—not evidence of a live Arc transfer.

No deployment, funded-wallet transaction, or mainnet action is performed by the repository checks.
