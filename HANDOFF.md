# Arc Canteen implementation handoff

This repository is the owned home of two Tameion builder products:

- **Aomi x Circle Execution Kit** for builders who already have an agent or decision engine.
- **Arc Agent-in-a-Box** for builders who need to author, deploy, and embed an agent around their own APIs or contracts.

The product and site decisions are recorded in the closed Wayfinder map, [Wayfind the Aomi Arc builder products and site](https://github.com/aomi-labs/arc-canteen/issues/2). The current implementation status is machine-readable in `proof/manifest.json`.

## Live surfaces

- Product site: <https://arc-canteen.aomi.dev>
- Live invoice agent: <https://arc-canteen.aomi.dev/agent-in-a-box#watch-live>
- Hosted invoice agent: Aomi Application `2938640`
- Aomi Build handoff: <https://build.aomi.dev>

Run `pnpm check:production` to verify the public product pages, invoice API decisions, refusal cases, and the public signer's fail-closed boundary.

## Remaining live gates

1. Expose and verify the hosted `/v1/task/build` seam before moving the Aomi × Circle Execution Kit beyond Preview.
2. With an authenticated and funded Circle Agent Wallet, explicitly review and sign the approved 1 test-USDC transfer on Arc Testnet.
3. Independently verify the Arc receipt, correlate the Aomi, Circle, and Arc identifiers, and update the proof bundle.
4. Have a non-author reproduce the documented path before changing the public claim to Builder-ready.

Do not mark a live gate complete from a build, mock, HTTP 200, transaction submission, or example identifier. Never commit access tokens, wallet credentials, private keys, or session material.
