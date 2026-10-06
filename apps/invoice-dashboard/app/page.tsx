import { AgentExperience } from "@/components/agent-experience";

export default function Page() {
  return (
    <main>
      <header className="topbar">
        <a href="https://arc-canteen.vercel.app">Aomi × Arc</a>
        <span>Invoice Agent reference app</span>
      </header>
      <section className="hero">
        <p className="eyebrow">Arc Agent-in-a-Box</p>
        <h1>Pay the right invoice once.</h1>
        <p>
          The agent reads your application API. Deterministic code checks the vendor, address,
          chain, and prior payment. Circle retains review and signing authority.
        </p>
      </section>
      <AgentExperience
        applicationId={process.env.NEXT_PUBLIC_AOMI_APPLICATION_ID ?? ""}
        backendUrl={process.env.NEXT_PUBLIC_AOMI_BASE_URL ?? "https://api.aomi.dev"}
      />
    </main>
  );
}
