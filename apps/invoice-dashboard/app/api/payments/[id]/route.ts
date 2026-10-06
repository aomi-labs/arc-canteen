import { recordPayment, readPayment } from "@/lib/payment-store";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payment = readPayment(id);
  return payment ? NextResponse.json(payment) : NextResponse.json({ error: "Payment record not found" }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as { transactionHash?: string };
  try {
    return NextResponse.json(recordPayment(id, body.transactionHash ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
