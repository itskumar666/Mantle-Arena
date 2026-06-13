"use client";
import Link from "next/link";
import { ConnectButton } from "thirdweb/react";
import { createWallet } from "thirdweb/wallets";
import { client, mantleSepolia } from "@/lib/config";

const wallets = [
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("walletConnect"),
  createWallet("io.rabby"),
];

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-arena-border bg-arena-950/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
            <span className="text-lg">⚔️</span>
            <span className="text-[15px]">
              Agent<span className="text-gradient-gold">Arena</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
            <Link
              href="/sandbox"
              className="relative text-agent-soft hover:text-white transition-colors font-medium"
            >
              Build a Bot
              <span className="absolute -top-1.5 -right-3 text-[8px] font-bold text-gold uppercase">new</span>
            </Link>
            <Link href="/challenges" className="hover:text-white transition-colors">
              Challenges
            </Link>
            <Link href="/leaderboard" className="hover:text-white transition-colors">
              Hall of Fame
            </Link>
            <Link href="/register" className="hover:text-white transition-colors">
              Register
            </Link>
          </div>
        </div>
        <ConnectButton client={client} chain={mantleSepolia} theme="dark" wallets={wallets} />
      </div>
    </nav>
  );
}
