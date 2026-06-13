"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareContractCall, readContract, waitForReceipt } from "thirdweb";
import { keccak256, toHex } from "thirdweb/utils";
import { privateKeyToAccount } from "viem/accounts";
import type { MatchResult } from "@/lib/sandbox/match";
import { contracts, mantleSepolia, ADDRESSES } from "@/lib/config";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agent-marena.vercel.app";
const METH_ASSET = "0x0000000000000000000000000000000000000001" as const;

const ACTION_TYPES = {
  Action: [
    { name: "challengeId", type: "uint256" },
    { name: "agentId",     type: "uint256" },
    { name: "kind",        type: "uint8"   },
    { name: "asset",       type: "address" },
    { name: "size",        type: "uint128" },
    { name: "nonce",       type: "uint64"  },
    { name: "deadline",    type: "uint64"  },
  ],
} as const;

interface OnChainResult {
  agentId: bigint;
  signingKey: string;
  explorerTx: string;
}

interface EnrollingChallenge {
  id: bigint;
  endTime: number;
  startingBalance: bigint;
}

// ── Main card ────────────────────────────────────────────────────────────────

export function ResultCard({ result }: { result: MatchResult }) {
  const { user, ranked } = result;
  const beat = ranked.filter((b) => !b.isUser && b.finalValue < user.finalValue).length;
  const total = ranked.length;
  const won = user.rank === 1;
  const profitable = user.pnl >= 0;

  const [onchain, setOnchain] = useState<OnChainResult | null>(null);

  const medal = user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : `#${user.rank}`;
  const verdict = won ? "🏆 CHAMPION" : profitable ? "📈 PROFITABLE" : "📉 REKT";
  const verdictColor = won ? "text-gold" : profitable ? "text-green-400" : "text-red-400";

  const tweetText = useMemo(() => {
    const pnl = `${user.pnl >= 0 ? "+" : ""}${user.pnlPct.toFixed(1)}%`;
    const headline = won
      ? `🏆 My AI trading bot "${user.name}" just WON in the Agent Arena — ${pnl}, beating every reference agent.`
      : profitable
        ? `📈 My AI trading bot "${user.name}" finished ${pnl} and ranked ${medal} in the Agent Arena.`
        : `😅 My AI trading bot "${user.name}" went ${pnl} in the Agent Arena. Think you can build a better one?`;
    return [headline, "", "I built it in 30 seconds — no code — and watched it trade on-chain against AI agents.", "", "Build yours 👇 @Mantle_Official @doraHacks", SITE_URL + "/sandbox"].join("\n");
  }, [user, won, profitable, medal]);

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-gold/10 via-arena-850/30 to-agent/10 p-8 shadow-card">
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gold/20 blur-3xl" />
      <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-agent/15 blur-3xl" />
      <div className="relative space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-widest font-mono">Agent Arena · Result</div>
            <div className="font-display text-2xl font-bold mt-1">{user.emoji} {user.name}</div>
          </div>
          <div className={`font-display text-2xl font-extrabold ${verdictColor}`}>{verdict}</div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Stat label="Rank" value={`${medal}`} sub={`of ${total}`} />
          <Stat label="PnL" value={`${user.pnl >= 0 ? "+" : ""}${user.pnlPct.toFixed(1)}%`} valueClass={profitable ? "text-green-400" : "text-red-400"} sub={`$${user.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat label="Beat" value={`${beat}/${total - 1}`} sub="house bots" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-semibold px-5 py-3 rounded-lg transition-colors">
            𝕏 Tweet my result
          </a>
          <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex-1 text-center border border-white/20 hover:bg-white/5 font-semibold px-5 py-3 rounded-lg transition-colors">
            🔁 Tweak & rerun
          </a>
        </div>

        <p className="text-xs text-gray-500 text-center">Same market, same rules for every bot — a fair fight, just like a real on-chain challenge.</p>

        <div className="border-t border-white/10 pt-5">
          {onchain
            ? <AfterMint onchain={onchain} strategyName={user.name} />
            : <MintSection botName={user.name} summary={result.user.name} onMinted={setOnchain} />
          }
        </div>
      </div>
    </div>
  );
}

// ── Mint section ─────────────────────────────────────────────────────────────

function MintSection({ botName, summary, onMinted }: { botName: string; summary: string; onMinted: (r: OnChainResult) => void }) {
  const account = useActiveAccount();
  const { mutate: sendTx, isPending } = useSendTransaction();
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMint() {
    if (!account) return;
    setMinting(true);
    setError(null);
    try {
      // Step 1: get signing keypair from server
      const res = await fetch("/api/promote-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: botName, summary }),
      });
      const { botPrivateKey, signingKey, strategyHash } = await res.json() as { botPrivateKey: string; signingKey: string; strategyHash: string };

      // Step 2: store private key in localStorage (used later for signing trades)
      localStorage.setItem(`arena:signing:${signingKey}`, botPrivateKey);

      // Step 3: connected wallet registers the agent on-chain
      const tx = prepareContractCall({
        contract: contracts.registry,
        method: "registerAgent",
        params: [signingKey as `0x${string}`, strategyHash as `0x${string}`, ""],
      });

      sendTx(tx, {
        onSuccess: async (txResult) => {
          const explorerTx = `https://explorer.sepolia.mantle.xyz/tx/${txResult.transactionHash}`;
          try {
            // Brief pause so the Mantle testnet RPC propagates the new block state
            await new Promise(r => setTimeout(r, 2000));
            // Get full receipt with logs, decode agentId from AgentRegistered event.
            // event AgentRegistered(uint256 indexed agentId, address indexed developer, ...)
            // topic[0] = event sig hash, topic[1] = agentId (indexed uint256)
            const TOPIC = "0x91a6741d34b35e9a57e79a03ee5cdeba57ec466a6d2310fa9f4507174fc246f5";
            const fullReceipt = await waitForReceipt(txResult);
            let agentId = 0n;
            for (const log of fullReceipt.logs) {
              if (log.topics[0] === TOPIC && log.topics[1]) {
                agentId = BigInt(log.topics[1]);
                break;
              }
            }
            onMinted({ agentId, signingKey, explorerTx });
          } catch (e) {
            console.error("[mint] log decode failed:", e);
            onMinted({ agentId: 0n, signingKey, explorerTx });
          } finally {
            setMinting(false);
          }
        },
        onError: (err) => {
          const msg = (err as Error).message ?? "";
          const lower = msg.toLowerCase();
          setError(
            msg.includes("SigningKeyAlreadyRegistered") ? "Signing key already registered. Try minting again (a fresh key will be generated)." :
            lower.includes("rejected") || lower.includes("denied") || lower.includes("cancelled") ? "Transaction cancelled." :
            lower.includes("insufficient") ? "Insufficient MNT for gas. Get testnet MNT from the Mantle faucet." :
            `Mint failed: ${msg.slice(0, 120)}`
          );
          setMinting(false);
        },
      });
    } catch {
      setError("Failed to prepare mint. Check your connection.");
      setMinting(false);
    }
  }

  if (!account) {
    return (
      <div className="text-center space-y-2">
        <p className="text-sm text-gray-400">Connect your wallet to mint this bot on-chain as a real ERC-8004 identity NFT.</p>
        <p className="text-xs text-gray-600">Then you can enter it into a live challenge and watch the AI trade.</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      <button
        onClick={handleMint}
        disabled={minting || isPending}
        className="w-full sm:w-auto shimmer-border text-white font-display font-semibold px-6 py-3 rounded-lg disabled:opacity-50 transition-opacity"
        style={{ ["--arena-card" as string]: "#13131d" }}
      >
        {minting || isPending ? "Minting on Mantle…" : "⛓️ Make it real — mint an on-chain identity"}
      </button>
      <p className="text-xs text-gray-500">Mints a real ERC-8004 NFT to your wallet on Mantle Sepolia</p>
      {error && <p className="text-xs text-amber-400">{error}</p>}
    </div>
  );
}

