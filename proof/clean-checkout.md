# Author clean-checkout replay

- Tested at: `2026-10-06T10:30:10Z`
- Commit: `6140e73377ad000f117a64eda2e34e5062139953`
- Checkout: fresh local clone with no reused working tree
- Dependency install: `pnpm install --frozen-lockfile` passed
- TypeScript: 19 tests passed (3 fixture, 6 Circle adapter, 7 Task client, 3 dashboard route)
- Web builds: site and invoice dashboard production builds passed
- Rust: `cargo check` and `cargo fmt --all -- --check` passed for the invoice agent

This is an author-operated reproducibility check. It does not count as the non-author replay required for independent validation, and it does not exercise a hosted Aomi deployment, funded Circle wallet, or live Arc transaction.
