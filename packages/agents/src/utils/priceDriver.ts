/**
 * Live Price Driver — fetches real ETH/BTC/MNT prices from Binance REST API
 * and pushes them into MockPriceOracle every 5 seconds.
 *
 * Real market prices give agents genuine momentum/mean-reversion signals to act on.
 *
 * Run: cp .env.pricedriver .env && npm run pricedriver
 */
import { sendTransaction, prepareContractCall, getContract } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { client, mantleSepolia, ASSETS } from "../config.js";

const DEMO_ORACLE = (process.env.DEMO_ORACLE_ADDRESS ?? "0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b") as `0x${string}`;
const OWNER_KEY   = (process.env.PRIVATE_KEY ?? "") as `0x${string}`;

const UPDATE_INTERVAL_MS = 5_000; // every 5 seconds — fast enough for agents to see real moves

const BINANCE_BASE = "https://api.binance.com/api/v3/ticker/price";

const demoOracleAbi = [
  {
    type: "function", name: "setPriceBatch",
    inputs: [
      { name: "assets", type: "address[]" },
      { name: "prices", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const oracle = getContract({ client, chain: mantleSepolia, address: DEMO_ORACLE, abi: demoOracleAbi });
const account = privateKeyToAccount({ client, privateKey: OWNER_KEY });

// Last known prices (1e18 scaled) — used as fallback if a fetch fails
const lastPrices: Record<string, bigint> = {
  [ASSETS.mETH]: 3800n * 10n ** 18n,
  [ASSETS.MNT]:  12n   * 10n ** 17n,
  [ASSETS.fBTC]: 105000n * 10n ** 18n,
  [ASSETS.USDY]: 1n * 10n ** 18n,
};

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_BASE}?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json() as { price: string };
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

async function fetchPrices(): Promise<void> {
  const [eth, btc, mnt] = await Promise.all([
    fetchBinancePrice("ETHUSDT"),
    fetchBinancePrice("BTCUSDT"),
    fetchBinancePrice("MNTUSDT"),
  ]);

  if (eth !== null) lastPrices[ASSETS.mETH] = BigInt(Math.round(eth * 1e18));
  if (btc !== null) lastPrices[ASSETS.fBTC] = BigInt(Math.round(btc * 1e18));
  if (mnt !== null) lastPrices[ASSETS.MNT]  = BigInt(Math.round(mnt * 1e18));
  // USDY is always $1
  lastPrices[ASSETS.USDY] = 1n * 10n ** 18n;

  const assets = Object.keys(lastPrices) as `0x${string}`[];
  const vals   = assets.map(a => lastPrices[a]);

  console.log(
    `[PriceDriver] ETH=$${eth?.toFixed(2) ?? "?"} BTC=$${btc?.toFixed(0) ?? "?"} MNT=$${mnt?.toFixed(4) ?? "?"}`
  );

  const tx = prepareContractCall({
    contract: oracle,
    method: "setPriceBatch",
    params: [assets, vals],
  });
  await sendTransaction({ transaction: tx, account });
}

async function run(): Promise<void> {
  if (!OWNER_KEY) { console.error("[PriceDriver] PRIVATE_KEY not set"); process.exit(1); }
  console.log("[PriceDriver] Starting — real Binance prices, updating every", UPDATE_INTERVAL_MS / 1000, "seconds");
  console.log("[PriceDriver] DemoOracle:", DEMO_ORACLE);

  while (true) {
    try { await fetchPrices(); } catch (e) { console.error("[PriceDriver] Error:", e); }
    await new Promise(r => setTimeout(r, UPDATE_INTERVAL_MS));
  }
}

run().catch(console.error);
