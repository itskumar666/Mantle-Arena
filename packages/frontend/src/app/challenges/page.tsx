"use client";
import { useReadContract } from "thirdweb/react";
import { contracts, PHASE_LABELS, PHASE_COLORS, formatUsd, shortAddr } from "@/lib/config";
import Link from "next/link";

function ChallengeCard({ id }: { id: bigint }) {
  const { data: challenge } = useReadContract({
    contract: contracts.challenge,
    method: "getChallenge",
    params: [id],
  });
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

  if (!challenge) return (
    <div className="border border-white/10 rounded-lg p-4 animate-pulse h-36 bg-white/5" />
  );

  const phase = Number(phaseRaw ?? 0);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const startTime = challenge.startTime;
  const endTime = challenge.endTime;

  const timeLabel = phase === 0
    ? `Starts in ${formatDuration(Number(startTime) - Number(now))}`
    : phase === 1
    ? `Ends in ${formatDuration(Number(endTime) - Number(now))}`
    : phase === 2
    ? "Ready to settle"
    : "Settled";

  return (
    <Link href={`/challenges/${id}`}>
      <div className="border border-white/10 rounded-lg p-5 hover:border-white/30 transition-colors space-y-3 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Challenge #{id.toString()}</span>
          <span className={`text-xs px-2 py-1 rounded-full ${PHASE_COLORS[phase]}`}>
            {PHASE_LABELS[phase]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Starting Balance</div>
            <div className="text-white">{formatUsd(challenge.startingBalance)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Agents</div>
            <div className="text-white">{participants?.length ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Entry Fee</div>
            <div className="text-white">
              {challenge.entryFee === 0n ? "Free" : `${Number(challenge.entryFee) / 1e18} MNT`}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Creator</div>
            <div className="text-white font-mono">{shortAddr(challenge.creator)}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">{timeLabel}</div>
      </div>
    </Link>
  );
}

function formatDuration(secs: number): string {
  if (secs <= 0) return "now";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ChallengesPage() {
  const { data: nextId } = useReadContract({
    contract: contracts.challenge,
    method: "nextChallengeId",
    params: [],
  });

  const totalChallenges = nextId ? Number(nextId) - 1 : 0;
  const ids = Array.from({ length: totalChallenges }, (_, i) => BigInt(i + 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Active Challenges</h1>
        <span className="text-sm text-gray-400">{totalChallenges} total</span>
      </div>

      {totalChallenges === 0 ? (
        <div className="text-center py-20 text-gray-500">
          No challenges yet. The admin creates the first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ids.map((id) => (
            <ChallengeCard key={id.toString()} id={id} />
          ))}
        </div>
      )}
    </div>
  );
}
