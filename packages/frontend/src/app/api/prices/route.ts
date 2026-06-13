import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// Revalidate every 5 minutes — CoinGecko free tier allows ~30 req/min
export const revalidate = 300;

// CoinGecko IDs for our 9 arena assets
const COINGECKO_IDS: Record<string, string> = {
  mETH: "ethereum",
  fBTC: "bitcoin",
  MNT:  "mantle",
  SOL:  "solana",
  BNB:  "binancecoin",
  AAVE: "aave",
};

const STABLE_SYMBOLS = ["USDY", "USDT", "AUSD"];

// Fetch the last `count` hourly closes for one coin from CoinGecko
async function fetchHourly(id: string, count: number): Promise<number[]> {
  // /market_chart?vs_currency=usd&days=N gives ~hourly data for days<=90
  const days = Math.ceil(count / 24) + 1;
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=hourly`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`CoinGecko ${id}: ${res.status}`);
  const data = await res.json() as { prices: [number, number][] };
  // data.prices is [[timestamp_ms, price], ...]
  const prices = data.prices.map(([, p]) => p);
  // Return the last `count` points
  return prices.slice(-count);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "mETH";
  const count = Math.min(500, Math.max(50, Number(searchParams.get("count") ?? 200)));

  // Stables always return flat $1 series
  if (STABLE_SYMBOLS.includes(symbol)) {
    return NextResponse.json({ symbol, prices: Array(count).fill(1.0), source: "stable" });
  }

  const id = COINGECKO_IDS[symbol];
  if (!id) {
    return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 });
  }

  try {
    const prices = await fetchHourly(id, count);
    if (prices.length < 20) {
      return NextResponse.json({ error: "Insufficient price history" }, { status: 502 });
    }
    return NextResponse.json({ symbol, prices, source: "coingecko" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[prices]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
