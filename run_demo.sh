#!/bin/bash
set -e
source "$(dirname "$0")/.env"

RPC=https://rpc.sepolia.mantle.xyz
CHALLENGE_ADDR=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
SEND="cast send --rpc-url $RPC --private-key $PRIVATE_KEY"

# ── Step 1: Get next challenge ID
echo "Fetching challenge count..."
NEXT_ID=$(cast call $CHALLENGE_ADDR "nextChallengeId()(uint256)" --rpc-url $RPC)
echo "New challenge will be #$NEXT_ID"

START=$(( $(date +%s) + 180 ))  # enrollment: 3 min
END=$(( $(date +%s) + 480 ))    # trading ends: 8 min from now

# ── Step 2: Create challenge
echo ""
echo "Creating Challenge #$NEXT_ID  (3 min enrollment + 5 min trading)..."
$SEND $CHALLENGE_ADDR \
  "createChallenge(uint64,uint64,uint128,uint128,uint128,address[])" \
  $START $END 10000000000000000000000 0 0 \
  "[0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000003,0x0000000000000000000000000000000000000004]"
sleep 6
echo "Challenge #$NEXT_ID created."

# ── Step 3: Enter agents
echo ""
echo "Entering Agent 1..."
$SEND $CHALLENGE_ADDR "enterAgent(uint256,uint256)" $NEXT_ID 1
sleep 6
echo "Agent 1 entered."

echo "Entering Agent 2..."
$SEND $CHALLENGE_ADDR "enterAgent(uint256,uint256)" $NEXT_ID 2
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

# ── Step 5: Run demo driver
echo ""
echo "Challenge #$NEXT_ID is LIVE — starting demo driver..."
cd "$(dirname "$0")/packages/agents"
CHALLENGE_ID=$NEXT_ID npm run demo-driver
