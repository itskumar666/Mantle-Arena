# Agent-Marena — CLAUDE.md

Project working directory: `/Users/ashutoshkumar/Desktop/15JuneHackathon/Agent-Marena`
Hackathon: Turing Test Hackathon 2026 (Mantle × Bybit × Byreal × BGA) — Phase 2 "AI Awakening"
Solo entry. $100K prize pool. Minimum target: $8K.
PRD: `../PRD.md` — all product decisions defer to this; surface contradictions explicitly rather than drifting.

---

## What this project is

On-chain protocol on Mantle where AI trading agents register an ERC-8004 identity NFT, compete in standardised paper-trading challenges against real Mantle oracle prices (mETH, USDY, fBTC, MNT), accumulate verifiable reputation, and get backed by humans who stake on them. Not another trading bot — this is the infrastructure those bots prove themselves on.

---

## Current build state (Day 4 of 15, calendar 2026-06-03)

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
| 8 | Deploy script | done (deploy not yet executed) |
| 9 | JS Agent SDK | **next** |
| 10 | 3 + 1 reference agents | pending |
| 11 | Indexer (Mantle Graph Endpoints) | pending |
| 12 | Frontend (Thirdweb SDK) | pending |
| 13 | Demo polish + 4-min recording | pending |
| 14 | Content blitz (X videos, Day 14) | pending |
| 15 | DoraHacks submission | pending |

### Git log
```
60fd0be Add Foundry deploy script for full Agent-Marena stack
67db5f2 Ship Api3PriceOracle adapter — production path for oracle pricing
2a73711 Ship StakeVault — prediction-market staking + 70/20/10 distribution
55aeb13 Ship Leaderboard + Reputation — PnL settlement and aggregate scoring
81d4114 Ship ExecutionEngine — EIP-712 signed actions + virtual portfolios
21064c6 Ship Challenge contract — lifecycle, entry fees, settler bounty
e5d9eb0 Scaffold Agent-Marena Foundry project + ship AgentRegistry
```

### Test suite
7 test suites, **118 tests passing** (includes 256-run fuzz + conservation invariants).
Run: `forge test`

---

## Repository structure

```
src/
  AgentRegistry.sol       — ERC-8004 identity NFT (ERC-721 + signing key + strategy hash)
  Challenge.sol           — Competition lifecycle (Enrolling/Live/Ended/Settled phases)
  ExecutionEngine.sol     — EIP-712 signed action gateway + virtual portfolio accounting
  Leaderboard.sol         — PnL snapshot + ranking at challenge settlement
  Reputation.sol          — Pure view: aggregate stats over agent's challenge history
  StakeVault.sol          — Prediction-market stakes + 70/20/10 distribution
  interfaces/
    IPriceOracle.sol      — getPrice(asset) view returns uint256 (1e18 scaled)
    IApi3ReaderProxy.sol  — API3 dAPI proxy interface (int224 value, uint32 timestamp)
  oracle/
    Api3PriceOracle.sol   — IPriceOracle backed by API3 dAPI proxies; staleness guard

test/
  AgentRegistry.t.sol     (20 tests)
  Challenge.t.sol         (26 tests)
  ExecutionEngine.t.sol   (24 tests)
  Leaderboard.t.sol       (12 tests)
  Reputation.t.sol        (6 tests)
  StakeVault.t.sol        (18 tests)
  Api3PriceOracle.t.sol   (12 tests)
  mocks/
    MockPriceOracle.sol   — for tests + live-stream demo (driveable prices)
    MockApi3Proxy.sol     — for Api3PriceOracle tests

script/
  Deploy.s.sol            — Deploys all 7 contracts, prints addresses, supports --verify
```

---

## Key design decisions (PRD deviations to remember)

1. **enterAgent gated to NFT owner** — PRD says "developer or anyone"; we gate to NFT owner for v1 safety. v2: anyone with entry fee.
2. **createChallenge owner-gated** — PRD is silent; we used owner-only for MVP (Arena curates challenges). v2: permissionless.
3. **StakeVault prediction-market model** — PRD §7 wording is contradictory. Implemented Reading D: losing stakes fund the prize pool (70/20/10 from loser pool); winning backers keep principal + share of bonus. Loser backers lose stake. PRD's "losing stakes returned" was interpreted as the v2 slash-mechanics deferral note, not a return-to-backer guarantee.
4. **Native MNT staking** — PRD §3 says USDC. Using native MNT for testnet; swap to ERC-20 on mainnet stretch.
5. **Mock oracle for demo** — Api3PriceOracle is the production path but demo uses MockPriceOracle (compressed-time mode needs driveable prices, not a real feed that updates every few minutes). ExecutionEngine.setPriceOracle() swaps at deploy time.
6. **via_ir = true** in foundry.toml — required for ExecutionEngine's 10-field ActionExecuted event (stack-too-deep otherwise).

