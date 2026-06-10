/**
 * Realistic Market Price Simulator
 *
 * Simulates live market price movements using Geometric Brownian Motion (GBM)
 * with regime switching (calm ↔ volatile periods) and asset correlations.
 *
 * This makes agents react to real-looking market data — trending moves, dips,
 * spikes, recoveries — instead of pure noise.
 *
 * Run: npm run price-sim
 */
import {
  sendTransaction,
  prepareContractCall,
  getContract,
  waitForReceipt,
} from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { client, mantleSepolia } from "./config.js";

// ── Config
function stripQuotes(s: string): `0x${string}` {
  return s.replace(/^["']|["']$/g, "") as `0x${string}`;
}
const OWNER_KEY   = stripQuotes(process.env.PRIVATE_KEY ?? "");
const ORACLE_ADDR = (process.env.PRICE_ORACLE_ADDRESS ?? "0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b") as `0x${string}`;
const INTERVAL_MS = 10_000; // 10s between updates — fast enough for agents to react

const oracleAbi = [
  {
    type: "function", name: "setPriceBatch",
    inputs: [
      { name: "assets",  type: "address[]" },
      { name: "prices",  type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setPrice",
    inputs: [{ name: "asset", type: "address" }, { name: "price", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const oracle  = getContract({ client, chain: mantleSepolia, address: ORACLE_ADDR, abi: oracleAbi });
const account = privateKeyToAccount({ client, privateKey: OWNER_KEY });

// ── Asset definitions
// Each asset has: starting price (USD), annual volatility, mean-reversion strength
const ASSETS: Record<string, { addr: `0x${string}`; name: string; price: number; vol: number; mu: number }> = {
  mETH:  { addr: "0x0000000000000000000000000000000000000001", name: "mETH",  price: 3_800,   vol: 0.035, mu: 0 },
  fBTC:  { addr: "0x0000000000000000000000000000000000000004", name: "fBTC",  price: 105_000,  vol: 0.025, mu: 0 },
  MNT:   { addr: "0x0000000000000000000000000000000000000003", name: "MNT",   price: 1.20,    vol: 0.040, mu: 0 },
  SOL:   { addr: "0x0000000000000000000000000000000000000005", name: "SOL",   price: 175,     vol: 0.055, mu: 0 },
  BNB:   { addr: "0x0000000000000000000000000000000000000007", name: "BNB",   price: 600,     vol: 0.030, mu: 0 },
  AAVE:  { addr: "0x0000000000000000000000000000000000000008", name: "AAVE",  price: 210,     vol: 0.050, mu: 0 },
  USDY:  { addr: "0x0000000000000000000000000000000000000002", name: "USDY",  price: 1.00,    vol: 0.001, mu: 0 }, // stablecoin
  USDT:  { addr: "0x0000000000000000000000000000000000000006", name: "USDT",  price: 1.00,    vol: 0.001, mu: 0 }, // stablecoin
  AUSD:  { addr: "0x0000000000000000000000000000000000000009", name: "AUSD",  price: 1.00,    vol: 0.001, mu: 0 }, // stablecoin
};

// Current simulated prices (mutable)
const prices: Record<string, number> = Object.fromEntries(
  Object.entries(ASSETS).map(([k, v]) => [k, v.price])
);

// ── GBM helpers

/** Box-Muller: returns a standard normal N(0,1) sample */
function randn(): number {
  const u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Market regime: "calm" or "volatile"
type Regime = "calm" | "volatile";
let regime: Regime = "calm";
let regimeTick = 0;
const REGIME_CALM_MIN = 8;  const REGIME_CALM_MAX = 15;
const REGIME_VOLA_MIN = 3;  const REGIME_VOLA_MAX = 8;
let regimeRemaining = randInt(REGIME_CALM_MIN, REGIME_CALM_MAX);

function randInt(lo: number, hi: number): number {
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

// Correlated random component shared by risk assets (BTC/ETH/SOL/BNB move together)
function getMarketFactor(): number {
  return randn();
}

/**
 * One GBM step for a given asset.
 * @param key   asset key in ASSETS
 * @param zMkt  shared market factor (correlation)
 * @param zIdio asset-specific factor
 */
function gbmStep(key: string, zMkt: number, zIdio: number): number {
  const asset   = ASSETS[key];
  const current = prices[key];

  // Stablecoins: tiny noise only
  if (key === "USDY" || key === "USDT" || key === "AUSD") {
    const noise = randn() * 0.001;
    return Math.max(0.990, Math.min(1.010, current + noise));
  }

  // Volatility multiplied in volatile regime
  const regimeMult = regime === "volatile" ? 2.2 : 1.0;
  const vol = asset.vol * regimeMult;

  // Correlation: 60% market factor, 40% idiosyncratic
  const corr   = 0.60;
  const zAsset = corr * zMkt + Math.sqrt(1 - corr * corr) * zIdio;

  // GBM step: S * exp((mu - vol²/2)*dt + vol*sqrt(dt)*Z)
  // dt = 1 tick, keep mu = 0 (no directional drift for fairness)
  const logReturn = (asset.mu - 0.5 * vol * vol) + vol * zAsset;
  const next = current * Math.exp(logReturn);

  // Clamp: never more than 5× or less than 0.2× starting price
  const start = asset.price;
  return Math.max(start * 0.2, Math.min(start * 5, next));
}

function updateRegime() {
  regimeTick++;
  regimeRemaining--;
  if (regimeRemaining <= 0) {
    if (regime === "calm") {
      regime = "volatile";
      regimeRemaining = randInt(REGIME_VOLA_MIN, REGIME_VOLA_MAX);
      console.log(`\n  ⚡ VOLATILE REGIME — brace for big moves (${regimeRemaining} ticks)`);
    } else {
      regime = "calm";
      regimeRemaining = randInt(REGIME_CALM_MIN, REGIME_CALM_MAX);
      console.log(`\n  😌 Calm regime restored (${regimeRemaining} ticks)\n`);
    }
  }
}

// ── Tick: update all prices + push to oracle
async function tick() {
  updateRegime();

  const zMkt = getMarketFactor();

  for (const key of Object.keys(ASSETS)) {
    prices[key] = gbmStep(key, zMkt, randn());
  }

  // Log price table
  const keys  = ["mETH", "fBTC", "MNT", "SOL", "BNB", "AAVE"];
  const label = regime === "volatile" ? "⚡ VOLATILE" : "  calm     ";
  const line  = keys.map(k => `${k}=$${prices[k].toFixed(k === "MNT" ? 4 : 0)}`).join("  ");
  console.log(`[t=${String(regimeTick).padStart(3)}] ${label}  ${line}`);

  // Build batch arrays
  const addrs  = Object.values(ASSETS).map(a => a.addr);
  const vals   = Object.keys(ASSETS).map(k => BigInt(Math.round(prices[k] * 1e18)));

  try {
    const result = await sendTransaction({
      transaction: prepareContractCall({
        contract: oracle,
        method:   "setPriceBatch",
        params:   [addrs, vals],
      }),
      account,
    });
    await waitForReceipt({ client, chain: mantleSepolia, transactionHash: result.transactionHash });
  } catch {
    // Fallback: individual setPrice calls if batch not available
    for (let i = 0; i < addrs.length; i++) {
      try {
        const r = await sendTransaction({
          transaction: prepareContractCall({
            contract: oracle, method: "setPrice", params: [addrs[i], vals[i]],
          }),
          account,
        });
        await waitForReceipt({ client, chain: mantleSepolia, transactionHash: r.transactionHash });
      } catch (e) {
        console.error(`  [price-sim] setPrice failed for ${addrs[i]}:`, e);
      }
    }
  }
}

// ── Main
async function run() {
  if (!OWNER_KEY) { console.error("[price-sim] PRIVATE_KEY not set"); process.exit(1); }

  console.log("=== Agent Arena Price Simulator ===");
  console.log(`Oracle: ${ORACLE_ADDR}`);
  console.log(`Update interval: ${INTERVAL_MS / 1000}s`);
  console.log("Assets: mETH (ETH/USD) · fBTC (BTC/USD) · MNT · SOL · BNB · AAVE · stablecoins");
  console.log("Market model: GBM + regime switching (calm ↔ volatile) + asset correlation");
  console.log("Press Ctrl+C to stop.\n");
  console.log("Starting prices:");
  for (const [k, v] of Object.entries(ASSETS)) {
    console.log(`  ${k.padEnd(6)} $${v.price.toLocaleString()}`);
  }
  console.log("");

  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error("[price-sim] tick error:", e);
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

run().catch(console.error);
