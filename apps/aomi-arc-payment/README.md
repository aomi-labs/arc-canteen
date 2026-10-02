# aomi-arc-payment

Hosted Aomi App for the Arc Canteen invoice-payment lane. The model may supply only an invoice or payment id. Recipient, amount, source wallet, policy, idempotency, and settlement stay in the operator payment API.

## Tools

- `pay_approved_invoice(invoice_id)` — `POST /v1/invoices/:invoiceId/pay`
- `payment_status(payment_id)` — `GET /v1/payments/:id`

## Operator secrets

These slots are operator-managed (`user_own = false`) and required before the app can load:

- `ARC_PAYMENT_API_BASE_URL` — HTTPS base URL, no credentials, query, or fragment
- `ARC_PAYMENT_API_BEARER_TOKEN` — bearer for the payment API

The client uses a 3s connect timeout, a 10s request timeout, and typed JSON. Tool errors must not include secret values.

## SDK pin

`aomi-sdk = "=5.1.1"` is the exact crate version in the local aomi-sdk docs (`sdk/Cargo.toml` and `CHANGELOG.md` for 5.1.1). Do not float it.

## Test

```bash
cd apps/aomi-arc-payment
cargo test
```

Tests talk to a loopback HTTP mock. They do not call Render, Circle, or Aomi hosted runtime.
