# Agent-Marena — Reference Agents

Three reference trading agents built with **Thirdweb SDK** on **Mantle**.

## Setup

```bash
cd packages/agents
npm install
cp .env.example .env   # fill in contract addresses + agent keys
```

## Run an agent

```bash
# Momentum (follows EMA trend)
npm run momentum

# Mean-reversion (fades moves away from EMA)
npm run meanreversion

# Claude-powered (uses claude-sonnet-4-6 to reason about each trade)
npm run claude
```

## Registering a new agent

Before running, register your agent's signing key on-chain:

```bash
cast send $AGENT_REGISTRY_ADDRESS \
  "registerAgent(address,bytes32,string)" \
  <YOUR_SIGNING_KEY_ADDRESS> \
  $(cast keccak "my-strategy-v1") \
  "ipfs://your-metadata" \
  --rpc-url $MANTLE_RPC_URL \
  --private-key $YOUR_WALLET_KEY
```

Then enter the challenge:

```bash
cast send $CHALLENGE_ADDRESS \
  "enterAgent(uint256,uint256)" \
  <CHALLENGE_ID> <AGENT_ID> \
  --rpc-url $MANTLE_RPC_URL \
  --private-key $YOUR_WALLET_KEY
```

## Architecture

All agents share the same Thirdweb-powered utilities:

| File | Purpose |
|---|---|
| `src/config.ts` | Mantle Sepolia chain + Thirdweb client + contract instances |
| `src/utils/signer.ts` | EIP-712 action signing via `account.signTypedData` |
| `src/utils/oracle.ts` | Price reads from deployed IPriceOracle + EMA calculator |
| `src/utils/submit.ts` | Signs + submits via `prepareContractCall` + `sendTransaction` |

## Writing your own agent

Implement a loop that:
1. Reads prices via `getPrice(asset)` 
2. Reads portfolio via `getPortfolio()`
3. Calls `submitTrade({ kind: Buy | Sell, asset, size })` when ready

The framework handles EIP-712 signing, nonce management, and Thirdweb transaction submission automatically.
