"use client";
import { useReadContract } from "thirdweb/react";
import { contracts, PHASE_LABELS, PHASE_COLORS, formatUsd, formatPnl, shortAddr } from "@/lib/config";
import Link from "next/link";

function WinnerCell({ challengeId, isSettled }: { challengeId: bigint; isSettled: boolean }) {
  const { data: ranking } = useReadContract({ contract: contracts.leaderboard, method: "ranking", params: [challengeId], queryOptions: { enabled: isSettled } });
  const winnerId = ranking?.[0];
  const { data: result }  = useReadContract({ contract: contracts.leaderboard, method: "resultOf", params: [challengeId, winnerId ?? 0n], queryOptions: { enabled: isSettled && winnerId != null } });

  if (!isSettled) return <span className="text-gray-600 text-xs">Pending</span>;
  if (!winnerId)  return <span className="text-gray-600 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span>🏆</span>
      <div>
        <Link href={`/agents/${winnerId}`} className="hover:text-yellow-300 font-mono text-xs block transition-colors">
          Agent #{winnerId.toString()}
        </Link>
        {result && <span className={`text-xs ${result.pnl >= 0n ? "text-green-400" : "text-red-400"}`}>{formatPnl(result.pnl)}</span>}
      </div>
    </div>
  );
}

function ChallengeRow({ id }: { id: bigint }) {
  const { data: challenge }    = useReadContract({ contract: contracts.challenge,   method: "getChallenge",    params: [id] });
  const { data: phaseRaw }     = useReadContract({ contract: contracts.challenge,   method: "phaseOf",         params: [id] });
  const { data: participants } = useReadContract({ contract: contracts.challenge,   method: "getParticipants", params: [id] });
  const { data: settled }      = useReadContract({ contract: contracts.leaderboard, method: "isSettled",       params: [id] });

  const phase     = Number(phaseRaw ?? 0);
  const isSettled = !!settled;

  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 px-4">
        <Link href={`/challenges/${id}`} className="hover:text-blue-400 font-medium text-sm">Challenge #{id.toString()}</Link>
        {challenge && <div className="text-xs text-gray-500 mt-0.5">{new Date(Number(challenge.endTime) * 1000).toLocaleDateString()}</div>}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full ${PHASE_COLORS[phase]}`}>{PHASE_LABELS[phase]}</span>
      </td>
      <td className="py-3 px-4 text-center text-sm">{participants?.length ?? "—"}</td>
      <td className="py-3 px-4 text-sm">{challenge ? formatUsd(challenge.startingBalance) : "—"}</td>
      <td className="py-3 px-4"><WinnerCell challengeId={id} isSettled={isSettled} /></td>
      <td className="py-3 px-4 text-right">
        <Link href={`/challenges/${id}`} className="text-xs text-blue-400 hover:text-blue-300">View →</Link>
      </td>
    </tr>
  );
}

export default function LeaderboardPage() {
  const { data: nextId } = useReadContract({ contract: contracts.challenge, method: "nextChallengeId", params: [] });
  const total = nextId ? Number(nextId) - 1 : 0;
  const ids   = Array.from({ length: total }, (_, i) => BigInt(i + 1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hall of Fame</h1>
        <p className="text-sm text-gray-500 mt-1">Every challenge ever run on Agent Arena. Winners earn a permanent Trophy NFT.</p>
      </div>

      <div className="border border-white/10 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-white/10">
              <th className="py-3 px-4 text-left">Challenge</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-center">Agents</th>
              <th className="py-3 px-4 text-left">Starting Balance</th>
              <th className="py-3 px-4 text-left">Winner</th>
              <th className="py-3 px-4 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr><td colSpan={6} className="py-16 text-center text-gray-500">
                <div className="text-3xl mb-3">🏟️</div>
                <div>No challenges yet. The Hall of Fame fills up as challenges settle.</div>
              </td></tr>
            ) : ids.map(id => <ChallengeRow key={id.toString()} id={id} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
