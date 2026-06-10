"use client";
import { useState } from "react";
import { useReadContract, useSendTransaction, useActiveAccount } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { toWei } from "thirdweb/utils";
import { contracts, PHASE_LABELS, PHASE_COLORS, formatUsd, formatPnl, shortAddr, assetSymbol, ASSET_META, EXPLORER } from "@/lib/config";
import Link from "next/link";

const LIVE_POLL_MS = 15_000;

// ── Live oracle price for one asset
function AssetPrice({ asset }: { asset: string }) {
  const { data: price } = useReadContract({
    contract: contracts.oracle,
    method: "getPrice",
    params: [asset as `0x${string}`],
    queryOptions: { refetchInterval: LIVE_POLL_MS },
  });
  const meta = ASSET_META[asset];
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`font-mono font-semibold ${meta?.color ?? "text-white"}`}>{meta?.symbol ?? shortAddr(asset)}</span>
        <span className="text-xs text-gray-500">{meta?.name}</span>
      </div>
      <span className="font-mono text-sm">
        {price != null ? `$${(Number(price) / 1e18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
      </span>
    </div>
  );
}

// ── Enter challenge panel
function EnterPanel({ challengeId, entryFee }: { challengeId: bigint; entryFee: bigint }) {
  const account = useActiveAccount();
  const { mutate: sendTx, isPending, isSuccess } = useSendTransaction();
  const [agentId, setAgentId] = useState("");

  if (!account) return (
    <div className="text-sm text-gray-500 text-center py-3">Connect wallet to enter</div>
  );

  if (isSuccess) return (
    <div className="text-green-400 text-sm text-center py-2 font-medium">Agent entered successfully!</div>
  );

  function handleEnter() {
    if (!agentId) return;
    const tx = prepareContractCall({
      contract: contracts.challenge,
      method: "enterAgent",
      params: [challengeId, BigInt(agentId)],
      value: entryFee,
    });
    sendTx(tx);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400">Your Agent ID</label>
        <input
          type="number" min="1" placeholder="e.g. 4"
          value={agentId} onChange={e => setAgentId(e.target.value)}
          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/40"
        />
        <p className="text-xs text-gray-600">
          Don&apos;t have an agent? <Link href="/register" className="text-blue-400 hover:text-blue-300">Register one first →</Link>
        </p>
      </div>
      <button
        onClick={handleEnter}
        disabled={isPending || !agentId}
        className="w-full py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-sm"
      >
        {isPending ? "Entering…" : entryFee > 0n ? `Enter (${(Number(entryFee) / 1e18).toFixed(3)} MNT)` : "Enter Challenge (Free)"}
      </button>
    </div>
  );
}

// ── Trophy claim button
function TrophyClaimButton({ challengeId, agentId, pnl }: { challengeId: bigint; agentId: bigint; pnl: bigint }) {
  const { mutate: sendTx, isPending, isSuccess } = useSendTransaction();
  const { data: existingToken } = useReadContract({ contract: contracts.trophy, method: "tokenOf", params: [challengeId, agentId] });

  const claimed = existingToken != null && existingToken > 0n;
  if (pnl <= 0n)   return null;
  if (claimed)     return <span className="text-xs text-yellow-400 font-medium">🏆 #{existingToken!.toString()}</span>;
  if (isSuccess)   return <span className="text-xs text-green-400 font-medium">Minted!</span>;

  return (
    <button
      onClick={() => sendTx(prepareContractCall({ contract: contracts.trophy, method: "claim", params: [challengeId, agentId] }))}
      disabled={isPending}
      className="text-xs px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
    >
      {isPending ? "Minting…" : "Claim Trophy"}
    </button>
  );
}

// ── Settle button
function SettleButton({ challengeId }: { challengeId: bigint }) {
  const { mutate: sendTx, isPending, isSuccess } = useSendTransaction();
  if (isSuccess) return <span className="text-green-400 text-sm">Settled — reload to see results</span>;
  return (
    <button
      onClick={() => sendTx(prepareContractCall({ contract: contracts.leaderboard, method: "settle", params: [challengeId] }))}
      disabled={isPending}
      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg disabled:opacity-50 transition-colors text-sm"
    >
      {isPending ? "Settling…" : "Settle Challenge"}
    </button>
  );
}

// ── Single asset holding chip
function AssetHolding({ challengeId, agentId, asset, isLive }: {
  challengeId: bigint; agentId: bigint; asset: string; isLive: boolean;
}) {
  const { data: amount } = useReadContract({
    contract: contracts.engine,
    method: "holdings",
    params: [challengeId, agentId, asset as `0x${string}`],
    queryOptions: { refetchInterval: isLive ? LIVE_POLL_MS : undefined },
  });
  if (!amount || amount === 0n) return null;
  const meta = ASSET_META[asset];
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded bg-white/5 font-mono ${meta?.color ?? "text-white"}`}>
      {(Number(amount) / 1e18).toFixed(4)} {meta?.symbol ?? asset.slice(0, 6)}
    </span>
  );
}

