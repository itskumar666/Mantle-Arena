# PROJECT_STATE.md — Agent-Marena Handoff
**As of: 2026-06-10**
Hackathon: Turing Test Hackathon 2026 (Mantle × Bybit × Byreal × BGA), Phase 2 "AI Awakening"
Prize pool: $100K. Minimum target: $8K. Deadline: ~2026-06-17 (Day 15 of 15).

---

## 1. What We Built

Full-stack on-chain AI trading arena running on Mantle Sepolia (chainId 5003).

**Contracts (8 total, all deployed):**

| Contract | Address |
|---|---|
| AgentRegistry | `0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd` |
| Challenge | `0x943bef0f81B47D1ABA4B2eFa05624e041595706D` |
| ExecutionEngine | `0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b` |
| Leaderboard | `0xB050caC3607c4c2818A5b3E2E9B231842766D771` |
| Reputation | `0x39eD9F8a8BCAC2dB3473D351f6a21B35e7C9487C` |
| StakeVault | `0xB9a1527b97400511bE583405B72a10F2DB9BB611` |
| TrophyNFT | `0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5` |
| MockPriceOracle (DemoOracle) | `0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b` |
| Api3PriceOracle (production path, not yet wired in) | `0x679A658D91c9CADeF966d631C08B5c1feB72B536` |

Deployer/owner wallet: `0x666AA4F5a674b9E50d8843F45a6Ef40244318550`
Explorer: https://explorer.sepolia.mantle.xyz

**Frontend:** Next.js 14 app with Thirdweb SDK + Tailwind. Routes: `/` (home), `/challenges` (browser with filters), `/challenges/[id]` (live price ticker, enter panel, holdings), `/agents` (registry), `/leaderboard`, `/register` (mint agent NFT), `/admin`.

**Agents (3 reference implementations):**
- `packages/agents/src/agents/momentum.ts` — momentum strategy
- `packages/agents/src/agents/meanReversion.ts` — mean reversion
- `packages/agents/src/agents/claude.ts` — AI/LLM via OpenRouter or Groq (uses `meta-llama/llama-3.3-70b-instruct:free` by default)

**Price infrastructure:**
- `packages/agents/src/priceSimulator.ts` — GBM simulator that drives the MockPriceOracle during demos
- `packages/agents/src/demoDriver.ts` — manual trade scenario driver used for Challenge #11 demo

**Hackathon ecosystem integrations (judging is 25% on this):**
- Deployed to Mantle Sepolia/Mainnet (configured in foundry.toml)
- API3 dAPI proxies as production oracle (Mantle-recommended)
- Thirdweb SDK for all frontend contract reads/writes + wallet connect
- Native MNT for stakes
- Mantle-named assets (mETH, USDY, fBTC, MNT) as the trading universe

---

## 2. Current State

### Working

- All 8 contracts deployed on Mantle Sepolia; test suite has 118 tests passing (`forge test`)
- Frontend runs locally: `cd packages/frontend && npm run dev` → http://localhost:3000
- GBM price simulator running: `cd packages/agents && npm run price-sim`
- Demo driver confirmed working: Challenge #11 ran, Agent #2 won +$1,384.62, Agent #1 lost -$1,440
- TrophyNFT deployed; "Claim Trophy" UI in frontend works
- Hall of Fame, challenge browser with filters, live price ticker — all working
- `run_demo.sh`: creates a fresh challenge + enrolls 5 agents in one shot (waits for confirmation)
- Agents 1, 2, 3 registered with known signing keys (see env files below)

### Not Yet Done (blocking submission)

1. **Frontend NOT deployed to Vercel** — required for 20-Project Award (public URL needed in DoraHacks)
2. **Contracts NOT verified on Mantle Explorer** — required for 20-Project Award; `forge verify-contract` commands are ready in CLAUDE.md
3. **API3 oracle NOT switched in** — `setup_api3_oracle.sh` exists but has not been run; `ExecutionEngine` still points to `MockPriceOracle` (`0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b`). Run the script to switch to live prices.
4. **DoraHacks submission not filed** — needs contract addresses + Vercel URL
5. **Demo video not recorded** — target 4 min: register → enter challenge → prices move → trophy claim
6. Agents 4 and 5 are NOT pre-registered; `run_demo.sh` auto-registers them on first run (saving printed signing keys from that output is important)

### Known Bugs and Gotchas

**CRITICAL — signTypedData:** Always use `signTypedData` from `"viem/accounts"`. Do NOT use thirdweb's `account.signTypedData` — it produces an invalid signature that reverts with `InvalidSignature` on-chain. The working pattern is in `packages/agents/src/utils/signer.ts`.

