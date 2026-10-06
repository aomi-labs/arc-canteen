# Proof policy

`manifest.json` is the readiness boundary for product claims. Local checks may verify code and fixture behavior. They cannot turn the hosted, wallet, or receipt gates green.

The manifest is intentionally explicit about the difference between fixture proof, mocked transport proof, a public production deployment, and a live product result. A missing live identifier is recorded as `null`; it is never replaced by an example value.

## Included evidence

- `site/` contains desktop and mobile captures of every builder-facing product page.
- `agent-in-a-box/` contains the approved invoice review boundary and the changed-address refusal on desktop and mobile.
- The `production-*` captures record the public site and dashboard at the deployment identifiers in the manifest.
- The screenshots stop before the Circle signing action. No wallet action was authorized or submitted while producing them.
- `pnpm check:production` verifies the public pages, approved and refused invoice decisions, and that the public Circle signer fails closed. It never invokes a wallet.

A live proof must record, without exposing credentials:

1. the deployed Aomi Application ID and reachable Agent API session (verified for Application `2938640`);
2. the exact reviewed Circle Wallet operation;
3. Circle's confirmed transaction identifier;
4. an independent Arc RPC receipt with matching hash, chain, recipient, and success status.

The Agent-in-a-Box hosted-runtime claim can be marked live after item 1. The Execution Kit remains Preview until its hosted Task seam is verified, and no settlement claim is allowed until all four items exist.

## Replay

Run `pnpm install --frozen-lockfile` and `pnpm check` from a clean checkout of `sourceCommit`. This verifies local contracts and builds, not the blocked live gates. Record a non-author replay separately before calling the package independently reproducible.
