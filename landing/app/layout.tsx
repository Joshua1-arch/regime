import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regime-Aware AI Trading System — Bitget Hackathon",
  description: "An AI system that classifies crypto market regimes using Qwen AI and dynamically allocates capital to specialist trading agents.",
  icons: {
    icon: "/vercel.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0f1e] text-slate-50">{children}</body>
    </html>
  );
}