// ── After mint: show agent + enter challenge ──────────────────────────────────

function AfterMint({ onchain, strategyName }: { onchain: OnChainResult; strategyName: string }) {
  return (
    <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 space-y-4 animate-scale-in">
      <div className="flex items-center gap-2 text-green-400 font-display font-semibold">
        ⛓️ Live on Mantle · Agent #{onchain.agentId.toString()}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/30 border border-white/10 p-3 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest">Agent ID</div>
          <div className="font-mono text-sm text-white">#{onchain.agentId.toString()}</div>
        </div>
        <div className="rounded-lg bg-black/30 border border-white/10 p-3 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest">Signing Key</div>
          <div className="font-mono text-xs text-gray-300 truncate">{onchain.signingKey.slice(0, 10)}…</div>
          <button onClick={() => navigator.clipboard.writeText(onchain.signingKey)} className="text-[9px] text-gray-600 hover:text-gray-400">copy full</button>
        </div>
      </div>

      <a href={onchain.explorerTx} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline block">
        View mint tx →
      </a>

      <div className="border-t border-white/10 pt-3">
        <EnterChallengeSection agentId={onchain.agentId} signingKey={onchain.signingKey} strategyName={strategyName} />
      </div>
    </div>
  );
}

// ── Enter challenge section ───────────────────────────────────────────────────

