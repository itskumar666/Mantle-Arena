#!/bin/bash
# Full demo: create challenge → enter AI agent → run price simulator + AI agent in parallel
set -e
source "$(dirname "$0")/.env"

RPC=https://rpc.sepolia.mantle.xyz
CHALLENGE_ADDR=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
AGENTS_DIR="$(dirname "$0")/packages/agents"

# ── Step 1: Get next challenge ID
echo "Fetching challenge count..."
NEXT_ID=$(cast call $CHALLENGE_ADDR "nextChallengeId()(uint256)" --rpc-url $RPC)
echo "New challenge will be #$NEXT_ID"

START=$(( $(date +%s) + 180 ))   # 3 min enrollment
END=$(( $(date +%s) + 480 ))     # 5 min trading (ends 8 min from now)

# ── Step 2: Create challenge with all 9 assets
echo ""
echo "Creating Challenge #$NEXT_ID  (3 min enrollment + 5 min trading)..."
echo "Assets: mETH · fBTC · MNT · SOL · BNB · AAVE · USDY · USDT · AUSD"
cast send $CHALLENGE_ADDR \
  "createChallenge(uint64,uint64,uint128,uint128,uint128,address[])" \
  $START $END 10000000000000000000000 0 0 \
  "[0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000004,0x0000000000000000000000000000000000000003,0x0000000000000000000000000000000000000005,0x0000000000000000000000000000000000000007,0x0000000000000000000000000000000000000008]" \
  --rpc-url $RPC --private-key $PRIVATE_KEY
sleep 6
echo "Challenge #$NEXT_ID created."

# ── Step 3: Enter agents 1 and 2
echo ""
echo "Entering Agent 1..."
cast send $CHALLENGE_ADDR "enterAgent(uint256,uint256)" $NEXT_ID 1 \
  --rpc-url $RPC --private-key $PRIVATE_KEY
sleep 6
echo "Agent 1 entered."

echo "Entering Agent 2..."
cast send $CHALLENGE_ADDR "enterAgent(uint256,uint256)" $NEXT_ID 2 \
  --rpc-url $RPC --private-key $PRIVATE_KEY
sleep 6
echo "Agent 2 entered."

# ── Step 4: Wait for challenge to go live
NOW=$(date +%s)
WAIT=$(( START - NOW + 3 ))
if [ $WAIT -gt 0 ]; then
  echo ""
  echo "Waiting ${WAIT}s for challenge to go live..."
  for i in $(seq $WAIT -1 1); do
    printf "\r  Live in ${i}s...   "
    sleep 1
  done
  echo ""
fi

echo ""
echo "Challenge #$NEXT_ID is LIVE"
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  Open TWO more terminal tabs and run:                    │"
echo "│                                                          │"
echo "│  Tab 2 — Price Simulator (GBM market model):             │"
echo "│    cd packages/agents && CHALLENGE_ID=$NEXT_ID npm run price-sim │"
echo "│                                                          │"
echo "│  Tab 3 — AI Agent (OpenRouter / Llama 70B):              │"
echo "│    cd packages/agents && cp .env.claude .env             │"
echo "│    # add OPENROUTER_API_KEY=sk-or-... to .env.claude     │"
echo "│    CHALLENGE_ID=$NEXT_ID AGENT_ID=1 npm run claude              │"
echo "│                                                          │"
echo "│  Tab 4 (optional) — Momentum Agent:                      │"
echo "│    cd packages/agents && cp .env.momentum .env           │"
echo "│    CHALLENGE_ID=$NEXT_ID AGENT_ID=2 npm run momentum            │"
echo "│                                                          │"
echo "│  Challenge ends at: $(date -v+${END}S 2>/dev/null || date -d @$END 2>/dev/null || echo 'see above') │"
echo "│  Then settle on the frontend to see the winner.          │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""
echo "Challenge #$NEXT_ID is live. Run the agents above, then settle when it ends."
