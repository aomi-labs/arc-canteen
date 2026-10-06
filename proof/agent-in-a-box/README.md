# Agent-in-a-Box browser proof

These images were captured from the local invoice dashboard on 2026-10-06.

- `INV-1042` reaches **Ready for wallet review** with the exact recipient, amount, and Arc Testnet chain shown before signing.
- `INV-1043` stops at **Payment refused** because the current vendor wallet differs from the invoice snapshot.
- Both states were captured at desktop and mobile sizes with zero browser console errors.

The evidence is fixture-backed and stops before `Confirm exact Circle CLI transfer`. It proves the builder UX and deterministic decision boundary, not a live Aomi Agent API session or Circle/Arc execution.
