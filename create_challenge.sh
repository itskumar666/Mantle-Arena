#!/bin/bash
set -e
source "$(dirname "$0")/.env"

CHALLENGE_ADDR=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
RPC=https://rpc.sepolia.mantle.xyz

START=$(( $(date +%s) + 600 ))    # 10 min enrollment window
END=$(( $(date +%s) + 86400 ))    # ends 24hr from now

echo "Creating new challenge..."
echo "Enrollment open for 10 minutes, then Live for 24 hours"

cast send $CHALLENGE_ADDR \
  "createChallenge(uint64,uint64,uint128,uint128,uint128,address[])" \
  $START $END \
  10000000000000000000000 0 0 \
  "[0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000003,0x0000000000000000000000000000000000000004]" \
  --rpc-url $RPC --private-key $PRIVATE_KEY

echo "Challenge created — you have 10 minutes to run enter_agents.sh"
echo "Update enter_agents.sh: set CHALLENGE_ID to the new challenge number (probably 5)"
