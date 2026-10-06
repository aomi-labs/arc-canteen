# Proof policy

`manifest.json` is the readiness boundary for product claims. Local checks may verify code and fixture behavior. They cannot turn the hosted, wallet, or receipt gates green.

The manifest is intentionally explicit about the difference between fixture proof, mocked transport proof, a protected Vercel preview, and a live product result. A missing live identifier is recorded as `null`; it is never replaced by an example value.

## Included evidence

- `site/` contains desktop and mobile captures of every builder-facing product page.
- `agent-in-a-box/` contains the approved invoice review boundary and the changed-address refusal on desktop and mobile.
- Source links in the captured site point to the immutable commit recorded in the manifest.
- The screenshots stop before the Circle signing action. No wallet action was authorized or submitted while producing them.

A live proof must record, without exposing credentials:

1. the deployed Aomi Application ID and reachable Agent API session;
2. the exact reviewed Circle Wallet operation;
3. Circle's confirmed transaction identifier;
4. an independent Arc RPC receipt with matching hash, chain, recipient, and success status.

Until all four exist, the website must keep the relevant status as Preview or local-only.

## Replay

Run `pnpm install --frozen-lockfile` and `pnpm check` from a clean checkout of `sourceCommit`. This verifies local contracts and builds, not the blocked live gates. Record a non-author replay separately before calling the package independently reproducible.
