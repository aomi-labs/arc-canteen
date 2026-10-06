use crate::client::*;
use aomi_sdk::*;
use serde_json::{Value, json};

pub(crate) struct GetInvoice;

impl DynAomiTool for GetInvoice {
    type App = InvoiceAgent;
    type Args = InvoiceIdArgs;
    const NAME: &'static str = "get_invoice";
    const DESCRIPTION: &'static str = "Read one invoice from the builder's application API. Use before making any payment decision.";

    fn run(_app: &InvoiceAgent, args: Self::Args, _ctx: DynToolCallCtx) -> Result<Value, String> {
        serde_json::to_value(InvoiceClient::from_env()?.invoice(&args.invoice_id)?)
            .map_err(|error| error.to_string())
    }
}

pub(crate) struct GetVendor;

impl DynAomiTool for GetVendor {
    type App = InvoiceAgent;
    type Args = VendorIdArgs;
    const NAME: &'static str = "get_vendor";
    const DESCRIPTION: &'static str = "Read the current approved vendor record and payout wallet from the builder's application API.";

    fn run(_app: &InvoiceAgent, args: Self::Args, _ctx: DynToolCallCtx) -> Result<Value, String> {
        serde_json::to_value(InvoiceClient::from_env()?.vendor(&args.vendor_id)?)
            .map_err(|error| error.to_string())
    }
}

pub(crate) struct CheckPaymentStatus;

impl DynAomiTool for CheckPaymentStatus {
    type App = InvoiceAgent;
    type Args = InvoiceIdArgs;
    const NAME: &'static str = "check_payment_status";
    const DESCRIPTION: &'static str = "Check whether the application already records a confirmed payment for this invoice. Always call before preparing payment.";

    fn run(_app: &InvoiceAgent, args: Self::Args, _ctx: DynToolCallCtx) -> Result<Value, String> {
        serde_json::to_value(InvoiceClient::from_env()?.payment(&args.invoice_id)?)
            .map_err(|error| error.to_string())
    }
}

pub(crate) struct PrepareInvoicePayment;

impl DynAomiTool for PrepareInvoicePayment {
    type App = InvoiceAgent;
    type Args = InvoiceIdArgs;
    const NAME: &'static str = "prepare_invoice_payment";
    const DESCRIPTION: &'static str = "Re-check the invoice, vendor, address, chain, and payment status in code. A safe invoice is routed to the host for staging, simulation, explicit wallet review, and signing; unsafe invoices return a refusal with no wallet action.";

    fn run_with_routes(
        _app: &InvoiceAgent,
        args: Self::Args,
        _ctx: DynToolCallCtx,
    ) -> Result<ToolReturn, String> {
        let decision = InvoiceClient::from_env()?.decision(&args.invoice_id)?;
        let PaymentDecision::Approve {
            invoice_id,
            chain_id,
            recipient,
            amount_usdc,
            amount_wei,
            reason,
        } = decision
        else {
            return serde_json::to_value(decision)
                .map(ToolReturn::from)
                .map_err(|error| error.to_string());
        };

        let preview = json!({
            "decision": "approve",
            "status": "awaiting_wallet_review",
            "invoiceId": invoice_id,
            "chainId": chain_id,
            "recipient": recipient,
            "amountUsdc": amount_usdc,
            "amountWei": amount_wei,
            "reason": reason,
        });

        ToolReturn::route(preview)
            .next(|next| {
                next.add::<host::StageTx>(json!({
                    "to": recipient,
                    "description": format!("Pay invoice {invoice_id}: {amount_usdc} native USDC on Arc Testnet"),
                    "data": { "raw": "0x" },
                    "value": amount_wei,
                    "kind": "invoice_payment",
                }))
                .note("Stage this exact Arc Testnet native-USDC transfer. Do not change the recipient or value. The host must simulate it and show the wallet review before signing.")
                .enforce(EnforcementPolicy::Continue, |enforce| {
                    enforce.add::<host::SimulateBatch>(json!({}));
                    enforce
                        .add::<host::CommitTxs>(json!({ "aa_preference": "manual" }))
                        .bind_as("transaction_hash");
                });
            })
            .after::<MarkInvoicePaid>(json!({ "invoice_id": invoice_id }))
            .awaits("transaction_hash")
            .note("The wallet returned a transaction result. Record it only after the host reports confirmed execution.")
            .try_build()
            .map_err(|error| format!("invoice payment route is invalid: {error}"))
    }
}

pub(crate) struct MarkInvoicePaid;

impl DynAomiTool for MarkInvoicePaid {
    type App = InvoiceAgent;
    type Args = MarkInvoicePaidArgs;
    const NAME: &'static str = "mark_invoice_paid";
    const DESCRIPTION: &'static str = "Write the confirmed Arc transaction hash back to the application API. This is a routed continuation after wallet execution, never a substitute for settlement confirmation.";

    fn run(_app: &InvoiceAgent, args: Self::Args, _ctx: DynToolCallCtx) -> Result<Value, String> {
        serde_json::to_value(
            InvoiceClient::from_env()?.mark_paid(&args.invoice_id, &args.transaction_hash)?,
        )
        .map_err(|error| error.to_string())
    }
}
