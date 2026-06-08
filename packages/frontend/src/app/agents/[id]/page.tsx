"use client";
import { useReadContract, useSendTransaction, useActiveAccount } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { contracts, formatUsd, formatPnl, shortAddr, EXPLORER } from "@/lib/config";
import Link from "next/link";

export default function AgentPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const agentId = BigInt(id);
  const account = useActiveAccount();
  const { mutate: sendTx, isPending: txPending } = useSendTransaction();

  const { data: agent }      = useReadContract({ contract: contracts.registry,   method: "getAgent",     params: [agentId] });
  const { data: reputation } = useReadContract({ contract: contracts.reputation, method: "reputationOf", params: [agentId] });
  const { data: claimable }  = useReadContract({
    contract: contracts.stakeVault,
    method: "claimable",
    params: [account?.address as `0x${string}`],
    queryOptions: { enabled: !!account },
  });
  const { data: history } = useReadContract({
    contract: contracts.leaderboard,
    method: "agentChallengeHistory",
    params: [agentId],
  });

  function handleClaim() {
    sendTx(prepareContractCall({ contract: contracts.stakeVault, method: "claim", params: [] }));
  }

  if (!agent) return (
    <div className="space-y-4 max-w-2xl animate-pulse">
      <div className="h-8 w-40 bg-white/10 rounded" />
      <div className="h-36 bg-white/5 rounded-lg" />
      <div className="h-36 bg-white/5 rounded-lg" />
    </div>
  );

  const repLoaded = reputation != null;
  const pnlPos    = repLoaded && reputation.cumulativePnL >= 0n;
  const winRate   = repLoaded && reputation.totalChallenges > 0n
    ? ((Number(reputation.wins) / Number(reputation.totalChallenges)) * 100).toFixed(0) : "—";
  const hasClaimable = claimable != null && claimable > 0n;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <Link href="/leaderboard" className="text-sm text-gray-500 hover:text-gray-300">← Hall of Fame</Link>
        <h1 className="text-2xl font-bold">Agent #{id}</h1>
        <a href={`${EXPLORER}/address/${agent.signingKey}`} target="_blank" rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300">
          View on Explorer →
        </a>
      </div>

      {/* Claimable winnings banner */}
      {hasClaimable && (
        <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-green-400">You have winnings to claim!</div>
            <div className="text-sm text-gray-300">{(Number(claimable) / 1e18).toFixed(6)} MNT</div>
          </div>
          <button onClick={handleClaim} disabled={txPending}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold disabled:opacity-50 transition-colors">
            {txPending ? "Claiming…" : "Claim"}
          </button>
        </div>
      )}

      {/* Identity */}
      <div className="border border-white/10 rounded-lg p-5 space-y-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identity (ERC-8004)</h2>
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
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">On-Chain Reputation</h2>
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

      {/* Challenge history */}
      {history && history.length > 0 && (
        <div className="border border-white/10 rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Challenge History</h2>
          <div className="flex flex-wrap gap-2">
            {history.map(cid => (
              <Link key={cid.toString()} href={`/challenges/${cid}`}
                className="text-xs px-3 py-1 border border-white/20 rounded-full hover:border-white/40 hover:bg-white/5 transition-colors font-mono">
                Challenge #{cid.toString()}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trophies */}
      <TrophySection agentId={agentId} history={history ?? []} />
    </div>
  );
}

function TrophySection({ agentId, history }: { agentId: bigint; history: readonly bigint[] }) {
  if (history.length === 0) return null;

  return (
    <div className="border border-yellow-500/20 rounded-lg p-5 space-y-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Trophies</h2>
      <div className="grid grid-cols-1 gap-3">
        {history.map(cid => (
          <TrophyCard key={cid.toString()} agentId={agentId} challengeId={cid} />
        ))}
      </div>
    </div>
  );
}

function TrophyCard({ agentId, challengeId }: { agentId: bigint; challengeId: bigint }) {
  const { mutate: sendTx, isPending, isSuccess } = useSendTransaction();
  const { data: tokenId } = useReadContract({
    contract: contracts.trophy,
    method: "tokenOf",
    params: [challengeId, agentId],
  });
  const { data: settled } = useReadContract({
    contract: contracts.leaderboard,
    method: "isSettled",
    params: [challengeId],
  });
  const { data: result } = useReadContract({
    contract: contracts.leaderboard,
    method: "resultOf",
    params: [challengeId, agentId],
    queryOptions: { enabled: !!settled },
  });

  if (!settled || !result) return null;
  const profitable = result.pnl > 0n;
  const claimed    = tokenId != null && tokenId > 0n;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${claimed ? "border-yellow-500/30 bg-yellow-500/5" : profitable ? "border-white/10 bg-white/5" : "border-white/5"}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{claimed ? "🏆" : profitable ? "🎯" : "📉"}</span>
        <div>
          <Link href={`/challenges/${challengeId}`} className="text-sm font-medium hover:text-blue-400">
            Challenge #{challengeId.toString()}
          </Link>
          <div className={`text-xs mt-0.5 ${result.pnl >= 0n ? "text-green-400" : "text-red-400"}`}>
            {formatPnl(result.pnl)} · Final: {formatUsd(result.finalValue)}
          </div>
        </div>
      </div>
      {claimed ? (
        <span className="text-xs text-yellow-400 font-medium">Trophy #{tokenId!.toString()}</span>
      ) : profitable && !isSuccess ? (
        <button
          onClick={() => sendTx(prepareContractCall({ contract: contracts.trophy, method: "claim", params: [challengeId, agentId] }))}
          disabled={isPending}
          className="text-xs px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded hover:bg-yellow-500/30 disabled:opacity-50 transition-colors">
          {isPending ? "Minting…" : "Claim Trophy"}
        </button>
      ) : isSuccess ? (
        <span className="text-xs text-green-400">Minted!</span>
      ) : null}
    </div>
  );
}
