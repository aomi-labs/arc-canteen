import assert from "node:assert/strict";

const siteUrl = process.env.ARC_CANTEEN_SITE_URL ?? "https://arc-canteen.aomi.dev";
const dashboardUrl = process.env.ARC_INVOICE_DASHBOARD_URL ?? "https://arc-invoice-agent.vercel.app";

async function response(path, options) {
  const result = await fetch(new URL(path, options?.dashboard ? dashboardUrl : siteUrl), options?.request);
  assert.equal(result.status, options?.status ?? 200, `${result.url} returned ${result.status}`);
  return result;
}

async function page(path, expectedText) {
  const result = await response(path);
  const body = await result.text();
  assert.match(body, expectedText, `${result.url} did not contain the expected product copy`);
}

await page("/", /Ship an Arc finance agent in 10 minutes/);
await page("/execution-kit", /Aomi [×x] Circle/);
await page("/agent-in-a-box", /Agent-in-a-Box/);
await page("/examples/invoice-dashboard", /Hosted agent chat is live/);
await response("/proof/pay-the-right-invoice", { status: 404 });

const home = await (await response("/")).text();
assert.match(home, /href="https:\/\/arc-invoice-agent\.vercel\.app"/, "live proof CTA lost its href");
assert.match(home, /href="https:\/\/aomi\.dev\/docs\/build"/, "Aomi Build reference lost its href");

const dashboard = await response("/", { dashboard: true });
assert.match(await dashboard.text(), /Aomi Widget/i);

const invoice = await (await response("/api/invoices/INV-1042", { dashboard: true })).json();
assert.deepEqual(
  {
    id: invoice.id,
    chainId: invoice.chainId,
    amountUsdc: invoice.amountUsdc,
    recipient: invoice.vendorWalletSnapshot,
  },
  {
    id: "INV-1042",
    chainId: 5_042_002,
    amountUsdc: "1",
    recipient: "0x1111111111111111111111111111111111111111",
  },
);

const approved = await (await response("/api/invoices/INV-1042/decision", { dashboard: true })).json();
assert.equal(approved.decision, "approve");
assert.equal(approved.recipient, invoice.vendorWalletSnapshot);
assert.equal(approved.amountWei, invoice.amountWei);

const changedAddress = await (await response("/api/invoices/INV-1043/decision", { dashboard: true })).json();
assert.deepEqual(
  { decision: changedAddress.decision, code: changedAddress.code },
  { decision: "refuse", code: "vendor_address_changed" },
);

const alreadyPaid = await (await response("/api/invoices/INV-1044/decision", { dashboard: true })).json();
assert.deepEqual(
  { decision: alreadyPaid.decision, code: alreadyPaid.code },
  { decision: "refuse", code: "already_paid" },
);

const signer = await response("/api/circle/execute", {
  dashboard: true,
  status: 403,
  request: {
    method: "POST",
    headers: { "content-type": "application/json", origin: dashboardUrl },
    body: JSON.stringify({ invoiceId: "INV-1042", confirmed: true }),
  },
});
assert.match((await signer.json()).error, /loopback-only/);

console.log(JSON.stringify({
  status: "verified",
  siteUrl,
  dashboardUrl,
  checks: {
    productPages: 4,
    dashboard: true,
    approvedInvoice: "INV-1042",
    refusedInvoices: ["INV-1043", "INV-1044"],
    publicSigner: "blocked",
  },
}, null, 2));
