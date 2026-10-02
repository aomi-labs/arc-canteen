export type HexAddress = `0x${string}`;
export type HexHash = `0x${string}`;
export type Uuid = `${string}-${string}-${string}-${string}-${string}`;
export type ArcChain = "ARC-TESTNET" | "ARC";

export const ARC_TESTNET_USDC =
  "0x3600000000000000000000000000000000000000" as HexAddress;
export const CIRCLE_CLI_PACKAGE = "@circle-fin/cli";
export const CIRCLE_CLI_VERSION = "1.1.4";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

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
  providerStatus?: string;
  providerPayload?: JsonValue;
};

export interface SettlementAdapter {
  settle(intent: ApprovedPaymentIntent): Promise<SettlementReceipt>;
}

export interface ReconciliationAdapter extends SettlementAdapter {
  reconcile(intent: ApprovedPaymentIntent): Promise<SettlementReceipt>;
}

export function isUuid(value: string): value is Uuid {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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
  const whole = amountUsdcMicros / 1_000_000n;
  const fraction = (amountUsdcMicros % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
