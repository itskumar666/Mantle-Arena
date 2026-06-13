/**
 * Archetype presets for the sandbox "quick build" path.
 *
 * These let a user spin up a bot WITHOUT the LLM compiler — pick an archetype,
 * nudge aggressiveness, run. Each preset builds a StrategySpec from a single
 * aggressiveness knob (0-100), then compiles to a runnable strategy via the
 * same interpreter the LLM output uses. One code path, two front doors.
 */
import { compileSpec, type StrategySpec } from "./compiledStrategy";
import type { StrategyFn } from "./types";

export interface Archetype {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** Build a spec from aggressiveness 0 (cautious) → 100 (reckless). */
  buildSpec: (aggression: number) => StrategySpec;
}

/** Map 0-100 aggression onto a [min,max] range. */
function lerp(aggression: number, min: number, max: number): number {
  return min + (max - min) * (Math.max(0, Math.min(100, aggression)) / 100);
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "momentum",
    name: "Momentum",
    emoji: "🚀",
    blurb: "Buys strength above the trend, exits when it fades.",
    buildSpec: (a) => {
      // More aggressive → smaller breakout threshold, bigger size.
      const trigger = lerp(a, 2.5, 0.4); // % above EMA to buy
      const size = Math.round(lerp(a, 35, 95));
      return {
        name: "Momentum Rider",
        summary: `Buys when price is ${trigger.toFixed(1)}% above its EMA, exits below it.`,
        rules: [
          { when: [{ left: { kind: "deviationPct", periods: 20 }, op: "gt", right: trigger }], action: "BUY", sizePct: size },
          { when: [{ left: { kind: "deviationPct", periods: 20 }, op: "lt", right: -0.5 }], action: "SELL", sizePct: 100 },
        ],
      };
    },
  },
  {
    id: "dipBuyer",
    name: "Dip Buyer",
    emoji: "🩸",
    blurb: "Buys fear below the mean, sells the bounce.",
    buildSpec: (a) => {
      const dip = lerp(a, -1.2, -4); // deeper dip required when more aggressive
      const size = Math.round(lerp(a, 40, 100));
      return {
        name: "Dip Sniper",
        summary: `Buys when price drops ${Math.abs(dip).toFixed(1)}% below EMA, sells on reversion above it.`,
        rules: [
          { when: [{ left: { kind: "deviationPct", periods: 20 }, op: "lt", right: dip }], action: "BUY", sizePct: size },
          { when: [{ left: { kind: "deviationPct", periods: 20 }, op: "gt", right: 1.5 }], action: "SELL", sizePct: 100 },
        ],
      };
    },
  },
  {
    id: "breakout",
    name: "Breakout",
    emoji: "⚡",
    blurb: "Chases fast moves, cuts losers quick.",
    buildSpec: (a) => {
      const move = lerp(a, 3, 0.8); // % move over last 5 ticks to trigger
      const stop = lerp(a, -2, -4);
      const size = Math.round(lerp(a, 45, 100));
      return {
        name: "Breakout Hunter",
        summary: `Buys a ${move.toFixed(1)}% pop over 5 ticks, stops out on a ${Math.abs(stop).toFixed(1)}% drop.`,
        rules: [
          { when: [{ left: { kind: "change", lookback: 5 }, op: "gt", right: move }], action: "BUY", sizePct: size },
          { when: [{ left: { kind: "change", lookback: 5 }, op: "lt", right: stop }], action: "SELL", sizePct: 100 },
        ],
      };
    },
  },
];

export function archetypeStrategy(id: string, aggression: number): { strategy: StrategyFn; spec: StrategySpec } {
  const arch = ARCHETYPES.find((x) => x.id === id) ?? ARCHETYPES[0];
  const spec = arch.buildSpec(aggression);
  return { strategy: compileSpec(spec), spec };
}
