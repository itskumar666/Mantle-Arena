import { createThirdwebClient, defineChain, getContract } from "thirdweb";

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia Testnet",
  rpc: "https://rpc.sepolia.mantle.xyz",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  blockExplorers: [
    { name: "Mantle Sepolia Explorer", url: "https://explorer.sepolia.mantle.xyz" },
  ],
});

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? "",
});

function addr(key: string): `0x${string}` {
  return (process.env[key] ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
}

// ── Minimal ABIs (only what the UI reads/writes)

const challengeAbi = [
  { type: "function", name: "nextChallengeId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function", name: "getChallenge",
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
    stateMutability: "view",
  },
  {
    type: "function", name: "phaseOf",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getParticipants",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "enterAgent",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

const registryAbi = [
  {
    type: "function", name: "getAgent",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "developer", type: "address" },
        { name: "signingKey", type: "address" },
        { name: "strategyHash", type: "bytes32" },
        { name: "registeredAt", type: "uint64" },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function", name: "totalAgents",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "registerAgent",
    inputs: [
      { name: "signingKey", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

const leaderboardAbi = [
  {
    type: "function", name: "isSettled",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "ranking",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "resultOf",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "finalValue", type: "uint256" },
        { name: "pnl", type: "int256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

const reputationAbi = [
  {
    type: "function", name: "reputationOf",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "totalChallenges", type: "uint256" },
        { name: "wins", type: "uint256" },
        { name: "cumulativePnL", type: "int256" },
        { name: "averageFinalValue", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

const engineAbi = [
  {
    type: "function", name: "getPortfolioValue",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const stakeVaultAbi = [
  {
    type: "function", name: "stake",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function", name: "stakeOf",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "backer", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "agentStakeTotal",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "claimable",
    inputs: [{ name: "backer", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "claim",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const contracts = {
  challenge:   getContract({ client, chain: mantleSepolia, address: addr("NEXT_PUBLIC_CHALLENGE_ADDRESS"),        abi: challengeAbi }),
  registry:    getContract({ client, chain: mantleSepolia, address: addr("NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS"),   abi: registryAbi }),
  leaderboard: getContract({ client, chain: mantleSepolia, address: addr("NEXT_PUBLIC_LEADERBOARD_ADDRESS"),      abi: leaderboardAbi }),
  reputation:  getContract({ client, chain: mantleSepolia, address: addr("NEXT_PUBLIC_REPUTATION_ADDRESS"),       abi: reputationAbi }),
  engine:      getContract({ client, chain: mantleSepolia, address: addr("NEXT_PUBLIC_EXECUTION_ENGINE_ADDRESS"), abi: engineAbi }),
  stakeVault:  getContract({ client, chain: mantleSepolia, address: addr("NEXT_PUBLIC_STAKE_VAULT_ADDRESS"),      abi: stakeVaultAbi }),
};

// Phase names matching the on-chain enum
export const PHASE_LABELS: Record<number, string> = {
  0: "Enrolling",
  1: "Live",
  2: "Ended",
  3: "Settled",
};

export const PHASE_COLORS: Record<number, string> = {
  0: "bg-blue-100 text-blue-800",
  1: "bg-green-100 text-green-800",
  2: "bg-yellow-100 text-yellow-800",
  3: "bg-gray-100 text-gray-800",
};

export function formatUsd(wei: bigint): string {
  return `$${(Number(wei) / 1e18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPnl(wei: bigint): string {
  const usd = Number(wei) / 1e18;
  const sign = usd >= 0 ? "+" : "";
  return `${sign}$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
