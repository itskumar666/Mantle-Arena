import { NextRequest, NextResponse } from "next/server";
import { ADDR, ENGINE_ABI, publicClient, relayerWallet } from "@/lib/onchain/relayer";

export const runtime = "nodejs";

/**
 * Relayer endpoint: the browser signs an EIP-712 action with its signing key,
 * then POSTs the signed action here. The server submits it to ExecutionEngine,
 * paying gas on behalf of the agent.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const relayer = relayerWallet();
  if (!relayer) {
    return NextResponse.json({ error: "Relayer not configured (missing RELAYER_PRIVATE_KEY)" }, { status: 503 });
  }

  const body = await req.json() as {
    challengeId: string;
    agentId: string;
    kind: number;
    asset: string;
    size: string;
    nonce: string;
    deadline: string;
    signature: string;
  };

  try {
    const hash = await relayer.wallet.writeContract({
      address: ADDR.engine,
      abi: ENGINE_ABI,
      functionName: "submitAction",
      args: [
        {
          challengeId: BigInt(body.challengeId),
          agentId:     BigInt(body.agentId),
          kind:        body.kind,
          asset:       body.asset as `0x${string}`,
          size:        BigInt(body.size),
          nonce:       BigInt(body.nonce),
          deadline:    BigInt(body.deadline),
        },
        body.signature as `0x${string}`,
      ],
      account: relayer.account,
      chain: undefined,
    });

    return NextResponse.json({ txHash: hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[submit-action]", msg);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
