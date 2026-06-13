import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM = `You compile a trader's plain-English description into a small JSON rule spec for a paper-trading bot competing on the Agent Arena (Mantle) sandbox.

The bot trades ONE asset (mETH by default). Each tick it evaluates rules top-to-bottom; the first rule whose conditions ALL hold fires. Express the user's intent as concrete, checkable conditions.

Indicators you may use:
- {"kind":"price"} — current price.
- {"kind":"ema","periods":N} — N-period exponential moving average (use 20 if unspecified).
- {"kind":"change","lookback":N} — percent change vs N ticks ago (e.g. 5 → recent move).
- {"kind":"deviationPct","periods":N} — percent the price sits above (+) or below (−) its N-period EMA.

Comparators: "gt","lt","gte","lte". The "right" side is either a number or another indicator.

Guidance:
- "buy the dip" → BUY when deviationPct lt a negative number (e.g. -2).
- "ride momentum / buy strength / breakout" → BUY when deviationPct gt a small positive number (e.g. +1), or change gt 0.
- "take profit / sell the rally" → SELL when deviationPct gt a positive number.
- "cut losses / stop loss" → SELL when change lt a negative number.
- Always include at least one BUY rule and one SELL rule so the bot both enters and exits.
- sizePct is 0-100 (percent of cash to deploy on BUY, percent of position to sell on SELL). Default BUY 50, SELL 100.
- Keep it to 2-4 rules. summary is one short sentence. name is a short punchy bot name (<= 4 words).

Return ONLY a raw JSON object. No markdown fences, no explanation, just the JSON.

Example output shape:
{"name":"Dip Buyer","summary":"Buy dips below EMA, sell rallies above.","rules":[{"when":[{"left":{"kind":"deviationPct","periods":20},"op":"lt","right":-3}],"action":"BUY","sizePct":50},{"when":[{"left":{"kind":"deviationPct","periods":20},"op":"gt","right":2}],"action":"SELL","sizePct":100}]}`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let description: string;
  try {
    const body = await req.json();
    description = typeof body?.description === "string" ? body.description : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!description.trim()) {
    return NextResponse.json({ error: "Describe your strategy first." }, { status: 400 });
  }
  if (description.length > 600) {
    description = description.slice(0, 600);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Strategy compiler not configured (missing GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Compile this trading strategy:\n\n"${description}"` },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[compile-strategy] Groq error:", res.status, text.slice(0, 200));
      return NextResponse.json(
        { error: `Compiler error (${res.status}). Try rephrasing your strategy.` },
        { status: 502 },
      );
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const raw: string = data?.choices?.[0]?.message?.content ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Compiler returned no output." }, { status: 502 });
    }
    const spec = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ spec });
  } catch (err) {
    console.error("[compile-strategy] unexpected error:", err);
    return NextResponse.json({ error: "Failed to compile strategy." }, { status: 500 });
  }
}
