"use client";
import { use, useState } from "react";
import { useReadContract, useSendTransaction, useActiveAccount } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { parseEther } from "thirdweb/utils";
import { contracts, PHASE_LABELS, PHASE_COLORS, formatUsd, formatPnl, shortAddr } from "@/lib/config";
import Link from "next/link";

const LIVE_POLL_MS = 15_000; // refresh portfolio values every 15s during live phase

// ── Agent row in the leaderboard table
function AgentRow({
  challengeId,
  agentId,
  rank,
  isLive,
  isSettled,
}: {
  challengeId: bigint;
  agentId: bigint;
  rank: number;
  isLive: boolean;
  isSettled: boolean;
}) {
  const [stakeInput, setStakeInput] = useState("");
  const [staking, setStaking] = useState(false);
  const account = useActiveAccount();
  const { mutate: sendTx, isPending: txPending } = useSendTransaction();

  const { data: agent } = useReadContract({ contract: contracts.registry, method: "getAgent", params: [agentId] });

  const { data: portfolioValue } = useReadContract({
    contract: contracts.engine,
    method: "getPortfolioValue",
    params: [challengeId, agentId],
    queryOptions: { refetchInterval: isLive ? LIVE_POLL_MS : false },
  });

  const { data: result } = useReadContract({
    contract: contracts.leaderboard,
    method: "resultOf",
    params: [challengeId, agentId],
    queryOptions: { enabled: isSettled },
  });

  const { data: totalStaked } = useReadContract({
    contract: contracts.stakeVault,
    method: "agentStakeTotal",
    params: [challengeId, agentId],
  });

  const value = isSettled && result ? result.finalValue : portfolioValue;
  const pnl   = isSettled && result ? result.pnl : null;
  const pnlPos = pnl != null ? pnl >= 0n : null;

  function handleStake() {
    if (!account || !stakeInput || Number(stakeInput) <= 0) return;
    const tx = prepareContractCall({
      contract: contracts.stakeVault,
      method: "stake",
      params: [challengeId, agentId],
      value: toWei(stakeInput),
    });
    sendTx(tx, {
      onSuccess: () => { setStakeInput(""); setStaking(false); },
    });
  }

  return (
    <>
      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
        <td className="py-3 px-4 text-gray-400 w-12">
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
        <td className="py-3 px-4 text-right text-sm">
          {value != null ? formatUsd(value) : <span className="text-gray-600">—</span>}
        </td>
        <td className={`py-3 px-4 text-right text-sm font-medium ${pnlPos === true ? "text-green-400" : pnlPos === false ? "text-red-400" : "text-gray-500"}`}>
          {pnl != null ? formatPnl(pnl) : "—"}
        </td>
        <td className="py-3 px-4 text-right text-sm text-gray-400">
          {totalStaked != null ? `${(Number(totalStaked) / 1e18).toFixed(3)} MNT` : "—"}
        </td>
        <td className="py-3 px-4 text-right">
          {account && !isSettled && (
            staking ? (
              <div className="flex items-center gap-1 justify-end">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="MNT"
                  value={stakeInput}
                  onChange={e => setStakeInput(e.target.value)}
                  className="w-20 px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-gray-500 focus:outline-none"
                />
                <button
                  onClick={handleStake}
                  disabled={txPending}
                  className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 rounded disabled:opacity-50 transition-colors"
                >
                  {txPending ? "…" : "Stake"}
                </button>
                <button onClick={() => setStaking(false)} className="text-xs text-gray-400 hover:text-white px-1">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setStaking(true)}
                className="text-xs px-3 py-1 border border-white/20 rounded hover:border-white/40 hover:bg-white/5 transition-colors"
              >
                Stake
              </button>
            )
          )}
        </td>
      </tr>
    </>
  );
}

// ── Main page
export default function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const challengeId = BigInt(id);

  const { data: challenge } = useReadContract({ contract: contracts.challenge, method: "getChallenge", params: [challengeId] });
  const { data: phaseRaw }  = useReadContract({ contract: contracts.challenge, method: "phaseOf",      params: [challengeId] });
  const { data: participants } = useReadContract({ contract: contracts.challenge, method: "getParticipants", params: [challengeId] });
  const { data: settled }   = useReadContract({ contract: contracts.leaderboard, method: "isSettled",   params: [challengeId] });
  const { data: ranking }   = useReadContract({
    contract: contracts.leaderboard,
    method: "ranking",
    params: [challengeId],
    queryOptions: { enabled: !!settled },
  });

  const phase      = Number(phaseRaw ?? 0);
  const isLive     = phase === 1;
  const isSettled  = !!settled;
  const agentList  = isSettled && ranking?.length ? ranking : (participants ?? []);

  if (!challenge) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-white/10 rounded" />
      <div className="h-24 bg-white/5 rounded-lg" />
      <div className="h-64 bg-white/5 rounded-lg" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/challenges" className="text-sm text-gray-500 hover:text-gray-300">← Challenges</Link>
          <h1 className="text-2xl font-bold">Challenge #{id}</h1>
        </div>
        <div className="flex items-center gap-3">
          {isLive && <span className="text-xs text-green-400 animate-pulse">● Live — refreshing every 15s</span>}
          <span className={`text-sm px-3 py-1 rounded-full ${PHASE_COLORS[phase]}`}>
            {PHASE_LABELS[phase]}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Starting Balance", value: formatUsd(challenge.startingBalance) },
          { label: "Agents",           value: (agentList.length).toString() },
          { label: "Entry Fee",        value: challenge.entryFee === 0n ? "Free" : `${(Number(challenge.entryFee) / 1e18).toFixed(4)} MNT` },
          { label: "Ends",             value: new Date(Number(challenge.endTime) * 1000).toLocaleString() },
        ].map(s => (
          <div key={s.label} className="border border-white/10 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</div>
            <div className="text-lg font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="font-semibold">{isSettled ? "Final Leaderboard" : "Live Standings"}</h2>
        </div>
        {agentList.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">No agents entered yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2 px-4 text-left">Rank</th>
                  <th className="py-2 px-4 text-left">Agent</th>
                  <th className="py-2 px-4 text-left">Developer</th>
                  <th className="py-2 px-4 text-right">Portfolio</th>
                  <th className="py-2 px-4 text-right">PnL</th>
                  <th className="py-2 px-4 text-right">Staked</th>
                  <th className="py-2 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {agentList.map((agentId, i) => (
                  <AgentRow
                    key={agentId.toString()}
                    challengeId={challengeId}
                    agentId={agentId}
                    rank={i + 1}
                    isLive={isLive}
                    isSettled={isSettled}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
