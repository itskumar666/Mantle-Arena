// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {ExecutionEngine} from "../src/ExecutionEngine.sol";
import {Leaderboard} from "../src/Leaderboard.sol";
import {Reputation} from "../src/Reputation.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ReputationTest is Test {
    AgentRegistry internal registry;
    Challenge internal challenge;
    ExecutionEngine internal engine;
    MockPriceOracle internal oracle;
    Leaderboard internal leaderboard;
    Reputation internal reputation;

    address internal admin = address(0xA11CE);
    address internal devAlice = address(0xA1);
    address internal devBob = address(0xB0B);

    uint256 internal aliceKey = uint256(keccak256("alice"));
    uint256 internal bobKey = uint256(keccak256("bob"));

    uint256 internal agentAlice;
    uint256 internal agentBob;

    address internal mETH = address(0xE7);
    uint128 internal constant STARTING_BALANCE = 10_000e18;

    function setUp() public {
        vm.warp(1_750_000_000);
        registry = new AgentRegistry(admin);
        challenge = new Challenge(IERC721(address(registry)), admin, admin);
        oracle = new MockPriceOracle();
        engine = new ExecutionEngine(registry, challenge, oracle, admin);
        leaderboard = new Leaderboard(challenge, engine);
        reputation = new Reputation(leaderboard);

        oracle.setPrice(mETH, 1000e18);

        vm.prank(devAlice);
        agentAlice = registry.registerAgent(vm.addr(aliceKey), keccak256("alice-strat"), "");
        vm.prank(devBob);
        agentBob = registry.registerAgent(vm.addr(bobKey), keccak256("bob-strat"), "");
    }

    // ---------- helpers ----------

    function _sign(uint256 pk, ExecutionEngine.Action memory a) internal view returns (bytes memory) {
        bytes32 digest = engine.hashAction(a);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _buy(uint256 cid, uint256 agentId, uint256 pk, uint128 size, uint64 nonce) internal {
        ExecutionEngine.Action memory a = ExecutionEngine.Action({
            challengeId: cid,
            agentId: agentId,
            kind: uint8(ExecutionEngine.ActionKind.Buy),
            asset: mETH,
            size: size,
            nonce: nonce,
            deadline: uint64(block.timestamp + 1 hours)
        });
        engine.submitAction(a, _sign(pk, a));
    }

    function _runChallenge(uint128 aliceBuySize, uint128 bobBuySize, uint256 finalPrice) internal returns (uint256) {
        address[] memory assets = new address[](1);
        assets[0] = mETH;
        uint64 start = uint64(block.timestamp) + 1 hours;
        uint64 end = start + 1 hours;
        vm.prank(admin);
        uint256 cid = challenge.createChallenge(start, end, STARTING_BALANCE, 0, 0, assets);

        vm.prank(devAlice);
        challenge.enterAgent(cid, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent(cid, agentBob);

        vm.warp(start + 1);
        // Each agent's first action in this challenge uses nonce 0 (per-challenge counter).
        if (aliceBuySize > 0) _buy(cid, agentAlice, aliceKey, aliceBuySize, 0);
        if (bobBuySize > 0) _buy(cid, agentBob, bobKey, bobBuySize, 0);

        oracle.setPrice(mETH, finalPrice);
        vm.warp(end + 1);
        leaderboard.settle(cid);
        return cid;
    }

    // ---------- tests ----------

    function test_reputationOf_noHistoryReturnsZeros() public view {
        Reputation.ReputationScore memory s = reputation.reputationOf(agentAlice);
        assertEq(s.totalChallenges, 0);
        assertEq(s.wins, 0);
        assertEq(s.cumulativePnL, 0);
        assertEq(s.averageFinalValue, 0);
    }

    function test_reputationOf_singleWin() public {
        // Alice buys 2 mETH @1000, Bob buys 1 mETH @1000. Price pumps to 1500.
        // Alice final = 8000 + 2*1500 = 11000. Bob = 9000 + 1500 = 10500. Alice wins.
        _runChallenge(2000e18, 1000e18, 1500e18);

        Reputation.ReputationScore memory s = reputation.reputationOf(agentAlice);
        assertEq(s.totalChallenges, 1);
        assertEq(s.wins, 1);
        assertEq(s.cumulativePnL, int256(1000e18));
        assertEq(s.averageFinalValue, 11000e18);
    }

    function test_reputationOf_singleLoss() public {
        // Alice buys 2 mETH @1000, Bob buys nothing. Crash to 500.
        // Alice final = 8000 + 2*500 = 9000 (PnL -1000). Bob = 10000 (PnL 0). Bob wins.
        _runChallenge(2000e18, 0, 500e18);

        Reputation.ReputationScore memory s = reputation.reputationOf(agentAlice);
        assertEq(s.totalChallenges, 1);
        assertEq(s.wins, 0);
        assertEq(s.cumulativePnL, -int256(1000e18));
        assertEq(s.averageFinalValue, 9000e18);
    }

    function test_reputationOf_aggregatesMultipleChallenges() public {
        // Challenge 1: Alice wins. PnL +1000, final 11000.
        _runChallenge(2000e18, 1000e18, 1500e18);
        // Reset price for the next challenge setup.
        oracle.setPrice(mETH, 1000e18);
        // Challenge 2: Alice loses. PnL -1000, final 9000.
        _runChallenge(2000e18, 0, 500e18);
        oracle.setPrice(mETH, 1000e18);
        // Challenge 3: Alice wins again. PnL +500, final 10500.
        _runChallenge(1000e18, 500e18, 1500e18);

        Reputation.ReputationScore memory s = reputation.reputationOf(agentAlice);
        assertEq(s.totalChallenges, 3);
        assertEq(s.wins, 2);
        assertEq(s.cumulativePnL, int256(500e18));
        // (11000 + 9000 + 10500) e18 / 3 = 10166.66...e18 (floor div).
        uint256 expectedAvg = uint256(11000e18 + 9000e18 + 10500e18) / 3;
        assertEq(s.averageFinalValue, expectedAvg);
    }

    function test_reputationOf_bobPerspectiveMatches() public {
        // Same challenge as singleWin from Bob's side: Bob loses.
        _runChallenge(2000e18, 1000e18, 1500e18);

        Reputation.ReputationScore memory s = reputation.reputationOf(agentBob);
        assertEq(s.totalChallenges, 1);
        assertEq(s.wins, 0);
        assertEq(s.cumulativePnL, int256(500e18)); // Bob still profited, just less than Alice
        assertEq(s.averageFinalValue, 10500e18);
    }

    function test_constructor_revertsOnZeroLeaderboard() public {
        vm.expectRevert(Reputation.ZeroAddress.selector);
        new Reputation(Leaderboard(address(0)));
    }
}
