import { createThirdwebClient, defineChain, getContract } from "thirdweb";

// ── Mantle Sepolia chain (Thirdweb defineChain for guaranteed correctness)
export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia Testnet",
  rpc: process.env.MANTLE_RPC_URL ?? "https://rpc.sepolia.mantle.xyz",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  blockExplorers: [
    {
      name: "Mantle Sepolia Explorer",
      url: "https://explorer.sepolia.mantle.xyz",
    },
  ],
});

// ── Thirdweb client
export const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID ?? "",
});

// ── Minimal ABIs (only the functions agents actually call)
const executionEngineAbi = [
  {
    type: "function",
    name: "submitAction",
    inputs: [
      {
        name: "a",
        type: "tuple",
        components: [
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
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPortfolioValue",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "totalValue", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextNonce",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cash",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "holdings",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "asset", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ACTION_TYPEHASH",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

const priceOracleAbi = [
  {
    type: "function",
    name: "getPrice",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── Contract instances
function addr(envKey: string): `0x${string}` {
  const val = process.env[envKey];
  if (!val) throw new Error(`Missing env var: ${envKey}`);
  return val as `0x${string}`;
}

export function getContracts() {
  return {
    executionEngine: getContract({
      client,
      chain: mantleSepolia,
      address: addr("EXECUTION_ENGINE_ADDRESS"),
      abi: executionEngineAbi,
    }),
    priceOracle: getContract({
      client,
      chain: mantleSepolia,
      address: addr("PRICE_ORACLE_ADDRESS"),
      abi: priceOracleAbi,
    }),
  };
}

// ── Mantle ecosystem asset addresses used inside the paper-trading engine.
// These match the addresses set in DemoOracle via SetupDemo.s.sol.
// Override via env vars once real Mantle Sepolia token addresses are confirmed.
export const ASSETS = {
  mETH: (process.env.METH_ADDRESS  ?? "0x0000000000000000000000000000000000000001") as `0x${string}`,
  USDY: (process.env.USDY_ADDRESS  ?? "0x0000000000000000000000000000000000000002") as `0x${string}`,
  MNT:  (process.env.MNT_ADDRESS   ?? "0x0000000000000000000000000000000000000003") as `0x${string}`,
  fBTC: (process.env.FBTC_ADDRESS  ?? "0x0000000000000000000000000000000000000004") as `0x${string}`,
};

// ── Agent identity (from env)
export const agentConfig = {
  agentId: BigInt(process.env.AGENT_ID ?? "0"),
  challengeId: BigInt(process.env.CHALLENGE_ID ?? "0"),
  signingKey: (process.env.AGENT_SIGNING_KEY ?? "") as `0x${string}`,
};
