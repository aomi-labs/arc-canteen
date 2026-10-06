import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import "@aomi-labs/widget-lib/styles.css";
import "./globals.css";
import "./agent-in-a-box.css";
import "./title-layout.css";

export const metadata: Metadata = {
  title: { default: "Aomi × Arc Builder Products", template: "%s | Aomi × Arc" },
  description: "Add an agent to your Arc app, or connect your existing agent to reviewed Circle Wallet execution.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><body><SiteHeader /><main>{children}</main><SiteFooter /></body></html>;
}
