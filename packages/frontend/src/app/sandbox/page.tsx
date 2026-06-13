"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { ARCHETYPES, archetypeStrategy } from "@/lib/sandbox/archetypes";
import { compileSpec, parseStrategySpec, type StrategySpec } from "@/lib/sandbox/compiledStrategy";
import { runMatch, type MatchResult } from "@/lib/sandbox/match";
import { LineChart, type ChartSeries } from "@/components/LineChart";
import { ResultCard } from "@/components/ResultCard";

type Mode = "preset" | "ai";

const BOT_COLORS: Record<string, string> = {
  user: "#c084fc",
  momentum: "#4ade80",
  meanReversion: "#60a5fa",
};

interface SavedBot {
  mode: Mode;
  botName: string;
  description: string;
  spec: StrategySpec | null;
  archetype: string;
  aggression: number;
}

function storageKey(address?: string) {
  return `arena:sandbox:bot:${address ?? "anon"}`;
}

function loadBot(address?: string): SavedBot | null {
  try {
    const raw = localStorage.getItem(storageKey(address));
    return raw ? (JSON.parse(raw) as SavedBot) : null;
  } catch { return null; }
}

function saveBot(bot: SavedBot, address?: string) {
  try { localStorage.setItem(storageKey(address), JSON.stringify(bot)); } catch { /* quota */ }
}

