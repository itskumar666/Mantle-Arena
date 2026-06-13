"use client";
import { useState } from "react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { keccak256, toHex } from "thirdweb/utils";
import { contracts, EXPLORER } from "@/lib/config";
import Link from "next/link";

export default function RegisterPage() {
  const account = useActiveAccount();
  const { mutate: sendTx, isPending, isSuccess, isError, error } = useSendTransaction();

  const [signingKey, setSigningKey] = useState("");
  const [strategyName, setStrategyName] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [txHash, setTxHash] = useState("");

  function handleRegister() {
    if (!account || !signingKey || !strategyName) return;
    const strategyHash = keccak256(toHex(strategyName)) as `0x${string}`;
    const tx = prepareContractCall({
      contract: contracts.registry,
      method: "registerAgent",
      params: [signingKey as `0x${string}`, strategyHash, metadataURI],
    });
    sendTx(tx, { onSuccess: (r) => setTxHash(r.transactionHash) });
  }

  if (!account) return (
    <div className="max-w-lg mx-auto text-center py-20 space-y-4">
      <h1 className="text-2xl font-bold">Register Your Agent</h1>
      <p className="text-gray-400">Connect your wallet to register an agent and mint its ERC-8004 identity NFT.</p>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-1">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">← Home</Link>
        <h1 className="text-2xl font-bold">Register Your Agent</h1>
        <p className="text-gray-400 text-sm">
          Mints an ERC-8004 identity NFT to your wallet. The signing key is the address your agent uses to sign trades — keep the corresponding private key secure.
        </p>
      </div>

      {isSuccess ? (
        <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-6 space-y-3">
          <div className="text-green-400 font-semibold text-lg">Agent Registered!</div>
          <p className="text-sm text-gray-300">Your ERC-8004 identity NFT has been minted on Mantle.</p>
          <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 block">
            View transaction →
          </a>
          <Link href="/challenges" className="block text-sm text-white mt-2 underline">
            Enter a challenge →
          </Link>
        </div>
      ) : (
        <div className="border border-white/10 rounded-lg p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Signing Key Address <span className="text-red-400">*</span></label>
            <input type="text" placeholder="0x… (generate with: cast wallet new)"
              value={signingKey} onChange={e => setSigningKey(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/40"
            />
            <p className="text-xs text-gray-500">
              Public address of a fresh wallet. Your agent software will use its private key to sign trades.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400">Strategy Name <span className="text-red-400">*</span></label>
            <input type="text" placeholder="e.g. momentum-ema5-v1"
              value={strategyName} onChange={e => setStrategyName(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/40"
            />
            <p className="text-xs text-gray-500">Hashed to bytes32 and stored on-chain.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400">Metadata URI <span className="text-gray-600">(optional)</span></label>
            <input type="text" placeholder="ipfs://… or https://…"
              value={metadataURI} onChange={e => setMetadataURI(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/40"
            />
          </div>

          {isError && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded p-3">
              {(error as Error)?.message?.includes("SigningKeyAlreadyRegistered")
                ? "That signing key address is already registered to another agent. Generate a fresh wallet address and use that instead."
                : (error as Error)?.message?.includes("ZeroSigningKey")
                ? "Signing key cannot be the zero address."
                : (error as Error)?.message?.includes("ZeroStrategyHash")
                ? "Strategy name cannot be empty."
                : "Transaction failed — check the signing key is a valid address and try again."}
            </div>
          )}

          <button onClick={handleRegister} disabled={isPending || !signingKey || !strategyName}
            className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {isPending ? "Registering…" : "Register Agent & Mint NFT"}
          </button>
        </div>
      )}
    </div>
  );
}
