"use client";
import { use } from "react";
import { useReadContract, useSendTransaction, useActiveAccount } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { parseEther } from "thirdweb/utils";
import { contracts, formatUsd, formatPnl, shortAddr } from "@/lib/config";
import Link from "next/link";

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agentId = BigInt(id);
  const account = useActiveAccount();
  const { mutate: sendTx, isPending: txPending } = useSendTransaction();

  const { data: agent }      = useReadContract({ contract: contracts.registry,   method: "getAgent",      params: [agentId] });
  const { data: reputation } = useReadContract({ contract: contracts.reputation,  method: "reputationOf",  params: [agentId] });
  const { data: claimable }  = useReadContract({
    contract: contracts.stakeVault,
    method: "claimable",
    params: [account?.address as `0x${string}`],
    queryOptions: { enabled: !!account },
  });

  function handleClaim() {
    const tx = prepareContractCall({ contract: contracts.stakeVault, method: "claim", params: [] });
    sendTx(tx);
  }

  if (!agent) return (
    <div className="space-y-4 max-w-2xl animate-pulse">
      <div className="h-8 w-40 bg-white/10 rounded" />
      <div className="h-36 bg-white/5 rounded-lg" />
      <div className="h-36 bg-white/5 rounded-lg" />
    </div>
  );

  const repLoaded  = reputation != null;
  const pnlPos     = repLoaded && reputation.cumulativePnL >= 0n;
  const winRate    = repLoaded && reputation.totalChallenges > 0n
    ? ((Number(reputation.wins) / Number(reputation.totalChallenges)) * 100).toFixed(0)
    : "—";
  const hasClaimable = claimable != null && claimable > 0n;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <Link href="/leaderboard" className="text-sm text-gray-500 hover:text-gray-300">← Leaderboard</Link>
        <h1 className="text-2xl font-bold">Agent #{id}</h1>
      </div>

      {/* Claimable winnings banner */}
      {hasClaimable && (
        <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-green-400">You have winnings to claim!</div>
            <div className="text-sm text-gray-300">{(Number(claimable) / 1e18).toFixed(6)} MNT claimable</div>
          </div>
          <button
            onClick={handleClaim}
            disabled={txPending}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold disabled:opacity-50 transition-colors"
          >
            {txPending ? "Claiming…" : "Claim"}
          </button>
        </div>
      )}

      {/* Identity */}
      <div className="border border-white/10 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Identity (ERC-8004)</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: "Developer",     value: shortAddr(agent.developer) },
            { label: "Signing Key",   value: shortAddr(agent.signingKey) },
            { label: "Strategy Hash", value: agent.strategyHash.slice(0, 18) + "…" },
            { label: "Registered",    value: new Date(Number(agent.registeredAt) * 1000).toLocaleDateString() },
          ].map(r => (
            <div key={r.label}>
              <div className="text-xs text-gray-500">{r.label}</div>
              <div className="font-mono mt-0.5">{r.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reputation */}
      <div className="border border-white/10 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">On-Chain Reputation</h2>
        {!repLoaded ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : reputation.totalChallenges === 0n ? (
          <div className="text-gray-500 text-sm">No settled challenges yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Challenges</div>
              <div className="text-3xl font-bold mt-1">{reputation.totalChallenges.toString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Wins</div>
              <div className="text-3xl font-bold mt-1">
                {reputation.wins.toString()}
                <span className="text-base text-gray-400 font-normal ml-1">({winRate}%)</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Cumulative PnL</div>
              <div className={`text-2xl font-semibold mt-1 ${pnlPos ? "text-green-400" : "text-red-400"}`}>
                {formatPnl(reputation.cumulativePnL)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Avg Final Value</div>
              <div className="text-2xl font-semibold mt-1">{formatUsd(reputation.averageFinalValue)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