**Nonce conflicts on fast `cast send` calls:** Always `sleep 6` between sends (already done in `run_demo.sh` and `setup_api3_oracle.sh`). Sending two txs in the same block causes nonce collision.

**`git filter-repo` destroys working tree:** If anyone runs `git filter-repo` to clean history, all TypeScript fixes will be wiped. These must be re-applied manually: `tsconfig.json` target set to `ES2020`, `parseEther` import removal, TrophyNFT contract changes. Do not run `git filter-repo` without a full backup.

**`pino-pretty` webpack error:** Already fixed in `packages/frontend/next.config.mjs` with `config.resolve.fallback = { "pino-pretty": false }`. Do not remove this.

**Hooks in loops:** If you add a new component that maps over a list and calls hooks inside the map body, React will throw a hooks-in-loops error. Extract each list item into its own child component (this is how `AssetHolding` was fixed from `HoldingsBreakdown`).

**`enterAgent` reverts with `WrongPhase`:** This happens if the enrollment window has already passed when you call `enterAgent`. Always create challenges with enough enrollment lead time. `run_demo.sh` uses 4 minutes of enrollment time.

**`.env.claude` still has placeholder for Claude agent signing key:** The file at `packages/agents/.env.claude` has `AGENT_SIGNING_KEY=<PASTE_CLAUDE_PRIVATE_KEY_HERE>`. Agent #3's signing address is `0x9c68b3427d8014090a695B419BD7c55Ab8773150` — the private key was printed when agent #3 was registered. It needs to be pasted in before `npm run claude` will work.

---

## 3. Architecture Quick Reference

```
Agent-Marena/
├── src/                        # Solidity contracts
│   ├── AgentRegistry.sol       # ERC-721 identity NFT + signing key + strategy hash
│   ├── Challenge.sol           # Lifecycle: Enrolling → Live → Ended → Settled
│   ├── ExecutionEngine.sol     # EIP-712 signed action gateway + virtual portfolio
│   ├── Leaderboard.sol         # PnL snapshot + ranking at settlement
│   ├── Reputation.sol          # Aggregate stats view across agent's history
│   ├── StakeVault.sol          # Prediction-market stakes, 70/20/10 distribution
│   ├── TrophyNFT.sol           # SBT minted to winner at claim
│   ├── interfaces/
│   │   ├── IPriceOracle.sol
│   │   └── IApi3ReaderProxy.sol
│   └── oracle/
│       └── Api3PriceOracle.sol # Production oracle backed by API3 dAPI proxies
├── test/                       # 7 suites, 118 tests
├── script/Deploy.s.sol
├── run_demo.sh                 # One-shot: register agents + create challenge + enter
├── setup_api3_oracle.sh        # Switch ExecutionEngine to Api3PriceOracle
├── create_challenge.sh
├── enter_agents.sh
├── packages/
│   ├── frontend/               # Next.js 14 app
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx              # Home / hero
│   │       │   ├── challenges/[id]/      # Live challenge view
│   │       │   ├── leaderboard/
│   │       │   ├── agents/
│   │       │   ├── register/
│   │       │   └── admin/
│   │       └── lib/config.ts             # All contract addresses + ABIs
│   └── agents/
│       └── src/
│           ├── agents/
│           │   ├── momentum.ts
│           │   ├── meanReversion.ts
│           │   └── claude.ts             # OpenRouter/Groq LLM agent
│           ├── config.ts                 # Thirdweb client + contract bindings
│           ├── priceSimulator.ts         # GBM oracle driver
│           ├── demoDriver.ts             # Manual trade scenario
│           └── utils/
│               ├── signer.ts             # EIP-712 signing (viem/accounts)
│               ├── submit.ts             # submitAction wrapper
│               └── oracle.ts             # getPrice + PriceHistory
```

---

## 4. Next Steps — Priority Order

These are in the order they must be done to unlock the 20-Project Award and DoraHacks submission.

### Step 1: Deploy frontend to Vercel

```bash
cd /Users/ashutoshkumar/Desktop/15JuneHackathon/Agent-Marena/packages/frontend
npx vercel --prod
```

When Vercel prompts for environment variables, set all of these (exact names and values):

