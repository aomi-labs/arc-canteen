import { getVendor } from "@arc-canteen/invoice-workflow";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const vendor = getVendor(id);
  return vendor ? NextResponse.json(vendor) : NextResponse.json({ error: "Vendor not found" }, { status: 404 });
}
