/**
 * Browser port of the on-chain price simulator (packages/agents/src/priceSimulator.ts).
 *
 * Same model: Geometric Brownian Motion with calm↔volatile regime switching and
 * a shared market factor so risk assets move together. Stablecoins stay pinned.
 *
 * Differences from the agent version:
 *   - No thirdweb / no oracle writes — this generates an in-memory price series.
 *   - Pluggable RNG so a seed produces a reproducible series (great for fair
 *     head-to-head bot comparisons and for scripted demo drama).
 */
import type { AssetDef, AssetSymbol, PriceTick } from "./types";

export const ASSETS: Record<AssetSymbol, AssetDef> = {
  mETH: { symbol: "mETH", name: "Mantle ETH",   addr: "0x0000000000000000000000000000000000000001", price: 3_800,   vol: 0.035, mu: 0 },
  fBTC: { symbol: "fBTC", name: "Fungible BTC",  addr: "0x0000000000000000000000000000000000000004", price: 105_000, vol: 0.025, mu: 0 },
  MNT:  { symbol: "MNT",  name: "Mantle",        addr: "0x0000000000000000000000000000000000000003", price: 1.20,    vol: 0.040, mu: 0 },
  SOL:  { symbol: "SOL",  name: "Solana",        addr: "0x0000000000000000000000000000000000000005", price: 175,     vol: 0.055, mu: 0 },
  BNB:  { symbol: "BNB",  name: "BNB",           addr: "0x0000000000000000000000000000000000000007", price: 600,     vol: 0.030, mu: 0 },
  AAVE: { symbol: "AAVE", name: "Aave",          addr: "0x0000000000000000000000000000000000000008", price: 210,     vol: 0.050, mu: 0 },
  USDY: { symbol: "USDY", name: "USD Yield",     addr: "0x0000000000000000000000000000000000000002", price: 1.00,    vol: 0.001, mu: 0 },
  USDT: { symbol: "USDT", name: "Tether",        addr: "0x0000000000000000000000000000000000000006", price: 1.00,    vol: 0.001, mu: 0 },
  AUSD: { symbol: "AUSD", name: "Agora USD",     addr: "0x0000000000000000000000000000000000000009", price: 1.00,    vol: 0.001, mu: 0 },
};

const STABLES: AssetSymbol[] = ["USDY", "USDT", "AUSD"];

/** Mulberry32 — tiny, fast, seedable PRNG. Deterministic given a seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RegimeConfig {
  calmMin: number; calmMax: number;
  volaMin: number; volaMax: number;
  volaMult: number;
}

const DEFAULT_REGIME: RegimeConfig = {
  calmMin: 8, calmMax: 15,
  volaMin: 3, volaMax: 8,
  volaMult: 2.2,
};

export interface SimulatorOptions {
  /** Seed for reproducible series. Omit for a random run. */
  seed?: number;
  /** Override regime parameters (e.g. more volatility for spicier demos). */
  regime?: Partial<RegimeConfig>;
}

/**
 * Stateful price simulator. Call `next()` to advance one tick and get the new
 * prices, or `series(n)` to generate a full run at once.
 */
export class PriceSimulator {
  private prices: PriceTick;
  private rand: () => number;
  private regime: "calm" | "volatile" = "calm";
  private regimeRemaining: number;
  private cfg: RegimeConfig;
  private tick = 0;

  constructor(opts: SimulatorOptions = {}) {
    // Seedable RNG; if no seed, derive a varied but call-stable one from asset count.
    this.rand = mulberry32(opts.seed ?? 0x9e3779b1);
    this.cfg = { ...DEFAULT_REGIME, ...opts.regime };
    this.prices = Object.fromEntries(
      (Object.keys(ASSETS) as AssetSymbol[]).map((k) => [k, ASSETS[k].price]),
    ) as PriceTick;
    this.regimeRemaining = this.randInt(this.cfg.calmMin, this.cfg.calmMax);
  }

  private randInt(lo: number, hi: number): number {
    return Math.floor(lo + this.rand() * (hi - lo + 1));
  }

  /** Box-Muller standard normal using the seeded RNG. */
  private randn(): number {
    const u1 = this.rand() || 1e-9;
    const u2 = this.rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private updateRegime(): void {
    this.regimeRemaining--;
    if (this.regimeRemaining <= 0) {
      if (this.regime === "calm") {
        this.regime = "volatile";
        this.regimeRemaining = this.randInt(this.cfg.volaMin, this.cfg.volaMax);
      } else {
        this.regime = "calm";
        this.regimeRemaining = this.randInt(this.cfg.calmMin, this.cfg.calmMax);
      }
    }
  }

  private gbmStep(key: AssetSymbol, zMkt: number): number {
    const asset = ASSETS[key];
    const current = this.prices[key];

    if (STABLES.includes(key)) {
      const noise = this.randn() * 0.001;
      return Math.max(0.99, Math.min(1.01, current + noise));
    }

    const regimeMult = this.regime === "volatile" ? this.cfg.volaMult : 1.0;
    const vol = asset.vol * regimeMult;

    // 60% shared market factor, 40% idiosyncratic — assets move together but not lockstep.
    const corr = 0.6;
    const zAsset = corr * zMkt + Math.sqrt(1 - corr * corr) * this.randn();

    const logReturn = asset.mu - 0.5 * vol * vol + vol * zAsset;
    const next = current * Math.exp(logReturn);

    // Clamp to 0.2×–5× starting price, same as the on-chain simulator.
    return Math.max(asset.price * 0.2, Math.min(asset.price * 5, next));
  }

  /** Advance one tick and return the new full price snapshot. */
  next(): PriceTick {
    this.updateRegime();
    const zMkt = this.randn();
    for (const key of Object.keys(ASSETS) as AssetSymbol[]) {
      this.prices[key] = this.gbmStep(key, zMkt);
    }
    this.tick++;
    return { ...this.prices };
  }

  get currentRegime(): "calm" | "volatile" {
    return this.regime;
  }

  /** Generate a full series of `n` ticks (each a full price snapshot). */
  series(n: number): PriceTick[] {
    const out: PriceTick[] = [];
    for (let i = 0; i < n; i++) out.push(this.next());
    return out;
  }
}

/** Convenience: extract one asset's price path from a multi-asset series. */
export function pricePath(series: PriceTick[], asset: AssetSymbol): number[] {
  return series.map((t) => t[asset]);
}
