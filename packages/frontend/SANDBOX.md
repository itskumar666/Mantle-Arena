# Agent Arena — Sandbox (Build-a-Bot)

The public, no-code, no-wallet on-ramp to the Agent Arena protocol. Lives at `/sandbox`.

## What it does

A visitor builds a trading bot two ways:

- **Plain English** → `POST /api/compile-strategy` → Claude (`claude-opus-4-8`, structured output) compiles the sentence into a `StrategySpec` (a small, safe rule DSL — never `eval`'d).
- **Archetype + slider** → a preset (`Momentum` / `Dip Buyer` / `Breakout`) builds the same `StrategySpec` from one aggressiveness knob.

The bot then runs a **match** against the reference agents (Momentum, Mean-Reversion) on one seeded price series, and a result card offers a pre-filled tweet and an optional on-chain promotion.

## Why it's honest

The sandbox is an **off-chain mirror** of the on-chain engine, not a different game:

| On-chain (`ExecutionEngine` / `Leaderboard`) | Sandbox (`lib/sandbox/engine.ts`) |
|---|---|
| virtual `cash` + `holdings` mappings | virtual cash + units |
| value = cash + Σ holdings × oracle price | value = cash + units × price |
| `pnl = finalValue − startingBalance` | identical |
| ranked descending by final value | identical |
| GBM + regime price simulator (`priceSimulator.ts`) | same model, seeded (`priceSim.ts`) |

Same math, same market model → the sandbox verdict matches what the contract would settle. The only difference is *where* it runs (browser, for instant results) and that prices come from a seeded simulator instead of a live oracle.

## File map

```
src/lib/sandbox/
  types.ts            shared types (StrategyFn, Decision, SimResult…)
  priceSim.ts         seedable GBM + regime simulator (browser port of priceSimulator.ts)
  engine.ts           virtual portfolio + PnL + Sharpe + drawdown (mirrors ExecutionEngine)
  strategies.ts       momentum + mean-reversion reference bots (the "house")
  compiledStrategy.ts safe rule DSL + interpreter (runs LLM/preset specs)
  archetypes.ts       no-LLM presets driven by an aggressiveness slider
  match.ts            runs user bot vs house bots on one shared seeded series

src/app/sandbox/page.tsx          the builder UI (both front doors) + results
src/components/ResultCard.tsx     shareable verdict + tweet + "Make it real"
src/components/LineChart.tsx      dependency-free SVG equity chart

src/app/api/compile-strategy/     Claude: English → StrategySpec (Node runtime)
src/app/api/promote-bot/          relayer: mint a real ERC-8004 NFT, gasless
src/lib/onchain/relayer.ts        viem clients + ABIs for the relayer
```

## On-chain promotion ("Make it real")

`POST /api/promote-bot` runs server-side with a relayer key (the owner/deployer):

1. generates a fresh ephemeral bot keypair,
2. calls `AgentRegistry.registerAgent(signingKey, strategyHash, "")` — registration is permissionless, so no contract change was needed,
3. returns the `agentId`, mint tx hash, and Mantle Explorer links.

The user pays no gas and connects no wallet. The bot's key is a throwaway controlling a paper-trading identity only — no funds, no risk. EIP-712 signing (for the optional live-trade path) uses **viem** directly, per the project gotcha that thirdweb's signer fails `ECDSA.recover`.

## Configuration

`packages/frontend/.env.local`:

| Var | Purpose | If unset |
|---|---|---|
| `ANTHROPIC_API_KEY` | powers the English→bot compiler | English mode returns a 503; archetype mode still works |
| `RELAYER_PRIVATE_KEY` | gasless on-chain bot promotion (owner key) | "Make it real" shows a graceful notice; sandbox still fully works |
| `NEXT_PUBLIC_SITE_URL` | link baked into the share tweet | falls back to the Vercel URL |

Every degradation is graceful: with no keys at all, the sandbox still simulates and ranks bots end-to-end.
