import { ARC_TESTNET_CHAIN_ID, CircleArcWallet, verifyArcReceipt } from "@arc-canteen/circle-arc-wallet";
import { evaluateCurrentInvoice, recordPayment } from "@/lib/payment-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json() as { invoiceId?: string; confirmed?: boolean };
  if (body.confirmed !== true || !body.invoiceId) {
    return NextResponse.json({ error: "Explicit confirmation and invoiceId are required" }, { status: 400 });
  }
  const decision = evaluateCurrentInvoice(body.invoiceId);
  if (decision.decision !== "approve") return NextResponse.json(decision, { status: 409 });
  if (decision.chainId !== ARC_TESTNET_CHAIN_ID) {
    return NextResponse.json({ error: "Only Arc Testnet is supported" }, { status: 409 });
  }
  const walletAddress = process.env.CIRCLE_AGENT_WALLET_ADDRESS;
  if (!walletAddress) {
    return NextResponse.json({
      error: "Circle execution is not configured. Set CIRCLE_AGENT_WALLET_ADDRESS and authenticate the Circle CLI on this server.",
      status: "preview",
    }, { status: 503 });
  }
  try {
    const wallet = new CircleArcWallet({ walletAddress });
    let result = await wallet.transfer({
      chainId: ARC_TESTNET_CHAIN_ID,
      recipient: decision.recipient,
      amountUsdc: decision.amountUsdc,
      invoiceId: decision.invoiceId,
      idempotencyKey: `invoice-${decision.invoiceId}`,
    }, () => true);
    if (result.transactionId && !result.transactionHash) {
      result = await wallet.waitForConfirmation(result.transactionId);
    }
    if (!result.transactionHash) throw new Error("Circle did not return a confirmed Arc transaction hash");
    const rpcUrl = process.env.ARC_TESTNET_RPC_URL;
    if (!rpcUrl) throw new Error("ARC_TESTNET_RPC_URL is required for independent receipt verification");
    const receipt = await verifyArcReceipt(result.transactionHash, rpcUrl);
    const payment = recordPayment(decision.invoiceId, receipt.transactionHash);
    return NextResponse.json({ decision, circle: result, receipt, payment });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
