# Author clean-checkout replay

- Tested at: `2026-10-06T11:07:44Z`
- Commit: `95aa673270b168dc0ab73c05c0bb5efec6445fa4`
- Checkout: clean detached worktree with no reused build output
- Dependency install: `pnpm install --frozen-lockfile` passed
- TypeScript: 19 tests passed (3 fixture, 6 Circle adapter, 7 Task client, 3 dashboard route)
- Web builds: site and invoice dashboard production builds passed
- Rust: 3 tests, `cargo check`, and `cargo fmt --all -- --check` passed for the invoice agent
- Production: the follow-up proof branch ran `pnpm check:production` against this deployed commit and verified the public product pages, dashboard, invoice decisions, refusal cases, and fail-closed public signer

This is an author-operated reproducibility check. It does not count as the non-author replay required for independent validation, and it does not exercise a hosted Aomi deployment, funded Circle wallet, or live Arc transaction.
