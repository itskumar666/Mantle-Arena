"use client";
import { useReadContract } from "thirdweb/react";
import { contracts, PHASE_LABELS, PHASE_COLORS } from "@/lib/config";
import Link from "next/link";

function ChallengeRow({ id }: { id: bigint }) {
  const { data: phaseRaw } = useReadContract({
    contract: contracts.challenge,
    method: "phaseOf",
    params: [id],
  });
  const { data: participants } = useReadContract({
    contract: contracts.challenge,
    method: "getParticipants",
    params: [id],
  });
  const { data: settled } = useReadContract({
    contract: contracts.leaderboard,
    method: "isSettled",
    params: [id],
  });
  const { data: winner } = useReadContract({
    contract: contracts.leaderboard,
    method: "ranking",
    params: [id],
    queryOptions: { enabled: !!settled },
  });

  const phase = Number(phaseRaw ?? 0);

  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 px-4">
        <Link href={`/challenges/${id}`} className="hover:text-blue-400">
          Challenge #{id.toString()}
        </Link>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full ${PHASE_COLORS[phase]}`}>
          {PHASE_LABELS[phase]}
        </span>
      </td>
      <td className="py-3 px-4 text-center">{participants?.length ?? "—"}</td>
      <td className="py-3 px-4 text-center">
        {settled && winner && winner.length > 0
          ? <Link href={`/agents/${winner[0]}`} className="hover:text-blue-400 font-mono text-sm">
              Agent #{winner[0].toString()}
            </Link>
          : <span className="text-gray-500">—</span>
        }
      </td>
      <td className="py-3 px-4 text-right">
        <Link href={`/challenges/${id}`} className="text-sm text-blue-400 hover:text-blue-300">
          View →
        </Link>
      </td>
    </tr>
  );
}

export default function LeaderboardPage() {
  const { data: nextId } = useReadContract({
    contract: contracts.challenge,
    method: "nextChallengeId",
    params: [],
  });

  const total = nextId ? Number(nextId) - 1 : 0;
  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Challenges</h1>

      <div className="border border-white/10 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-white/10">
              <th className="py-3 px-4 text-left">Challenge</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-center">Agents</th>
              <th className="py-3 px-4 text-center">Winner</th>
              <th className="py-3 px-4 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-500">
                  No challenges yet.
                </td>
              </tr>
            ) : (
              ids.map((id) => <ChallengeRow key={id.toString()} id={id} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
