import { getInvoice } from "@arc-canteen/invoice-workflow";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const invoice = getInvoice(id);
  return invoice
    ? NextResponse.json(invoice)
    : NextResponse.json({ error: "Invoice not found" }, { status: 404 });
}
