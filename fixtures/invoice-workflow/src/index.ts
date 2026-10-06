export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ONE_USDC_WEI = "1000000000000000000";

export type InvoiceStatus = "due" | "paid";

export interface Vendor {
  id: string;
  name: string;
  approved: boolean;
  walletAddress: `0x${string}`;
}

export interface Invoice {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorWalletSnapshot: `0x${string}`;
  amountUsdc: string;
  amountWei: string;
  chainId: number;
  status: InvoiceStatus;
  memo: string;
}

export interface PaymentStatus {
  invoiceId: string;
  status: "not_paid" | "confirmed";
  transactionHash?: `0x${string}`;
}

export type InvoiceDecision =
  | {
      decision: "approve";
      invoiceId: string;
      chainId: number;
      recipient: `0x${string}`;
      amountUsdc: string;
      amountWei: string;
      reason: string;
    }
  | {
      decision: "refuse";
      invoiceId: string;
      code: "already_paid" | "vendor_not_approved" | "vendor_address_changed" | "unsupported_chain";
      reason: string;
    };

const originalVendorWallet = "0x1111111111111111111111111111111111111111" as const;

export const vendors: Readonly<Record<string, Vendor>> = Object.freeze({
  "vendor-acme": {
    id: "vendor-acme",
    name: "Acme Infrastructure",
    approved: true,
    walletAddress: originalVendorWallet,
  },
  "vendor-changed": {
    id: "vendor-changed",
    name: "Changed Address Supplies",
    approved: true,
    walletAddress: "0x2222222222222222222222222222222222222222",
  },
});

export const invoices: Readonly<Record<string, Invoice>> = Object.freeze({
  "INV-1042": {
    id: "INV-1042",
    vendorId: "vendor-acme",
    vendorName: "Acme Infrastructure",
    vendorWalletSnapshot: originalVendorWallet,
    amountUsdc: "1",
    amountWei: ONE_USDC_WEI,
    chainId: ARC_TESTNET_CHAIN_ID,
    status: "due",
    memo: "October infrastructure invoice",
  },
  "INV-1043": {
    id: "INV-1043",
    vendorId: "vendor-changed",
    vendorName: "Changed Address Supplies",
    vendorWalletSnapshot: originalVendorWallet,
    amountUsdc: "1",
    amountWei: ONE_USDC_WEI,
    chainId: ARC_TESTNET_CHAIN_ID,
    status: "due",
    memo: "Invoice with a changed payout address",
  },
  "INV-1044": {
    id: "INV-1044",
    vendorId: "vendor-acme",
    vendorName: "Acme Infrastructure",
    vendorWalletSnapshot: originalVendorWallet,
    amountUsdc: "1",
    amountWei: ONE_USDC_WEI,
    chainId: ARC_TESTNET_CHAIN_ID,
    status: "paid",
    memo: "Already settled invoice",
  },
});

export const payments: Readonly<Record<string, PaymentStatus>> = Object.freeze({
  "INV-1042": { invoiceId: "INV-1042", status: "not_paid" },
  "INV-1043": { invoiceId: "INV-1043", status: "not_paid" },
  "INV-1044": {
    invoiceId: "INV-1044",
    status: "confirmed",
    transactionHash: `0x${"44".repeat(32)}`,
  },
});

export function getInvoice(invoiceId: string): Invoice | undefined {
  return invoices[invoiceId];
}

export function getVendor(vendorId: string): Vendor | undefined {
  return vendors[vendorId];
}

export function getPaymentStatus(invoiceId: string): PaymentStatus | undefined {
  return payments[invoiceId];
}

export function evaluateInvoice(invoiceId: string): InvoiceDecision {
  const invoice = invoices[invoiceId];
  if (!invoice) throw new Error(`Unknown invoice ${invoiceId}`);
  const vendor = vendors[invoice.vendorId];
  if (!vendor?.approved) {
    return {
      decision: "refuse",
      invoiceId,
      code: "vendor_not_approved",
      reason: "The invoice vendor is not currently approved.",
    };
  }
  if (invoice.chainId !== ARC_TESTNET_CHAIN_ID) {
    return {
      decision: "refuse",
      invoiceId,
      code: "unsupported_chain",
      reason: "The starter only permits Arc Testnet payments.",
    };
  }
  if (invoice.status === "paid" || payments[invoiceId]?.status === "confirmed") {
    return {
      decision: "refuse",
      invoiceId,
      code: "already_paid",
      reason: "The invoice already has a confirmed payment.",
    };
  }
  if (vendor.walletAddress.toLowerCase() !== invoice.vendorWalletSnapshot.toLowerCase()) {
    return {
      decision: "refuse",
      invoiceId,
      code: "vendor_address_changed",
      reason: "The current vendor wallet differs from the address captured on the invoice.",
    };
  }
  return {
    decision: "approve",
    invoiceId,
    chainId: invoice.chainId,
    recipient: vendor.walletAddress,
    amountUsdc: invoice.amountUsdc,
    amountWei: invoice.amountWei,
    reason: "The vendor is approved, the address is unchanged, and no payment is recorded.",
  };
}
