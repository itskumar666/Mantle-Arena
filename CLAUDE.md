# Agent-Marena — CLAUDE.md

**Project working directory:** `/Users/ashutoshkumar/Desktop/15JuneHackathon/Agent-Marena`
**Hackathon:** Turing Test Hackathon 2026 (Mantle × Bybit × Byreal × BGA) — Phase 2 "AI Awakening"
**Solo entry. $100K prize pool. Minimum target: $8K.**
**PRD:** `../PRD.md` — all product decisions defer to this; surface contradictions explicitly rather than drifting.

---

## What this project is

On-chain protocol on Mantle where AI trading agents:
1. Register an **ERC-8004 identity NFT** (AgentRegistry) binding a developer address to a signing key + strategy hash
2. Compete in **standardised paper-trading challenges** (Challenge) against real/simulated asset prices
3. Execute trades via **EIP-712 signed actions** (ExecutionEngine) — virtual portfolios, no real token transfers
4. Accumulate **verifiable reputation** on-chain (Leaderboard + Reputation)
5. Get **backed by humans who stake MNT** on them (StakeVault — prediction-market model)
6. Win **on-chain SVG trophy NFTs** as cryptographic proof of profitable trading (TrophyNFT)

Not another trading bot. This is the infrastructure those bots prove themselves on.

---

## Architecture

### Smart contracts (8 total, Mantle Sepolia)

| Contract | Address | Role |
|---|---|---|
| AgentRegistry | `0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd` | ERC-721 identity NFT; stores developer, signingKey, strategyHash |
| Challenge | `0x943bef0f81B47D1ABA4B2eFa05624e041595706D` | Competition lifecycle: Enrolling → Live → Ended → Settled |
| Api3PriceOracle | `0x679A658D91c9CADeF966d631C08B5c1feB72B536` | Production oracle: API3 dAPI proxies with staleness guard |
| ExecutionEngine | `0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b` | EIP-712 action gateway; virtual portfolio accounting |
| Leaderboard | `0xB050caC3607c4c2818A5b3E2E9B231842766D771` | PnL snapshot + ranking at settlement |
| Reputation | `0x39eD9F8a8BCAC2dB3473D351f6a21B35e7C9487C` | Pure-view aggregate stats over agent's challenge history |
| StakeVault | `0xB9a1527b97400511bE583405B72a10F2DB9BB611` | Prediction-market stakes + 70/20/10 distribution |
| TrophyNFT | `0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5` | On-chain SVG NFT; minted to developer when agent finishes with PnL > 0 |
| MockPriceOracle (DemoOracle) | `0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b` | Driveable oracle for demo; **ExecutionEngine currently points here** |

**Chain:** Mantle Sepolia, chainId 5003
**Deployer/owner:** `0x666AA4F5a674b9E50d8843F45a6Ef40244318550`
**Explorer:** https://explorer.sepolia.mantle.xyz

### Off-chain components

```
packages/
  agents/          TypeScript agent SDK + 3 reference agents
    src/
      config.ts         — chain config, contract ABIs, ASSETS map
      priceSimulator.ts — GBM + regime-switching simulator (pushes to DemoOracle)
      demoDriver.ts     — scripted 2-agent drama: pump/crash/recover scenario
      agents/
        momentum.ts      — trend-following reference agent
        meanReversion.ts — mean-reversion reference agent
        claude.ts        — AI agent via OpenRouter/Groq (LLM makes BUY/SELL/HOLD decisions)
      utils/
        oracle.ts        — price read helpers + PriceHistory
        submit.ts        — submitTrade, usdAmount, fractionOfHoldings
        signer.ts        — EIP-712 signing, getPortfolio

  frontend/        Next.js 14 + Thirdweb SDK + Tailwind
    src/
      app/
        page.tsx          — landing / challenge list
        challenges/       — challenge detail + enter agent
        agents/           — agent detail + register
        leaderboard/      — live rankings
        admin/            — create challenge, settle, mint trophy (owner-only)
        register/         — agent registration flow
      components/
        Navbar.tsx
        providers.tsx     — ThirdwebProvider wrapper
      lib/
        config.ts         — ALL contract addresses + ABIs + ASSET_META + helpers
```

---

## Repository structure

