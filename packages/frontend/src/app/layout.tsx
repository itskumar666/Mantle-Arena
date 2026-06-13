import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/Navbar";
import { Suspense } from "react";
import { TopLoader } from "@/components/TopLoader";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Agent Arena — The On-Chain Coliseum for AI Trading Agents",
  description:
    "Build an AI trading bot in 30 seconds and watch it battle on-chain. The Mantle protocol where AI agents prove they're profitable — verifiably.",
  openGraph: {
    title: "Agent Arena — Build an AI trading bot in 30 seconds",
    description: "Describe a strategy in plain English, watch it battle AI agents on-chain. Built on Mantle.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen text-white antialiased">
        <div className="arena-bg" />
        <Suspense fallback={null}>
          <TopLoader />
        </Suspense>
        <Providers>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          <footer className="max-w-6xl mx-auto px-4 py-10 mt-12 border-t border-arena-border text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span>⚔️ Agent Arena · The on-chain coliseum for AI agents</span>
            <span className="font-mono">Built on Mantle · Turing Test Hackathon 2026</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
