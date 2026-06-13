/**
 * Reference strategies — pure-function ports of the three on-chain agents
 * (packages/agents/src/agents/{momentum,meanReversion,claude}.ts).
 *
 * Each conforms to StrategyFn: (ctx) => Decision. They are deterministic and
 * stateless except for what they read from ctx (price/EMA/position), so they
 * can be reused both in the sandbox and as the "house" opponents a user's bot
 * competes against.
 *
 * The decision thresholds match the originals:
 *   - Momentum:      buy when price > 101% of EMA(20), sell when < 99%.
 *   - MeanReversion: buy when price < EMA-2%, sell when price > EMA+2%.
 */
import type { Decision, StrategyContext, StrategyFn } from "./types";

const EMA_PERIODS = 20;

/** Trend-follower: ride moves above the EMA, exit when they fade. */
export const momentumStrategy: StrategyFn = (ctx: StrategyContext): Decision => {
  const e = ctx.ema(EMA_PERIODS);
  if (e === 0) return hold();
  const leadBps = (ctx.price / e) * 10000;

  if (!ctx.inPosition && leadBps > 10100) {
    // > 101% of EMA → bullish, deploy ~50% of cash (mirrors $500-notional sizing).
    return { action: "BUY", sizePct: 50, reason: "Price broke above EMA — trend up" };
  }
  if (ctx.inPosition && leadBps < 9900) {
    // < 99% of EMA → momentum flipped, exit fully.
    return { action: "SELL", sizePct: 100, reason: "Price fell below EMA — trend down" };
  }
  return hold();
};

/** Fades extremes: buy the dip below EMA, sell the rip above it. */
export const meanReversionStrategy: StrategyFn = (ctx: StrategyContext): Decision => {
  const e = ctx.ema(EMA_PERIODS);
  if (e === 0) return hold();
  const deviationBps = ((ctx.price - e) / e) * 10000;

  if (!ctx.inPosition && deviationBps < -200) {
    return { action: "BUY", sizePct: 40, reason: "Dropped >2% below EMA — buy the dip" };
  }
  if (ctx.inPosition && deviationBps > 200) {
    return { action: "SELL", sizePct: 100, reason: "Pumped >2% above EMA — take profit" };
  }
  return hold();
};

function hold(): Decision {
  return { action: "HOLD", sizePct: 0 };
}

export interface ReferenceBot {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  strategy: StrategyFn;
}

/** The three "house" bots a user's creation competes against. */
export const REFERENCE_BOTS: ReferenceBot[] = [
  {
    id: "momentum",
    name: "Momentum",
    emoji: "🟢",
    blurb: "Rides the trend — buys strength above the EMA, sells when it breaks.",
    strategy: momentumStrategy,
  },
  {
    id: "meanReversion",
    name: "Mean Reversion",
    emoji: "🔵",
    blurb: "Fades extremes — buys the dip, sells the rip back to the mean.",
    strategy: meanReversionStrategy,
  },
];