```
src/
  AgentRegistry.sol
  Challenge.sol
  ExecutionEngine.sol
  Leaderboard.sol
  Reputation.sol
  StakeVault.sol
  TrophyNFT.sol
  interfaces/
    IPriceOracle.sol       — getPrice(asset) view → uint256 (1e18 scaled)
    IApi3ReaderProxy.sol   — API3 dAPI proxy: int224 value, uint32 timestamp
  oracle/
    Api3PriceOracle.sol    — IPriceOracle backed by API3 dAPI proxies

test/
  AgentRegistry.t.sol  (20 tests)
  Challenge.t.sol      (26 tests)
  ExecutionEngine.t.sol (24 tests)
  Leaderboard.t.sol    (12 tests)
  Reputation.t.sol     (6 tests)
  StakeVault.t.sol     (18 tests)
  Api3PriceOracle.t.sol (12 tests)
  mocks/
    MockPriceOracle.sol   — has both setPrice() AND setPriceBatch()
    MockApi3Proxy.sol

script/
  Deploy.s.sol         — deploys all 8 contracts, prints addresses

run_demo.sh            — full demo: register agents → create challenge → enter → print instructions
create_challenge.sh    — create a single challenge
enter_agents.sh        — enter agents into an existing challenge
```

---

## Asset address map

Placeholder addresses `0x01`–`0x09` used as asset identifiers throughout all contracts. The address is the key — these are NOT real token addresses.

| Placeholder | Symbol | Name | Volatility (annual) |
|---|---|---|---|
| `0x...0001` | mETH | Mantle ETH | 3.5% |
| `0x...0002` | USDY | USD Yield (Ondo) | stable |
| `0x...0003` | MNT | Mantle | 4.0% |
| `0x...0004` | fBTC | Fungible BTC | 2.5% |
| `0x...0005` | SOL | Solana | 5.5% |
| `0x...0006` | USDT | Tether | stable |
| `0x...0007` | BNB | BNB | 3.0% |
| `0x...0008` | AAVE | Aave | 5.0% |
| `0x...0009` | AUSD | Agora USD | stable |

Stablecoins (USDY, USDT, AUSD) are clamped to $0.99–$1.01 in the simulator; all others use correlated GBM.

---

## Key design decisions

1. **EIP-712 signing for actions** — agents sign `Action` structs off-chain; anyone submits the tx. This means the agent's signing key never pays gas; the executor (owner wallet in demo) pays. Required for "agents trade without paying gas" demo narrative.

2. **owner-gated `createChallenge`** — PRD is silent; owner-only for MVP so the Arena curates challenges. v2: permissionless.

3. **`enterAgent` gated to NFT owner** — PRD says "developer or anyone"; v1 gates to NFT owner for safety. v2: anyone with entry fee.

4. **Native MNT staking** — PRD §3 says USDC. Using native MNT on testnet; swap to ERC-20 on mainnet stretch.

5. **Mock oracle for demo** — Api3PriceOracle is the production path but demo uses DemoOracle (`0xe3ea69...`) because compressed-time mode needs driveable prices. `ExecutionEngine.setPriceOracle()` swaps at deploy time. **ExecutionEngine currently points to DemoOracle.**

6. **StakeVault prediction-market model** — losing stakes fund the prize pool (70/20/10 from loser pool); winning backers keep principal + share of bonus. Loser backers lose stake.

7. **`via_ir = true`** in foundry.toml — required for ExecutionEngine's 10-field `ActionExecuted` event. DO NOT remove.

8. **TrophyNFT fully on-chain SVG** — no IPFS, no external hosting. `tokenURI` returns `data:application/json;base64,...` with embedded `data:image/svg+xml;base64,...`. Medal emoji (🥇🥈🥉) for top 3; `#N` for others. Anyone can call `claim()` — NFT goes to the agent's developer address.

9. **Thirdweb SDK throughout** — both frontend (Next.js) and agents package use `thirdweb` v5 for contract interaction. Do NOT introduce viem/ethers directly except for EIP-712 signing (see gotcha below).

---

## Foundry config

```toml
solc_version = "0.8.28"
optimizer = true
optimizer_runs = 200
via_ir = true          # DO NOT remove — stack-too-deep without it
```

Remappings: `@openzeppelin/contracts/ → lib/openzeppelin-contracts/contracts/`

Networks:

| Alias | Chain ID | RPC |
|---|---|---|
| `mantle_sepolia` | 5003 | `https://rpc.sepolia.mantle.xyz` |
| `mantle_mainnet` | 5000 | `https://rpc.mantle.xyz` |

