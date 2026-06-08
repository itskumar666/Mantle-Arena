"use client";
import { useState } from "react";
import { useReadContract } from "thirdweb/react";
import { contracts, PHASE_LABELS, PHASE_COLORS, formatUsd, formatPnl, shortAddr, assetSymbol } from "@/lib/config";
import Link from "next/link";

type Tab = "all" | "enrolling" | "live" | "ended" | "settled";
const TABS: { key: Tab; label: string; phase: number | null }[] = [
  { key: "all",      label: "All",       phase: null },
  { key: "enrolling",label: "Enrolling", phase: 0    },
  { key: "live",     label: "Live",      phase: 1    },
  { key: "ended",    label: "Ended",     phase: 2    },
  { key: "settled",  label: "Settled",   phase: 3    },
];

function WinnerBadge({ challengeId, isSettled }: { challengeId: bigint; isSettled: boolean }) {
  const { data: ranking } = useReadContract({ contract: contracts.leaderboard, method: "ranking", params: [challengeId], queryOptions: { enabled: isSettled } });
  const winnerId = ranking?.[0];
  const { data: result }  = useReadContract({ contract: contracts.leaderboard, method: "resultOf", params: [challengeId, winnerId ?? 0n], queryOptions: { enabled: isSettled && winnerId != null } });

  if (!isSettled || !winnerId) return null;
  return (
    <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span>🏆</span>
        <Link href={`/agents/${winnerId}`} className="font-mono text-xs hover:text-yellow-300 transition-colors">
          Agent #{winnerId.toString()}
        </Link>
      </div>
      {result && <span className={`font-semibold text-xs ${result.pnl >= 0n ? "text-green-400" : "text-red-400"}`}>{formatPnl(result.pnl)}</span>}
    </div>
  );
}

function ChallengeCard({ id, filterPhase }: { id: bigint; filterPhase: number | null }) {
  const { data: challenge }    = useReadContract({ contract: contracts.challenge,   method: "getChallenge",    params: [id] });
  const { data: phaseRaw }     = useReadContract({ contract: contracts.challenge,   method: "phaseOf",         params: [id] });
  const { data: participants } = useReadContract({ contract: contracts.challenge,   method: "getParticipants", params: [id] });
  const { data: allowedAssets }= useReadContract({ contract: contracts.challenge,   method: "getAllowedAssets", params: [id] });
  const { data: settled }      = useReadContract({ contract: contracts.leaderboard, method: "isSettled",       params: [id] });

  const phase = Number(phaseRaw ?? 0);
  if (filterPhase !== null && phase !== filterPhase) return null;

  if (!challenge) return <div className="border border-white/10 rounded-lg p-5 animate-pulse h-52 bg-white/5" />;

  const isSettled = !!settled;
  const now = BigInt(Math.floor(Date.now() / 1000));

  function timeLabel() {
    if (phase === 0) { const d = Number(challenge!.startTime) - Number(now); return d > 0 ? `Starts in ${fmtDur(d)}` : "Starting soon"; }
    if (phase === 1) { const d = Number(challenge!.endTime)   - Number(now); return d > 0 ? `Ends in ${fmtDur(d)}`   : "Ending soon"; }
    if (phase === 2) return "Ready to settle";
    return `Settled · ${new Date(Number(challenge!.endTime) * 1000).toLocaleDateString()}`;
  }

  return (
    <div className="border border-white/10 rounded-lg p-5 hover:border-white/25 transition-colors space-y-4 flex flex-col">
      <div className="flex items-center justify-between">
        <Link href={`/challenges/${id}`} className="font-semibold hover:text-blue-400 transition-colors">
          Challenge #{id.toString()}
        </Link>
        <span className={`text-xs px-2 py-1 rounded-full ${PHASE_COLORS[phase]}`}>{PHASE_LABELS[phase]}</span>
      </div>

      {/* Asset pills */}
      {allowedAssets && allowedAssets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allowedAssets.map(a => (
            <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono">
              {assetSymbol(a)}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Starting Balance</div>
          <div className="font-medium mt-0.5">{formatUsd(challenge.startingBalance)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Agents</div>
          <div className="font-medium mt-0.5">{participants?.length ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Entry Fee</div>
          <div className="font-medium mt-0.5">{challenge.entryFee === 0n ? "Free" : `${(Number(challenge.entryFee) / 1e18).toFixed(3)} MNT`}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Creator</div>
          <div className="font-mono text-xs mt-0.5 text-gray-400">{shortAddr(challenge.creator)}</div>
        </div>
      </div>

      <WinnerBadge challengeId={id} isSettled={isSettled} />

      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-xs text-gray-500">{timeLabel()}</span>
        <Link href={`/challenges/${id}`}
          className="text-xs px-3 py-1.5 border border-white/20 rounded-lg hover:border-white/40 hover:bg-white/5 transition-colors">
          {phase === 0 ? "Enter →" : "View →"}
        </Link>
      </div>
    </div>
  );
}

function fmtDur(secs: number): string {
  if (secs <= 0) return "now";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ChallengesPage() {
  const [tab, setTab] = useState<Tab>("all");
  const { data: nextId } = useReadContract({ contract: contracts.challenge, method: "nextChallengeId", params: [] });

  const total = nextId ? Number(nextId) - 1 : 0;
  const ids   = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  const filterPhase = TABS.find(t => t.key === tab)?.phase ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Challenges</h1>
          <p className="text-sm text-gray-500 mt-1">Enter a challenge, run your agent, earn a Trophy NFT if profitable.</p>
        </div>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <div className="flex gap-1 border border-white/10 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? "bg-white text-black" : "text-gray-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="text-center py-24 text-gray-500">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-lg font-medium">No challenges yet.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ids.map(id => <ChallengeCard key={id.toString()} id={id} filterPhase={filterPhase} />)}
        </div>
      )}
    </div>
  );
}
