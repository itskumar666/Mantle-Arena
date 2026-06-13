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

export const ADDRESSES = {
  registry:    process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS   ?? "0xb135bbbd7b224599b970acb3d840b78f07d1bc50",
  challenge:   process.env.NEXT_PUBLIC_CHALLENGE_ADDRESS        ?? "0x52525Cd48D46228F2dD4C0C023145AE1Eac8597b",
  engine:      process.env.NEXT_PUBLIC_EXECUTION_ENGINE_ADDRESS ?? "0x9118ab69430d342961c3362fa654560eed53dccd",
  leaderboard: process.env.NEXT_PUBLIC_LEADERBOARD_ADDRESS      ?? "0xb583b0b9918638bd66874c1d321d9fc9ad63ea6d",
  reputation:  process.env.NEXT_PUBLIC_REPUTATION_ADDRESS       ?? "0x269c3569ab761fe1122beca6b27687f9389216a4",
  stakeVault:  process.env.NEXT_PUBLIC_STAKE_VAULT_ADDRESS      ?? "0x2203253a5abcc71f4e31db30fdfe4c714a981edd",
  trophy:      process.env.NEXT_PUBLIC_TROPHY_ADDRESS           ?? "0x466a926659b371113ca43c51cd39a47227bbcd54",
  oracle:      process.env.NEXT_PUBLIC_ORACLE_ADDRESS           ?? "0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b",
} as const;

// ── Asset address → human-readable info
export const ASSET_META: Record<string, { symbol: string; name: string; color: string }> = {
  "0x0000000000000000000000000000000000000001": { symbol: "mETH",  name: "Mantle ETH",     color: "text-blue-400"   },
  "0x0000000000000000000000000000000000000002": { symbol: "USDY",  name: "USD Yield",      color: "text-green-400"  },
  "0x0000000000000000000000000000000000000003": { symbol: "MNT",   name: "Mantle",         color: "text-purple-400" },
  "0x0000000000000000000000000000000000000004": { symbol: "fBTC",  name: "Fungible BTC",   color: "text-orange-400" },
  "0x0000000000000000000000000000000000000005": { symbol: "SOL",   name: "Solana",         color: "text-teal-400"   },
  "0x0000000000000000000000000000000000000006": { symbol: "USDT",  name: "Tether",         color: "text-emerald-400"},
  "0x0000000000000000000000000000000000000007": { symbol: "BNB",   name: "BNB",            color: "text-yellow-400" },
  "0x0000000000000000000000000000000000000008": { symbol: "AAVE",  name: "Aave",           color: "text-pink-400"   },
  "0x0000000000000000000000000000000000000009": { symbol: "AUSD",  name: "Agora USD",      color: "text-cyan-400"   },
};

export function assetSymbol(addr: string): string {
  return ASSET_META[addr.toLowerCase()] ? ASSET_META[addr.toLowerCase()]?.symbol ?? shortAddr(addr) : (ASSET_META[addr]?.symbol ?? shortAddr(addr));
}

export function assetName(addr: string): string {
  return ASSET_META[addr]?.name ?? shortAddr(addr);
}

// ── ABIs

