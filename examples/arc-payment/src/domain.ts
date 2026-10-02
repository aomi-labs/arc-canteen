export type HexAddress = `0x${string}`;
export type HexHash = `0x${string}`;
export type Uuid = `${string}-${string}-${string}-${string}-${string}`;
export type ArcChain = "ARC-TESTNET" | "ARC";

export type PaymentIntent = {
  id: Uuid;
  invoiceId: string;
  chain: ArcChain;
  source: HexAddress;
  recipient: HexAddress;
  amountUsdcMicros: bigint;
};

declare const approvedPayment: unique symbol;

export type ApprovedPaymentIntent = PaymentIntent & {
  readonly [approvedPayment]: true;
};

export type PolicyRejection =
  | "invalid_address"
  | "wrong_chain"
  | "wrong_source"
  | "unapproved_recipient"
  | "duplicate_invoice"
  | "amount_out_of_bounds";

export type PolicyDecision =
  | { status: "approved"; intent: ApprovedPaymentIntent }
  | { status: "rejected"; reason: PolicyRejection };

export type SettlementReceipt = {
  intentId: Uuid;
  provider: "circle-agent-wallet" | "aomi-eoa";
  status: "confirmed" | "unresolved";
  txHash?: HexHash;
  providerId?: string;
};

export interface SettlementAdapter {
  settle(intent: ApprovedPaymentIntent): Promise<SettlementReceipt>;
}

export function isHexAddress(value: string): value is HexAddress {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isHexHash(value: string): value is HexHash {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function sameAddress(left: HexAddress, right: HexAddress) {
  return left.toLowerCase() === right.toLowerCase();
}

export function formatUsdc(amountUsdcMicros: bigint) {
  const whole = amountUsdcMicros / BigInt(1_000_000);
  const fraction = (amountUsdcMicros % BigInt(1_000_000))
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
