"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { links } from "@/components/links";

export function ExternalLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={className} target="_blank" rel="noreferrer">{children}</a>;
}

const nav = [
  { label: "Start", href: "/#start" },
  { label: "Agent", href: "/agent-in-a-box" },
  { label: "Execution", href: "/execution-kit" },
  { label: "Reference", href: "/reference" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aomi-mark.svg" alt="" width="26" height="26" />
          <span>Aomi × Arc</span>
        </Link>
        <nav aria-label="Main navigation">
          {nav.map((item) => <Link key={item.href} className={pathname === item.href ? "active" : ""} href={item.href}>{item.label}</Link>)}
          <ExternalLink href={links.github}>GitHub ↗</ExternalLink>
          <ExternalLink href={links.docs}>Docs ↗</ExternalLink>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div><strong>Aomi × Arc</strong><p>Builder infrastructure for agentic finance on Arc.</p></div>
        <div><Link href="/execution-kit">Execution Kit</Link><Link href="/agent-in-a-box">Agent-in-a-Box</Link></div>
        <div><ExternalLink href={links.tameion}>Tameion Hackathon ↗</ExternalLink><ExternalLink href={links.github}>Source ↗</ExternalLink></div>
      </div>
    </footer>
  );
}