// ── Holdings breakdown: cash + per-asset positions
function HoldingsBreakdown({ challengeId, agentId, allowedAssets, isLive }: {
  challengeId: bigint; agentId: bigint; allowedAssets: readonly string[]; isLive: boolean;
}) {
  const { data: cash } = useReadContract({
    contract: contracts.engine,
    method: "cash",
    params: [challengeId, agentId],
    queryOptions: { refetchInterval: isLive ? LIVE_POLL_MS : undefined },
  });
  const cashUsd = cash != null ? Number(cash) / 1e18 : null;

  return (
    <div className="flex flex-wrap justify-end gap-1.5 mt-1">
      {allowedAssets.map(asset => (
        <AssetHolding key={asset} challengeId={challengeId} agentId={agentId} asset={asset} isLive={isLive} />
      ))}
      {cashUsd !== null && cashUsd > 0.01 && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 font-mono text-gray-400">
          ${cashUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} cash
        </span>
      )}
    </div>
  );
}

// ── Agent row
function AgentRow({ challengeId, agentId, rank, isLive, isSettled, allowedAssets }: {
  challengeId: bigint; agentId: bigint; rank: number; isLive: boolean; isSettled: boolean;
  allowedAssets: readonly string[];
}) {
  const [staking, setStaking]   = useState(false);
  const [stakeAmt, setStakeAmt] = useState("");
  const account = useActiveAccount();
  const { mutate: sendTx, isPending: txPending } = useSendTransaction();

  const { data: agent }          = useReadContract({ contract: contracts.registry, method: "getAgent", params: [agentId] });
  const { data: portfolioValue } = useReadContract({
    contract: contracts.engine, method: "getPortfolioValue", params: [challengeId, agentId],
    queryOptions: { refetchInterval: isLive ? LIVE_POLL_MS : undefined },
  });
  const { data: result }      = useReadContract({ contract: contracts.leaderboard, method: "resultOf", params: [challengeId, agentId], queryOptions: { enabled: isSettled } });
  const { data: totalStaked } = useReadContract({ contract: contracts.stakeVault,  method: "agentStakeTotal", params: [challengeId, agentId] });

  const value  = isSettled && result ? result.finalValue : portfolioValue;
  const pnl    = isSettled && result ? result.pnl : null;
  const pnlPos = pnl != null ? pnl >= 0n : null;
  const icon   = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  function handleStake() {
    if (!stakeAmt || Number(stakeAmt) <= 0) return;
    sendTx(
      prepareContractCall({ contract: contracts.stakeVault, method: "stake", params: [challengeId, agentId], value: toWei(stakeAmt || "0") }),
      { onSuccess: () => { setStakeAmt(""); setStaking(false); } }
    );
  }

  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 px-4 text-gray-400 w-10">{icon}</td>
      <td className="py-3 px-4">
        <Link href={`/agents/${agentId}`} className="hover:text-blue-400 font-mono text-sm">Agent #{agentId.toString()}</Link>
      </td>
      <td className="py-3 px-4 font-mono text-sm text-gray-400">{agent ? shortAddr(agent.developer) : "—"}</td>
      <td className="py-3 px-4 text-right text-sm">
        <div>{value != null ? formatUsd(value) : <span className="text-gray-600">—</span>}</div>
        <div className="flex justify-end">
          <HoldingsBreakdown challengeId={challengeId} agentId={agentId} allowedAssets={allowedAssets} isLive={isLive} />
        </div>
      </td>
      <td className={`py-3 px-4 text-right text-sm font-medium ${pnlPos === true ? "text-green-400" : pnlPos === false ? "text-red-400" : "text-gray-500"}`}>
        {pnl != null ? formatPnl(pnl) : "—"}
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-400">
        {totalStaked != null ? `${(Number(totalStaked) / 1e18).toFixed(3)} MNT` : "—"}
      </td>
      <td className="py-3 px-4 text-right">
        {isSettled && pnl != null ? (
          <TrophyClaimButton challengeId={challengeId} agentId={agentId} pnl={pnl} />
        ) : account && !isSettled ? (
          staking ? (
            <div className="flex items-center gap-1 justify-end">
              <input type="number" min="0" step="0.01" placeholder="MNT" value={stakeAmt}
                onChange={e => setStakeAmt(e.target.value)}
                className="w-20 px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-gray-500 focus:outline-none"
              />
              <button onClick={handleStake} disabled={txPending}
                className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 rounded disabled:opacity-50">
                {txPending ? "…" : "Stake"}
              </button>
              <button onClick={() => setStaking(false)} className="text-xs text-gray-400 px-1">✕</button>
            </div>
          ) : (
            <button onClick={() => setStaking(true)}
              className="text-xs px-3 py-1 border border-white/20 rounded hover:border-white/40 hover:bg-white/5 transition-colors">
              Back
            </button>
          )
        ) : null}
      </td>
    </tr>
  );
}

