import { NextRequest, NextResponse } from "next/server";
import { ADDR, CHALLENGE_ABI, publicClient, relayerWallet, EXPLORER } from "@/lib/onchain/relayer";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Pro plan supports up to 300s

const LEADERBOARD_ADDRESS = (process.env.NEXT_PUBLIC_LEADERBOARD_ADDRESS ?? "0xAa7F578169917F26554903b7207617c34BAEFC19") as `0x${string}`;
const TROPHY_ADDRESS      = (process.env.NEXT_PUBLIC_TROPHY_ADDRESS      ?? "0xa7CC2d73b901715f4B156E4F911B2a6f6B2D988f") as `0x${string}`;

const LEADERBOARD_ABI = [
  { type: "function", name: "settle",     inputs: [{ name: "challengeId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "isSettled",  inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "ranking",    inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { type: "function", name: "resultOf",   inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "finalValue", type: "uint256" }, { name: "pnl", type: "int256" }] }], stateMutability: "view" },
] as const;

const TROPHY_ABI = [
  { type: "function", name: "claim",   inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ name: "tokenId", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "tokenOf", inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel cron sends a secret header; skip check in dev
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relayer = relayerWallet();
  if (!relayer) return NextResponse.json({ error: "No relayer key" }, { status: 503 });

  const pub = publicClient();
  const log: string[] = [];

  // Discover challenge count
  const nextId = await pub.readContract({ address: ADDR.challenge, abi: CHALLENGE_ABI, functionName: "nextChallengeId" });
  const count = Number(nextId) - 1;
  log.push(`Checking ${count} challenges`);

  for (let id = 1; id <= count; id++) {
    const cId = BigInt(id);
    try {
      const phase = await pub.readContract({ address: ADDR.challenge, abi: CHALLENGE_ABI, functionName: "phaseOf", args: [cId] });
      // phase 2 = Ended, phase 3 = Settled
      if (phase !== 2) continue;

      // Settle Challenge contract
      log.push(`Settling challenge #${id}...`);
      const settleTx = await relayer.wallet.writeContract({
        address: ADDR.challenge, abi: CHALLENGE_ABI, functionName: "settle",
        args: [cId], account: relayer.account, chain: undefined,
      });
      await pub.waitForTransactionReceipt({ hash: settleTx });
      log.push(`  Challenge settled: ${EXPLORER}/tx/${settleTx}`);

      // Settle Leaderboard
      const lbSettled = await pub.readContract({ address: LEADERBOARD_ADDRESS, abi: LEADERBOARD_ABI, functionName: "isSettled", args: [cId] });
      if (!lbSettled) {
        const lbTx = await relayer.wallet.writeContract({
          address: LEADERBOARD_ADDRESS, abi: LEADERBOARD_ABI, functionName: "settle",
          args: [cId], account: relayer.account, chain: undefined,
        });
        await pub.waitForTransactionReceipt({ hash: lbTx });
        log.push(`  Leaderboard settled: ${EXPLORER}/tx/${lbTx}`);
      }

      // Claim trophies for profitable agents
      let ranking: readonly bigint[];
      try {
        ranking = await pub.readContract({ address: LEADERBOARD_ADDRESS, abi: LEADERBOARD_ABI, functionName: "ranking", args: [cId] });
      } catch { continue; }

      for (const agentId of ranking) {
        try {
          const existing = await pub.readContract({ address: TROPHY_ADDRESS, abi: TROPHY_ABI, functionName: "tokenOf", args: [cId, agentId] });
          if (existing !== 0n) continue;
          const result = await pub.readContract({ address: LEADERBOARD_ADDRESS, abi: LEADERBOARD_ABI, functionName: "resultOf", args: [cId, agentId] });
          if (result.pnl <= 0n) continue;
          const claimTx = await relayer.wallet.writeContract({
            address: TROPHY_ADDRESS, abi: TROPHY_ABI, functionName: "claim",
            args: [cId, agentId], account: relayer.account, chain: undefined,
          });
          await pub.waitForTransactionReceipt({ hash: claimTx });
          log.push(`  Trophy claimed for agent #${agentId}: ${EXPLORER}/tx/${claimTx}`);
        } catch (e) {
          log.push(`  Trophy skip agent #${agentId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      log.push(`Challenge #${id} error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, log });
}
