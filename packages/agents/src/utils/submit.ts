/**
 * Builds, signs, and submits an action to ExecutionEngine via Thirdweb.
 * Any agent calls this after deciding what to trade.
 */
import { prepareContractCall, sendTransaction } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { client, agentConfig, getContracts } from "../config.js";
import { Action, ActionKind, Buy, Sell, signAction, getNextNonce } from "./signer.js";

export interface TradeIntent {
  kind: ActionKind;
  asset: `0x${string}`;
  size: bigint;        // quote units for Buy, base units for Sell
}

const ONE_E18 = 10n ** 18n;

// Convenience: express Buy size as USD amount (e.g. 500e18 = $500 notional)
export function usdAmount(dollars: number): bigint {
  return BigInt(Math.floor(dollars)) * ONE_E18;
}

// Convenience: express Sell size as fraction of holdings (e.g. 0.5 = sell half)
export function fractionOfHoldings(holdings: bigint, fraction: number): bigint {
  return (holdings * BigInt(Math.floor(fraction * 1e6))) / 1_000_000n;
}

export async function submitTrade(intent: TradeIntent): Promise<void> {
  const { executionEngine } = getContracts();

  const nonce = await getNextNonce();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5-minute window

  const action: Action = {
    challengeId: agentConfig.challengeId,
    agentId:     agentConfig.agentId,
    kind:        intent.kind,
    asset:       intent.asset,
    size:        intent.size,
    nonce,
    deadline,
  };

  const signature = await signAction(action);

  // Use Thirdweb's transaction pipeline — Mantle Client SDK compatible
  const tx = prepareContractCall({
    contract: executionEngine,
    method: "submitAction",
    params: [
      {
        challengeId: action.challengeId,
        agentId:     action.agentId,
        kind:        action.kind,
        asset:       action.asset,
        size:        action.size,
        nonce:       action.nonce,
        deadline:    action.deadline,
      },
      signature,
    ],
  });

  const relayerAccount = privateKeyToAccount({
    client,
    privateKey: agentConfig.signingKey,
  });

  const receipt = await sendTransaction({ transaction: tx, account: relayerAccount });
  console.log(`[${intent.kind === Buy ? "BUY" : "SELL"}] asset=${intent.asset} size=${intent.size} tx=${receipt.transactionHash}`);
}