```
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=b1b58a867a13e4e60f144297596c302c
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd
NEXT_PUBLIC_CHALLENGE_ADDRESS=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
NEXT_PUBLIC_EXECUTION_ENGINE_ADDRESS=0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b
NEXT_PUBLIC_LEADERBOARD_ADDRESS=0xB050caC3607c4c2818A5b3E2E9B231842766D771
NEXT_PUBLIC_REPUTATION_ADDRESS=0x39eD9F8a8BCAC2dB3473D351f6a21B35e7C9487C
NEXT_PUBLIC_STAKE_VAULT_ADDRESS=0xB9a1527b97400511bE583405B72a10F2DB9BB611
NEXT_PUBLIC_TROPHY_ADDRESS=0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5
NEXT_PUBLIC_DEMO_ORACLE_ADDRESS=0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b
NEXT_PUBLIC_CHAIN_ID=5003
```

After deploy, confirm the live URL loads the challenge browser before continuing.

### Step 2: Verify contracts on Mantle Explorer

Run from the repo root (requires `PRIVATE_KEY` in `.env`):

```bash
source .env

# AgentRegistry
forge verify-contract 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd src/AgentRegistry.sol:AgentRegistry \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --constructor-args $(cast abi-encode "constructor(address)" 0x666AA4F5a674b9E50d8843F45a6Ef40244318550) \
  --chain 5003

# Challenge
forge verify-contract 0x943bef0f81B47D1ABA4B2eFa05624e041595706D src/Challenge.sol:Challenge \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --constructor-args $(cast abi-encode "constructor(address,address)" 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd 0x666AA4F5a674b9E50d8843F45a6Ef40244318550) \
  --chain 5003

# ExecutionEngine
forge verify-contract 0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b src/ExecutionEngine.sol:ExecutionEngine \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --chain 5003

# Leaderboard
forge verify-contract 0xB050caC3607c4c2818A5b3E2E9B231842766D771 src/Leaderboard.sol:Leaderboard \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --chain 5003

# Reputation
forge verify-contract 0x39eD9F8a8BCAC2dB3473D351f6a21B35e7C9487C src/Reputation.sol:Reputation \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --chain 5003

# StakeVault
forge verify-contract 0xB9a1527b97400511bE583405B72a10F2DB9BB611 src/StakeVault.sol:StakeVault \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --chain 5003

# TrophyNFT
forge verify-contract 0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5 src/TrophyNFT.sol:TrophyNFT \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --chain 5003

# Api3PriceOracle
forge verify-contract 0x679A658D91c9CADeF966d631C08B5c1feB72B536 src/oracle/Api3PriceOracle.sol:Api3PriceOracle \
  --verifier blockscout \
  --verifier-url "https://explorer.sepolia.mantle.xyz/api?" \
  --constructor-args $(cast abi-encode "constructor(address)" 0x666AA4F5a674b9E50d8843F45a6Ef40244318550) \
  --chain 5003
```

If a verify command fails with "already verified", that's fine — skip it.

### Step 3: Switch to live API3 prices

```bash
cd /Users/ashutoshkumar/Desktop/15JuneHackathon/Agent-Marena
./setup_api3_oracle.sh
```

This wires 9 API3 dAPI proxies into `Api3PriceOracle` and calls `ExecutionEngine.setPriceOracle(0x679A658D91c9CADeF966d631C08B5c1feB72B536)`. After running, confirm with:

```bash
cast call 0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b "priceOracle()(address)" \
  --rpc-url https://rpc.sepolia.mantle.xyz
# Should print: 0x679A658D91c9CADeF966d631C08B5c1feB72B536
```

Note: After switching to Api3PriceOracle, the GBM price simulator (`npm run price-sim`) no longer controls prices — it will keep running but `ExecutionEngine` will read from API3 live feeds instead.

### Step 4: File DoraHacks submission

Go to https://dorahacks.io and file submission with:
- Project name: Agent-Marena
- Contract addresses: all 8 from the table in Section 1
- Frontend URL: Vercel URL from Step 1
- GitHub repo link
- Demo video link (Step 5)
- Track: Mantle × Bybit × Byreal × BGA

### Step 5: Record demo video (4 min target)

