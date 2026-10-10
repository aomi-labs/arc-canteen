# Circle Agent Wallet adapter for Arc

This internal package wraps the official `circle` CLI without shell interpolation. It provides:

- an exact transfer review before submission;
- a stable Circle idempotency key;
- transaction-status reconciliation;
- explicit terminal-state handling; and
- independent Arc RPC verification of the receipt hash, status, and logs.

It also signs EIP-712 data through `circle wallet sign typed-data` and executes exact ABI calls only when the supplied parameters reproduce Aomi's calldata byte-for-byte. For smart-account or bundler execution, the outer transaction is not treated as the inner call: the consuming app must verify its exact contract events, target, selector, and failure events from the receipt logs.

The reference dashboard permits CLI execution only from a same-origin loopback browser. Production applications must put this adapter behind their own authenticated and authorized backend. Circle retains signing authority.
