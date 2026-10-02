use std::io::Read;
use std::time::Duration;

use aomi_sdk::{DynToolCallCtx, resolve_secret_value};
use reqwest::StatusCode;
use reqwest::blocking::{Client, Response};
use reqwest::header::ACCEPT;
use serde::{Deserialize, Serialize};

const API_BASE_URL_SECRET: &str = "ARC_PAYMENT_API_BASE_URL";
const API_BEARER_TOKEN_SECRET: &str = "ARC_PAYMENT_API_BEARER_TOKEN";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE_BYTES: u64 = 256 * 1024;
const MAX_ID_LENGTH: usize = 200;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SettlementStatus {
    InProgress,
    Confirmed,
    Unresolved,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaymentResponse {
    #[serde(alias = "id")]
    pub(crate) payment_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) invoice_id: Option<String>,
    pub(crate) status: SettlementStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) tx_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) arcscan_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PaymentResponseEnvelope {
    Direct(PaymentResponse),
    Payment { payment: PaymentResponse },
    Data { data: PaymentResponse },
}

impl PaymentResponseEnvelope {
    fn into_payment(self) -> PaymentResponse {
        match self {
            Self::Direct(payment) | Self::Payment { payment } | Self::Data { data: payment } => {
                payment
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct ApiErrorResponse {
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    error: Option<ApiErrorDetail>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ApiErrorDetail {
    Message(String),
    Object {
        #[serde(default)]
        code: Option<String>,
        #[serde(default)]
        message: Option<String>,
    },
}

impl ApiErrorResponse {
    fn summary(self) -> Option<String> {
        let mut code = self.code;
        let mut message = self.message;

        match self.error {
            Some(ApiErrorDetail::Message(value)) => {
                message = message.or(Some(value));
            }
            Some(ApiErrorDetail::Object {
                code: nested_code,
                message: nested_message,
            }) => {
                code = code.or(nested_code);
                message = message.or(nested_message);
            }
            None => {}
        }

        match (code, message) {
            (Some(code), Some(message)) => Some(format!("{code}: {message}")),
            (Some(code), None) => Some(code),
            (None, Some(message)) => Some(message),
            (None, None) => None,
        }
    }
}

pub(crate) struct PaymentApiClient {
    http: Client,
    base_url: reqwest::Url,
    bearer_token: String,
}

impl PaymentApiClient {
    pub(crate) fn from_ctx(ctx: &DynToolCallCtx) -> Result<Self, String> {
        let base_url = resolve_secret_value(
            ctx,
            None,
            API_BASE_URL_SECRET,
            "aomi-arc-payment requires the operator secret ARC_PAYMENT_API_BASE_URL",
        )?;
        let bearer_token = resolve_secret_value(
            ctx,
            None,
            API_BEARER_TOKEN_SECRET,
            "aomi-arc-payment requires the operator secret ARC_PAYMENT_API_BEARER_TOKEN",
        )?;

        Self::new(&base_url, bearer_token, CONNECT_TIMEOUT, REQUEST_TIMEOUT)
    }

    fn new(
        base_url: &str,
        bearer_token: String,
        connect_timeout: Duration,
        request_timeout: Duration,
    ) -> Result<Self, String> {
        let base_url = validate_base_url(base_url)?;
        let http = Client::builder()
            .connect_timeout(connect_timeout)
            .timeout(request_timeout)
            .build()
            .map_err(|_| "failed to configure the Arc payment API client".to_string())?;

        Ok(Self {
            http,
            base_url,
            bearer_token,
        })
    }

    pub(crate) fn pay_approved_invoice(
        &self,
        invoice_id: &str,
    ) -> Result<PaymentResponse, String> {
        let invoice_id = validate_id(invoice_id, "invoice_id")?;
        let url = self.endpoint(&["v1", "invoices", invoice_id, "pay"])?;
        let response = self
            .http
            .post(url)
            .header(ACCEPT, "application/json")
            .bearer_auth(&self.bearer_token)
            .send()
            .map_err(|error| request_error("pay approved invoice", error))?;

        let mut payment = decode_response(response)?;
        if payment.invoice_id.is_none() {
            payment.invoice_id = Some(invoice_id.to_string());
        }
        Ok(payment)
    }

    pub(crate) fn payment_status(&self, payment_id: &str) -> Result<PaymentResponse, String> {
        let payment_id = validate_id(payment_id, "payment_id")?;
        let url = self.endpoint(&["v1", "payments", payment_id])?;
        let response = self
            .http
            .get(url)
            .header(ACCEPT, "application/json")
            .bearer_auth(&self.bearer_token)
            .send()
            .map_err(|error| request_error("get payment status", error))?;

        decode_response(response)
    }

    fn endpoint(&self, segments: &[&str]) -> Result<reqwest::Url, String> {
        let mut url = self.base_url.clone();
        let mut path = url
            .path_segments_mut()
            .map_err(|_| "ARC_PAYMENT_API_BASE_URL cannot be used as a base URL".to_string())?;
        path.pop_if_empty();
        path.extend(segments);
        drop(path);
        Ok(url)
    }
}

fn validate_base_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw.trim())
        .map_err(|_| "ARC_PAYMENT_API_BASE_URL is not a valid URL".to_string())?;

    if url.username() != "" || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err(
            "ARC_PAYMENT_API_BASE_URL must not contain credentials, a query, or a fragment"
                .to_string(),
        );
    }

    let is_https = url.scheme() == "https";
    let is_test_loopback = cfg!(test)
        && url.scheme() == "http"
        && url
            .host_str()
            .is_some_and(|host| host == "localhost" || host.parse::<std::net::IpAddr>().is_ok_and(|ip| ip.is_loopback()));

    if !is_https && !is_test_loopback {
        return Err("ARC_PAYMENT_API_BASE_URL must use HTTPS".to_string());
    }

    if url.cannot_be_a_base() {
        return Err("ARC_PAYMENT_API_BASE_URL cannot be used as a base URL".to_string());
    }

    Ok(url)
}

fn validate_id<'a>(value: &'a str, field: &str) -> Result<&'a str, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{field} must not be empty"));
    }
    let allowed = value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.'));
    if value.len() > MAX_ID_LENGTH || !allowed {
        return Err(format!("{field} is invalid"));
    }
    Ok(value)
}

