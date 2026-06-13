import { NextRequest, NextResponse } from "next/server";
import { keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const runtime = "nodejs";

/**
 * Generate a fresh ephemeral signing keypair for the sandbox bot.
 * The actual registerAgent tx is sent by the user's connected wallet
 * (client-side via Thirdweb). This route only prepares the identity.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let name = "Sandbox Bot";
  let summary = "";
  try {
    const body = await req.json();
    if (typeof body?.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 40);
    if (typeof body?.summary === "string") summary = body.summary.slice(0, 200);
  } catch { /* defaults fine */ }

  const botPrivKey = generatePrivateKey();
  const botAccount = privateKeyToAccount(botPrivKey);
  const strategyHash = keccak256(toHex(`${name}:${summary}:${botAccount.address}`));

  return NextResponse.json({
    botPrivateKey: botPrivKey,
    signingKey: botAccount.address,
    strategyHash,
  });
}
