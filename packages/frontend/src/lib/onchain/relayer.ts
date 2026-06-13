/**
 * Server-side on-chain config for the relayer (Node runtime only).
 *
 * Uses viem directly — NOT thirdweb — because the project's ExecutionEngine
 * rejects signatures produced by thirdweb's account wrapper (see CLAUDE.md:
 * "EIP-712 signing: use viem directly"). viem's signTypedData recovers cleanly
 * against the on-chain ECDSA.recover check.
 *
 * The relayer (owner) key pays gas and submits txs; bots get an ephemeral
 * signing keypair generated per promotion. No user wallet is ever involved.
 */
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: { default: { name: "Mantle Sepolia Explorer", url: "https://explorer.sepolia.mantle.xyz" } },
});

export const ADDR = {
  registry: (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ?? "0xb135bbbd7b224599b970acb3d840b78f07d1bc50") as `0x${string}`,
  challenge: (process.env.NEXT_PUBLIC_CHALLENGE_ADDRESS ?? "0x52525Cd48D46228F2dD4C0C023145AE1Eac8597b") as `0x${string}`,
  engine: (process.env.NEXT_PUBLIC_EXECUTION_ENGINE_ADDRESS ?? "0x9118ab69430d342961c3362fa654560eed53dccd") as `0x${string}`,
} as const;

export const EXPLORER = "https://explorer.sepolia.mantle.xyz";

export const REGISTRY_ABI = [
  {
    type: "function", name: "registerAgent", stateMutability: "nonpayable",
    inputs: [
      { name: "signingKey", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function", name: "agentIdBySigningKey", stateMutability: "view",
    inputs: [{ name: "signingKey", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const CHALLENGE_ABI = [
  {
    type: "function", name: "enterAgent", stateMutability: "payable",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "phaseOf", stateMutability: "view",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function", name: "nextChallengeId", stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "settle", stateMutability: "nonpayable",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "getChallenge", stateMutability: "view",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "creator", type: "address" },
        { name: "startTime", type: "uint64" },
        { name: "endTime", type: "uint64" },
        { name: "startingBalance", type: "uint128" },
        { name: "entryFee", type: "uint128" },
        { name: "settleBounty", type: "uint128" },
        { name: "entryFeesCollected", type: "uint128" },
        { name: "settled", type: "bool" },
      ],
    }],
  },
  {
    type: "function", name: "getParticipants", stateMutability: "view",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

export const ENGINE_ABI = [
  {
    type: "function", name: "submitAction", stateMutability: "nonpayable",
    inputs: [
      {
        name: "a", type: "tuple", components: [
          { name: "challengeId", type: "uint256" },
          { name: "agentId", type: "uint256" },
          { name: "kind", type: "uint8" },
          { name: "asset", type: "address" },
          { name: "size", type: "uint128" },
          { name: "nonce", type: "uint64" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "nextNonce", stateMutability: "view",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint64" }],
  },
] as const;

/** EIP-712 type for a signed Action — matches ExecutionEngine's _hashAction. */
export const ACTION_EIP712_TYPES = {
  Action: [
    { name: "challengeId", type: "uint256" },
    { name: "agentId", type: "uint256" },
    { name: "kind", type: "uint8" },
    { name: "asset", type: "address" },
    { name: "size", type: "uint128" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export function actionDomain() {
  return {
    name: "Agent Arena Execution Engine",
    version: "1",
    chainId: mantleSepolia.id,
    verifyingContract: ADDR.engine,
  } as const;
}

export function publicClient() {
  return createPublicClient({ chain: mantleSepolia, transport: http() });
}

/** Wallet client for the relayer/owner. Returns null if no key configured. */
export function relayerWallet() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) return null;
  const account = privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`));
  const wallet = createWalletClient({ account, chain: mantleSepolia, transport: http() });
  return { wallet, account };
}