function EnterChallengeSection({ agentId, signingKey, strategyName }: { agentId: bigint; signingKey: string; strategyName: string }) {
  const account = useActiveAccount();
  const { mutateAsync: sendTxAsync, isPending } = useSendTransaction();
  const [enrolling, setEnrolling] = useState<EnrollingChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState<bigint | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadEnrolling() {
    setLoading(true);
    try {
      const nextId = await readContract({ contract: contracts.challenge, method: "nextChallengeId", params: [] });
      const count = Number(nextId) - 1;
      const found: EnrollingChallenge[] = [];
      for (let i = 1; i <= count; i++) {
        const cId = BigInt(i);
        const [phase, cd] = await Promise.all([
          readContract({ contract: contracts.challenge, method: "phaseOf", params: [cId] }),
          readContract({ contract: contracts.challenge, method: "getChallenge", params: [cId] }),
        ]);
        if (phase === 0) {
          found.push({ id: cId, endTime: Number(cd.endTime), startingBalance: cd.startingBalance });
        }
      }
      setEnrolling(found);
    } catch (e) {
      console.error("loadEnrolling", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEnrolling(); }, []);

  async function handleEnter(challengeId: bigint) {
    setEnterError(null);
    try {
      const tx = prepareContractCall({
        contract: contracts.challenge,
        method: "enterAgent",
        params: [challengeId, agentId],
        value: 0n,
      });
      await sendTxAsync(tx);
      setEntered(challengeId);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setEnterError(msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied") ? "Cancelled." : msg.slice(0, 100));
    }
  }

  async function handleCreateAndEnter() {
    setCreating(true);
    setEnterError(null);
    try {
      // Read nextChallengeId BEFORE creating — the new challenge gets exactly this ID
      // (contract does: challengeId = nextChallengeId++)
      const challengeId = await readContract({
        contract: contracts.challenge,
        method: "nextChallengeId",
        params: [],
      });

      // Step 1: create challenge (2-minute enrollment window, 1-hour trading)
      const now = BigInt(Math.floor(Date.now() / 1000));
      const startTime = now + 120n;
      const endTime   = startTime + 3600n;
      const createTx = prepareContractCall({
        contract: contracts.challenge,
        method: "createChallenge",
        params: [startTime, endTime, 10000n * 10n ** 18n, 0n, 0n, [METH_ASSET]],
      });
      await sendTxAsync(createTx);

      // Step 2: wait for RPC to propagate, then enter agent
      await new Promise(r => setTimeout(r, 2000));
      const enterTx = prepareContractCall({
        contract: contracts.challenge,
        method: "enterAgent",
        params: [challengeId, agentId],
        value: 0n,
      });
      await sendTxAsync(enterTx);
      setEntered(challengeId);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      const lower = msg.toLowerCase();
      setEnterError(
        lower.includes("rejected") || lower.includes("denied") ? "Transaction cancelled." :
        lower.includes("insufficient") ? "Not enough MNT for gas. Get testnet MNT from the Mantle faucet." :
        lower.includes("WrongPhase") ? "Challenge not in enrollment phase yet — wait a moment and try again." :
        `Failed: ${msg.slice(0, 120)}`
      );
      await loadEnrolling();
    } finally {
      setCreating(false);
    }
  }

  if (entered !== null) {
    return <TradingLoop agentId={agentId} challengeId={entered} signingKey={signingKey} strategyName={strategyName} />;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-300">Enter a challenge to start AI trading</div>

      {loading ? (
        <div className="text-xs text-gray-500 animate-pulse">Loading challenges…</div>
      ) : enrolling.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">No enrolling challenges right now.</p>
          <button
            onClick={handleCreateAndEnter}
            disabled={creating || isPending || !account}
            className="w-full py-2 rounded-lg border border-white/20 text-sm text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            {creating || isPending ? "Creating…" : "➕ Create a 1-hour challenge"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {enrolling.map((c) => (
            <div key={c.id.toString()} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-xs text-gray-300">
                Challenge #{c.id.toString()} · ends {new Date(c.endTime * 1000).toLocaleTimeString()}
              </div>
              <button
                onClick={() => handleEnter(c.id)}
                disabled={isPending || !account}
                className="text-xs px-3 py-1 bg-gold text-arena-950 font-semibold rounded hover:shadow-glow disabled:opacity-40 transition-all"
              >
                {isPending ? "…" : "Enter"}
              </button>
            </div>
          ))}
        </div>
      )}

      {enterError && <p className="text-xs text-red-400">{enterError}</p>}
      {!account && <p className="text-xs text-gray-500">Connect wallet to enter.</p>}
    </div>
  );
}

