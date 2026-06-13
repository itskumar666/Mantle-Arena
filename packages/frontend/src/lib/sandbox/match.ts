import { ASSETS, PriceSimulator, pricePath } from "./priceSim";
import { runStrategy } from "./engine";
import { REFERENCE_BOTS } from "./strategies";
import type { AssetSymbol, SimResult, StrategyFn } from "./types";

export interface MatchConfig {
  name: string;
  strategy: StrategyFn;
  asset?: AssetSymbol;
  startingBalance?: number;
  ticks?: number;
  seed?: number;
}

export interface MatchResult {
  asset: AssetSymbol;
  startingBalance: number;
  prices: number[];
  priceSource: "coingecko" | "simulated";
  ranked: RankedBot[];
  user: RankedBot;
}

export interface RankedBot extends SimResult {
  id: string;
  emoji: string;
  isUser: boolean;
  rank: number;
}

async function fetchRealPrices(asset: AssetSymbol, count: number): Promise<number[] | null> {
  try {
    const res = await fetch(`/api/prices?symbol=${asset}&count=${count}`);
    if (!res.ok) return null;
    const data = await res.json() as { prices: number[]; source: string };
    if (!Array.isArray(data.prices) || data.prices.length < 20) return null;
    return data.prices;
  } catch {
    return null;
  }
}

export async function runMatch(cfg: MatchConfig): Promise<MatchResult> {
  const asset = cfg.asset ?? "mETH";
  const startingBalance = cfg.startingBalance ?? 10_000;
  const ticks = cfg.ticks ?? 200;

  // Try real CoinGecko prices first; fall back to simulator if unavailable.
  let prices: number[];
  let priceSource: "coingecko" | "simulated";

  const real = await fetchRealPrices(asset, ticks);
  if (real && real.length >= 20) {
    prices = real;
    priceSource = "coingecko";
  } else {
    const seed = cfg.seed ?? Math.floor(Math.random() * 0x7fffffff);
    const sim = new PriceSimulator({ seed });
    prices = pricePath(sim.series(ticks), asset);
    priceSource = "simulated";
  }

  const contenders: Array<{ id: string; emoji: string; isUser: boolean; strategy: StrategyFn; name: string }> = [
    { id: "user", emoji: "🟣", isUser: true, strategy: cfg.strategy, name: cfg.name },
    ...REFERENCE_BOTS.map((b) => ({
      id: b.id,
      emoji: b.emoji,
      isUser: false,
      strategy: b.strategy,
      name: b.name,
    })),
  ];

  const results = await Promise.all(
    contenders.map(async (c) => {
      const r = await runStrategy({ name: c.name, startingBalance, prices, strategy: c.strategy });
      return { ...r, id: c.id, emoji: c.emoji, isUser: c.isUser };
    }),
  );

  results.sort((a, b) => b.finalValue - a.finalValue);
  const ranked: RankedBot[] = results.map((r, i) => ({ ...r, rank: i + 1 }));
  const user = ranked.find((r) => r.isUser)!;

  return { asset, startingBalance, prices, priceSource, ranked, user };
}
