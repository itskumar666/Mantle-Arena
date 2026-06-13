/**
 * Off-chain sandbox types.
 *
 * The sandbox runs the SAME conceptual model as the on-chain ExecutionEngine —
 * a virtual portfolio of cash + holdings, marked to market against a price feed,
 * with PnL = finalValue - startingBalance. The only difference is it runs in the
 * browser against a simulated price series for instant results (no gas, no wallet).
 *
 * Values here are plain USD floats (not 1e18-scaled bigints) because nothing here
 * touches the chain; the math is identical, the representation is lighter.
 */

export type AssetSymbol =
  | "mETH" | "fBTC" | "MNT" | "SOL" | "BNB" | "AAVE" | "USDY" | "USDT" | "AUSD";

export interface AssetDef {
  symbol: AssetSymbol;
  name: string;
  /** Asset address used on-chain — the canonical identifier (placeholder 0x..01-09). */
  addr: `0x${string}`;
  /** Starting price in USD. */
  price: number;
  /** Per-tick volatility (matches the on-chain price simulator). */
  vol: number;
  /** Drift; kept at 0 for fairness, mirroring priceSimulator.ts. */
  mu: number;
}

/** A single price observation across all assets at one tick. */
export type PriceTick = Record<AssetSymbol, number>;

/** Decision a strategy emits each tick. */
export interface Decision {
  action: "BUY" | "SELL" | "HOLD";
  /** Percent of available cash (BUY) or held position (SELL) to act on, 0-100. */
  sizePct: number;
  /** Optional human-readable rationale (the LLM agent fills this in). */
  reason?: string;
}

/** Everything a strategy can see when deciding. */
export interface StrategyContext {
  /** Current price of the strategy's target asset. */
  price: number;
  /** Recent prices of the target asset, oldest → newest (includes current). */
  history: number[];
  /** Exponential moving average over `periods` of the target asset. */
  ema: (periods: number) => number;
  /** Virtual cash available (USD). */
  cash: number;
  /** Mark-to-market value of holdings in the target asset (USD). */
  holdingsValue: number;
  /** cash + holdingsValue (USD). */
  totalValue: number;
  /** True if the strategy currently holds any of the target asset. */
  inPosition: boolean;
  /** Tick index since the challenge started (0-based). */
  tick: number;
}

/**
 * A strategy is a pure function: market + portfolio state → decision.
 * Reference agents and LLM-compiled bots both conform to this shape.
 */
export type StrategyFn = (ctx: StrategyContext) => Decision | Promise<Decision>;

/** A single executed trade in a sandbox run. */
export interface TradeRecord {
  tick: number;
  action: "BUY" | "SELL";
  /** Price the trade executed at. */
  price: number;
  /** USD notional moved (cash spent on BUY, cash received on SELL). */
  notional: number;
  reason?: string;
}

/** A point on the equity curve — portfolio value over time. */
export interface EquityPoint {
  tick: number;
  price: number;
  value: number;
}

/** Result of simulating one strategy over a price series. */
export interface SimResult {
  /** Display name of the bot. */
  name: string;
  startingBalance: number;
  finalValue: number;
  pnl: number;
  pnlPct: number;
  trades: TradeRecord[];
  equity: EquityPoint[];
  /** Rough Sharpe-style risk-adjusted score (mean tick return / stdev). */
  sharpe: number;
  /** Largest peak-to-trough drawdown over the run, as a positive percent. */
  maxDrawdownPct: number;
}
