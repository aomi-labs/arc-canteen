# Build with Aomi at Tameion

A standalone builder resource for the Tameion hackathon on Arc. Intended domain: `arc-canteen.aomi.dev`. The site is in this repository and is not deployed yet.

## Run locally

```bash
pnpm install --frozen-lockfile
npm run dev -- --port 3006
```

Open http://localhost:3006. To check production compilation, run `npm run typecheck && npm run build`.

## Content and boundaries

The editable text, links, and recipe data live in `content/site.ts`. The full developer reference (CLI, Skills, MCP, Rust SDK, Build platform, widget, SDK/API, Telegram, security, examples) lives in `content/build.ts` and renders on `/build`. The site is a static guide, not a wallet, transaction simulator, payment processor, or live transaction record. Its Arc Testnet walkthrough is based on Aomi's documented Portal experience; a team member with a funded test wallet must complete and record an end-to-end run before describing the steps as verified in the deployed environment.

The fully written USDC payment recipe describes a user-approved transfer. It does **not** assert that Aomi already pays an x402-gated API on Arc through this same flow. StableFX requires a Circle credential and remains a direction until the actual flow is tested.

The Aomi mark is copied from the Aomi Labs landing asset. Color, type, and controls follow `@aomi-labs/design`: ink `#09090b`, sky `#5288c2`, pink only as a small mark, PT Serif display, Geist body, pill buttons, and square ink borders.

## Publishing checklist

- Confirm `arc-canteen.aomi.dev` DNS and Vercel project ownership.
- Verify Portal Arc Testnet network selection and a USDC transfer with an ArcScan receipt.
- Confirm the deployed simulation, signing and Commit Service behavior with Aomi engineering.
- Check StableFX demo credential availability before calling that recipe runnable.
- Replace or add an office-hours link only when Canteen has published it.
