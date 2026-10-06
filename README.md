# Aomi × Arc builder products

This monorepo gives Tameion hackathon builders two focused ways to add AI to an Arc application.

| If the builder… | Use | Source |
| --- | --- | --- |
| already has an agent or decision engine | **Aomi × Circle Execution Kit** | `packages/task-client`, `packages/circle-arc-wallet` |
| needs to build and embed the agent | **Arc Agent-in-a-Box** | `templates/invoice-agent`, `apps/invoice-dashboard` |

The public site in `apps/site` is a launcher for these products. It intentionally links to the canonical [Aomi Build](https://aomi.dev/docs/build) and [Agent API](https://aomi.dev/docs/integrate/agent) documentation instead of duplicating it.

## Repository map

- `apps/site` — product-first Tameion landing site.
- `apps/invoice-dashboard` — canonical Aomi Widget plus explicit Circle Wallet execution review.
- `templates/invoice-agent` — Rust Aomi App with custom invoice and vendor API tools.
- `fixtures/invoice-workflow` — deterministic approved, changed-address, and already-paid cases.
- `packages/task-client` — hardened client for the Aomi Task API contract.
- `packages/circle-arc-wallet` — Circle CLI adapter and independent Arc receipt verifier.
- `proof/manifest.json` — machine-readable readiness claims. Unverified gates stay unverified.
- `scripts/verify-production.mjs` — read-only smoke of the two public deployments and fail-closed signer boundary.

## Run locally

```bash
pnpm install
pnpm check
pnpm dev
```

The site runs on port 3000. The invoice dashboard runs on port 3001 with `pnpm dev:dashboard`.

Copy `apps/invoice-dashboard/.env.example` to `.env.local` to connect a deployed Aomi App. Live wallet execution additionally needs an authenticated Circle CLI, a wallet address, and an Arc Testnet RPC URL. Never put wallet credentials in this repository.

## Deploy

The root `.aomi/config.json` registers `templates/invoice-agent/aomi.toml` as the community Project application. Connect and deploy the repository through [Aomi Build](https://build.aomi.dev); do not copy the app into a second platform repository.

The invoice dashboard is a separate Vercel project from the product site. Deploy it from the repository root so pnpm workspace dependencies are available:

```bash
./scripts/deploy-invoice-dashboard.sh
```

The script deploys an archive of the current commit, swaps in the dashboard-specific Vercel config inside an isolated temporary directory, and records the source commit in deployment metadata. It never uploads local build output or uncommitted files.

Set `NEXT_PUBLIC_AOMI_APPLICATION_ID` only after Aomi Build has activated the invoice agent. The public deployment intentionally cannot invoke the local Circle CLI signer route.

Verify the public product pages and invoice decisions without signing or mutating wallet state:

```bash
pnpm check:production
```

## Status and trust boundaries

- **Execution Kit: Preview.** The client implements the expected `/v1/task/build` validation and recovery contract, but Aomi does not currently expose a confirmed public hosted Task endpoint. Do not present it as live until that endpoint passes the proof manifest gates.
- **Agent-in-a-Box: live hosted starter.** Aomi Application 2938640 calls the public invoice APIs, and the dashboard embeds it through `@aomi-labs/widget-lib`, locked to that Application ID in Direct mode. The approved and refusal paths are production-verified; Circle signing and Arc settlement are intentionally still unverified.
- Circle Agent Wallet retains signing authority. Aomi prepares and orchestrates execution; it is not the custodian, trader, counterparty, or compliance principal.
- A successful API response is not settlement. The live path records payment only after Circle confirmation and an independent `eth_getTransactionReceipt` check against Arc.

## Invoice proof

`INV-1042` is the only fixture eligible for preparation. `INV-1043` must refuse because the vendor wallet changed. `INV-1044` must refuse because payment is already confirmed. The hosted agent has exercised all three against the public fixture API; this is not evidence of a live Arc transfer.

Repository checks never submit a funded-wallet transaction or mainnet action.
