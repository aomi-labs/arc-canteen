# Circle Agent Wallet adapter for Arc

This internal package wraps the official `circle` CLI without shell interpolation. It provides:

- an exact transfer review before submission;
- a stable Circle idempotency key;
- transaction-status reconciliation;
- explicit terminal-state handling; and
- independent Arc RPC verification of hash, status, sender, recipient, native value, and empty calldata.

The reference dashboard permits CLI execution only from a same-origin loopback browser. Production applications must put this adapter behind their own authenticated and authorized backend. Circle retains signing authority.
