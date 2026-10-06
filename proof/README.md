# Proof policy

`manifest.json` is the readiness boundary for product claims. Local checks may verify code and fixture behavior. They cannot turn the hosted, wallet, or receipt gates green.

A live proof must record, without exposing credentials:

1. the deployed Aomi Application ID and reachable Agent API session;
2. the exact reviewed Circle Wallet operation;
3. Circle's confirmed transaction identifier;
4. an independent Arc RPC receipt with matching hash, chain, recipient, and success status.

Until all four exist, the website must keep the relevant status as Preview or local-only.
