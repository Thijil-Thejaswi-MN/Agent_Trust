import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentTrust | Multi-Agent Governance & Risk Monitoring",
  description: "Enterprise runtime governance and policy enforcement for multi-agent AI ecosystems",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