// ── Winner banner
function WinnerBanner({ challengeId, rankingIds }: { challengeId: bigint; rankingIds: readonly bigint[] }) {
  const winnerId = rankingIds[0];
  const { data: result } = useReadContract({ contract: contracts.leaderboard, method: "resultOf", params: [challengeId, winnerId] });
  const { data: agent }  = useReadContract({ contract: contracts.registry,    method: "getAgent",  params: [winnerId] });

  return (
    <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
        <span className="text-xl">🏆</span> Challenge Winner
      </div>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href={`/agents/${winnerId}`} className="text-xl font-bold hover:text-yellow-300 transition-colors">
            Agent #{winnerId.toString()}
          </Link>
          {agent && <div className="text-sm text-gray-400 mt-0.5">Developer: <span className="font-mono">{shortAddr(agent.developer)}</span></div>}
        </div>
        {result && (
          <div className="text-right">
            <div className={`text-2xl font-bold ${result.pnl >= 0n ? "text-green-400" : "text-red-400"}`}>{formatPnl(result.pnl)}</div>
            <div className="text-sm text-gray-400">Final: {formatUsd(result.finalValue)}</div>
          </div>
        )}
      </div>
      {result && result.pnl > 0n && (
        <div className="pt-2 border-t border-yellow-500/20">
          <TrophyClaimButton challengeId={challengeId} agentId={winnerId} pnl={result.pnl} />
        </div>
      )}
    </div>
  );
}

