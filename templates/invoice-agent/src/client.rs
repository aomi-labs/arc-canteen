use aomi_sdk::schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;

pub(crate) use crate::tool::*;

const ARC_TESTNET_CHAIN_ID: u64 = 5_042_002;

#[derive(Clone, Default)]
pub(crate) struct InvoiceAgent;

#[derive(Clone)]
pub(crate) struct InvoiceClient {
    http: reqwest::blocking::Client,
    base_url: String,
}

impl InvoiceClient {
    pub(crate) fn from_env() -> Result<Self, String> {
        let base_url = std::env::var("INVOICE_API_BASE_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:3001/api".to_string())
            .trim_end_matches('/')
            .to_string();
        if !(base_url.starts_with("https://")
            || base_url.starts_with("http://127.0.0.1:")
            || base_url.starts_with("http://localhost:"))
        {
            return Err("INVOICE_API_BASE_URL must use HTTPS (loopback HTTP is allowed)".into());
        }
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|error| format!("failed to build invoice API client: {error}"))?;
        Ok(Self { http, base_url })
    }

    fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, String> {
        let response = self
            .http
            .get(format!("{}{path}", self.base_url))
            .send()
            .map_err(|error| format!("invoice API request failed: {error}"))?;
        Self::decode(response)
    }

    fn post<T: for<'de> Deserialize<'de>>(&self, path: &str, body: Value) -> Result<T, String> {
        let response = self
            .http
            .post(format!("{}{path}", self.base_url))
            .json(&body)
            .send()
            .map_err(|error| format!("invoice API request failed: {error}"))?;
        Self::decode(response)
    }

    fn decode<T: for<'de> Deserialize<'de>>(
        response: reqwest::blocking::Response,
    ) -> Result<T, String> {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        if !status.is_success() {
            return Err(format!("invoice API returned {status}: {body}"));
        }
        serde_json::from_str(&body)
            .map_err(|error| format!("invoice API response was invalid: {error}"))
    }

    pub(crate) fn invoice(&self, id: &str) -> Result<Invoice, String> {
        self.get(&format!("/invoices/{id}"))
    }

    pub(crate) fn vendor(&self, id: &str) -> Result<Vendor, String> {
        self.get(&format!("/vendors/{id}"))
    }

    pub(crate) fn payment(&self, id: &str) -> Result<PaymentStatus, String> {
        self.get(&format!("/payments/{id}"))
    }

    pub(crate) fn mark_paid(
        &self,
        id: &str,
        transaction_hash: &str,
    ) -> Result<PaymentStatus, String> {
        if !valid_transaction_hash(transaction_hash) {
            return Err("transaction_hash must be a 32-byte 0x-prefixed hash".into());
        }
        self.post(
            &format!("/payments/{id}"),
            json!({ "transactionHash": transaction_hash }),
        )
    }

    pub(crate) fn decision(&self, id: &str) -> Result<PaymentDecision, String> {
        let invoice = self.invoice(id)?;
        let vendor = self.vendor(&invoice.vendor_id)?;
        let payment = self.payment(id)?;
        Ok(decide(&invoice, &vendor, &payment))
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Invoice {
    pub(crate) id: String,
    pub(crate) vendor_id: String,
    pub(crate) vendor_name: String,
    pub(crate) vendor_wallet_snapshot: String,
    pub(crate) amount_usdc: String,
    pub(crate) amount_wei: String,
    pub(crate) chain_id: u64,
    pub(crate) status: String,
    pub(crate) memo: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Vendor {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) approved: bool,
    pub(crate) wallet_address: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaymentStatus {
    pub(crate) invoice_id: String,
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) transaction_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub(crate) enum PaymentDecision {
    Approve {
        invoice_id: String,
        chain_id: u64,
        recipient: String,
        amount_usdc: String,
        amount_wei: String,
        reason: String,
    },
    Refuse {
        invoice_id: String,
        code: &'static str,
        reason: String,
    },
}

pub(crate) fn decide(
    invoice: &Invoice,
    vendor: &Vendor,
    payment: &PaymentStatus,
) -> PaymentDecision {
    let refuse = |code, reason: &str| PaymentDecision::Refuse {
        invoice_id: invoice.id.clone(),
        code,
        reason: reason.to_string(),
    };
    if !vendor.approved {
        return refuse(
            "vendor_not_approved",
            "The current vendor record is not approved.",
        );
    }
    if invoice.chain_id != ARC_TESTNET_CHAIN_ID {
        return refuse(
            "unsupported_chain",
            "The starter only permits Arc Testnet payments.",
        );
    }
    if invoice.status == "paid" || payment.status == "confirmed" {
        return refuse(
            "already_paid",
            "The invoice already has a confirmed payment.",
        );
    }
    if !same_address(&vendor.wallet_address, &invoice.vendor_wallet_snapshot) {
        return refuse(
            "vendor_address_changed",
            "The current vendor wallet differs from the address captured on the invoice.",
        );
    }
    PaymentDecision::Approve {
        invoice_id: invoice.id.clone(),
        chain_id: invoice.chain_id,
        recipient: vendor.wallet_address.to_ascii_lowercase(),
        amount_usdc: invoice.amount_usdc.clone(),
        amount_wei: invoice.amount_wei.clone(),
        reason: "The vendor is approved, the address is unchanged, and no payment is recorded."
            .into(),
    }
}

fn same_address(left: &str, right: &str) -> bool {
    valid_address(left) && valid_address(right) && left.eq_ignore_ascii_case(right)
}

fn valid_address(value: &str) -> bool {
    value.len() == 42
        && value.starts_with("0x")
        && value[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_transaction_hash(value: &str) -> bool {
    value.len() == 66
        && value.starts_with("0x")
        && value[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct InvoiceIdArgs {
    /// Invoice identifier from the builder's application, for example INV-1042.
    pub(crate) invoice_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct VendorIdArgs {
    /// Vendor identifier returned by get_invoice.
    pub(crate) vendor_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct MarkInvoicePaidArgs {
    /// Invoice identifier whose payment has independently confirmed.
    pub(crate) invoice_id: String,
    /// Confirmed Arc transaction hash returned by the wallet execution path.
    pub(crate) transaction_hash: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approved() -> (Invoice, Vendor, PaymentStatus) {
        (
            Invoice {
                id: "INV-1042".into(),
                vendor_id: "vendor-acme".into(),
                vendor_name: "Acme".into(),
                vendor_wallet_snapshot: "0x1111111111111111111111111111111111111111".into(),
                amount_usdc: "1".into(),
                amount_wei: "1000000000000000000".into(),
                chain_id: ARC_TESTNET_CHAIN_ID,
                status: "due".into(),
                memo: "test".into(),
            },
            Vendor {
                id: "vendor-acme".into(),
                name: "Acme".into(),
                approved: true,
                wallet_address: "0x1111111111111111111111111111111111111111".into(),
            },
            PaymentStatus {
                invoice_id: "INV-1042".into(),
                status: "not_paid".into(),
                transaction_hash: None,
            },
        )
    }

    #[test]
    fn approves_only_the_unchanged_unpaid_invoice() {
        let (invoice, vendor, payment) = approved();
        assert!(matches!(
            decide(&invoice, &vendor, &payment),
            PaymentDecision::Approve { .. }
        ));
    }

    #[test]
    fn refuses_changed_address_and_duplicate_payment() {
        let (invoice, mut vendor, mut payment) = approved();
        vendor.wallet_address = "0x2222222222222222222222222222222222222222".into();
        assert!(matches!(
            decide(&invoice, &vendor, &payment),
            PaymentDecision::Refuse {
                code: "vendor_address_changed",
                ..
            }
        ));
        vendor.wallet_address = invoice.vendor_wallet_snapshot.clone();
        payment.status = "confirmed".into();
        assert!(matches!(
            decide(&invoice, &vendor, &payment),
            PaymentDecision::Refuse {
                code: "already_paid",
                ..
            }
        ));
    }
}
