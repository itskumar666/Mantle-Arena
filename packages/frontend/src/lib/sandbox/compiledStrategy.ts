/**
 * Compiled-strategy interpreter.
 *
 * The plain-English bot builder works in two stages:
 *   1. Claude compiles the user's sentence into a StrategySpec (a small, safe
 *      rule DSL) — done once, server-side, in /api/compile-strategy.
 *   2. This interpreter turns a StrategySpec into a StrategyFn that runs
 *      deterministically every tick in the browser sandbox.
 *
 * Compiling once (not calling the LLM per tick) makes runs instant, cheap, and
 * reproducible — and keeps untrusted model output away from `eval`: the spec is
 * pure data, validated before it ever runs.
 */
import type { Decision, StrategyContext, StrategyFn } from "./types";

/** Indicators a rule can reference. */
export type Indicator =
  | { kind: "price" }
  | { kind: "ema"; periods: number }
  /** Percent change of price vs N ticks ago. */
  | { kind: "change"; lookback: number }
  /** Percent deviation of price from its EMA, in percent. */
  | { kind: "deviationPct"; periods: number };

export type Comparator = "gt" | "lt" | "gte" | "lte";

/** A single condition: indicator (compared to either a constant or another indicator). */
export interface Condition {
  left: Indicator;
  op: Comparator;
  /** Right-hand side: a number, or another indicator to compare against. */
  right: number | Indicator;
}

/** A rule: when ALL conditions hold, emit this action. First matching rule wins. */
export interface Rule {
  when: Condition[];
  action: "BUY" | "SELL" | "HOLD";
  /** Percent of cash (BUY) or position (SELL) to act on, 0-100. */
  sizePct: number;
}

export interface StrategySpec {
  /** Short label the model gives the strategy. */
  name: string;
  /** One-line description of what it does. */
  summary: string;
  rules: Rule[];
}

function evalIndicator(ind: Indicator, ctx: StrategyContext): number {
  switch (ind.kind) {
    case "price":
      return ctx.price;
    case "ema":
      return ctx.ema(clampPeriods(ind.periods));
    case "change": {
      const lb = Math.max(1, Math.floor(ind.lookback));
      const past = ctx.history[ctx.history.length - 1 - lb];
      if (past === undefined || past === 0) return 0;
      return ((ctx.price - past) / past) * 100;
    }
    case "deviationPct": {
      const e = ctx.ema(clampPeriods(ind.periods));
      if (e === 0) return 0;
      return ((ctx.price - e) / e) * 100;
    }
  }
}

function clampPeriods(p: number): number {
  if (!Number.isFinite(p)) return 20;
  return Math.max(2, Math.min(200, Math.floor(p)));
}

function compare(a: number, op: Comparator, b: number): boolean {
  switch (op) {
    case "gt": return a > b;
    case "lt": return a < b;
    case "gte": return a >= b;
    case "lte": return a <= b;
  }
}

function evalCondition(c: Condition, ctx: StrategyContext): boolean {
  const left = evalIndicator(c.left, ctx);
  const right = typeof c.right === "number" ? c.right : evalIndicator(c.right, ctx);
  return compare(left, c.op, right);
}

/** Turn a validated StrategySpec into a runnable strategy. */
export function compileSpec(spec: StrategySpec): StrategyFn {
  return (ctx: StrategyContext): Decision => {
    for (const rule of spec.rules) {
      const allHold = rule.when.every((c) => evalCondition(c, ctx));
      if (!allHold) continue;

      // Don't BUY with no cash or SELL with no position — skip to next rule.
      if (rule.action === "BUY" && ctx.cash <= 0) continue;
      if (rule.action === "SELL" && !ctx.inPosition) continue;

      return {
        action: rule.action,
        sizePct: Math.max(0, Math.min(100, rule.sizePct)),
        reason: spec.summary,
      };
    }
    return { action: "HOLD", sizePct: 0 };
  };
}

/**
 * Validate untrusted JSON (from the LLM) into a StrategySpec.
 * Throws on anything malformed so the caller can fall back gracefully.
 */
export function parseStrategySpec(raw: unknown): StrategySpec {
  if (typeof raw !== "object" || raw === null) throw new Error("spec must be an object");
  const o = raw as Record<string, unknown>;

  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : "Custom Bot";
  const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 140) : "";
  if (!Array.isArray(o.rules) || o.rules.length === 0) throw new Error("spec.rules must be a non-empty array");

  const rules = o.rules.slice(0, 8).map(parseRule);
  return { name, summary, rules };
}

function parseRule(raw: unknown): Rule {
  const o = raw as Record<string, unknown>;
  const action = o.action;
  if (action !== "BUY" && action !== "SELL" && action !== "HOLD") {
    throw new Error(`invalid action: ${String(action)}`);
  }
  const sizePct = typeof o.sizePct === "number" ? o.sizePct : 50;
  if (!Array.isArray(o.when)) throw new Error("rule.when must be an array");
  const when = o.when.slice(0, 4).map(parseCondition);
  return { when, action, sizePct };
}

function parseCondition(raw: unknown): Condition {
  const o = raw as Record<string, unknown>;
  const left = parseIndicator(o.left);
  const op = o.op;
  if (op !== "gt" && op !== "lt" && op !== "gte" && op !== "lte") {
    throw new Error(`invalid comparator: ${String(op)}`);
  }
  const right = typeof o.right === "number" ? o.right : parseIndicator(o.right);
  return { left, op, right };
}

function parseIndicator(raw: unknown): Indicator {
  const o = raw as Record<string, unknown>;
  switch (o?.kind) {
    case "price":
      return { kind: "price" };
    case "ema":
      return { kind: "ema", periods: clampPeriods(Number(o.periods)) };
    case "change":
      return { kind: "change", lookback: Math.max(1, Math.min(100, Math.floor(Number(o.lookback) || 1))) };
    case "deviationPct":
      return { kind: "deviationPct", periods: clampPeriods(Number(o.periods)) };
    default:
      throw new Error(`invalid indicator kind: ${String(o?.kind)}`);
  }
}
