#!/bin/bash
# Wire all API3 proxy addresses into the deployed Api3PriceOracle,
# then switch ExecutionEngine from MockOracle → Api3PriceOracle.
set -e
source "$(dirname "$0")/.env"

RPC=https://rpc.sepolia.mantle.xyz
API3_ORACLE=0x679A658D91c9CADeF966d631C08B5c1feB72B536
ENGINE=0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b

echo "Wiring API3 proxy addresses into Api3PriceOracle..."

# Helper: setProxy + wait
set_proxy() {
  local ASSET=$1 PROXY=$2 NAME=$3
  echo "  $NAME: asset=$ASSET → proxy=$PROXY"
  cast send $API3_ORACLE "setProxy(address,address)" $ASSET $PROXY \
    --rpc-url $RPC --private-key $PRIVATE_KEY > /dev/null
  sleep 6
}

# ── Existing assets (keep same internal addresses used in challenges)
set_proxy 0x0000000000000000000000000000000000000001 0xECd2Dd0067832675a705FF9dcD2CB722Bce78213 "mETH  (ETH/USD)"
set_proxy 0x0000000000000000000000000000000000000002 0xd48e2213f1407216Fd4277D3019267a80bD547EA "USDY  (USDC/USD)"
set_proxy 0x0000000000000000000000000000000000000003 0x8f27d271E478fbE9114ba1605bf4bf264b9F450a "MNT   (MNT/USD)"
set_proxy 0x0000000000000000000000000000000000000004 0x86f49FB6A5A0164FC445B3e0c4D020e7CC9Ac85B "fBTC  (BTC/USD)"

# ── New assets
set_proxy 0x0000000000000000000000000000000000000005 0x26FAf1dC0E8e68f47151b3FbcB5a3d33d077236e "SOL   (SOL/USD)"
set_proxy 0x0000000000000000000000000000000000000006 0xCf31E6d732f7823A6289927e2Ad2fb1BcfD42CbC "USDT  (USDT/USD)"
set_proxy 0x0000000000000000000000000000000000000007 0xe1B7DF400F7F94BF0362B85AC25cc22D6bcAb9EE "BNB   (BNB/USD)"
set_proxy 0x0000000000000000000000000000000000000008 0xae8cDcA1eb77DAdcA62f13ceFe5df779Cd78A892 "AAVE  (AAVE/USD)"
set_proxy 0x0000000000000000000000000000000000000009 0x34B53FCD2267c9c24756B17BD3EcE4a9cb6EA367 "AUSD  (AUSD/USD)"

echo ""
echo "Switching ExecutionEngine → Api3PriceOracle..."
cast send $ENGINE "setPriceOracle(address)" $API3_ORACLE \
  --rpc-url $RPC --private-key $PRIVATE_KEY
sleep 6

echo ""
echo "Verifying oracle switch..."
NEW_ORACLE=$(cast call $ENGINE "priceOracle()(address)" --rpc-url $RPC)
echo "  ExecutionEngine.priceOracle = $NEW_ORACLE"
if [ "$NEW_ORACLE" = "$API3_ORACLE" ]; then
  echo "  SUCCESS — live API3 prices active"
else
  echo "  MISMATCH — expected $API3_ORACLE"
fi
