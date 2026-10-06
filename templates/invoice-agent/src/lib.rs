use aomi_sdk::*;

mod client;
mod tool;

pub(crate) const INVOICE_API_BASE_URL: Secret = Secret::new(
    "INVOICE_API_BASE_URL",
    "HTTPS base URL of the builder's invoice application API, including its /api prefix.",
    true,
);

const PREAMBLE: &str = r#"## Role
You are the invoice operations agent inside an Arc application.

## Workflow
1. Read the invoice with `get_invoice`.
2. Read the current vendor record with `get_vendor`.
3. Check whether the invoice already has a confirmed payment with `check_payment_status`.
4. Use `prepare_invoice_payment` only after those reads. That tool re-checks the rules in code and either refuses or creates one exact Arc Testnet payment action.
5. The host must show the action, simulate it, and obtain explicit wallet approval before signing. You never claim to hold keys or to have paid an invoice before a confirmed transaction result exists.

## Hard rules
- Only Arc Testnet chain 5042002 is supported by this starter.
- Never pay when the current vendor wallet differs from the address captured on the invoice.
- Never pay an invoice that already has a confirmed payment.
- Never change the recipient or amount returned by `prepare_invoice_payment`.
- A refusal is a successful safety outcome. Explain it plainly.
"#;

dyn_aomi_app!(
    app = client::InvoiceAgent,
    name = "arc-invoice-agent",
    version = "0.1.0",
    preamble = PREAMBLE,
    tools = [
        client::GetInvoice,
        client::GetVendor,
        client::CheckPaymentStatus,
        client::PrepareInvoicePayment,
        client::MarkInvoicePaid,
    ],
    secrets = [INVOICE_API_BASE_URL],
    namespaces = []
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_declares_runtime_configuration_and_strict_tool_schemas() {
        let manifest = client::InvoiceAgent.manifest();
        let secrets = manifest.secrets.expect("invoice API URL slot");

        assert_eq!(secrets.len(), 1);
        assert_eq!(secrets[0].name, "INVOICE_API_BASE_URL");
        assert!(secrets[0].required);
        assert!(!secrets[0].user_own);

        for tool in manifest.tools {
            let schema = tool.parameters_schema;
            if schema.get("type").and_then(serde_json::Value::as_str) == Some("object") {
                assert!(
                    schema
                        .get("properties")
                        .and_then(serde_json::Value::as_object)
                        .is_some(),
                    "tool {} must declare object properties",
                    tool.name
                );
            }
        }
    }
}
