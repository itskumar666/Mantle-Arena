/**
 * Demo Driver — violently moves prices AND submits trades for 2 agents.
 *
 * Scenario:
 *   1. Reset prices to realistic values
 *   2. Pump mETH hard → Agent 1 (momentum) buys near the top
 *   3. Crash mETH hard → Agent 1 sells at a loss
 *   4. Agent 2 (mean-reversion) buys the dip
 *   5. Price recovers → Agent 2 sells at a profit
 *
 *   Result: Agent 1 loses ~$1 400, Agent 2 profits ~$1 500 — clear winner for settlement.
 *
 * Run: CHALLENGE_ID=5 npm run demo-driver
 */
import {
  sendTransaction,
  prepareContractCall,
  readContract,
  getContract,
  waitForReceipt,
} from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { signTypedData } from "viem/accounts";
import { client, mantleSepolia, ASSETS } from "./config.js";

// ── Config
function env(key: string, fallback = ""): `0x${string}` {
  return ((process.env[key] ?? fallback).replace(/^"|"$/g, "").replace(/^'|'$/g, "")) as `0x${string}`;
}

const CHALLENGE_ID = BigInt(process.env.CHALLENGE_ID ?? "5");
const AGENT1_ID    = BigInt(process.env.AGENT1_ID    ?? "1");
const AGENT2_ID    = BigInt(process.env.AGENT2_ID    ?? "2");
const AGENT1_KEY   = env("AGENT1_SIGNING_KEY", "0xc7ba91b990e7044b5a3f90afa75050e3e64f60a0cbc5eec8ce529874ea74376a");
const AGENT2_KEY   = env("AGENT2_SIGNING_KEY", "0xf3219eb7443fd9953324a87f7f0264020620ba7e22b07c1fc126b03ffa10da99");
const OWNER_KEY    = env("PRIVATE_KEY");
const ORACLE_ADDR    = (process.env.PRICE_ORACLE_ADDRESS ?? "0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b") as `0x${string}`;
const ENGINE_ADDR    = (process.env.EXECUTION_ENGINE_ADDRESS ?? "0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b") as `0x${string}`;

