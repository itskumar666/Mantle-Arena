# Agent Arena — Submission Package

Everything you need to submit, demo, and promote. Turing Test Hackathon 2026.

---

## 1. DoraHacks submission copy

**Tagline:**
> The on-chain coliseum where AI trading agents prove they're profitable — and anyone can build one in 30 seconds.

**Short description (≤280 chars):**
> Agent Arena is the Mantle protocol where AI trading agents register an ERC-8004 identity, compete in verifiable on-chain challenges, and earn permanent trophies. Plus a no-code sandbox: describe a bot in plain English, watch it battle AIs, mint it on-chain.

**Full description:**

> Every AI trading bot claims it's profitable. None can prove it — backtests are cherry-picked, screenshots are faked, "verified PnL" isn't a primitive anyone owns. **Agent Arena fixes that.**
>
> It's an on-chain protocol on Mantle (8 smart contracts, 118 passing tests with fuzzing) where AI agents:
> - register an **ERC-8004 identity NFT** (the hackathon's flagship standard, used as our core reputation primitive),
> - compete in standardized paper-trading challenges priced by **API3 oracles** over Mantle ecosystem assets (mETH, USDY, fBTC, MNT),
> - execute via **EIP-712 signed actions** — agents trade gas-free, every trade verifiable on-chain,
> - accumulate **on-chain reputation** and mint **fully on-chain SVG trophy NFTs** when profitable,
> - and get **backed by humans** who stake MNT in a 70/20/10 prediction-market vault.
>
> We're not building one agent. **We're building the arena every agent proves itself in** — every other trading-bot submission is a potential user of this protocol.
>
> **And we made it consumer-grade.** The `/sandbox` lets anyone build a bot with no code and no wallet: describe a strategy in plain English ("buy mETH when it dips 3%, sell when it pumps 2%") and Claude compiles it into a real trading bot, which then battles our reference AIs on the same market. You get a verdict, a one-click tweet, and a "Make it real" button that mints your bot a real ERC-8004 identity on Mantle — gaslessly. Play instantly off-chain; go on-chain when you're hooked.

**Links to include:**
- Live demo: `https://<your-vercel>.vercel.app` (and `/sandbox`)
- GitHub: `https://github.com/<you>/Agent-Marena`
- Demo video: `<youtube/loom link>`
- All contract addresses: see README "Deployed Addresses" (copy that table in verbatim)

**Tracks to nominate:**
- AI Trading & Strategy (primary)
- Consumer & Viral DApps (the sandbox *is* the "gamified trading UI, highly shareable consumer app" brief)
- Agentic Wallets & Economy / AI Alpha & Data (infra fit)
- Best UI/UX · Community Voting · Grand Champion · 20-Project Deployment (cross-eligible)

---

## 2. Demo video script (4:00 — rehearse 5×)

> Record at `/sandbox` first (the hook), then the protocol. Have the dev server warm and `ANTHROPIC_API_KEY` + `RELAYER_PRIVATE_KEY` set.

**0:00–0:25 — Hook**
> "Every AI bot in this hackathon says it's profitable. None of them can prove it. So I built the thing that forces them to — and made it so anyone can play."
> On screen: the home page hero, then click "Build a Bot in 30 Seconds".

**0:25–1:15 — The plain-English bot (the wow)**
> "I'm going to build a trading bot by typing one sentence." Type: *"Buy mETH when it drops more than 3% below its average, and sell when it pumps 2% above. Go big on the dips."*
> Click **Enter the Arena.** "Claude just compiled that English into a real trading strategy."
> Results animate in: rank, PnL, the equity chart with your purple line vs the house bots.
> "Same market, same rules for every bot — a fair fight, exactly like an on-chain challenge."

**1:15–1:45 — The viral loop**
> "Now the part that matters for a hackathon." Click **Tweet my result** — show the pre-filled tweet tagging @Mantle_Official @doraHacks with the link.
> "Every person who builds a bot recruits the next one."

**1:45–2:30 — Make it real (the bridge to infra)**
> Click **⛓️ Make it real.** "No wallet, no gas — but this is real." Wait for the green confirmation.
> Click **View identity NFT →**, land on **Mantle Explorer** showing the freshly minted ERC-8004 NFT.
> "That bot now has a real on-chain identity in the same protocol the reference agents compete in."

**2:30–3:30 — The protocol underneath**
> "Here's what's underneath." Quick tour: Challenges page, the live leaderboard, an agent profile with reputation.
> "8 contracts on Mantle: ERC-8004 identity, EIP-712 signed gas-free trades, API3 oracle pricing, a prediction-market stake vault, and fully on-chain SVG trophy NFTs. 118 tests, fuzzed."
> Show one contract verified on Mantle Explorer.

**3:30–4:00 — The pitch**
> "Most submissions are one more trading bot. Agent Arena is the arena they all prove themselves in — and a consumer app that turns anyone into an agent author in 30 seconds. We're not building an agent. We're building the rails. Live on Mantle. Link below."

**Fallback:** pre-record the on-chain mint segment in case RPC is slow live. Keep a compressed-time recording ready.

---

## 3. Submission checklist (20-Project Deployment Award floor)

- [ ] Frontend deployed to Vercel, publicly accessible (incl. `/sandbox`)
- [ ] `ANTHROPIC_API_KEY` + `RELAYER_PRIVATE_KEY` set in Vercel env
- [ ] All 8 contracts verified on Mantle Explorer (commands in CLAUDE.md)
- [ ] AI-powered on-chain function demonstrated (`/api/promote-bot` mints via owner; agents call `submitAction`)
- [ ] GitHub public with README + SANDBOX.md + deployed addresses
- [ ] Demo video ≥2 min uploaded (targeting 4)
- [ ] DoraHacks submission with addresses + Vercel URL + repo + video
- [ ] At least 1 build-in-public tweet posted before judging

---

## 4. Content blitz — copy/paste tweets

Post 1 launch tweet + the thread on submission day; space the rest across judging week. Replace `<link>`.

**Launch:**
> Agent Arena is live on @Mantle_Official 🏟️
>
> Build an AI trading bot by typing ONE sentence. Watch it battle other AIs on-chain. Mint it as a real ERC-8004 NFT — no wallet, no code.
>
> Every bot claims it's profitable. Here they prove it.
>
> <link>/sandbox @doraHacks

**The hook:**
> I typed "buy mETH when it dips 3%, sell when it pumps 2%" into a text box.
>
> An AI compiled it into a real trading bot. It battled 2 other AIs on a live market. I got a verdict in 10 seconds.
>
> Then I minted it on-chain with no wallet. Try it 👇 <link>/sandbox

**Builder thread (5 tweets):**
> 1/ I spent the @Mantle_Official hackathon building Agent Arena: the on-chain coliseum where AI trading agents prove they're profitable. 8 contracts, 118 tests, solo. And a no-code sandbox anyone can play. 🧵
>
> 2/ The problem: every AI bot claims it makes money. Backtests lie, screenshots lie. "Verified PnL" isn't a primitive. ERC-8004 gives agents an identity — but identity with no track record is empty.
>
> 3/ Agent Arena generates the track record. Agents register an ERC-8004 NFT, compete in challenges priced by API3 oracles on mETH/USDY/MNT, trade via EIP-712 signed actions (gas-free), and mint on-chain trophies when profitable.
>
> 4/ Then I made it consumer-grade. Describe a bot in plain English → Claude compiles it → it battles my reference AIs on the same market → you get a result card + a one-click tweet. No code, no wallet.
>
> 5/ The kicker: hit "Make it real" and your sandbox bot gets a real ERC-8004 identity minted on Mantle, gaslessly. Play off-chain, go on-chain when you're hooked. Every trading-bot submission could be a user of this. <link>

**Engagement poll:**
> In a fair on-chain trading arena over 30 days, who wins?
> 🚀 Momentum
> 🩸 Dip buyer
> ⚡ Breakout
> 🎲 Pure luck
>
> Build yours and find out 👇 <link>/sandbox

> Tag strategy: @Mantle_Official @Byreal_io @doraHacks @BybitOfficial + judges' handles when visible.
