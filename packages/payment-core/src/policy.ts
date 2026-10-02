import {
  isHexAddress,
  sameAddress,
  type ApprovedPaymentIntent,
  type HexAddress,
  type PaymentIntent,
  type PolicyDecision,
} from "./domain";

export type PaymentPolicy = {
  chain: PaymentIntent["chain"];
  source: HexAddress;
  approvedRecipients: ReadonlySet<string>;
  paidInvoiceIds: ReadonlySet<string>;
  maxAmountUsdcMicros: bigint;
};

export function evaluatePayment(
  intent: PaymentIntent,
  policy: PaymentPolicy,
): PolicyDecision {
  if (!isHexAddress(intent.source) || !isHexAddress(intent.recipient)) {
    return { status: "rejected", reason: "invalid_address" };
  }
  if (intent.chain !== policy.chain) {
    return { status: "rejected", reason: "wrong_chain" };
  }
  if (!sameAddress(intent.source, policy.source)) {
    return { status: "rejected", reason: "wrong_source" };
  }
  if (!policy.approvedRecipients.has(intent.recipient.toLowerCase())) {
    return { status: "rejected", reason: "unapproved_recipient" };
  }
  if (policy.paidInvoiceIds.has(intent.invoiceId)) {
    return { status: "rejected", reason: "duplicate_invoice" };
  }
  if (
    intent.amountUsdcMicros <= 0n ||
    intent.amountUsdcMicros > policy.maxAmountUsdcMicros
  ) {
    return { status: "rejected", reason: "amount_out_of_bounds" };
  }

  return {
    status: "approved",
    intent: intent as ApprovedPaymentIntent,
  };
}