// ── ABIs
const oracleAbi = [
  { type: "function", name: "setPrice", inputs: [{ name: "asset", type: "address" }, { name: "price", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
] as const;

const engineAbi = [
  {
    type: "function", name: "submitAction",
    inputs: [{ name: "a", type: "tuple", components: [
      { name: "challengeId", type: "uint256" },
      { name: "agentId",     type: "uint256" },
      { name: "kind",        type: "uint8"   },
      { name: "asset",       type: "address" },
      { name: "size",        type: "uint128" },
      { name: "nonce",       type: "uint64"  },
      { name: "deadline",    type: "uint64"  },
    ]}, { name: "signature", type: "bytes" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "nextNonce", inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "cash",      inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "holdings",  inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }, { name: "asset", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getPortfolioValue", inputs: [{ name: "challengeId", type: "uint256" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const oracle  = getContract({ client, chain: mantleSepolia, address: ORACLE_ADDR, abi: oracleAbi });
const engine  = getContract({ client, chain: mantleSepolia, address: ENGINE_ADDR, abi: engineAbi });
const owner   = privateKeyToAccount({ client, privateKey: OWNER_KEY });

const Buy  = 0;
const Sell = 1;
const METH = ASSETS.mETH;

function toPrice(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1e18));
}

// ── Helpers
const MNT  = ASSETS.MNT;
const FBTC = ASSETS.fBTC;
const USDY = ASSETS.USDY;

async function setPrice(asset: `0x${string}`, dollars: number) {
  const result = await sendTransaction({
    transaction: prepareContractCall({ contract: oracle, method: "setPrice", params: [asset, toPrice(dollars)] }),
    account: owner,
  });
  await waitForReceipt({ client, chain: mantleSepolia, transactionHash: result.transactionHash });
}

async function setMethPrice(dollars: number) {
  console.log(`  [Oracle] mETH=$${dollars.toFixed(0)}`);
  await setPrice(METH, dollars);
}

async function initAllPrices() {
  console.log("  Setting baseline prices: mETH=$3800 MNT=$1.20 fBTC=$105000 USDY=$1");
  await setPrice(METH, 3_800);
  await setPrice(MNT,  1.20);
  await setPrice(FBTC, 105_000);
  await setPrice(USDY, 1.00);
}

async function getNonce(agentId: bigint) {
  return BigInt(await readContract({ contract: engine, method: "nextNonce", params: [CHALLENGE_ID, agentId] }));
}

async function getHoldings(agentId: bigint): Promise<bigint> {
  return BigInt(await readContract({ contract: engine, method: "holdings", params: [CHALLENGE_ID, agentId, METH] }));
}

async function getPortfolio(agentId: bigint) {
  const [cash, value] = await Promise.all([
    readContract({ contract: engine, method: "cash",              params: [CHALLENGE_ID, agentId] }),
    readContract({ contract: engine, method: "getPortfolioValue", params: [CHALLENGE_ID, agentId] }),
  ]);
  return { cash: BigInt(cash), value: BigInt(value) };
}

const ACTION_TYPES = {
  Action: [
    { name: "challengeId", type: "uint256" },
    { name: "agentId",     type: "uint256" },
    { name: "kind",        type: "uint8"   },
    { name: "asset",       type: "address" },
    { name: "size",        type: "uint128" },
    { name: "nonce",       type: "uint64"  },
    { name: "deadline",    type: "uint64"  },
  ],
} as const;

async function submitTrade(
  agentId: bigint,
  signerPrivateKey: `0x${string}`,
  kind: 0 | 1,
  size: bigint
) {
  const nonce    = await getNonce(agentId);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);

  const sig = await signTypedData({
    privateKey: signerPrivateKey,
    domain: {
      name:              "Agent Arena Execution Engine",
      version:           "1",
      chainId:           5003,
      verifyingContract: ENGINE_ADDR,
    },
    types: ACTION_TYPES,
    primaryType: "Action",
    message: { challengeId: CHALLENGE_ID, agentId, kind, asset: METH, size, nonce, deadline },
  });

  const result = await sendTransaction({
    transaction: prepareContractCall({
      contract: engine,
      method: "submitAction",
      params: [{ challengeId: CHALLENGE_ID, agentId, kind, asset: METH, size, nonce, deadline }, sig],
    }),
    account: owner,
  });
  await waitForReceipt({ client, chain: mantleSepolia, transactionHash: result.transactionHash });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function logPortfolios() {
  const [p1, p2] = await Promise.all([getPortfolio(AGENT1_ID), getPortfolio(AGENT2_ID)]);
  const starting = 10_000n * 10n ** 18n;
  const pnl1 = p1.value - starting;
  const pnl2 = p2.value - starting;
  console.log(`  [Portfolio] Agent1: $${(Number(p1.value)/1e18).toFixed(2)} (PnL: ${pnl1 >= 0n ? "+" : ""}$${(Number(pnl1)/1e18).toFixed(2)})`);
  console.log(`  [Portfolio] Agent2: $${(Number(p2.value)/1e18).toFixed(2)} (PnL: ${pnl2 >= 0n ? "+" : ""}$${(Number(pnl2)/1e18).toFixed(2)})`);
}

// ── Main scenario
async function run() {
  if (!OWNER_KEY) { console.error("PRIVATE_KEY not set in env"); process.exit(1); }
  console.log(`\n=== Agent Arena Demo Driver ===`);
  console.log(`Challenge: #${CHALLENGE_ID}  Agent1: #${AGENT1_ID}  Agent2: #${AGENT2_ID}\n`);

  // ── Step 1: Reset to realistic prices
  console.log("Step 1 — Resetting all prices to baseline...");
  await initAllPrices();

  // ── Step 2: Pump mETH +32%
  console.log("\nStep 2 — Pumping mETH to $5,000 (+32%)...");
  for (const p of [4_100, 4_400, 4_700, 5_000]) {
    await setMethPrice(p);
  }

  // ── Step 3: Agent 1 buys near the top ($3 000 of mETH at $5 000)
  console.log("\nStep 3 — Agent 1 buys $3 000 mETH at the top ($5 000)...");
  const buySize1 = 3_000n * 10n ** 18n; // $3 000 quote
  await submitTrade(AGENT1_ID, AGENT1_KEY, Buy, buySize1);
  console.log("  Agent 1 bought.");
  await logPortfolios();

  // ── Step 4: Crash mETH -48% (from 5 000 → 2 600)
  console.log("\nStep 4 — Crashing mETH to $2 600...");
  for (const p of [4_400, 3_800, 3_200, 2_800, 2_600]) {
    await setMethPrice(p);
  }

  // ── Step 5: Agent 1 sells everything at $2 600 (realises loss)
  console.log("\nStep 5 — Agent 1 panic-sells at $2 600...");
  const h1 = await getHoldings(AGENT1_ID);
  if (h1 > 0n) {
    await submitTrade(AGENT1_ID, AGENT1_KEY, Sell, h1);
    console.log(`  Agent 1 sold ${(Number(h1)/1e18).toFixed(4)} mETH.`);
  } else {
    console.log("  Agent 1 has no holdings to sell.");
  }
  await logPortfolios();

  // ── Step 6: Agent 2 buys the dip at $2 600
  console.log("\nStep 6 — Agent 2 buys dip at $2 600 ($3 000 notional)...");
  const buySize2 = 3_000n * 10n ** 18n;
  await submitTrade(AGENT2_ID, AGENT2_KEY, Buy, buySize2);
  console.log("  Agent 2 bought.");
  await logPortfolios();

  // ── Step 7: Price recovers +46% (2 600 → 3 800)
  console.log("\nStep 7 — Price recovers to $3 800...");
  for (const p of [2_900, 3_200, 3_500, 3_800]) {
    await setMethPrice(p);
  }

  // ── Step 8: Agent 2 takes profit at $3 800
  console.log("\nStep 8 — Agent 2 takes profit at $3 800...");
  const h2 = await getHoldings(AGENT2_ID);
  if (h2 > 0n) {
    await submitTrade(AGENT2_ID, AGENT2_KEY, Sell, h2);
    console.log(`  Agent 2 sold ${(Number(h2)/1e18).toFixed(4)} mETH.`);
  }

  // ── Final state
  console.log("\n=== FINAL PORTFOLIOS ===");
  await logPortfolios();

  const starting = 10_000n * 10n ** 18n;
  const [p1, p2] = await Promise.all([getPortfolio(AGENT1_ID), getPortfolio(AGENT2_ID)]);
  const pnl1 = p1.value - starting;
  const pnl2 = p2.value - starting;

  console.log(`\nWinner: ${pnl1 > pnl2 ? `Agent #${AGENT1_ID}` : `Agent #${AGENT2_ID}`}`);
  console.log(`\nYou can now settle Challenge #${CHALLENGE_ID} and claim Trophy NFTs.`);
}

run().catch(console.error);
