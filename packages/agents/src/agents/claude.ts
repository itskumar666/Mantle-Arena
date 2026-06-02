/**
 * Claude-Powered Agent — uses Anthropic claude-sonnet-4-6 to reason about
 * market conditions and decide Buy / Sell / Hold with position sizing.
 *
 * At each tick the agent:
 *   1. Reads current prices (API3 oracle on Mantle via Thirdweb)
 *   2. Reads portfolio state (cash, holdings, total value)
 *   3. Builds a structured prompt with the last N price samples
 *   4. Calls Claude and parses a structured JSON decision
 *   5. If not Hold, signs + submits the action via Thirdweb on Mantle
 *
 * Uses Thirdweb SDK for Mantle interactions, Anthropic SDK for reasoning.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { getPrice, PriceHistory } from "../utils/oracle.js";
import { submitTrade, usdAmount, fractionOfHoldings } from "../utils/submit.js";
import { getPortfolio } from "../utils/signer.js";
import { Buy, Sell } from "../utils/signer.js";
import { ASSETS, agentConfig } from "../config.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const POLL_INTERVAL_MS = 30_000; // Claude calls cost tokens; slower cadence
const HISTORY_WINDOW = 10;
const MAX_BUY_NOTIONAL = usdAmount(1000);

const TARGET_ASSET = ASSETS.mETH;

interface ClaudeDecision {
  action: "BUY" | "SELL" | "HOLD";
  size_pct: number;  // % of available cash (BUY) or % of holdings (SELL)
  reasoning: string;
}

async function askClaude(
  priceHistory: bigint[],
  currentPrice: bigint,
  cashBalance: bigint,
  portfolioValue: bigint,
): Promise<ClaudeDecision> {
  const priceHistoryUsd = priceHistory.map((p) => Number(p) / 1e18);
  const currentPriceUsd = Number(currentPrice) / 1e18;
  const cashUsd = Number(cashBalance) / 1e18;
  const valueUsd = Number(portfolioValue) / 1e18;
  const holdingsValue = valueUsd - cashUsd;
  const holdingsPct = valueUsd > 0 ? ((holdingsValue / valueUsd) * 100).toFixed(1) : "0.0";

  const prompt = `You are a trading agent in a paper-trading competition on the Mantle blockchain.
Your goal: maximise portfolio value against other AI agents.

Current market state for mETH/USD:
- Current price: $${currentPriceUsd.toFixed(2)}
- Recent prices (oldest → newest): ${priceHistoryUsd.map((p) => `$${p.toFixed(2)}`).join(", ")}

Your portfolio:
- Cash balance: $${cashUsd.toFixed(2)}
- Holdings value: $${holdingsValue.toFixed(2)} (${holdingsPct}% of portfolio)
- Total portfolio value: $${valueUsd.toFixed(2)}

Decide your next action. Respond with ONLY valid JSON in this exact format:
{
  "action": "BUY" | "SELL" | "HOLD",
  "size_pct": <0-100, percentage of available cash to spend on BUY, or % of holdings to sell on SELL>,
  "reasoning": "<one sentence>"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (Claude might wrap it in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text}`);

  const decision = JSON.parse(jsonMatch[0]) as ClaudeDecision;
  console.log(`[Claude] ${decision.action} ${decision.size_pct}% — ${decision.reasoning}`);
  return decision;
}

async function run(): Promise<void> {
  console.log(`[Claude] Starting — agentId=${agentConfig.agentId} challengeId=${agentConfig.challengeId}`);

  const history = new PriceHistory(HISTORY_WINDOW);

  while (true) {
    try {
      const price = await getPrice(TARGET_ASSET);
      history.push(price);

      if (history.length < 3) {
        console.log(`[Claude] Gathering price history (${history.length}/3)...`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const { cash, value } = await getPortfolio();

      const decision = await askClaude(
        // expose internal samples via a getter — PriceHistory stores them privately,
        // so we cast to access the field for the prompt (acceptable for demo code)
        (history as unknown as { samples: bigint[] }).samples,
        price,
        cash,
        value,
      );

      if (decision.action === "BUY" && decision.size_pct > 0) {
        const rawSize = (cash * BigInt(Math.floor(decision.size_pct))) / 100n;
        const size = rawSize < MAX_BUY_NOTIONAL ? rawSize : MAX_BUY_NOTIONAL;
        if (size > 0n) {
          await submitTrade({ kind: Buy, asset: TARGET_ASSET, size });
        }
      } else if (decision.action === "SELL" && decision.size_pct > 0) {
        const holdingsValue = value > cash ? value - cash : 0n;
        const size = fractionOfHoldings(holdingsValue, decision.size_pct / 100);
        if (size > 0n) {
          await submitTrade({ kind: Sell, asset: TARGET_ASSET, size });
        }
      }
      // HOLD → do nothing
    } catch (err) {
      console.error("[Claude] Error:", err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

run().catch(console.error);
