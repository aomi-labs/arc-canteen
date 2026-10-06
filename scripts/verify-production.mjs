import assert from "node:assert/strict";

const siteUrl = process.env.ARC_CANTEEN_SITE_URL ?? "https://arc-canteen.aomi.dev";

async function response(path, options) {
  const result = await fetch(new URL(path, siteUrl), options?.request);
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
await page("/agent-in-a-box", /Watch it live/);
await page("/agent-in-a-box", /Tameion RFB 02/);
await page("/examples/invoice-dashboard", /Watch it live/);
await response("/proof/pay-the-right-invoice", { status: 404 });

const home = await (await response("/")).text();
assert.match(home, /href="\/agent-in-a-box#watch-live"/, "live agent CTA lost its href");
assert.match(home, /href="https:\/\/aomi\.dev\/docs\/build"/, "Aomi Build reference lost its href");

const agentInABox = await (await response("/agent-in-a-box")).text();
assert.match(agentInABox, />Widget Source Code ↗</, "widget source CTA is missing");
assert.match(agentInABox, />App Source Code ↗</, "invoice-agent source CTA is missing");
assert.match(agentInABox, />How it works</, "request-lifecycle CTA is missing");
assert.match(
  agentInABox,
  /href="https:\/\/github\.com\/aomi-labs\/arc-canteen\/tree\/main\/templates\/invoice-agent"/,
  "invoice-agent source CTA lost its href",
);

const executionKit = await (await response("/execution-kit")).text();
const executionSections = [
  "You already own the intelligence.",
  "Integrate against the tested contract.",
  "From agent intent to verified Arc receipt.",
  "Five gates before completion.",
];
let previousSection = -1;
for (const section of executionSections) {
  const position = executionKit.indexOf(section);
  assert.ok(position > previousSection, `execution-kit section is missing or out of order: ${section}`);
  previousSection = position;
}
assert.match(executionKit, /ArcExecutionKit\.arcTestnet/, "complete Execution Kit integration is missing");

const invoice = await (await response("/api/invoices/INV-1042")).json();
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

const approved = await (await response("/api/invoices/INV-1042/decision")).json();
assert.equal(approved.decision, "approve");
assert.equal(approved.recipient, invoice.vendorWalletSnapshot);
assert.equal(approved.amountWei, invoice.amountWei);

const changedAddress = await (await response("/api/invoices/INV-1043/decision")).json();
assert.deepEqual(
  { decision: changedAddress.decision, code: changedAddress.code },
  { decision: "refuse", code: "vendor_address_changed" },
);

const alreadyPaid = await (await response("/api/invoices/INV-1044/decision")).json();
assert.deepEqual(
  { decision: alreadyPaid.decision, code: alreadyPaid.code },
  { decision: "refuse", code: "already_paid" },
);

console.log(JSON.stringify({
  status: "verified",
  siteUrl,
  checks: {
    productPages: 4,
    integratedAgentPage: true,
    agentDemoActions: true,
    executionKitJourney: true,
    approvedInvoice: "INV-1042",
    refusedInvoices: ["INV-1043", "INV-1044"],
    settlement: "not exposed",
  },
}, null, 2));
