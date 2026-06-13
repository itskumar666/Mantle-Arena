"use client";

import { useState } from "react";
import { useSendTransaction } from "thirdweb/react";
import { prepareContractCall, readContract } from "thirdweb";
import { contracts, ASSET_META } from "@/lib/config";

interface CreateChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ASSET_OPTIONS = Object.entries(ASSET_META).map(([addr, meta]) => ({
  addr,
  symbol: meta.symbol,
  name: meta.name,
}));

export function CreateChallengeModal({ isOpen, onClose, onSuccess }: CreateChallengeModalProps) {
  const { mutateAsync: sendTxAsync, isPending } = useSendTransaction();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [startingBalance, setStartingBalance] = useState("10000");
  const [entryFee, setEntryFee] = useState("0");
  const [enrollDuration, setEnrollDuration] = useState("2"); // minutes
  const [tradingDuration, setTradingDuration] = useState("60"); // minutes
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["0x0000000000000000000000000000000000000001"]); // default mETH

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setError(null);

    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const enrollMin = BigInt(Math.max(1, Number(enrollDuration)));
      const tradeMin = BigInt(Math.max(1, Number(tradingDuration)));

      const startTime = now + enrollMin * 60n;
      const endTime = startTime + tradeMin * 60n;

      const balance = BigInt(Math.floor(Number(startingBalance) * 1e18));
      const fee = BigInt(Math.floor(Number(entryFee) * 1e18));

      const tx = prepareContractCall({
        contract: contracts.challenge,
        method: "createChallenge",
        params: [
          startTime,
          endTime,
          balance,
          fee,
          0n, // settleBounty
          selectedAssets,
        ],
      });

      await sendTxAsync(tx);
      setStartingBalance("10000");
      setEntryFee("0");
      setEnrollDuration("2");
      setTradingDuration("60");
      setSelectedAssets(["0x0000000000000000000000000000000000000001"]);
      onSuccess?.();
      onClose();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      const lower = msg.toLowerCase();
      setError(
        lower.includes("rejected") || lower.includes("denied")
          ? "Transaction cancelled."
          : lower.includes("insufficient")
          ? "Not enough MNT for gas."
          : `Failed: ${msg.slice(0, 120)}`
      );
    } finally {
      setCreating(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white/5 border border-white/10 rounded-lg max-w-md w-full space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Create Challenge</h2>
          <button
            onClick={onClose}
            disabled={creating}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Starting Balance */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Starting Balance (USD equivalent)
            </label>
            <input
              type="number"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              min="100"
              step="100"
              disabled={creating}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/40 disabled:opacity-50"
              placeholder="10000"
            />
            <p className="text-xs text-gray-500">Recommended: 5,000–20,000</p>
          </div>

          {/* Entry Fee */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Entry Fee (MNT, optional)
            </label>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              min="0"
              step="0.1"
              disabled={creating}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/40 disabled:opacity-50"
              placeholder="0"
            />
          </div>

          {/* Enrollment Duration */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Enrollment Window (minutes)
            </label>
            <input
              type="number"
              value={enrollDuration}
              onChange={(e) => setEnrollDuration(e.target.value)}
              min="1"
              max="60"
              step="1"
              disabled={creating}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/40 disabled:opacity-50"
            />
          </div>

          {/* Trading Duration */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Trading Duration (minutes)
            </label>
            <input
              type="number"
              value={tradingDuration}
              onChange={(e) => setTradingDuration(e.target.value)}
              min="1"
              step="1"
              disabled={creating}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/40 disabled:opacity-50"
            />
          </div>

          {/* Allowed Assets */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Allowed Assets
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {ASSET_OPTIONS.map((asset) => (
                <button
                  key={asset.addr}
                  onClick={() => {
                    setSelectedAssets((prev) =>
                      prev.includes(asset.addr)
                        ? prev.filter((a) => a !== asset.addr)
                        : [...prev, asset.addr]
                    );
                  }}
                  disabled={creating}
                  className={`text-xs px-2 py-1.5 rounded-lg font-medium transition-colors text-left disabled:opacity-50 ${
                    selectedAssets.includes(asset.addr)
                      ? "bg-white/20 border border-white/40 text-white"
                      : "bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {asset.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !startingBalance}
            className="flex-1 px-4 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
