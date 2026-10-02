use aomi_sdk::{Secret, dyn_aomi_app};

mod client;
mod tool;

#[cfg(test)]
mod mock_http;

const PAYMENT_API_BASE_URL: Secret = Secret::new(
    "ARC_PAYMENT_API_BASE_URL",
    "HTTPS base URL for the operator-managed Arc payment API.",
    true,
);

const PAYMENT_API_BEARER_TOKEN: Secret = Secret::new(
    "ARC_PAYMENT_API_BEARER_TOKEN",
    "Bearer token for the operator-managed Arc payment API.",
    true,
);

const PREAMBLE: &str = r#"## Role
You are the hosted payment bridge for approved Arc Canteen invoices.

## Safety boundary
- `pay_approved_invoice` accepts only an invoice id. The payment API owns the recipient, amount, source wallet, policy, idempotency, and settlement.
- Never invent or request a recipient, amount, wallet key, bearer token, or API base URL.
- Use `payment_status` with the returned payment id to check an in-progress or unresolved settlement.
- Report the API status exactly. A submitted or unresolved payment is not confirmed until the API returns `confirmed`.
"#;

#[derive(Clone, Default)]
pub(crate) struct ArcPaymentApp;

dyn_aomi_app!(
    app = ArcPaymentApp,
    name = "aomi-arc-payment",
    version = "0.1.0",
    preamble = PREAMBLE,
    tools = [tool::PayApprovedInvoice, tool::PaymentStatus],
    secrets = [PAYMENT_API_BASE_URL, PAYMENT_API_BEARER_TOKEN],
    namespaces = []
);

#[cfg(test)]
mod tests {
    use super::*;
    use aomi_sdk::DynAomiApp;

    #[test]
    fn manifest_declares_operator_managed_secrets() {
        let manifest = ArcPaymentApp.manifest();
        let secrets = manifest.secrets.expect("secret declarations");

        assert_eq!(secrets.len(), 2);
        assert!(secrets.iter().all(|secret| secret.required));
        assert!(secrets.iter().all(|secret| !secret.user_own));
        assert_eq!(secrets[0].name, "ARC_PAYMENT_API_BASE_URL");
        assert_eq!(secrets[1].name, "ARC_PAYMENT_API_BEARER_TOKEN");
    }

    #[test]
    fn manifest_exposes_invoice_only_payment_tools() {
        let manifest = ArcPaymentApp.manifest();
        let names: Vec<&str> = manifest.tools.iter().map(|tool| tool.name.as_str()).collect();
        assert_eq!(names, ["pay_approved_invoice", "payment_status"]);

        let pay_props = schema_properties(&manifest.tools[0].parameters_schema);
        assert!(pay_props.contains_key("invoice_id"));
        assert!(!pay_props.contains_key("recipient"));
        assert!(!pay_props.contains_key("amount"));
        assert!(!pay_props.contains_key("wallet"));

        let status_props = schema_properties(&manifest.tools[1].parameters_schema);
        assert!(status_props.contains_key("payment_id"));
        assert!(!status_props.contains_key("invoice_id"));
    }

    fn schema_properties(schema: &serde_json::Value) -> &serde_json::Map<String, serde_json::Value> {
        if let Some(properties) = schema.get("properties").and_then(serde_json::Value::as_object) {
            return properties;
        }
        schema
            .get("$defs")
            .and_then(serde_json::Value::as_object)
            .into_iter()
            .flat_map(|defs| defs.values())
            .find_map(|def| def.get("properties").and_then(serde_json::Value::as_object))
            .expect("tool args schema properties")
    }
}
