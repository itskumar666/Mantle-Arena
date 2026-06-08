#!/bin/bash
set -e
source "$(dirname "$0")/.env"

CHALLENGE=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
RPC=https://rpc.sepolia.mantle.xyz
CHALLENGE_ID=5

echo "Entering agents 1, 2 into Challenge #$CHALLENGE_ID..."

cast send $CHALLENGE "enterAgent(uint256,uint256)" $CHALLENGE_ID 1 \
  --rpc-url $RPC --private-key $PRIVATE_KEY
echo "Agent 1 entered"

cast send $CHALLENGE "enterAgent(uint256,uint256)" $CHALLENGE_ID 2 \
  --rpc-url $RPC --private-key $PRIVATE_KEY
echo "Agent 2 entered"

echo "Done — 2 agents in Challenge #$CHALLENGE_ID"
