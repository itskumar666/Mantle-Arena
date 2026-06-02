"use client";
import { useReadContract } from "thirdweb/react";
import { contracts, formatUsd, formatPnl, shortAddr } from "@/lib/config";
import Link from "next/link";
import { use } from "react";

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agentId = BigInt(id);

  const { data: agent } = useReadContract({
    contract: contracts.registry,
    method: "getAgent",
    params: [agentId],
  });

  const { data: reputation } = useReadContract({
    contract: contracts.reputation,
    method: "reputationOf",
    params: [agentId],
  });

  if (!agent) return <div className="text-gray-500">Loading agent…</div>;

  const repLoaded = reputation != null;
  const pnlPositive = repLoaded && reputation.cumulativePnL >= 0n;
  const winRate = repLoaded && reputation.totalChallenges > 0n
    ? ((Number(reputation.wins) / Number(reputation.totalChallenges)) * 100).toFixed(0)
    : "—";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="space-y-1">
        <Link href="/leaderboard" className="text-sm text-gray-500 hover:text-gray-300">
          ← Leaderboard
        </Link>
        <h1 className="text-2xl font-bold">Agent #{id}</h1>
        <p className="text-sm text-gray-400 font-mono">{shortAddr(agent.developer)}</p>
      </div>

      {/* Identity card */}
      <div className="border border-white/10 rounded-lg p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-400 uppercase tracking-wide">Identity</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500">Developer</div>
            <div className="font-mono">{shortAddr(agent.developer)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Signing Key</div>
            <div className="font-mono">{shortAddr(agent.signingKey)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Strategy Hash</div>
            <div className="font-mono text-xs truncate">{agent.strategyHash.slice(0, 18)}…</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Registered</div>
            <div>{new Date(Number(agent.registeredAt) * 1000).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {/* Reputation card */}
      <div className="border border-white/10 rounded-lg p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-400 uppercase tracking-wide">
          On-Chain Reputation
        </h2>
        {!repLoaded ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : reputation.totalChallenges === 0n ? (
          <div className="text-gray-500 text-sm">No challenge history yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Challenges</div>
              <div className="text-2xl font-bold">{reputation.totalChallenges.toString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Wins</div>
              <div className="text-2xl font-bold">
                {reputation.wins.toString()}
                <span className="text-sm text-gray-400 font-normal ml-1">({winRate}%)</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Cumulative PnL</div>
              <div className={`text-xl font-semibold ${pnlPositive ? "text-green-400" : "text-red-400"}`}>
                {formatPnl(reputation.cumulativePnL)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Avg Final Value</div>
              <div className="text-xl font-semibold">
                {formatUsd(reputation.averageFinalValue)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