Verifier: blockscout (`https://api-sepolia.mantlescan.xyz/api`)

---

## Environment variables

### Root `.env` (Foundry + shell scripts)

| Variable | Example | Purpose |
|---|---|---|
| `PRIVATE_KEY` | `0x873ca0...` | Deployer/owner private key |
| `MANTLE_SEPOLIA_RPC_URL` | `https://rpc.sepolia.mantle.xyz` | Foundry RPC |
| `MANTLE_MAINNET_RPC_URL` | `https://rpc.mantle.xyz` | Foundry RPC (mainnet) |
| `MANTLESCAN_API_KEY` | `Y75EWJ8S...` | Contract verification |

### `packages/agents/.env` (shared agent config)

| Variable | Purpose |
|---|---|
| `MANTLE_RPC_URL` | `https://rpc.sepolia.mantle.xyz` |
| `THIRDWEB_CLIENT_ID` | Thirdweb dashboard client ID |
| `PRIVATE_KEY` | Owner key for gas payments (price-sim, demo-driver) |
| `PRICE_ORACLE_ADDRESS` | DemoOracle: `0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b` |
| `EXECUTION_ENGINE_ADDRESS` | `0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b` |
| `AGENT_REGISTRY_ADDRESS` | `0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd` |
| `CHALLENGE_ADDRESS` | `0x943bef0f81B47D1ABA4B2eFa05624e041595706D` |

### Per-agent env files

| File | Extra vars |
|---|---|
| `.env.momentum` | `CHALLENGE_ID`, `AGENT_ID`, `AGENT_SIGNING_KEY` |
| `.env.meanreversion` | `CHALLENGE_ID`, `AGENT_ID`, `AGENT_SIGNING_KEY` |
| `.env.claude` | `CHALLENGE_ID`, `AGENT_ID`, `AGENT_SIGNING_KEY`, `GROQ_API_KEY` (or `OPENROUTER_API_KEY` + `AI_BASE_URL` + `AI_MODEL`) |

### `packages/frontend/.env.local`

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` | Thirdweb dashboard client ID |
| `NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS` | (optional; hardcoded fallback exists) |
| `NEXT_PUBLIC_CHALLENGE_ADDRESS` | (optional) |
| `NEXT_PUBLIC_EXECUTION_ENGINE_ADDRESS` | (optional) |
| `NEXT_PUBLIC_LEADERBOARD_ADDRESS` | (optional) |
| `NEXT_PUBLIC_REPUTATION_ADDRESS` | (optional) |
| `NEXT_PUBLIC_STAKE_VAULT_ADDRESS` | (optional) |
| `NEXT_PUBLIC_TROPHY_ADDRESS` | (optional) |
| `NEXT_PUBLIC_ORACLE_ADDRESS` | (optional) |

---

## All npm scripts

### `packages/agents/` — `cd packages/agents && npm run <script>`

| Script | What it does |
|---|---|
| `price-sim` | GBM price simulator — pushes all 9 asset prices to DemoOracle every 10s. Regime switches calm↔volatile. |
| `demo-driver` | Scripted drama: pump mETH +32%, Agent1 buys top, crash -48%, Agent2 buys dip, recover, Agent2 wins. Set `CHALLENGE_ID=N`. |
| `momentum` | Momentum agent loop. Set `CHALLENGE_ID`, `AGENT_ID`, `AGENT_SIGNING_KEY` via env or `.env.momentum`. |
| `meanreversion` | Mean-reversion agent loop. Same env vars. |
| `claude` | AI agent (LLM BUY/SELL/HOLD via OpenRouter or Groq). Same env vars + `GROQ_API_KEY`. |
| `build` | TypeScript type-check only (`tsc --noEmit`). |

### `packages/frontend/` — `cd packages/frontend && npm run <script>`

| Script | What it does |
|---|---|
| `dev` | Next.js dev server on `http://localhost:3000` |
| `build` | Production build |
| `start` | Serve production build |

### Foundry — from project root

```bash
forge test                          # run all 118 tests
forge test -vvv                     # verbose with traces
forge test --match-contract X       # single suite
forge build --sizes                 # check contract sizes
forge fmt                           # format (CI checks this)
forge script script/Deploy.s.sol --dry-run   # simulate deploy
```

### Demo shell scripts — from project root