// ── Browser AI trading loop ───────────────────────────────────────────────────

interface TradeLog {
  ts: string;
  action: string;
  reasoning: string;
  txHash?: string;
}

function TradingLoop({ agentId, challengeId, signingKey, strategyName }: {
  agentId: bigint;
  challengeId: bigint;
  signingKey: string;
  strategyName: string;
}) {
  const [active, setActive] = useState(true);
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [portfolio, setPortfolio] = useState({ cash: 0, value: 0 });
  const priceHistory = useRef<number[]>([]);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((entry: TradeLog) => {
    setLogs((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  const runCycle = useCallback(async () => {
    const privKey = localStorage.getItem(`arena:signing:${signingKey}`);
    if (!privKey) { addLog({ ts: now(), action: "ERROR", reasoning: "Signing key not found in storage." }); return; }

    try {
      // Read price
      const price = await readContract({ contract: contracts.oracle, method: "getPrice", params: [METH_ASSET] });
      const priceUsd = Number(price) / 1e18;
      priceHistory.current = [...priceHistory.current, priceUsd].slice(-12);

      // Read portfolio
      const [cashWei, valueWei] = await Promise.all([
        readContract({ contract: contracts.engine, method: "cash", params: [challengeId, agentId] }),
        readContract({ contract: contracts.engine, method: "getPortfolioValue", params: [challengeId, agentId] }),
      ]);
      const cashUsd  = Number(cashWei) / 1e18;
      const valueUsd = Number(valueWei) / 1e18;
      setPortfolio({ cash: cashUsd, value: valueUsd });

      if (priceHistory.current.length < 3) {
        addLog({ ts: now(), action: "WAIT", reasoning: `Gathering price history (${priceHistory.current.length}/3)…` });
        return;
      }

      // AI decision
      const resp = await fetch("/api/ai-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: priceHistory.current, cash: cashUsd, portfolioValue: valueUsd, symbol: "mETH" }),
      });
      const { action, size_pct, reasoning } = await resp.json() as { action: string; size_pct: number; reasoning: string };

      if (action === "HOLD") {
        addLog({ ts: now(), action: "HOLD", reasoning });
        return;
      }

      // Calculate size
      const kind = action === "BUY" ? 0 : 1;
      const rawSize = action === "BUY"
        ? (cashWei * BigInt(Math.max(1, Math.min(100, size_pct)))) / 100n
        : ((valueWei - cashWei) * BigInt(Math.max(1, Math.min(100, size_pct)))) / 100n;
      const size = rawSize > 0n ? rawSize : 0n;
      if (size === 0n) { addLog({ ts: now(), action: "SKIP", reasoning: "Size too small." }); return; }

      // Get nonce + deadline
      const nonce = await readContract({ contract: contracts.engine, method: "nextNonce", params: [challengeId, agentId] });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

      // Sign EIP-712 action with the bot's signing key
      const signerAccount = privateKeyToAccount(privKey as `0x${string}`);
      const signature = await signerAccount.signTypedData({
        domain: {
          name: "Agent Arena Execution Engine",
          version: "1",
          chainId: mantleSepolia.id,
          verifyingContract: ADDRESSES.engine as `0x${string}`,
        },
        types: ACTION_TYPES,
        primaryType: "Action",
        message: { challengeId, agentId, kind, asset: METH_ASSET, size, nonce, deadline },
      });

      // Submit via server relayer (gas paid by owner)
      const sub = await fetch("/api/submit-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challengeId.toString(),
          agentId:     agentId.toString(),
          kind,
          asset:       METH_ASSET,
          size:        size.toString(),
          nonce:       nonce.toString(),
          deadline:    deadline.toString(),
          signature,
        }),
      });
      const { txHash, error } = await sub.json() as { txHash?: string; error?: string };
      addLog({ ts: now(), action, reasoning, txHash: txHash ?? undefined });
      if (error) console.error("[trading]", error);
    } catch (e) {
      addLog({ ts: now(), action: "ERROR", reasoning: e instanceof Error ? e.message.slice(0, 80) : String(e) });
    }
  }, [agentId, challengeId, signingKey, addLog]);

  useEffect(() => {
    if (!active) { if (loopRef.current) clearInterval(loopRef.current); return; }
    runCycle();
    loopRef.current = setInterval(runCycle, 30_000);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [active, runCycle]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${active ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
          <span className="text-sm font-medium text-white">{strategyName} · Challenge #{challengeId.toString()}</span>
        </div>
        <button onClick={() => setActive(a => !a)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {active ? "⏸ Pause" : "▶ Resume"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-center">
          <div className="text-gray-500">Cash</div>
          <div className="text-white font-mono">${portfolio.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-center">
          <div className="text-gray-500">Portfolio</div>
          <div className="text-white font-mono">${portfolio.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="rounded-lg bg-black/20 border border-white/10 p-2 space-y-1 max-h-40 overflow-y-auto">
          {logs.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px]">
              <span className="text-gray-600 shrink-0">{l.ts}</span>
              <span className={`font-mono shrink-0 w-12 ${l.action === "BUY" ? "text-green-400" : l.action === "SELL" ? "text-red-400" : "text-gray-500"}`}>{l.action}</span>
              <span className="text-gray-400 truncate">{l.reasoning}</span>
              {l.txHash && (
                <a href={`https://explorer.sepolia.mantle.xyz/tx/${l.txHash}`} target="_blank" rel="noopener noreferrer" className="text-gold shrink-0 hover:underline">tx↗</a>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-600">AI checks every 30s · gas paid by arena</p>
    </div>
  );
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Stat({ label, value, sub, valueClass = "" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-arena-border bg-arena-950/40 p-4 text-center">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`font-display text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5 font-mono">{sub}</div>}
    </div>
  );
}
