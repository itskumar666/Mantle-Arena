#!/bin/bash
# Full demo: register up to 5 agents → create challenge → enter all → run instructions
# Run from the Agent-Marena directory: ./run_demo.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.env"

RPC=https://rpc.sepolia.mantle.xyz
CHALLENGE_ADDR=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
REGISTRY_ADDR=0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd
AGENTS_DIR="$SCRIPT_DIR/packages/agents"
TARGET_AGENTS=5

send() {
  local DESC=$1; shift
  echo "  → $DESC"
  cast send "$@" --rpc-url $RPC --private-key $PRIVATE_KEY > /dev/null
  sleep 7
}

# ── Step 1: Check and register missing agents
echo "=== Step 1: Checking registered agents ==="
TOTAL=$(cast call $REGISTRY_ADDR "totalAgents()(uint256)" --rpc-url $RPC)
echo "  Currently registered: $TOTAL agents"

while [ "$TOTAL" -lt "$TARGET_AGENTS" ]; do
  NEXT=$(( TOTAL + 1 ))
  echo ""
  echo "  Registering Agent #$NEXT..."
  # Generate a fresh signing key
  KEY_OUTPUT=$(cast wallet new 2>&1)
  SIGN_ADDR=$(echo "$KEY_OUTPUT" | grep "Address:" | awk '{print $2}')
  SIGN_KEY=$(echo "$KEY_OUTPUT"  | grep "Private key:" | awk '{print $3}')

  # strategyHash = keccak256("agent-auto-$NEXT")
  STRATEGY=$(cast keccak "agent-auto-$NEXT")

  send "Register Agent #$NEXT (signingKey=$SIGN_ADDR)" \
    $REGISTRY_ADDR "registerAgent(address,bytes32,string)" \
    $SIGN_ADDR $STRATEGY "Agent #$NEXT — auto-registered"

  echo "  ✓ Agent #$NEXT registered"
  echo "    Signing address: $SIGN_ADDR"
  echo "    Private key:     $SIGN_KEY  ← save this!"
  TOTAL=$NEXT
done

echo ""
echo "✓ All $TARGET_AGENTS agents registered."

# ── Step 2: Create challenge
echo ""
echo "=== Step 2: Create Challenge ==="
NEXT_ID=$(cast call $CHALLENGE_ADDR "nextChallengeId()(uint256)" --rpc-url $RPC)
echo "  New challenge will be #$NEXT_ID"

START=$(( $(date +%s) + 240 ))   # 4 min enrollment (enough to enter 5 agents)
END=$(( $(date +%s) + 540 ))     # 5 min trading window after enrollment

echo "  Enrollment: 4 min  |  Trading: 5 min"

send "Create Challenge #$NEXT_ID" \
  $CHALLENGE_ADDR \
  "createChallenge(uint64,uint64,uint128,uint128,uint128,address[])" \
  $START $END 10000000000000000000000 0 0 \
  "[0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000004,0x0000000000000000000000000000000000000003,0x0000000000000000000000000000000000000005,0x0000000000000000000000000000000000000007,0x0000000000000000000000000000000000000008]"

echo "  ✓ Challenge #$NEXT_ID created"

# ── Step 3: Enter all 5 agents
echo ""
echo "=== Step 3: Entering Agents 1–$TARGET_AGENTS ==="
for i in $(seq 1 $TARGET_AGENTS); do
  send "Enter Agent $i" \
    $CHALLENGE_ADDR "enterAgent(uint256,uint256)" $NEXT_ID $i
  echo "  ✓ Agent $i entered"
done

# ── Step 4: Wait for live
echo ""
echo "=== Step 4: Waiting for challenge to go live ==="
NOW=$(date +%s)
WAIT=$(( START - NOW + 3 ))
if [ $WAIT -gt 0 ]; then
  echo "  Waiting ${WAIT}s..."
  for i in $(seq $WAIT -1 1); do
    printf "\r  Live in ${i}s...   "
    sleep 1
  done
  echo ""
fi

LIVE_UNTIL=$(date -r $END "+%H:%M:%S" 2>/dev/null || date -d @$END "+%H:%M:%S" 2>/dev/null || echo "see above")

# ── Step 5: Instructions
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Challenge #$NEXT_ID is LIVE — trading ends at $LIVE_UNTIL       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Open 6 terminal tabs from the Agent-Marena directory:       ║"
echo "║                                                              ║"
echo "║  Tab 1 — GBM Price Simulator (keep running):                ║"
echo "║    cd packages/agents                                        ║"
echo "║    npm run price-sim                                         ║"
echo "║                                                              ║"
echo "║  Tab 2 — AI Agent (OpenRouter, Agent #1):                   ║"
echo "║    cd packages/agents                                        ║"
echo "║    CHALLENGE_ID=$NEXT_ID AGENT_ID=1 AGENT_SIGNING_KEY=\$KEY npm run claude  ║"
echo "║                                                              ║"
echo "║  Tab 3 — Momentum Agent (Agent #2):                         ║"
echo "║    cd packages/agents                                        ║"
echo "║    CHALLENGE_ID=$NEXT_ID AGENT_ID=2 npm run momentum                  ║"
echo "║                                                              ║"
echo "║  Tab 4 — Mean Reversion Agent (Agent #3):                   ║"
echo "║    cd packages/agents                                        ║"
echo "║    CHALLENGE_ID=$NEXT_ID AGENT_ID=3 npm run meanreversion            ║"
echo "║                                                              ║"
echo "║  Tab 5 — Momentum Agent v2 (Agent #4):                      ║"
echo "║    cd packages/agents                                        ║"
echo "║    CHALLENGE_ID=$NEXT_ID AGENT_ID=4 npm run momentum                  ║"
echo "║                                                              ║"
echo "║  Tab 6 — Mean Reversion Agent v2 (Agent #5):                ║"
echo "║    cd packages/agents                                        ║"
echo "║    CHALLENGE_ID=$NEXT_ID AGENT_ID=5 npm run meanreversion            ║"
echo "║                                                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  After trading ends: go to frontend → Settle → Claim Trophy  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