export default function SandboxPage() {
  const account = useActiveAccount();
  const address = account?.address;

  const [mode, setMode] = useState<Mode>("ai");
  const [botName, setBotName] = useState("");
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [archetype, setArchetype] = useState(ARCHETYPES[0].id);
  const [aggression, setAggression] = useState(55);
  const [description, setDescription] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [restored, setRestored] = useState(false);

  // Load saved bot on mount / when wallet connects
  useEffect(() => {
    const saved = loadBot(address) ?? loadBot(undefined);
    if (!saved) { setRestored(true); return; }
    setMode(saved.mode);
    setBotName(saved.botName);
    setDescription(saved.description);
    setSpec(saved.spec);
    setArchetype(saved.archetype);
    setAggression(saved.aggression);
    setRestored(true);
  }, [address]);

  // Persist whenever bot state changes
  const persist = useCallback((patch: Partial<SavedBot>) => {
    setRestored((r) => {
      if (!r) return r;
      const current = loadBot(address) ?? {
        mode: "ai" as Mode, botName: "", description: "", spec: null,
        archetype: ARCHETYPES[0].id, aggression: 55,
      };
      saveBot({ ...current, ...patch }, address);
      return r;
    });
  }, [address]);

  async function compileFromEnglish(): Promise<StrategySpec | null> {
    setCompileError(null);
    setCompiling(true);
    try {
      const res = await fetch("/api/compile-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCompileError(data?.error ?? "Failed to compile.");
        return null;
      }
      const parsed = parseStrategySpec(data.spec);
      setSpec(parsed);
      const name = botName || parsed.name;
      if (!botName) setBotName(name);
      persist({ spec: parsed, botName: name, description });
      return parsed;
    } catch {
      setCompileError("Network error. Try again.");
      return null;
    } finally {
      setCompiling(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      let strategy;
      let name = botName.trim();

      if (mode === "preset") {
        const built = archetypeStrategy(archetype, aggression);
        setSpec(built.spec);
        strategy = built.strategy;
        if (!name) name = built.spec.name;
        persist({ mode, spec: built.spec, botName: name, archetype, aggression, description });
      } else {
        let s = spec;
        if (!s) s = await compileFromEnglish();
        if (!s) return;
        strategy = compileSpec(s);
        if (!name) name = s.name;
        persist({ mode, spec: s, botName: name, description, archetype, aggression });
      }

      setBotName(name);
      const match = await runMatch({ name, strategy });
      setResult(match);
      // Smooth scroll to results
      requestAnimationFrame(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } finally {
      setRunning(false);
    }
  }

  const chartSeries: ChartSeries[] = result
    ? result.ranked.map((b) => ({
        label: b.name,
        color: BOT_COLORS[b.id] ?? "#9ca3af",
        values: b.equity.map((p) => p.value),
        emphasized: b.isUser,
      }))
    : [];

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <header className="text-center space-y-3 animate-fade-up">
        <div className="inline-flex items-center gap-2 rounded-full border border-arena-border bg-arena-850/60 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-gold">
          Build · Battle · Brag
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
          Build a Trading Bot in <span className="text-gradient-gold">30 Seconds</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
          Describe a strategy in plain English — or pick an archetype — and watch your bot battle
          our reference AIs on the same live market. No wallet, no code, instant verdict.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex justify-center gap-2 animate-fade-up [animation-delay:80ms]">
        <button
          onClick={() => { setMode("ai"); persist({ mode: "ai" }); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "ai" ? "bg-gold text-arena-950" : "border border-arena-border text-gray-300 hover:bg-white/5"
          }`}
        >
          ✨ Describe in English
        </button>
        <button
          onClick={() => { setMode("preset"); persist({ mode: "preset" }); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "preset" ? "bg-gold text-arena-950" : "border border-arena-border text-gray-300 hover:bg-white/5"
          }`}
        >
          🎛️ Pick an Archetype
        </button>
      </div>

      <div className="border border-arena-border rounded-2xl p-6 space-y-5 bg-arena-850/40 shadow-card animate-fade-up [animation-delay:140ms]">
        {mode === "ai" ? (
          <div className="space-y-3">
            <label className="text-sm text-gray-300 font-medium">Describe your trading strategy</label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSpec(null);
                persist({ description: e.target.value, spec: null });
              }}
              placeholder="e.g. Buy mETH when it dips more than 3% below its average, sell when it pumps 2% above. Go big on the dips."
              rows={3}
              className="w-full bg-arena-950/60 border border-arena-border rounded-lg p-3 text-sm focus:outline-none focus:border-gold/60 resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setDescription(ex);
                    setSpec(null);
                    persist({ description: ex, spec: null });
                  }}
                  className="text-xs px-2.5 py-1 rounded-full border border-white/10 text-gray-400 hover:border-white/30 hover:text-gray-200 transition-colors"
                >
                  {ex.length > 48 ? ex.slice(0, 48) + "…" : ex}
                </button>
              ))}
            </div>
            {compileError && <p className="text-sm text-red-400">{compileError}</p>}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ARCHETYPES.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setArchetype(a.id); persist({ archetype: a.id }); }}
                  className={`text-left rounded-lg p-4 border transition-all ${
                    archetype === a.id
                      ? "border-gold/60 bg-gold/10 shadow-glow"
                      : "border-arena-border hover:border-white/30"
                  }`}
                >
                  <div className="text-2xl">{a.emoji}</div>
                  <div className="font-display font-semibold mt-1">{a.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{a.blurb}</div>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Aggressiveness</span>
                <span className="text-gray-400 font-mono">{aggression}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={aggression}
                onChange={(e) => { const v = Number(e.target.value); setAggression(v); persist({ aggression: v }); }}
                className="w-full accent-purple-400"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>Cautious</span>
                <span>Reckless</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            value={botName}
            onChange={(e) => { setBotName(e.target.value); persist({ botName: e.target.value }); }}
            placeholder="Name your bot (optional)"
            maxLength={32}
            className="flex-1 bg-arena-950/60 border border-arena-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold/60"
          />
          <button
            onClick={handleRun}
            disabled={running || compiling || (mode === "ai" && !description.trim())}
            className="bg-gold hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none text-arena-950 font-display font-bold px-6 py-2.5 rounded-lg transition-all whitespace-nowrap"
          >
            {compiling ? "Compiling…" : running ? "Running match…" : "⚔️ Enter the Arena"}
          </button>
        </div>

        {spec && (
          <div className="text-xs text-gray-400 border-t border-arena-border pt-3 flex items-center justify-between gap-2">
            <span><span className="text-gold font-medium">{spec.name}:</span> {spec.summary}</span>
            <button
              onClick={() => {
                try { localStorage.removeItem(storageKey(address)); } catch { /* */ }
                setSpec(null); setBotName(""); setDescription(""); setResult(null);
              }}
              className="text-gray-600 hover:text-gray-400 shrink-0"
            >
              ✕ clear
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div id="results" className="space-y-6 animate-scale-in">
          <ResultCard result={result} />

          <div className="border border-arena-border rounded-2xl p-6 space-y-4 bg-arena-850/40 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">Portfolio value over the match</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${result.priceSource === "coingecko" ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-white/10 text-gray-500"}`}>
                {result.priceSource === "coingecko" ? "📡 real prices · CoinGecko" : "🎲 simulated prices"}
              </span>
            </div>
            <LineChart series={chartSeries} baseline={result.startingBalance} />
            <div className="flex flex-wrap gap-4 text-xs">
              {result.ranked.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-0.5 rounded"
                    style={{ background: BOT_COLORS[b.id] ?? "#9ca3af" }}
                  />
                  <span className={b.isUser ? "text-white font-medium" : "text-gray-400"}>
                    {b.name}
                    {b.isUser && " (you)"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Leaderboard result={result} />
        </div>
      )}
    </div>
  );
}

const EXAMPLES = [
  "Buy mETH when it dips 3% below its average, sell when it pumps 2% above.",
  "Ride momentum — buy strength above the trend, exit when it breaks.",
  "Chase fast breakouts and cut losers quickly.",
];

function Leaderboard({ result }: { result: MatchResult }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="border border-arena-border rounded-2xl overflow-hidden bg-arena-850/40 shadow-card">
      <div className="px-5 py-3 border-b border-arena-border text-sm font-display font-semibold">Final Standings</div>
      <table className="w-full text-sm">
        <tbody>
          {result.ranked.map((b, i) => (
            <tr
              key={b.id}
              className={`border-b border-arena-border last:border-0 ${b.isUser ? "bg-gold/10" : ""}`}
            >
              <td className="px-5 py-3 w-12">{medals[i] ?? `#${i + 1}`}</td>
              <td className="px-2 py-3">
                <span className={b.isUser ? "font-semibold text-white" : "text-gray-300"}>
                  {b.emoji} {b.name}
                  {b.isUser && <span className="text-gold text-xs ml-2">YOUR BOT</span>}
                </span>
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-gray-300 font-mono">
                ${b.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              <td
                className={`px-5 py-3 text-right tabular-nums font-mono font-medium ${
                  b.pnl >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {b.pnl >= 0 ? "+" : ""}
                {b.pnlPct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
