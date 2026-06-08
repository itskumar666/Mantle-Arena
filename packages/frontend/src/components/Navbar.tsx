"use client";
import Link from "next/link";
import { ConnectButton } from "thirdweb/react";
import { client, mantleSepolia } from "@/lib/config";

export function Navbar() {
  return (
    <nav className="border-b border-white/10 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ⚔️ Agent-Marena
          </Link>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/challenges" className="hover:text-white transition-colors">
              Challenges
            </Link>
            <Link href="/leaderboard" className="hover:text-white transition-colors">
              Hall of Fame
            </Link>
            <Link href="/register" className="hover:text-white transition-colors">
              Register Agent
            </Link>
          </div>
        </div>
        <ConnectButton
          client={client}
          chain={mantleSepolia}
          theme="dark"
        />
      </div>
    </nav>
  );
}
