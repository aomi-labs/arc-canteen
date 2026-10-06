import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@aomi-labs/widget-lib/styles.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Arc Invoice Agent",
  description: "A Tameion-ready Agent-in-a-Box reference application.",
};

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
