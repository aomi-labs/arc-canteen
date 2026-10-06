# Agent-in-a-Box browser proof

These images were captured from the local invoice dashboard on 2026-10-06.

- `INV-1042` reaches **Ready for wallet review** with the exact recipient, amount, and Arc Testnet chain shown before signing.
- `INV-1043` stops at **Payment refused** because the current vendor wallet differs from the invoice snapshot.
- Both states were captured at desktop and mobile sizes with zero browser console errors.

The checked-in images are fixture-backed and stop before `Confirm exact Circle CLI transfer`.

The hosted follow-up on 2026-10-06 used Aomi Application `2938640` through the production dashboard and exercised the same persistent Agent API session across:

- `INV-1042`: approved for exact Circle wallet review;
- `INV-1043`: refused because the vendor payout address changed;
- `INV-1044`: refused because the invoice was already paid.

That browser run completed with zero console warnings or errors. It proves the deployed app, custom API tools, direct Agent API accessor, and Circle review handoff—not Circle signing or Arc settlement.