fn decode_response(response: Response) -> Result<PaymentResponse, String> {
    let status = response.status();
    let body = read_bounded_body(response)?;

    if !status.is_success() {
        let detail = serde_json::from_slice::<ApiErrorResponse>(&body)
            .ok()
            .and_then(ApiErrorResponse::summary);
        return Err(api_status_error(status, detail));
    }

    let envelope: PaymentResponseEnvelope = serde_json::from_slice(&body)
        .map_err(|_| "Arc payment API returned an invalid payment response".to_string())?;
    Ok(envelope.into_payment())
}

fn read_bounded_body(response: Response) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|_| "failed to read the Arc payment API response".to_string())?;
    if body.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("Arc payment API response exceeded the size limit".to_string());
    }
    Ok(body)
}

fn api_status_error(status: StatusCode, detail: Option<String>) -> String {
    match detail {
        Some(detail) => format!("Arc payment API returned HTTP {status}: {detail}"),
        None => format!("Arc payment API returned HTTP {status}"),
    }
}

fn request_error(action: &str, error: reqwest::Error) -> String {
    if error.is_timeout() {
        format!("Arc payment API timed out while attempting to {action}")
    } else {
        format!("Arc payment API request failed while attempting to {action}")
    }
}

#[cfg(test)]
impl PaymentApiClient {
    pub(crate) fn for_test(
        base_url: &str,
        bearer_token: &str,
        timeout: Duration,
    ) -> Result<Self, String> {
        Self::new(
            base_url,
            bearer_token.to_string(),
            timeout,
            timeout,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mock_http::{self, MockResponse, RecordedRequest};
    use serde_json::json;
    use std::time::Duration;

    #[test]
    fn rejects_non_https_remote_base_urls() {
        let error = validate_base_url("http://example.com").expect_err("http remote");
        assert!(error.contains("HTTPS"));
    }

    #[test]
    fn rejects_credentials_in_base_url() {
        let error = validate_base_url("https://user:pass@example.com")
            .expect_err("credentials");
        assert!(error.contains("must not contain credentials"));
    }

    #[test]
    fn allows_loopback_http_only_in_tests() {
        validate_base_url("http://127.0.0.1:9").expect("loopback http");
        validate_base_url("https://payments.example.com").expect("https");
    }

    #[test]
    fn rejects_path_injection_in_ids() {
        assert!(validate_id("../escape", "invoice_id").is_err());
        assert!(validate_id("inv/1", "invoice_id").is_err());
        assert!(validate_id("", "payment_id").is_err());
        assert_eq!(validate_id(" inv_1 ", "invoice_id").unwrap(), "inv_1");
    }

    #[test]
    fn pay_posts_bearer_and_decodes_typed_json() {
        let server = mock_http::spawn(|request: &RecordedRequest| {
            assert_eq!(request.method, "POST");
            assert_eq!(request.path, "/v1/invoices/inv-1/pay");
            assert_eq!(request.authorization.as_deref(), Some("Bearer test-token"));
            MockResponse::json(
                200,
                json!({
                    "payment": {
                        "paymentId": "pay-1",
                        "status": "confirmed",
                        "txHash": "0xabc"
                    }
                })
                .to_string(),
            )
        });
        let client = PaymentApiClient::for_test(&server.base_url(), "test-token", Duration::from_secs(2))
            .expect("client");

        let payment = client.pay_approved_invoice("inv-1").expect("pay");
        assert_eq!(payment.payment_id, "pay-1");
        assert_eq!(payment.invoice_id.as_deref(), Some("inv-1"));
        assert_eq!(payment.status, SettlementStatus::Confirmed);
        assert_eq!(payment.tx_hash.as_deref(), Some("0xabc"));
    }

    #[test]
    fn payment_status_gets_unresolved_payload() {
        let server = mock_http::spawn(|request: &RecordedRequest| {
            assert_eq!(request.method, "GET");
            assert_eq!(request.path, "/v1/payments/pay-9");
            MockResponse::json(
                200,
                json!({
                    "data": {
                        "id": "pay-9",
                        "invoiceId": "inv-9",
                        "status": "unresolved"
                    }
                })
                .to_string(),
            )
        });
        let client = PaymentApiClient::for_test(&server.base_url(), "test-token", Duration::from_secs(2))
            .expect("client");

        let payment = client.payment_status("pay-9").expect("status");
        assert_eq!(payment.payment_id, "pay-9");
        assert_eq!(payment.status, SettlementStatus::Unresolved);
    }

    #[test]
    fn unauthorized_responses_do_not_echo_the_bearer() {
        let server = mock_http::spawn(|_| {
            MockResponse::json(
                401,
                json!({ "error": { "code": "unauthorized", "message": "bad token" } }).to_string(),
            )
        });
        let client = PaymentApiClient::for_test(&server.base_url(), "secret-token", Duration::from_secs(2))
            .expect("client");

        let error = client.pay_approved_invoice("inv-1").expect_err("401");
        assert!(error.contains("HTTP 401 Unauthorized"));
        assert!(error.contains("unauthorized"));
        assert!(!error.contains("secret-token"));
    }

    #[test]
    fn request_timeout_is_bounded() {
        let server = mock_http::spawn(|_| {
            MockResponse::delayed(200, "{}", Duration::from_millis(400))
        });
        let client = PaymentApiClient::for_test(
            &server.base_url(),
            "test-token",
            Duration::from_millis(80),
        )
        .expect("client");

        let error = client.payment_status("pay-1").expect_err("timeout");
        assert!(error.contains("timed out"));
    }
}
