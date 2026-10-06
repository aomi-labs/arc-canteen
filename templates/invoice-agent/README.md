# Arc Invoice Agent

This is the Agent-in-a-Box starter for Tameion builders. It turns a builder-owned invoice API into five typed Aomi tools and keeps the payment decision inside a deterministic code check.

The only required deployment secret is `INVOICE_API_BASE_URL`, pointing at an HTTPS service that implements the four endpoints described in the repository root README. The included invoice dashboard supplies a compatible fixture API for local development.

Deployment and activation remain owned by [Aomi Build](https://build.aomi.dev). After activation, use the returned Application ID in the example dashboard.
