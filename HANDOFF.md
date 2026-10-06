# Arc Canteen implementation handoff

This repository is the owned home of two Tameion builder products:

- **Aomi x Circle Execution Kit** for builders who already have an agent or decision engine.
- **Arc Agent-in-a-Box** for builders who need to author, deploy, and embed an agent around their own APIs or contracts.

The product and site decisions are recorded in the closed Wayfinder map, [Wayfind the Aomi Arc builder products and site](https://github.com/aomi-labs/arc-canteen/issues/2). The current implementation status is machine-readable in `proof/manifest.json`.

## Live surfaces

- Product site: <https://arc-canteen.aomi.dev>
- Invoice dashboard and fixture API: <https://arc-invoice-agent.vercel.app>
- Aomi Build handoff: <https://build.aomi.dev>

Run `pnpm check:production` to verify the public product pages, invoice API decisions, refusal cases, and the public signer's fail-closed boundary.

## Remaining live gates

1. Connect this repository to Aomi Build, deploy and activate `templates/invoice-agent`, and record the issued Application ID.
2. Configure the hosted app's `INVOICE_API_BASE_URL` secret slot with `https://arc-invoice-agent.vercel.app/api`.
3. Set `NEXT_PUBLIC_AOMI_APPLICATION_ID` on the invoice-dashboard Vercel project and redeploy it.
4. Complete a real Agent API session that approves `INV-1042` and refuses `INV-1043` or `INV-1044`.
5. With an authenticated and funded Circle Agent Wallet, explicitly review and sign the approved 1 test-USDC transfer on Arc Testnet.
6. Independently verify the Arc receipt, correlate the Aomi, Circle, and Arc identifiers, and update the proof bundle.
7. Have a non-author reproduce the documented path before changing the public claim to Builder-ready.

Do not mark a live gate complete from a build, mock, HTTP 200, transaction submission, or example identifier. Never commit access tokens, wallet credentials, private keys, or session material.