// ── Main page
export default function ChallengePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const challengeId = BigInt(id);

  const { data: challenge }    = useReadContract({ contract: contracts.challenge,   method: "getChallenge",    params: [challengeId] });
  const { data: phaseRaw }     = useReadContract({ contract: contracts.challenge,   method: "phaseOf",         params: [challengeId] });
  const { data: participants } = useReadContract({ contract: contracts.challenge,   method: "getParticipants", params: [challengeId] });
  const { data: allowedAssets }= useReadContract({ contract: contracts.challenge,   method: "getAllowedAssets", params: [challengeId] });
  const { data: settled }      = useReadContract({ contract: contracts.leaderboard, method: "isSettled",       params: [challengeId] });
  const { data: ranking }      = useReadContract({ contract: contracts.leaderboard, method: "ranking",         params: [challengeId], queryOptions: { enabled: !!settled } });

  const phase     = Number(phaseRaw ?? 0);
  const isLive    = phase === 1;
  const isEnroll  = phase === 0;
  const isSettled = !!settled;
  const agentList = isSettled && ranking?.length ? ranking : (participants ?? []);

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <Link href="/challenges" className="text-sm text-gray-500 hover:text-gray-300">← All Challenges</Link>
          <h1 className="text-2xl font-bold">Challenge #{id}</h1>
          <a href={`${EXPLORER}/address/${challenge.creator}`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-300">
            by {shortAddr(challenge.creator)} →
          </a>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isLive && <span className="text-xs text-green-400 animate-pulse">● Live</span>}
          {phase === 2 && !isSettled && <SettleButton challengeId={challengeId} />}
          <span className={`text-sm px-3 py-1 rounded-full ${PHASE_COLORS[phase]}`}>{PHASE_LABELS[phase]}</span>
        </div>
      </div>

      {/* Winner banner */}
      {isSettled && ranking && ranking.length > 0 && (
        <WinnerBanner challengeId={challengeId} rankingIds={ranking} />
      )}

      {/* Two-column layout: stats + right panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Starting Balance", value: formatUsd(challenge.startingBalance) },
              { label: "Agents",           value: agentList.length.toString() },
              { label: "Entry Fee",        value: challenge.entryFee === 0n ? "Free" : `${(Number(challenge.entryFee) / 1e18).toFixed(3)} MNT` },
              { label: "Ends",             value: new Date(Number(challenge.endTime) * 1000).toLocaleString() },
            ].map(s => (
              <div key={s.label} className="border border-white/10 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</div>
                <div className="font-semibold mt-1 text-sm">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: prices + enter */}
        <div className="space-y-4">
          {/* Live prices */}
          {allowedAssets && allowedAssets.length > 0 && (
            <div className="border border-white/10 rounded-lg p-4 space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${isLive ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
                {isLive ? "Live Prices" : "Asset Prices"}
              </div>
              {allowedAssets.map(a => <AssetPrice key={a} asset={a} />)}
            </div>
          )}

          {/* Enter panel (enrolling only) */}
          {isEnroll && (
            <div className="border border-blue-500/30 bg-blue-500/5 rounded-lg p-4 space-y-3">
              <div className="text-sm font-semibold text-blue-300">Enter This Challenge</div>
              <EnterPanel challengeId={challengeId} entryFee={challenge.entryFee} />
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-sm">{isSettled ? "Final Leaderboard" : "Live Standings"}</h2>
          {isSettled && <span className="text-xs text-gray-500">Profitable agents can claim a Trophy NFT</span>}
        </div>
        {agentList.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">No agents entered yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2 px-4 text-left w-10"></th>
                  <th className="py-2 px-4 text-left">Agent</th>
                  <th className="py-2 px-4 text-left">Developer</th>
                  <th className="py-2 px-4 text-right">Portfolio</th>
                  <th className="py-2 px-4 text-right">PnL</th>
                  <th className="py-2 px-4 text-right">Staked</th>
                  <th className="py-2 px-4 text-right">{isSettled ? "Trophy" : "Stake"}</th>
                </tr>
              </thead>
              <tbody>
                {agentList.map((agentId, i) => (
                  <AgentRow key={agentId.toString()} challengeId={challengeId} agentId={agentId}
                    rank={i + 1} isLive={isLive} isSettled={isSettled}
                    allowedAssets={allowedAssets ?? []} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
