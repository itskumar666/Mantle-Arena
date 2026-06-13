/**
 * Sandbox simulation engine.
 *
 * Mirrors the on-chain ExecutionEngine accounting exactly:
 *   - Each agent starts with `startingBalance` virtual cash, zero holdings.
 *   - BUY moves cash → holdings at the current price; SELL reverses it.
 *   - Portfolio value = cash + holdings * price (mark-to-market).
 *   - PnL = finalValue - startingBalance.
 *
 * The only thing that's different from the contract is where it runs (browser)
 * and what drives prices (the seeded PriceSimulator instead of an oracle).
 */
import type {
  Decision,
  EquityPoint,
  SimResult,
  StrategyContext,
  StrategyFn,
  TradeRecord,
} from "./types";

/** EMA over the last `periods` samples — same recurrence as utils/oracle.ts. */
export function ema(samples: number[], periods: number): number {
  if (samples.length === 0) return 0;
  const alpha = 2 / (periods + 1);
  let e = samples[0];
  for (let i = 1; i < samples.length; i++) {
    e = alpha * samples[i] + (1 - alpha) * e;
  }
  return e;
}

export interface RunOptions {
  name: string;
  startingBalance: number;
  /** Price path of the target asset, oldest → newest. */
  prices: number[];
  strategy: StrategyFn;
  /** Ticks to observe before the strategy is allowed to trade (EMA warmup). */
  warmup?: number;
  /** How many trailing prices the strategy can see each tick. */
  historyWindow?: number;
}

/**
 * Run one strategy over a price path and return its full result
 * (equity curve, trades, PnL, Sharpe, max drawdown).
 */
export async function runStrategy(opts: RunOptions): Promise<SimResult> {
  const { name, startingBalance, prices, strategy } = opts;
  const warmup = opts.warmup ?? 20;
  const historyWindow = opts.historyWindow ?? 20;

  let cash = startingBalance;
  let units = 0; // base units of the target asset held

  const trades: TradeRecord[] = [];
  const equity: EquityPoint[] = [];

  for (let tick = 0; tick < prices.length; tick++) {
    const price = prices[tick];
    const history = prices.slice(Math.max(0, tick - historyWindow + 1), tick + 1);
    const holdingsValue = units * price;
    const totalValue = cash + holdingsValue;

    equity.push({ tick, price, value: totalValue });

    if (tick < warmup) continue;

    const ctx: StrategyContext = {
      price,
      history,
      ema: (p) => ema(history, p),
      cash,
      holdingsValue,
      totalValue,
      inPosition: units > 1e-12,
      tick,
    };

    let decision: Decision;
    try {
      decision = await strategy(ctx);
    } catch {
      decision = { action: "HOLD", sizePct: 0 };
    }

    const pct = Math.max(0, Math.min(100, decision.sizePct)) / 100;

    if (decision.action === "BUY" && pct > 0 && cash > 0) {
      const spend = cash * pct;
      units += spend / price;
      cash -= spend;
      trades.push({ tick, action: "BUY", price, notional: spend, reason: decision.reason });
    } else if (decision.action === "SELL" && pct > 0 && units > 1e-12) {
      const sellUnits = units * pct;
      const proceeds = sellUnits * price;
      units -= sellUnits;
      cash += proceeds;
      trades.push({ tick, action: "SELL", price, notional: proceeds, reason: decision.reason });
    }
  }

  // Final mark-to-market at the last observed price.
  const lastPrice = prices[prices.length - 1] ?? 0;
  const finalValue = cash + units * lastPrice;
  const pnl = finalValue - startingBalance;

  return {
    name,
    startingBalance,
    finalValue,
    pnl,
    pnlPct: startingBalance > 0 ? (pnl / startingBalance) * 100 : 0,
    trades,
    equity,
    sharpe: sharpeOf(equity),
    maxDrawdownPct: maxDrawdownOf(equity),
  };
}

/** Mean tick-return / stdev of tick-returns. Rough but enough to rank consistency. */
function sharpeOf(equity: EquityPoint[]): number {
  if (equity.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].value;
    if (prev > 0) rets.push((equity[i].value - prev) / prev);
  }
  if (rets.length === 0) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Annualize-ish by sqrt(n) so the number reads like a real Sharpe.
  return (mean / std) * Math.sqrt(rets.length);
}

/** Largest peak-to-trough decline over the run, as a positive percent. */
function maxDrawdownOf(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of equity) {
    if (p.value > peak) peak = p.value;
    if (peak > 0) {
      const dd = (peak - p.value) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd * 100;
}
