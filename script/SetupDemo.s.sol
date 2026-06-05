// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ExecutionEngine} from "../src/ExecutionEngine.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {DemoOracle} from "../src/oracle/DemoOracle.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";

/// @notice One-shot demo setup:
///   1. Deploy DemoOracle + seed prices (mETH, USDY, MNT)
///   2. Wire DemoOracle into the live ExecutionEngine
///   3. Create Challenge #1 (1h enrollment, 24h live, $10k starting balance)
///   4. Register 3 reference agents (momentum, meanReversion, claude)
///   5. Enter all 3 into Challenge #1
///
/// Run:
///   source .env && forge script script/SetupDemo.s.sol:SetupDemoScript \
///     --rpc-url https://rpc.sepolia.mantle.xyz \
///     --private-key $PRIVATE_KEY \
///     --broadcast
contract SetupDemoScript is Script {
    // ── Already-deployed contracts (Mantle Sepolia)
    address constant REGISTRY       = 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd;
    address constant CHALLENGE_ADDR = 0x943bef0f81B47D1ABA4B2eFa05624e041595706D;
    address constant ENGINE         = 0x27DAE5cA1b42918F13B7b454A76E5D3Bbcc6989b;

    // ── Demo asset addresses (Mantle Sepolia — use canonical token addrs when available)
    // These are placeholder addresses used as identifiers inside the paper-trading engine.
    // Replace with real token addresses once confirmed on Mantle Sepolia.
    address constant METH  = 0x0000000000000000000000000000000000000001;
    address constant USDY  = 0x0000000000000000000000000000000000000002;
    address constant MNT   = 0x0000000000000000000000000000000000000003;

    // ── Demo agent signing keys (public addresses only — private keys stay in agent .env)
    // Replace with the actual vm.addr() outputs from your 3 agent wallets.
    address constant MOMENTUM_SIGNER    = 0x1111111111111111111111111111111111111111;
    address constant REVERSION_SIGNER   = 0x2222222222222222222222222222222222222222;
    address constant CLAUDE_SIGNER      = 0x3333333333333333333333333333333333333333;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy DemoOracle and set initial prices
        DemoOracle oracle = new DemoOracle(deployer);

        address[] memory assets = new address[](3);
        uint256[] memory prices = new uint256[](3);
        assets[0] = METH;  prices[0] = 3800e18; // mETH  ~$3800
        assets[1] = USDY;  prices[1] = 1e18;    // USDY  ~$1
        assets[2] = MNT;   prices[2] = 1.2e18;  // MNT   ~$1.20
        oracle.setPriceBatch(assets, prices);

        console2.log("DemoOracle deployed:", address(oracle));

        // ── 2. Wire DemoOracle into ExecutionEngine
        ExecutionEngine(ENGINE).setPriceOracle(IPriceOracle(address(oracle)));
        console2.log("ExecutionEngine oracle updated to DemoOracle");

        // ── 3. Create Challenge #1
        uint64 startTime = uint64(block.timestamp + 1 hours);
        uint64 endTime   = uint64(block.timestamp + 25 hours);
        uint128 startingBalance = 10_000e18; // $10,000 virtual USDC
        uint128 entryFee = 0;
        uint128 settleBounty = 0;

        address[] memory challengeAssets = new address[](3);
        challengeAssets[0] = METH;
        challengeAssets[1] = USDY;
        challengeAssets[2] = MNT;

        uint256 challengeId = Challenge(CHALLENGE_ADDR).createChallenge(
            startTime, endTime, startingBalance, entryFee, settleBounty, challengeAssets
        );
        console2.log("Challenge created, id:", challengeId);
        console2.log("  Start:", startTime, " End:", endTime);

        // ── 4. Register 3 reference agents
        uint256 agentMomentum   = AgentRegistry(REGISTRY).registerAgent(
            MOMENTUM_SIGNER, keccak256("momentum-ema20-v1"), "ipfs://momentum-strategy"
        );
        uint256 agentReversion  = AgentRegistry(REGISTRY).registerAgent(
            REVERSION_SIGNER, keccak256("mean-reversion-ema20-v1"), "ipfs://mean-reversion-strategy"
        );
        uint256 agentClaude     = AgentRegistry(REGISTRY).registerAgent(
            CLAUDE_SIGNER, keccak256("claude-sonnet-4-6-v1"), "ipfs://claude-strategy"
        );
        console2.log("Agents registered:", agentMomentum, agentReversion, agentClaude);

        // ── 5. Enter all 3 into Challenge #1
        Challenge(CHALLENGE_ADDR).enterAgent(challengeId, agentMomentum);
        Challenge(CHALLENGE_ADDR).enterAgent(challengeId, agentReversion);
        Challenge(CHALLENGE_ADDR).enterAgent(challengeId, agentClaude);
        console2.log("All 3 agents entered Challenge #1");

        vm.stopBroadcast();

        console2.log("=== Demo setup complete ===");
        console2.log("DemoOracle:  ", address(oracle));
        console2.log("Challenge ID:", challengeId);
        console2.log("Agent IDs:   ", agentMomentum, agentReversion, agentClaude);
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update packages/agents/.env with AGENT_ID and CHALLENGE_ID");
        console2.log("  2. Wait for startTime, then run: npm run momentum / meanreversion / claude");
        console2.log("  3. Demo: watch live leaderboard reshuffle at /challenges/1");
    }
}
