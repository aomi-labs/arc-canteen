"use client";

import dynamic from "next/dynamic";

const APPLICATION_ID = 2_938_640;
const AomiWidget = dynamic(
  () => import("@aomi-labs/widget-lib").then((module) => module.AomiWidget),
  { ssr: false, loading: () => <div className="live-widget-loading">Loading invoice agent…</div> },
);

export function InvoiceAgentWidget() {
  return (
    <div className="live-widget">
      <AomiWidget
        applicationId={String(APPLICATION_ID)}
        apiUrl="https://chat.aomi.dev"
        auth={{ kind: "browser_wallet" }}
        wallets={{ evm: { preset: "popular" }, solana: false }}
        walletFamilies={["evm"]}
        walletPosition="footer"
        routing={{
          targets: [{ mode: "direct", apps: [{ applicationId: APPLICATION_ID }] }],
          defaultMode: "direct",
        }}
        showSidebar={false}
        persistThread
        threadPersistenceKey={`arc-invoice-agent-${APPLICATION_ID}-canteen`}
        height="660px"
      />
    </div>
  );
}
