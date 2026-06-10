"use client";
import { useEffect, useState } from "react";

const MESSAGES = [
  "Fetching data from Mantle Network...",
  "Querying on-chain agent portfolios...",
  "Consulting the oracle (API3 dAPIs)...",
  "Counting trophy NFTs...",
  "Calculating who made money and who didn't...",
  "Almost there, Mantle is fast but not that fast...",
  "Decentralising. Please hold.",
];

export default function Loading() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      {/* Spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-t-purple-500 animate-spin" />
      </div>

      {/* Animated message */}
      <div className="space-y-2">
        <p className="text-gray-400 text-sm font-mono transition-all duration-500">
          {MESSAGES[msgIdx]}
        </p>
        <p className="text-gray-600 text-xs">⚔️ Agent Arena on Mantle</p>
      </div>
    </div>
  );
}