```bash
./run_demo.sh         # full demo: register 5 agents → create challenge → enter all → print tab instructions
./create_challenge.sh # create a single 24-hr challenge
./enter_agents.sh     # enter agents 1–N into CHALLENGE_ID
```

---

## Running the demo end-to-end

```bash
# 1. Start price simulator (Terminal 1)
cd packages/agents && npm run price-sim

# 2. Run scripted drama (Terminal 2) — creates a clear winner
CHALLENGE_ID=<N> npm run demo-driver

# 3. Run live agents in separate terminals if showing real-time trading
CHALLENGE_ID=<N> AGENT_ID=1 npm run momentum
CHALLENGE_ID=<N> AGENT_ID=2 npm run meanreversion
CHALLENGE_ID=<N> AGENT_ID=3 npm run claude   # needs GROQ_API_KEY

# 4. After challenge endTime passes — settle via frontend admin page or:
cast send 0xB050caC3607c4c2818A5b3E2E9B231842766D771 "settle(uint256)" <N> \
  --rpc-url https://rpc.sepolia.mantle.xyz --private-key $PRIVATE_KEY

# 5. Claim trophy NFT for winning agent
cast send 0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5 "claim(uint256,uint256)" <challengeId> <agentId> \
  --rpc-url https://rpc.sepolia.mantle.xyz --private-key $PRIVATE_KEY
```

For a faster self-contained demo: `./run_demo.sh` handles steps 1-3 setup, then use `demo-driver`.

---

## Known gotchas

**Nonce conflicts between `cast send` calls**
Always add `sleep 6` or use `waitForReceipt` between sequential `cast send` commands. Sending multiple txs in the same block from the same account causes nonce conflicts and reverts. The shell scripts use `sleep 7` throughout.

**`git filter-repo` reverts working tree**
Running `filter-repo` rewrites history and discards uncommitted changes. All TS fixes get wiped. Re-apply any staged changes manually after filter-repo runs.

**WalletConnect `pino-pretty` webpack error**
`pino-pretty` is an optional dep of pino (used internally by WalletConnect). Not available in browser. Fix is in `packages/frontend/next.config.mjs`:
```js
config.resolve.fallback = { ...config.resolve.fallback, "pino-pretty": false };
```
Do not remove this.

**Hooks in loops — React rule**
Never call `useReadContract` (or any hook) inside `.map()`. Extract each item to a child component that calls the hook at the top level. Violation crashes the entire page at runtime.

**EIP-712 signing: use viem directly**
Use `signTypedData` from `viem/accounts`, NOT `account.signTypedData` from thirdweb's `privateKeyToAccount`. Thirdweb's wrapper produces a signature that fails `ExecutionEngine`'s `ECDSA.recover` check with `InvalidSignature`. The `demoDriver.ts` and all agents use viem's `signTypedData` directly.

**`MockPriceOracle` has `setPrice()` but not `setPriceBatch()`**
The test mock (`test/mocks/MockPriceOracle.sol`) only has `setPrice(address, uint256)`. The deployed DemoOracle at `0xe3ea69...` was deployed with both `setPrice` and `setPriceBatch`. The `priceSimulator.ts` tries `setPriceBatch` first and falls back to individual `setPrice` calls.

**`enterAgent` is owner-gated via NFT ownership**
Only the NFT owner of the agentId (i.e., the developer who registered it) can call `enterAgent`. Attempting to enter someone else's agent reverts. The `run_demo.sh` works because all agents are registered by the same deployer key.

**Challenge enrollment window must be open (phase 0)**
`enterAgent` reverts if the challenge phase is not `Enrolling` (phase 0). The `createChallenge` `startTime` is when phase transitions from 0 → 1 (Live). Enter agents before `startTime`.

**ExecutionEngine points to DemoOracle, not Api3PriceOracle**
At deploy time, `ExecutionEngine` was configured with `0xe3ea69...` (DemoOracle). The `Api3PriceOracle` at `0x679A65...` is deployed but not wired to the engine. To switch to production oracle: call `ExecutionEngine.setPriceOracle(0x679A658D91c9CADeF966d631C08B5c1feB72B536)` as owner.

---

## Current build state (Day 9+, all PRD days complete)

### PRD day progress

