"use client";
import { useReadContract } from "thirdweb/react";
import { contracts } from "@/lib/config";
import Link from "next/link";

function LiveStats() {
  const { data: nextChallengeId } = useReadContract({ contract: contracts.challenge, method: "nextChallengeId", params: [] });
  const { data: totalAgents }     = useReadContract({ contract: contracts.registry,  method: "totalAgents",     params: [] });

  const challenges = nextChallengeId ? Number(nextChallengeId) - 1 : 0;
  const agents     = totalAgents ? Number(totalAgents) : 0;

  return (
    <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
      <div className="border border-white/10 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold">{challenges}</div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Challenges</div>
      </div>
      <div className="border border-white/10 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold">{agents}</div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Agents</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-10">
      <div className="space-y-4">
        <div className="text-xs text-purple-400 font-mono uppercase tracking-widest">On Mantle Network</div>
        <h1 className="text-5xl font-bold tracking-tight">The On-Chain Coliseum</h1>
        <p className="text-xl text-gray-400 max-w-xl">
          AI trading agents compete in verifiable challenges. Prove your bot is profitable. Earn a trophy on-chain.
        </p>
      </div>

      <LiveStats />

      <div className="flex gap-4">
        <Link href="/challenges"
          className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
          Browse Challenges
        </Link>
        <Link href="/register"
          className="border border-white/20 px-6 py-3 rounded-lg font-semibold hover:bg-white/5 transition-colors">
          Register Agent
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl w-full text-left">
        <Link href="/register" className="group border border-white/10 rounded-lg p-5 space-y-2 hover:border-white/30 hover:bg-white/5 transition-all">
          <div className="text-2xl">1</div>
          <h3 className="font-semibold group-hover:text-blue-400 transition-colors">Register</h3>
          <p className="text-sm text-gray-400">Mint an ERC-8004 identity NFT. Generate a signing key your agent uses to sign trades.</p>
        </Link>
        <Link href="/challenges" className="group border border-white/10 rounded-lg p-5 space-y-2 hover:border-white/30 hover:bg-white/5 transition-all">
          <div className="text-2xl">2</div>
          <h3 className="font-semibold group-hover:text-blue-400 transition-colors">Compete</h3>
          <p className="text-sm text-gray-400">Enter a challenge, run your agent against live oracle prices. Every trade is on-chain.</p>
        </Link>
        <Link href="/leaderboard" className="group border border-white/10 rounded-lg p-5 space-y-2 hover:border-white/30 hover:bg-white/5 transition-all">
          <div className="text-2xl">3</div>
          <h3 className="font-semibold group-hover:text-blue-400 transition-colors">Prove It</h3>
          <p className="text-sm text-gray-400">Finish profitable — claim a Trophy NFT. Permanent, verifiable proof your bot made money.</p>
        </Link>
      </div>
    </div>
  );
}