Sequence to show on screen:
1. Open Vercel frontend. Show Hall of Fame + challenge browser.
2. Click "Register Agent" — mint agent NFT. (Can use pre-existing Agent #3 if short on time.)
3. Run `./run_demo.sh` in terminal; show challenge being created and agents entering.
4. Switch to the challenge detail page in frontend. Show live price ticker moving.
5. Open 3 tabs running `npm run momentum`, `npm run meanreversion`, `npm run claude` simultaneously.
6. Wait for challenge to end. Hit "Settle" button in frontend.
7. Winner's address: click "Claim Trophy". Show TrophyNFT appearing in wallet.
8. Show Mantle Explorer transaction for at least one on-chain action.

### Step 6: Post content on X

Tag: `@Mantle_Official @doraHacks @BybitOfficial @Byreal_io`
Hook: *"Every AI bot says it's profitable. Mine has to prove it on-chain."*

---

## 5. How to Run a Full Demo From Scratch

**Prerequisites:** `.env` file in repo root contains `PRIVATE_KEY=0x...` for the deployer wallet (`0x666AA4F5a674b9E50d8843F45a6Ef40244318550`). Wallet needs Mantle Sepolia MNT (faucet: https://faucet.sepolia.mantle.xyz).

```bash
cd /Users/ashutoshkumar/Desktop/15JuneHackathon/Agent-Marena

# Terminal 1 — start demo. Creates challenge + enters 5 agents. Note the CHALLENGE_ID printed.
./run_demo.sh
```

`run_demo.sh` will print a box of instructions at the end. Open 6 terminal tabs as instructed. Here is what each tab runs (replace `$CHALLENGE_ID` with the number printed):

```bash
# Tab 1 — GBM price simulator (keep running for duration of challenge)
cd packages/agents && npm run price-sim

# Tab 2 — AI agent (requires AGENT_SIGNING_KEY for Agent #3)
cd packages/agents
CHALLENGE_ID=<ID> AGENT_ID=3 npm run claude

# Tab 3 — Momentum agent #1
cd packages/agents
CHALLENGE_ID=<ID> AGENT_ID=1 npm run momentum

# Tab 4 — Mean reversion agent #2
cd packages/agents
CHALLENGE_ID=<ID> AGENT_ID=2 npm run meanreversion

# Tab 5 — Momentum agent #4 (registered by run_demo.sh if needed)
cd packages/agents
CHALLENGE_ID=<ID> AGENT_ID=4 AGENT_SIGNING_KEY=<KEY_FROM_DEMO_OUTPUT> npm run momentum

# Tab 6 — Mean reversion agent #5
cd packages/agents
CHALLENGE_ID=<ID> AGENT_ID=5 AGENT_SIGNING_KEY=<KEY_FROM_DEMO_OUTPUT> npm run meanreversion
```

After the challenge `endTime` passes:
1. Open frontend → navigate to challenge page → click "Settle Challenge"
2. Winner appears in Leaderboard tab
3. Winner can click "Claim Trophy" — mints TrophyNFT to their wallet
4. Hall of Fame on home page updates

---

## 6. Environment Variables Reference

### Root `.env` (used by `run_demo.sh`, `setup_api3_oracle.sh`, `forge script`)

| Variable | Value |
|---|---|
| `PRIVATE_KEY` | Deployer private key for `0x666AA4F5a674b9E50d8843F45a6Ef40244318550` — NOT committed |
| `MANTLE_SEPOLIA_RPC_URL` | `https://rpc.sepolia.mantle.xyz` |
| `MANTLE_MAINNET_RPC_URL` | `https://rpc.mantle.xyz` |

### `packages/frontend/.env.local` (Next.js frontend, already populated)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` | `b1b58a867a13e4e60f144297596c302c` |
| `NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS` | `0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd` |
| `NEXT_PUBLIC_CHALLENGE_ADDRESS` | `0x943bef0f81B47D1ABA4B2eFa05624e041595706D` |
| `NEXT_PUBLIC_EXECUTION_ENGINE_ADDRESS` | `0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b` |
| `NEXT_PUBLIC_LEADERBOARD_ADDRESS` | `0xB050caC3607c4c2818A5b3E2E9B231842766D771` |
| `NEXT_PUBLIC_REPUTATION_ADDRESS` | `0x39eD9F8a8BCAC2dB3473D351f6a21B35e7C9487C` |
| `NEXT_PUBLIC_STAKE_VAULT_ADDRESS` | `0xB9a1527b97400511bE583405B72a10F2DB9BB611` |
| `NEXT_PUBLIC_TROPHY_ADDRESS` | `0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5` |
| `NEXT_PUBLIC_DEMO_ORACLE_ADDRESS` | `0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b` |
| `NEXT_PUBLIC_CHAIN_ID` | `5003` |

### `packages/agents/.env.momentum` (Agent #1 — momentum)

| Variable | Value |
|---|---|
| `AGENT_ID` | `1` |
| `AGENT_SIGNING_KEY` | `<AGENT1_SIGNING_KEY — see .env.momentum>` |
| `EXECUTION_ENGINE_ADDRESS` | `0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b` |
| `PRICE_ORACLE_ADDRESS` | `0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b` |
| `CHALLENGE_ID` | Update per run |

### `packages/agents/.env.meanreversion` (Agent #2 — mean reversion)

| Variable | Value |
|---|---|
| `AGENT_ID` | `2` |
| `AGENT_SIGNING_KEY` | `0xf3219eb7443fd9953324a87f7f0264020620ba7e22b07c1fc126b03ffa10da99` |
| `CHALLENGE_ID` | Update per run |

### `packages/agents/.env.claude` (Agent #3 — AI/LLM)

| Variable | Value / Note |
|---|---|
| `AGENT_ID` | `3` |
| `AGENT_SIGNING_KEY` | **NOT SET** — must paste signing key for `0x9c68b3427d8014090a695B419BD7c55Ab8773150` |
| `GROQ_API_KEY` | `<YOUR_GROQ_API_KEY>` (free, may rate-limit) |
| `OPENROUTER_API_KEY` | Optional override — get at https://openrouter.ai/keys |
| `AI_MODEL` | Default: `meta-llama/llama-3.3-70b-instruct:free` |
| `CHALLENGE_ID` | Update per run |

### `packages/agents/.env.pricedriver` (GBM simulator)

| Variable | Value |
|---|---|
| `DEMO_ORACLE_ADDRESS` | `0xe3ea6971C66121Cb24f878AeE30f78A39B3fc94b` |
| `PRIVATE_KEY` | Needs deployer key (same as root `.env`) |

---

## 7. Useful One-Liners

```bash
# Solidity
forge test                          # run all 118 tests
forge test -vvv                     # with traces
forge test --match-contract AgentRegistry  # single suite
forge build --sizes                 # check contract sizes

# Check current oracle on ExecutionEngine
cast call 0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b "priceOracle()(address)" \
  --rpc-url https://rpc.sepolia.mantle.xyz

# Check how many agents are registered
cast call 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd "totalAgents()(uint256)" \
  --rpc-url https://rpc.sepolia.mantle.xyz

# Check next challenge ID
cast call 0x943bef0f81B47D1ABA4B2eFa05624e041595706D "nextChallengeId()(uint256)" \
  --rpc-url https://rpc.sepolia.mantle.xyz

# Frontend local dev
cd packages/frontend && npm run dev     # http://localhost:3000

# Price simulator
cd packages/agents && npm run price-sim

# Demo driver (manual trade scenario, not needed for live demo)
cd packages/agents && npm run demo-driver
```

---

## 8. Resume Prompt

Paste this verbatim into a new Claude Code session to resume work on this project:

---

```
I am working on Agent-Marena, a hackathon project (Turing Test Hackathon 2026, Mantle × Bybit × Byreal × BGA).
Working directory: /Users/ashutoshkumar/Desktop/15JuneHackathon/Agent-Marena
Read PROJECT_STATE.md first — it is the authoritative handoff document.

Quick context:
- 8 Solidity contracts deployed and working on Mantle Sepolia (chainId 5003)
- Next.js frontend runs locally (packages/frontend, npm run dev)
- 3 reference agents: momentum, meanReversion, claude (in packages/agents/src/agents/)
- GBM price simulator drives the MockPriceOracle during demos (npm run price-sim)
- TrophyNFT (0x7C24Bdf978a13AAbC917d4A7Fb1becD88d75E5d5) is deployed and working

What still needs to be done (in priority order):
1. Deploy frontend to Vercel: cd packages/frontend && npx vercel --prod
   Use all NEXT_PUBLIC_* vars from packages/frontend/.env.local
2. Verify contracts on Mantle Explorer using forge verify-contract (commands in PROJECT_STATE.md Section 4 Step 2)
3. Run ./setup_api3_oracle.sh to switch ExecutionEngine to live API3 prices
4. File DoraHacks submission with all contract addresses + Vercel URL
5. Record 4-minute demo video

Key gotchas to know before touching any code:
- signTypedData: use viem's signTypedData (from "viem/accounts"), NOT thirdweb account.signTypedData
- Nonce conflicts: always sleep 6 seconds between cast send calls
- pino-pretty webpack fix in next.config.mjs must not be removed
- Agent #3 (.env.claude) signing key is a placeholder — must be filled in

Deployed addresses are hardcoded as fallbacks in packages/frontend/src/lib/config.ts so the frontend works even without env vars.

The deployer wallet is 0x666AA4F5a674b9E50d8843F45a6Ef40244318550. The PRIVATE_KEY for it must be in the root .env file for any cast send or forge script commands.

Start by reading PROJECT_STATE.md, then tell me what you can confirm is working and what the first concrete action is.
```
