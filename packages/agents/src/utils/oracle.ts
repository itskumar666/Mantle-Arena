/**
 * Price feed utilities. Reads from the deployed IPriceOracle
 * (Api3PriceOracle on-chain in production) via Thirdweb readContract.
 * All prices returned as 1e18-scaled bigint (quote units per 1 base).
 */
import { readContract } from "thirdweb";
import { getContracts } from "../config.js";

export async function getPrice(asset: `0x${string}`): Promise<bigint> {
  const { priceOracle } = getContracts();
  const price = await readContract({
    contract: priceOracle,
    method: "getPrice",
    params: [asset],
  });
  return BigInt(price);
}

export async function getPrices(assets: `0x${string}`[]): Promise<Map<`0x${string}`, bigint>> {
  const prices = await Promise.all(assets.map((a) => getPrice(a)));
  return new Map(assets.map((a, i) => [a, prices[i]]));
}

// Maintains a sliding window of price samples for EMA / price history.
export class PriceHistory {
  private samples: bigint[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 20) {
    this.maxSamples = maxSamples;
  }

  push(price: bigint): void {
    this.samples.push(price);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  get latest(): bigint {
    if (this.samples.length === 0) throw new Error("No price samples yet");
    return this.samples[this.samples.length - 1];
  }

  // Exponential moving average using 2/(N+1) smoothing factor (integer math).
  ema(periods: number): bigint {
    if (this.samples.length === 0) throw new Error("No samples");
    const alpha_num = 2n;
    const alpha_den = BigInt(periods + 1);
    let ema = this.samples[0];
    for (let i = 1; i < this.samples.length; i++) {
      // ema = alpha * price + (1 - alpha) * ema  (scaled to avoid floats)
      ema = (alpha_num * this.samples[i] + (alpha_den - alpha_num) * ema) / alpha_den;
    }
    return ema;
  }

  get length(): number {
    return this.samples.length;
  }
}