const challengeAbi = [
  { type: "function", name: "nextChallengeId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function", name: "getChallenge",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "creator",            type: "address" },
        { name: "startTime",          type: "uint64"  },
        { name: "endTime",            type: "uint64"  },
        { name: "startingBalance",    type: "uint128" },
        { name: "entryFee",           type: "uint128" },
        { name: "settleBounty",       type: "uint128" },
        { name: "entryFeesCollected", type: "uint128" },
        { name: "settled",            type: "bool"    },
      ],
    }],
    stateMutability: "view",
  },
  { type: "function", name: "phaseOf",        inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "uint8" }],     stateMutability: "view" },
  { type: "function", name: "getParticipants", inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { type: "function", name: "getAllowedAssets", inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "address[]" }], stateMutability: "view" },
  {
    type: "function", name: "enterAgent",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function", name: "createChallenge",
    inputs: [
      { name: "startTime",       type: "uint64"    },
      { name: "endTime",         type: "uint64"    },
      { name: "startingBalance", type: "uint128"   },
      { name: "entryFee",        type: "uint128"   },
      { name: "settleBounty",    type: "uint128"   },
      { name: "allowedAssets",   type: "address[]" },
    ],
    outputs: [{ name: "challengeId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

const registryAbi = [
  {
    type: "function", name: "getAgent",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "developer",    type: "address" },
        { name: "signingKey",   type: "address" },
        { name: "strategyHash", type: "bytes32" },
        { name: "registeredAt", type: "uint64"  },
      ],
    }],
    stateMutability: "view",
  },
  { type: "function", name: "totalAgents",         inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "ownerOf",             inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "agentIdBySigningKey", inputs: [{ name: "signingKey", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function", name: "registerAgent",
    inputs: [
      { name: "signingKey",   type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "metadataURI",  type: "string"  },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  { type: "error", name: "ZeroSigningKey",              inputs: [] },
  { type: "error", name: "ZeroStrategyHash",            inputs: [] },
  { type: "error", name: "SigningKeyAlreadyRegistered", inputs: [{ name: "signingKey", type: "address" }, { name: "existingAgentId", type: "uint256" }] },
  { type: "error", name: "NotAgentOwner",               inputs: [{ name: "agentId", type: "uint256" }, { name: "caller", type: "address" }] },
  { type: "error", name: "AgentDoesNotExist",           inputs: [{ name: "agentId", type: "uint256" }] },
] as const;

const leaderboardAbi = [
  { type: "function", name: "isSettled", inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "bool" }],       stateMutability: "view" },
  { type: "function", name: "ranking",   inputs: [{ name: "challengeId", type: "uint256" }], outputs: [{ type: "uint256[]" }],  stateMutability: "view" },
  { type: "function", name: "rankOf",    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "uint16" }], stateMutability: "view" },
  {
    type: "function", name: "resultOf",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [{ name: "finalValue", type: "uint256" }, { name: "pnl", type: "int256" }] }],
    stateMutability: "view",
  },
  { type: "function", name: "agentChallengeHistory", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { type: "function", name: "settle", inputs: [{ name: "challengeId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
] as const;

const reputationAbi = [
  {
    type: "function", name: "reputationOf",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "totalChallenges",   type: "uint256" },
        { name: "wins",              type: "uint256" },
        { name: "cumulativePnL",     type: "int256"  },
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
  {
    type: "function", name: "cash",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "holdings",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }, { name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "nextNonce",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "submitAction",
    inputs: [
      {
        name: "a", type: "tuple", components: [
          { name: "challengeId", type: "uint256" },
          { name: "agentId",     type: "uint256" },
          { name: "kind",        type: "uint8"   },
          { name: "asset",       type: "address" },
          { name: "size",        type: "uint128" },
          { name: "nonce",       type: "uint64"  },
          { name: "deadline",    type: "uint64"  },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
  { type: "function", name: "claim", inputs: [], outputs: [], stateMutability: "nonpayable" },
] as const;

const trophyAbi = [
  {
    type: "function", name: "claim",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "tokenOf",
    inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "trophies",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "challengeId", type: "uint256" },
        { name: "agentId",     type: "uint256" },
        { name: "finalValue",  type: "uint256" },
        { name: "pnl",         type: "int256"  },
        { name: "rank",        type: "uint16"  },
        { name: "claimedAt",   type: "uint64"  },
      ],
    }],
    stateMutability: "view",
  },
  { type: "function", name: "balanceOf", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const oracleAbi = [
  {
    type: "function", name: "getPrice",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── Contract instances
export const contracts = {
  challenge:   getContract({ client, chain: mantleSepolia, address: ADDRESSES.challenge   as `0x${string}`, abi: challengeAbi }),
  registry:    getContract({ client, chain: mantleSepolia, address: ADDRESSES.registry    as `0x${string}`, abi: registryAbi }),
  leaderboard: getContract({ client, chain: mantleSepolia, address: ADDRESSES.leaderboard as `0x${string}`, abi: leaderboardAbi }),
  reputation:  getContract({ client, chain: mantleSepolia, address: ADDRESSES.reputation  as `0x${string}`, abi: reputationAbi }),
  engine:      getContract({ client, chain: mantleSepolia, address: ADDRESSES.engine      as `0x${string}`, abi: engineAbi }),
  stakeVault:  getContract({ client, chain: mantleSepolia, address: ADDRESSES.stakeVault  as `0x${string}`, abi: stakeVaultAbi }),
  trophy:      getContract({ client, chain: mantleSepolia, address: ADDRESSES.trophy      as `0x${string}`, abi: trophyAbi }),
  oracle:      getContract({ client, chain: mantleSepolia, address: ADDRESSES.oracle      as `0x${string}`, abi: oracleAbi }),
};

// ── UI helpers
export const PHASE_LABELS: Record<number, string> = { 0: "Enrolling", 1: "Live", 2: "Ended", 3: "Settled" };

export const PHASE_COLORS: Record<number, string> = {
  0: "bg-blue-500/20 text-blue-300",
  1: "bg-green-500/20 text-green-300",
  2: "bg-yellow-500/20 text-yellow-300",
  3: "bg-gray-500/20 text-gray-300",
};

export function formatUsd(wei: bigint): string {
  return `$${(Number(wei) / 1e18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPnl(wei: bigint): string {
  const usd  = Number(wei) / 1e18;
  const sign = usd >= 0 ? "+" : "";
  return `${sign}$${Math.abs(usd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const EXPLORER = "https://explorer.sepolia.mantle.xyz";
