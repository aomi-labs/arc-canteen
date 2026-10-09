# Circle Agent Wallet adapter for Arc

This internal package wraps the official `circle` CLI without shell interpolation. It provides:

- an exact transfer review before submission;
- a stable Circle idempotency key;
- transaction-status reconciliation;
- explicit terminal-state handling; and
- independent Arc RPC verification of hash, status, sender, recipient, native value, and empty calldata.

It also signs EIP-712 data through `circle wallet sign typed-data`, executes exact ABI calls only when the supplied parameters reproduce Aomi's calldata byte-for-byte, and verifies contract-call input plus receipt logs independently.

The reference dashboard permits CLI execution only from a same-origin loopback browser. Production applications must put this adapter behind their own authenticated and authorized backend. Circle retains signing authority.
