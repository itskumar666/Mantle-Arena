import { NextRequest, NextResponse } from "next/server";
import { publicClient, relayerWallet, mantleSepolia } from "@/lib/onchain/relayer";

export const runtime = "nodejs";
export const maxDuration = 60;

const ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORACLE_ADDRESS ?? "0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b") as `0x${string}`;

const ORACLE_ABI = [
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

// Asset placeholder addresses → CoinGecko IDs
const ASSETS: { addr: `0x${string}`; coingeckoId: string | null }[] = [
  { addr: "0x0000000000000000000000000000000000000001", coingeckoId: "ethereum" },       // mETH
  { addr: "0x0000000000000000000000000000000000000002", coingeckoId: null },             // USDY stable
  { addr: "0x0000000000000000000000000000000000000003", coingeckoId: "mantle" },         // MNT
  { addr: "0x0000000000000000000000000000000000000004", coingeckoId: "bitcoin" },        // fBTC
  { addr: "0x0000000000000000000000000000000000000005", coingeckoId: "solana" },         // SOL
  { addr: "0x0000000000000000000000000000000000000006", coingeckoId: null },             // USDT stable
  { addr: "0x0000000000000000000000000000000000000007", coingeckoId: "binancecoin" },    // BNB
  { addr: "0x0000000000000000000000000000000000000008", coingeckoId: "aave" },           // AAVE
  { addr: "0x0000000000000000000000000000000000000009", coingeckoId: null },             // AUSD stable
];

async function fetchPrices(): Promise<Map<string, number>> {
  const ids = [...new Set(ASSETS.map((a) => a.coingeckoId).filter(Boolean))].join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // no Next cache — we want fresh prices each cron tick
  });
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data = await res.json() as Record<string, { usd: number }>;
  const map = new Map<string, number>();
  for (const [id, val] of Object.entries(data)) {
    map.set(id, val.usd);
  }
  return map;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relayer = relayerWallet();
  if (!relayer) return NextResponse.json({ error: "No RELAYER_PRIVATE_KEY configured" }, { status: 503 });

  let priceMap: Map<string, number>;
  try {
    priceMap = await fetchPrices();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  const addrs: `0x${string}`[] = [];
  const prices: bigint[] = [];

  for (const asset of ASSETS) {
    let usd: number;
    if (asset.coingeckoId === null) {
      usd = 1.0; // stablecoin
    } else {
      usd = priceMap.get(asset.coingeckoId) ?? 0;
      if (usd === 0) continue; // skip if CoinGecko didn't return this id
    }
    addrs.push(asset.addr);
    // 1e18-scaled integer
    prices.push(BigInt(Math.round(usd * 1e18)));
  }

  const pub = publicClient();
  const hash = await relayer.wallet.writeContract({
    address: ORACLE_ADDRESS,
    abi: ORACLE_ABI,
    functionName: "setPriceBatch",
    args: [addrs, prices],
    account: relayer.account,
    chain: mantleSepolia,
  });
  await pub.waitForTransactionReceipt({ hash });

  const summary = ASSETS.map((a, i) => {
    const idx = addrs.indexOf(a.addr);
    return idx >= 0 ? `${a.coingeckoId ?? "stable"}=$${Number(prices[idx]) / 1e18}` : null;
  }).filter(Boolean);

  return NextResponse.json({ ok: true, tx: hash, prices: summary });
}
