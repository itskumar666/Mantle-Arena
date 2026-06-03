#!/usr/bin/env bash
# Verifies all 7 Agent-Marena contracts on Mantle Sepolia Explorer (Blockscout).
# Run from the Agent-Marena/ directory: bash script/verify.sh

set -e

CHAIN=5003
VERIFIER_URL="https://explorer.sepolia.mantle.xyz/api?"
DEPLOYER=0x666AA4F5a674b9E50d8843F45a6Ef40244318550

REGISTRY=0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd
CHALLENGE=0x943bef0f81B47D1ABA4B2eFa05624e041595706D
ORACLE=0x679A658D91c9CADeF966d631C08B5c1feB72B536
ENGINE=0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b
LEADERBOARD=0xB050caC3607c4c2818A5b3E2E9B231842766D771
REPUTATION=0x39eD9F8a8BCAC2dB3473D351f6a21B35e7C9487C
STAKEVAULT=0xB9a1527b97400511bE583405B72a10F2DB9BB611

COMMON="--verifier blockscout --verifier-url $VERIFIER_URL --chain $CHAIN --via-ir --compiler-version 0.8.28 --optimizer-runs 200"

echo "=== 1/7 AgentRegistry ==="
ARGS=$(cast abi-encode "constructor(address)" $DEPLOYER)
forge verify-contract $REGISTRY src/AgentRegistry.sol:AgentRegistry \
  $COMMON --constructor-args $ARGS

echo "=== 2/7 Challenge ==="
ARGS=$(cast abi-encode "constructor(address,address,address)" $REGISTRY $DEPLOYER $DEPLOYER)
forge verify-contract $CHALLENGE src/Challenge.sol:Challenge \
  $COMMON --constructor-args $ARGS

echo "=== 3/7 Api3PriceOracle ==="
ARGS=$(cast abi-encode "constructor(address,uint32)" $DEPLOYER 3600)
forge verify-contract $ORACLE src/oracle/Api3PriceOracle.sol:Api3PriceOracle \
  $COMMON --constructor-args $ARGS

echo "=== 4/7 ExecutionEngine ==="
ARGS=$(cast abi-encode "constructor(address,address,address,address)" $REGISTRY $CHALLENGE $ORACLE $DEPLOYER)
forge verify-contract $ENGINE src/ExecutionEngine.sol:ExecutionEngine \
  $COMMON --constructor-args $ARGS

echo "=== 5/7 Leaderboard ==="
ARGS=$(cast abi-encode "constructor(address,address)" $CHALLENGE $ENGINE)
forge verify-contract $LEADERBOARD src/Leaderboard.sol:Leaderboard \
  $COMMON --constructor-args $ARGS

echo "=== 6/7 Reputation ==="
ARGS=$(cast abi-encode "constructor(address)" $LEADERBOARD)
forge verify-contract $REPUTATION src/Reputation.sol:Reputation \
  $COMMON --constructor-args $ARGS

echo "=== 7/7 StakeVault ==="
ARGS=$(cast abi-encode "constructor(address,address,address,address,address)" $REGISTRY $CHALLENGE $LEADERBOARD $DEPLOYER $DEPLOYER)
forge verify-contract $STAKEVAULT src/StakeVault.sol:StakeVault \
  $COMMON --constructor-args $ARGS

echo ""
echo "All verifications submitted."
echo "Check status at: https://explorer.sepolia.mantle.xyz"
