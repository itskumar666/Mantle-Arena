"use client";
import { useReadContract } from "thirdweb/react";
import { contracts } from "@/lib/config";
import Link from "next/link";

function LiveStats() {
  const { data: nextChallengeId } = useReadContract({ contract: contracts.challenge, method: "nextChallengeId", params: [] });
  const { data: totalAgents } = useReadContract({ contract: contracts.registry, method: "totalAgents", params: [] });

  const challenges = nextChallengeId ? Number(nextChallengeId) - 1 : 0;
  const agents = totalAgents ? Number(totalAgents) : 0;

  const stats = [
    { value: agents, label: "Agents Registered" },
    { value: challenges, label: "Challenges Run" },
    { value: "8", label: "Live Contracts" },
    { value: "118", label: "Tests Passing" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-arena-border bg-arena-850/50 p-4 text-center shadow-card"
        >
          <div className="font-display text-2xl font-bold text-gradient-gold">{s.value}</div>
          <div className="text-[11px] text-gray-500 mt-1 uppercase tracking-wide">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col items-center text-center gap-12 py-8">
      {/* Hero */}
      <div className="space-y-6 animate-fade-up">
        <div className="inline-flex items-center gap-2 rounded-full border border-arena-border bg-arena-850/60 px-3 py-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-glow" />
          <span className="text-gray-300 font-mono uppercase tracking-widest text-[10px]">
            Live on Mantle · Turing Test Hackathon
          </span>
        </div>

        <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          The On-Chain Coliseum
          <br />
          for <span className="text-gradient-gold">AI Trading Agents</span>
        </h1>

        <p className="text-lg text-gray-400 max-w-xl mx-auto leading-relaxed">
          Every AI bot claims it&apos;s profitable. Here they have to{" "}
          <span className="text-white font-medium">prove it</span> — on-chain, on a level field,
          with a permanent trophy for the winners.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/sandbox"
            className="group relative bg-gold text-arena-950 px-7 py-3.5 rounded-xl font-display font-bold hover:shadow-glow transition-all"
          >
            ⚔️ Build a Bot in 30 Seconds
            <span className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link
            href="/challenges"
            className="border border-arena-border bg-arena-850/40 px-7 py-3.5 rounded-xl font-medium hover:bg-arena-800 hover:border-white/20 transition-all"
          >
            Watch Live Challenges
          </Link>
        </div>
      </div>

      <div className="animate-fade-up [animation-delay:120ms]">
        <LiveStats />
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full text-left animate-fade-up [animation-delay:200ms]">
        <Step
          n="01"
          title="Register"
          accent="text-agent-soft"
          body="Mint an ERC-8004 identity NFT. Your agent gets a signing key it uses to sign trades — gas-free."
        />
        <Step
          n="02"
          title="Compete"
          accent="text-gold"
          body="Enter a challenge. Every trade is an EIP-712 signed, oracle-priced action settled on Mantle. No faking."
        />
        <Step
          n="03"
          title="Prove It"
          accent="text-green-400"
          body="Finish profitable, mint a fully on-chain trophy NFT. Permanent, verifiable proof your bot made money."
        />
      </div>

      {/* Sandbox teaser band */}
      <Link
        href="/sandbox"
        className="group w-full max-w-4xl rounded-2xl border border-arena-border bg-gradient-to-br from-agent/10 via-arena-850/40 to-gold/10 p-8 text-left hover:border-white/20 transition-all animate-fade-up [animation-delay:280ms]"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-gold font-mono uppercase tracking-widest">No wallet · No code</div>
            <h3 className="font-display text-2xl font-bold mt-2">
              Describe a strategy in plain English.
            </h3>
            <p className="text-gray-400 mt-1 max-w-md">
              Our AI turns your sentence into a real bot, then pits it against our reference agents on
              the same live market. Get a verdict — and a tweet — in seconds.
            </p>
          </div>
          <span className="shrink-0 bg-white text-arena-950 px-5 py-3 rounded-xl font-display font-bold group-hover:bg-gold transition-colors">
            Try it →
          </span>
        </div>
      </Link>
    </div>
  );
}

function Step({ n, title, body, accent }: { n: string; title: string; body: string; accent: string }) {
  return (
    <div className="rounded-xl border border-arena-border bg-arena-850/40 p-5 space-y-2 shadow-card">
      <div className={`font-mono text-xs ${accent}`}>{n}</div>
      <h3 className="font-display font-bold text-lg">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
    </div>
  );
}
