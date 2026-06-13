import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface AIDecision {
  action: "BUY" | "SELL" | "HOLD";
  size_pct: number;
  reasoning: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { prices, cash, portfolioValue, symbol } = await req.json() as {
    prices: number[];
    cash: number;
    portfolioValue: number;
    symbol: string;
  };

  const holdingsValue = portfolioValue - cash;
  const holdingsPct = portfolioValue > 0 ? ((holdingsValue / portfolioValue) * 100).toFixed(1) : "0.0";
  const currentPrice = prices.at(-1) ?? 0;

  const prompt = `You are a trading agent in a paper-trading competition on the Mantle blockchain.
Goal: maximise portfolio value against other AI agents.

Asset: ${symbol}
Current price: $${currentPrice.toFixed(2)}
Recent prices (oldest→newest): ${prices.map(p => `$${p.toFixed(2)}`).join(", ")}

Portfolio:
- Cash: $${cash.toFixed(2)}
- Holdings value: $${holdingsValue.toFixed(2)} (${holdingsPct}% of portfolio)
- Total value: $${portfolioValue.toFixed(2)}

Respond ONLY with valid JSON — no explanation outside the JSON:
{"action":"BUY"|"SELL"|"HOLD","size_pct":<0-100>,"reasoning":"<one sentence>"}`;

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const groqKey   = process.env.GROQ_API_KEY;
  if (!nvidiaKey && !groqKey) {
    return NextResponse.json<AIDecision>({ action: "HOLD", size_pct: 0, reasoning: "No API key configured." });
  }

  try {
    // Use NVIDIA NIM (MiniMax M2.7 reasoning model) if available, else fall back to Groq
    // Z.AI GLM-5.1 (hackathon sponsor) via NVIDIA NIM — agentic reasoning model
    const apiKey  = nvidiaKey ?? groqKey!;
    const baseUrl = nvidiaKey ? "https://integrate.api.nvidia.com/v1" : "https://api.groq.com/openai/v1";
    const model   = nvidiaKey ? "z-ai/glm-5.1" : "llama-3.3-70b-versatile";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
        temperature: 0.3,
        stream: false,
      }),
    });
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const text = data.choices[0]?.message?.content ?? "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    const decision = JSON.parse(match[0]) as AIDecision;
    return NextResponse.json(decision);
  } catch (err) {
    console.error("[ai-decision]", err);
    return NextResponse.json<AIDecision>({ action: "HOLD", size_pct: 0, reasoning: "AI error — holding." });
  }
}
