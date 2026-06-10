/**
 * AI-Powered Trading Agent — uses OpenRouter (or any OpenAI-compatible API) to reason
 * about market conditions and decide Buy / Sell / Hold with position sizing.
 *
 * OpenRouter: https://openrouter.ai — set OPENROUTER_API_KEY + AI_BASE_URL + AI_MODEL in .env.claude
 * Groq fallback: still works if you set GROQ_API_KEY instead.
 */
import { getPrice, PriceHistory } from "../utils/oracle.js";
import { submitTrade, usdAmount, fractionOfHoldings } from "../utils/submit.js";
import { getPortfolio } from "../utils/signer.js";
import { Buy, Sell } from "../utils/signer.js";
import { ASSETS, agentConfig } from "../config.js";

const AI_API_KEY    = process.env.OPENROUTER_API_KEY ?? process.env.GROQ_API_KEY ?? "";
const AI_BASE_URL   = process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1";
const AI_MODEL      = process.env.AI_MODEL    ?? "meta-llama/llama-3.3-70b-instruct:free";

const POLL_INTERVAL_MS = 30_000;
const HISTORY_WINDOW   = 10;
const MAX_BUY_NOTIONAL = usdAmount(1000);
const TARGET_ASSET     = ASSETS.mETH;

interface AIDecision {
  action:    "BUY" | "SELL" | "HOLD";
  size_pct:  number;
  reasoning: string;
}

async function askAI(
  priceHistory: bigint[],
  currentPrice: bigint,
  cashBalance:  bigint,
  portfolioValue: bigint,
): Promise<AIDecision> {
  const priceHistoryUsd = priceHistory.map(p => Number(p) / 1e18);
  const currentPriceUsd = Number(currentPrice) / 1e18;
  const cashUsd         = Number(cashBalance)  / 1e18;
  const valueUsd        = Number(portfolioValue) / 1e18;
  const holdingsValue   = valueUsd - cashUsd;
  const holdingsPct     = valueUsd > 0 ? ((holdingsValue / valueUsd) * 100).toFixed(1) : "0.0";

  const prompt = `You are a trading agent in a paper-trading competition on the Mantle blockchain.
Your goal: maximise portfolio value against other AI agents.

Current market state for mETH/USD:
- Current price: $${currentPriceUsd.toFixed(2)}
- Recent prices (oldest → newest): ${priceHistoryUsd.map(p => `$${p.toFixed(2)}`).join(", ")}

Your portfolio:
- Cash: $${cashUsd.toFixed(2)}
- Holdings value: $${holdingsValue.toFixed(2)} (${holdingsPct}% of portfolio)
- Total value: $${valueUsd.toFixed(2)}

Respond with ONLY valid JSON:
{"action":"BUY"|"SELL"|"HOLD","size_pct":<0-100>,"reasoning":"<one sentence>"}`;

  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${AI_API_KEY}`,
      "HTTP-Referer":  "https://agent-arena.vercel.app",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 128,
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`AI API error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices[0]?.message?.content ?? "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in AI response: ${text}`);
  const decision = JSON.parse(match[0]) as AIDecision;
  console.log(`[AI] ${decision.action} ${decision.size_pct}% — ${decision.reasoning}`);
  return decision;
}

async function run(): Promise<void> {
  if (!AI_API_KEY) {
    console.error("[AI] No API key set. Add OPENROUTER_API_KEY=sk-or-... to .env.claude");
    console.error("[AI] Get a free key at https://openrouter.ai/keys");
    process.exit(1);
  }
  console.log(`[AI] Starting — agentId=${agentConfig.agentId} challengeId=${agentConfig.challengeId} model=${AI_MODEL}`);

  const history = new PriceHistory(HISTORY_WINDOW);

  while (true) {
    try {
      const price = await getPrice(TARGET_ASSET);
      history.push(price);

      if (history.length < 3) {
        console.log(`[AI] Gathering price history (${history.length}/3)...`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const { cash, value } = await getPortfolio();
      const samples = (history as unknown as { samples: bigint[] }).samples;

      const decision = await askAI(samples, price, cash, value);

      if (decision.action === "BUY" && decision.size_pct > 0) {
        const rawSize = (cash * BigInt(Math.floor(decision.size_pct))) / 100n;
        const size = rawSize < MAX_BUY_NOTIONAL ? rawSize : MAX_BUY_NOTIONAL;
        if (size > 0n) await submitTrade({ kind: Buy, asset: TARGET_ASSET, size });
      } else if (decision.action === "SELL" && decision.size_pct > 0) {
        const holdingsValue = value > cash ? value - cash : 0n;
        const size = fractionOfHoldings(holdingsValue, decision.size_pct / 100);
        if (size > 0n) await submitTrade({ kind: Sell, asset: TARGET_ASSET, size });
      }
    } catch (err) {
      console.error("[AI] Error:", err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

run().catch(console.error);
