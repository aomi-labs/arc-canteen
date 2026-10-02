use aomi_sdk::{
    DynAomiTool, DynToolCallCtx,
    schemars::JsonSchema,
    serde_json::Value,
};
use serde::Deserialize;

use crate::ArcPaymentApp;
use crate::client::{PaymentApiClient, PaymentResponse};

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct PayApprovedInvoiceArgs {
    /// Approved invoice id only. The payment API owns recipient, amount, source wallet, and settlement.
    pub(crate) invoice_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct PaymentStatusArgs {
    /// Payment id returned by `pay_approved_invoice`.
    pub(crate) payment_id: String,
}

pub(crate) struct PayApprovedInvoice;

impl DynAomiTool for PayApprovedInvoice {
    type App = ArcPaymentApp;
    type Args = PayApprovedInvoiceArgs;

    const NAME: &'static str = "pay_approved_invoice";
    const DESCRIPTION: &'static str = "Pay one approved Arc Canteen invoice by invoice id. Do not supply a recipient, amount, wallet, or network. The operator payment API decides those fields, applies policy, and settles once.";

    fn run(
        _app: &ArcPaymentApp,
        args: Self::Args,
        ctx: DynToolCallCtx,
    ) -> Result<Value, String> {
        let payment = PaymentApiClient::from_ctx(&ctx)?.pay_approved_invoice(&args.invoice_id)?;
        payment_value(payment)
    }
}

pub(crate) struct PaymentStatus;

impl DynAomiTool for PaymentStatus {
    type App = ArcPaymentApp;
    type Args = PaymentStatusArgs;

    const NAME: &'static str = "payment_status";
    const DESCRIPTION: &'static str = "Read the current settlement status for a payment id returned by pay_approved_invoice. Report the API status exactly; submitted or unresolved is not confirmed.";

    fn run(_app: &ArcPaymentApp, args: Self::Args, ctx: DynToolCallCtx) -> Result<Value, String> {
        let payment = PaymentApiClient::from_ctx(&ctx)?.payment_status(&args.payment_id)?;
        payment_value(payment)
    }
}

fn payment_value(payment: PaymentResponse) -> Result<Value, String> {
    serde_json::to_value(payment)
        .map_err(|_| "failed to encode the payment response".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mock_http::{self, MockResponse, RecordedRequest};
    use aomi_sdk::testing::{TestCtxBuilder, run_tool};
    use serde_json::json;

    fn ctx(tool: &str, base_url: &str, token: &str) -> aomi_sdk::DynToolCallCtx {
        TestCtxBuilder::new(tool)
            .secret("ARC_PAYMENT_API_BASE_URL", base_url)
            .secret("ARC_PAYMENT_API_BEARER_TOKEN", token)
            .build()
    }

    fn confirmed_body() -> String {
        json!({
            "paymentId": "pay-1",
            "invoiceId": "inv-1",
            "status": "confirmed",
            "provider": "circle-agent-wallet",
            "providerId": "op-1",
            "txHash": "0xabc",
            "arcscanUrl": "https://testnet.arcscan.app/tx/0xabc"
        })
        .to_string()
    }

    #[test]
    fn pay_approved_invoice_posts_only_the_invoice_id() {
        let server = mock_http::spawn(|request: &RecordedRequest| {
            assert_eq!(request.method, "POST");
            assert_eq!(request.path, "/v1/invoices/inv-1/pay");
            assert!(request.body.is_empty());
            assert_eq!(
                request.authorization.as_deref(),
                Some("Bearer operator-token")
            );
            MockResponse::json(200, confirmed_body())
        });

        let result = run_tool::<PayApprovedInvoice>(
            &ArcPaymentApp,
            json!({ "invoice_id": "inv-1" }),
            ctx("pay_approved_invoice", &server.base_url(), "operator-token"),
        )
        .expect("pay tool");

        assert_eq!(result.value["paymentId"], "pay-1");
        assert_eq!(result.value["invoiceId"], "inv-1");
        assert_eq!(result.value["status"], "confirmed");
        assert_eq!(result.value["txHash"], "0xabc");
        assert!(result.value.get("recipient").is_none());
        assert!(result.value.get("amount").is_none());
    }

    #[test]
    fn payment_status_reads_the_payment_id() {
        let server = mock_http::spawn(|request: &RecordedRequest| {
            assert_eq!(request.method, "GET");
            assert_eq!(request.path, "/v1/payments/pay-1");
            assert_eq!(
                request.authorization.as_deref(),
                Some("Bearer operator-token")
            );
            MockResponse::json(
                200,
                json!({
                    "id": "pay-1",
                    "invoiceId": "inv-1",
                    "status": "in_progress"
                })
                .to_string(),
            )
        });

        let result = run_tool::<PaymentStatus>(
            &ArcPaymentApp,
            json!({ "payment_id": "pay-1" }),
            ctx("payment_status", &server.base_url(), "operator-token"),
        )
        .expect("status tool");

        assert_eq!(result.value["paymentId"], "pay-1");
        assert_eq!(result.value["status"], "in_progress");
    }

    #[test]
    fn second_pay_call_returns_the_existing_settlement() {
        let server = mock_http::spawn(|request: &RecordedRequest| {
            assert_eq!(request.path, "/v1/invoices/inv-1/pay");
            MockResponse::json(200, confirmed_body())
        });

        let first = run_tool::<PayApprovedInvoice>(
            &ArcPaymentApp,
            json!({ "invoice_id": "inv-1" }),
            ctx("pay_approved_invoice", &server.base_url(), "operator-token"),
        )
        .expect("first pay");
        let second = run_tool::<PayApprovedInvoice>(
            &ArcPaymentApp,
            json!({ "invoice_id": "inv-1" }),
            ctx("pay_approved_invoice", &server.base_url(), "operator-token"),
        )
        .expect("second pay");

        assert_eq!(first.value["paymentId"], second.value["paymentId"]);
        assert_eq!(second.value["status"], "confirmed");
    }

    #[test]
    fn unapproved_invoice_is_refused() {
        let server = mock_http::spawn(|_| {
            MockResponse::json(
                409,
                json!({
                    "code": "unapproved_invoice",
                    "message": "invoice is not approved"
                })
                .to_string(),
            )
        });

        let error = run_tool::<PayApprovedInvoice>(
            &ArcPaymentApp,
            json!({ "invoice_id": "inv-unapproved" }),
            ctx("pay_approved_invoice", &server.base_url(), "operator-token"),
        )
        .expect_err("unapproved invoice");

        assert!(error.contains("HTTP 409 Conflict"));
        assert!(error.contains("unapproved_invoice"));
        assert!(!error.contains("operator-token"));
    }

    #[test]
    fn missing_operator_secrets_fail_before_any_http_call() {
        let error = run_tool::<PayApprovedInvoice>(
            &ArcPaymentApp,
            json!({ "invoice_id": "inv-1" }),
            TestCtxBuilder::new("pay_approved_invoice").build(),
        )
        .expect_err("missing secrets");

        assert!(error.contains("ARC_PAYMENT_API_BASE_URL"));
    }
}
