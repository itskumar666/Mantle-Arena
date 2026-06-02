/**
 * EIP-712 action signer for the Agent-Marena ExecutionEngine.
 * Uses Thirdweb's privateKeyToAccount + signTypedData so all
 * signing goes through Mantle-recommended tooling.
 */
import { privateKeyToAccount } from "thirdweb/wallets";
import { readContract } from "thirdweb";
import { client, mantleSepolia, agentConfig, getContracts } from "../config.js";

export type ActionKind = 0 | 1; // 0 = Buy, 1 = Sell
export const Buy: ActionKind = 0;
export const Sell: ActionKind = 1;

export interface Action {
  challengeId: bigint;
  agentId: bigint;
  kind: ActionKind;
  asset: `0x${string}`;
  size: bigint;        // quote units (Buy) or base units (Sell), 1e18 scaled
  nonce: bigint;
  deadline: bigint;
}

// EIP-712 domain matches ExecutionEngine constructor:
// EIP712("Agent Arena Execution Engine", "1")
const DOMAIN_TYPES = {
  EIP712Domain: [
    { name: "name",              type: "string"  },
    { name: "version",           type: "string"  },
    { name: "chainId",           type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

const ACTION_TYPES = {
  Action: [
    { name: "challengeId", type: "uint256" },
    { name: "agentId",     type: "uint256" },
    { name: "kind",        type: "uint8"   },
    { name: "asset",       type: "address" },
    { name: "size",        type: "uint128" },
    { name: "nonce",       type: "uint64"  },
    { name: "deadline",    type: "uint64"  },
  ],
} as const;

export async function signAction(action: Action): Promise<`0x${string}`> {
  const { executionEngine } = getContracts();

  const account = privateKeyToAccount({
    client,
    privateKey: agentConfig.signingKey,
  });

  const signature = await account.signTypedData({
    domain: {
      name: "Agent Arena Execution Engine",
      version: "1",
      chainId: BigInt(mantleSepolia.id),
      verifyingContract: executionEngine.address,
    },
    types: ACTION_TYPES,
    primaryType: "Action",
    message: {
      challengeId: action.challengeId,
      agentId:     action.agentId,
      kind:        action.kind,
      asset:       action.asset,
      size:        action.size,
      nonce:       action.nonce,
      deadline:    action.deadline,
    },
  });

  return signature;
}

export async function getNextNonce(): Promise<bigint> {
  const { executionEngine } = getContracts();
  const nonce = await readContract({
    contract: executionEngine,
    method: "nextNonce",
    params: [agentConfig.challengeId, agentConfig.agentId],
  });
  return BigInt(nonce);
}

export async function getPortfolio(): Promise<{ cash: bigint; value: bigint }> {
  const { executionEngine } = getContracts();
  const [cash, value] = await Promise.all([
    readContract({
      contract: executionEngine,
      method: "cash",
      params: [agentConfig.challengeId, agentConfig.agentId],
    }),
    readContract({
      contract: executionEngine,
      method: "getPortfolioValue",
      params: [agentConfig.challengeId, agentConfig.agentId],
    }),
  ]);
  return { cash: BigInt(cash), value: BigInt(value) };
}
