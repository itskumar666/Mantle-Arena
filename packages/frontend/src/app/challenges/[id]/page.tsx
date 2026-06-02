"use client";
import { useReadContract } from "thirdweb/react";
import { contracts, PHASE_LABELS, PHASE_COLORS, formatUsd, formatPnl, shortAddr } from "@/lib/config";
import Link from "next/link";
import { use } from "react";

function AgentRow({
  challengeId,
  agentId,
  rank,
  isSettled,
}: {
  challengeId: bigint;
  agentId: bigint;
  rank: number;
  isSettled: boolean;
}) {
  const { data: agent } = useReadContract({
    contract: contracts.registry,
    method: "getAgent",
    params: [agentId],
  });

  const { data: portfolioValue } = useReadContract({
    contract: contracts.engine,
    method: "getPortfolioValue",
    params: [challengeId, agentId],
  });

  const { data: result } = useReadContract({
    contract: contracts.leaderboard,
    method: "resultOf",
    params: [challengeId, agentId],
    // only call if settled
    queryOptions: { enabled: isSettled },
  });

  const value = isSettled && result ? result.finalValue : portfolioValue;
  const pnl = isSettled && result ? result.pnl : null;
  const pnlPositive = pnl !== null && pnl !== undefined ? pnl >= 0n : null;

  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 px-4 text-gray-400">
        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
      </td>
      <td className="py-3 px-4">
        <Link href={`/agents/${agentId}`} className="hover:text-blue-400 font-mono text-sm">
          Agent #{agentId.toString()}
        </Link>
      </td>
      <td className="py-3 px-4 font-mono text-sm text-gray-400">
        {agent ? shortAddr(agent.developer) : "—"}
      </td>
      <td className="py-3 px-4 text-right">
        {value != null ? formatUsd(value) : "—"}
      </td>
      <td className={`py-3 px-4 text-right ${pnlPositive === true ? "text-green-400" : pnlPositive === false ? "text-red-400" : "text-gray-400"}`}>
        {pnl != null ? formatPnl(pnl) : "—"}
      </td>
    </tr>
  );
}

export default function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const challengeId = BigInt(id);

  const { data: challenge } = useReadContract({
    contract: contracts.challenge,
    method: "getChallenge",
    params: [challengeId],
  });
  const { data: phaseRaw } = useReadContract({
    contract: contracts.challenge,
    method: "phaseOf",
    params: [challengeId],
  });
  const { data: participants } = useReadContract({
    contract: contracts.challenge,
    method: "getParticipants",
    params: [challengeId],
  });
  const { data: settled } = useReadContract({
    contract: contracts.leaderboard,
    method: "isSettled",
    params: [challengeId],
  });
  const { data: ranking } = useReadContract({
    contract: contracts.leaderboard,
    method: "ranking",
    params: [challengeId],
    queryOptions: { enabled: !!settled },
  });

  const phase = Number(phaseRaw ?? 0);
  const isSettled = !!settled;
  const orderedAgents = isSettled && ranking ? ranking : (participants ?? []);

  if (!challenge) return <div className="text-gray-500">Loading challenge…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/challenges" className="text-sm text-gray-500 hover:text-gray-300">
            ← Challenges
          </Link>
          <h1 className="text-2xl font-bold">Challenge #{id}</h1>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full ${PHASE_COLORS[phase]}`}>
          {PHASE_LABELS[phase]}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Starting Balance", value: formatUsd(challenge.startingBalance) },
          { label: "Agents", value: (participants?.length ?? 0).toString() },
          { label: "Entry Fee", value: challenge.entryFee === 0n ? "Free" : `${Number(challenge.entryFee) / 1e18} MNT` },
          { label: "Fees Collected", value: `${Number(challenge.entryFeesCollected) / 1e18} MNT` },
        ].map((s) => (
          <div key={s.label} className="border border-white/10 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</div>
            <div className="text-lg font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold">
            {isSettled ? "Final Leaderboard" : "Live Standings"}
          </h2>
          {!isSettled && (
            <span className="text-xs text-gray-500 animate-pulse">● Live</span>
          )}
        </div>
        {orderedAgents.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">No agents entered yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide">
                <th className="py-2 px-4 text-left">Rank</th>
                <th className="py-2 px-4 text-left">Agent</th>
                <th className="py-2 px-4 text-left">Developer</th>
                <th className="py-2 px-4 text-right">Portfolio Value</th>
                <th className="py-2 px-4 text-right">PnL</th>
              </tr>
            </thead>
            <tbody>
              {orderedAgents.map((agentId, i) => (
                <AgentRow
                  key={agentId.toString()}
                  challengeId={challengeId}
                  agentId={agentId}
                  rank={i + 1}
                  isSettled={isSettled}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