| PRD Day | Work | Status |
|---|---|---|
| 1 | Foundry scaffold, Mantle testnet config | done |
| 2 | AgentRegistry contract | done |
| 3 | Challenge contract | done |
| 4 | ExecutionEngine + IPriceOracle | done |
| 5 | API3 oracle adapter | done |
| 6 | Leaderboard + Reputation | done |
| 7 | StakeVault | done |
| 8 | Deploy script + testnet deploy | done — contracts live on Mantle Sepolia |
| 9 | JS Agent SDK (agents package) | done |
| 10 | 3 reference agents (momentum, meanReversion, claude) | done |
| 11 | Indexer | skipped — frontend reads contracts directly |
| 12 | Frontend (Thirdweb SDK, Next.js) | done — local only |
| 12b | TrophyNFT contract | done |
| 13 | Demo polish (demo-driver, GBM sim, run_demo.sh) | done |

### Test suite

7 suites, **118 tests passing** (includes 256-run fuzz + conservation invariants).

```bash
forge test          # run all
forge test -vvv     # with traces
```

---

## Remaining tasks (submission deadline ~Day 15)

- [ ] **Vercel deploy** — frontend not yet publicly accessible (required for 20-Project Award)
- [ ] **Contract verification on Mantle Explorer** — see verification commands below
- [ ] **DoraHacks submission** — with all contract addresses + Vercel URL + GitHub
- [ ] **Demo video** — 4-min recording using `./run_demo.sh` + demo-driver scenario
- [ ] **Content blitz** — X posts tagging @Mantle_Official @Byreal_io @doraHacks @BybitOfficial

### Contract verification commands

```bash
# AgentRegistry
forge verify-contract 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd src/AgentRegistry.sol:AgentRegistry \
  --verifier blockscout --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --constructor-args $(cast abi-encode "constructor(address)" 0x666AA4F5a674b9E50d8843F45a6Ef40244318550) \
  --chain 5003

# Challenge
forge verify-contract 0x943bef0f81B47D1ABA4B2eFa05624e041595706D src/Challenge.sol:Challenge \
  --verifier blockscout --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --constructor-args $(cast abi-encode "constructor(address)" 0x666AA4F5a674b9E50d8843F45a6Ef40244318550) \
  --chain 5003

# TrophyNFT
forge verify-contract 0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5 src/TrophyNFT.sol:TrophyNFT \
  --verifier blockscout --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --constructor-args $(cast abi-encode "constructor(address,address)" 0xB050caC3607c4c2818A5b3E2E9B231842766D771 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd) \
  --chain 5003

# Repeat for ExecutionEngine, Leaderboard, Reputation, StakeVault, Api3PriceOracle
# — constructor args vary; check Deploy.s.sol for correct order
```

---

## Mantle ecosystem integration (25% of judging — CRITICAL)

Current integrations:
- Deployed to Mantle Sepolia
- **API3 dAPIs** as oracle source (Mantle-recommended oracle provider)
- **Native MNT** for stakes
- **Thirdweb SDK v5** throughout (frontend + agents)
- Named Mantle ecosystem assets: mETH, USDY, fBTC, MNT, AUSD
- Explorer links to `explorer.sepolia.mantle.xyz`

Rule: when picking any library/tool, check Mantle's published options first. Generic viem/ethers is a fallback only if no Mantle-endorsed option exists.

---

## 20-Project Deployment Award checklist

- [ ] Contracts deployed + verified on Mantle Explorer
- [ ] At least one AI-powered function callable on-chain (`ExecutionEngine.submitAction` triggered by Claude/Groq agent)
- [ ] Frontend publicly accessible (Vercel deploy)
- [ ] Demo video ≥2 min (targeting 4 min)
- [ ] Open-source GitHub repo with README + deployed addresses
- [ ] DoraHacks submission with contract addresses

---

## Coding conventions

- **TypeScript strict** — no `any`, no implicit returns, explicit return types on public functions
- **No comments on obvious code** — comments for non-obvious decisions only
- **React hooks in components** — never call `useReadContract` / `useContractRead` inside `.map()` or other loop. Extract to a child component.
- **signTypedData from viem** — not from thirdweb account wrapper (InvalidSignature bug)
- **waitForReceipt after every sendTransaction** — especially in loops; prevents nonce conflicts
- **sleep 6+ between cast sends** — in shell scripts; same nonce reason
- **ASSET addresses are placeholders** — `0x...0001` through `0x...0009`. Never treat as real token addresses.
- **All amounts are 1e18 scaled** — prices from oracle, portfolio values, PnL — everything is wei-denominated USD equivalent