---

## Foundry config

```toml
solc_version = "0.8.28"
optimizer = true, runs = 200
via_ir = true  # DO NOT remove — stack-too-deep without it
```

Remappings: `@openzeppelin/contracts/ → lib/openzeppelin-contracts/contracts/`
Networks: `mantle_sepolia` (chain 5003), `mantle_mainnet` (chain 5000)
Verifier: Mantlescan blockscout API

---

## Deploy (not yet run)

```bash
cp .env.example .env   # fill in PRIVATE_KEY, MANTLESCAN_API_KEY
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify --verifier blockscout \
  --verifier-url https://explorer.sepolia.mantle.xyz/api?
```

Post-deploy (once you have real API3 proxy addresses for Mantle Sepolia):
```bash
cast send $API3_ORACLE "setProxy(address,address)" $METH_ADDR $METH_PROXY --rpc-url ...
cast send $ENGINE "setPriceOracle(address)" $API3_ORACLE --rpc-url ...
```

---

## Mantle ecosystem integration (25% of judging — CRITICAL)

Current:
- Deployed to Mantle Sepolia/Mainnet (RPC + verifier configured)
- API3 dAPIs as oracle source (Mantle-recommended)
- Native MNT for stakes
- Named Mantle assets (mETH, USDY, fBTC, MNT) as trading universe

**Planned for remaining days (committed):**
- Day 11: **Mantle Graph Endpoints** for the indexer subgraph (every frontend query hits Mantle's hosted Graph)
- Day 12: **Thirdweb SDK** for frontend contract reads/writes + wallet connect
- Day 12: **Particle AA SDK** for gasless agent action submissions (sharp demo narrative: "agents trade without paying gas")
- Day 10: **Byreal Agent Skills** as a 4th reference agent — cross-track eligibility unlock
- Day 8 deploy: Pin real Mantle ecosystem token addresses for mETH, USDY, fBTC, MNT

Rule: when picking a library/tool for any remaining phase, check Mantle's published options first. Generic viem/ethers is a fallback only if no Mantle-endorsed option exists.

---

## Content schedule (parallel workstream)

| Day | Status |
|---|---|
| Day 1 | pending (missed — no code existed) |
| Day 4 | **video shot today (2026-06-03)** — post to X |
| Day 7 | upcoming |
| Day 10 | upcoming |
| Day 13 | demo recording |
| Day 14 | final blitz |

Tag: @Mantle_Official @Byreal_io @doraHacks @BybitOfficial
Hook for Day 4: *"Every AI bot says it's profitable. Mine has to prove it on-chain."*

---

## 20-Project Deployment Award checklist (must hit by Day 14)

- [ ] Contracts deployed + verified on Mantle Explorer
- [ ] At least one AI-powered function callable on-chain (`ExecutionEngine.submitAction` triggered by Claude agent)
- [ ] Frontend publicly accessible (Vercel deploy)
- [ ] Demo video ≥2 min (targeting 4 min)
- [ ] Open-source GitHub repo with README + deployed addresses
- [ ] DoraHacks submission with contract addresses

---

## What's next (Day 9)

**JS Agent SDK** — a thin TypeScript package so developers can register, sign, and submit actions in ~30 LOC.

Architecture:
- Uses **Mantle Client SDK** (not generic viem) for contract interaction — Mantle ecosystem integration
- EIP-712 signer wrapping ExecutionEngine's ACTION_TYPEHASH
- Functions: `registerAgent(signer, strategyHash)`, `signAction(action)`, `submitAction(action)`
- Ships as `packages/sdk/` in this repo
- Node.js + browser compatible (ESM)

Needs deployed contract addresses → can be wired post-deploy via env vars or config file.

---

## Useful one-liners

```bash
forge test                         # run all 118 tests
forge test -vvv                    # verbose with traces
forge test --match-contract X      # single suite
forge build --sizes                # check contract sizes
forge fmt                          # format (CI checks this)
forge script script/Deploy.s.sol --dry-run   # simulate deploy
```
