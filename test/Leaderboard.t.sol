// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {ExecutionEngine} from "../src/ExecutionEngine.sol";
import {Leaderboard} from "../src/Leaderboard.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract LeaderboardTest is Test {
    AgentRegistry internal registry;
    Challenge internal challenge;
    ExecutionEngine internal engine;
    MockPriceOracle internal oracle;
    Leaderboard internal leaderboard;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0x7AEA5);
    address internal devAlice = address(0xA1);
    address internal devBob = address(0xB0B);
    address internal devCarol = address(0xCA401);

    uint256 internal aliceKey = uint256(keccak256("alice"));
    uint256 internal bobKey = uint256(keccak256("bob"));
    uint256 internal carolKey = uint256(keccak256("carol"));

    uint256 internal agentAlice;
    uint256 internal agentBob;
    uint256 internal agentCarol;
    uint256 internal challengeId;

    address internal mETH = address(0xE7);
    uint64 internal constant START_OFFSET = 1 hours;
    uint64 internal constant DURATION = 24 hours;
    uint128 internal constant STARTING_BALANCE = 10_000e18;

    event LeaderboardSettled(uint256 indexed challengeId, address indexed settler, uint256 participants);
    event AgentResultRecorded(
        uint256 indexed challengeId, uint256 indexed agentId, uint256 finalValue, int256 pnl, uint16 rank
    );

    function setUp() public {
        vm.warp(1_750_000_000);
        registry = new AgentRegistry(admin);
        challenge = new Challenge(IERC721(address(registry)), admin, treasury);
        oracle = new MockPriceOracle();
        engine = new ExecutionEngine(registry, challenge, oracle, admin);
        leaderboard = new Leaderboard(challenge, engine);

        oracle.setPrice(mETH, 1000e18);

        vm.prank(devAlice);
        agentAlice = registry.registerAgent(vm.addr(aliceKey), keccak256("alice-strat"), "");
        vm.prank(devBob);
        agentBob = registry.registerAgent(vm.addr(bobKey), keccak256("bob-strat"), "");
        vm.prank(devCarol);
        agentCarol = registry.registerAgent(vm.addr(carolKey), keccak256("carol-strat"), "");

        address[] memory assets = new address[](1);
        assets[0] = mETH;
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;
        vm.prank(admin);
        challengeId = challenge.createChallenge(start, end, STARTING_BALANCE, 0, 0, assets);

        vm.prank(devAlice);
        challenge.enterAgent(challengeId, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent(challengeId, agentBob);
        vm.prank(devCarol);
        challenge.enterAgent(challengeId, agentCarol);

        vm.warp(start + 1);
    }

    // ---------- helpers ----------

    function _sign(uint256 pk, ExecutionEngine.Action memory a) internal view returns (bytes memory) {
        bytes32 digest = engine.hashAction(a);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _buy(uint256 agentId, uint256 pk, uint128 size, uint64 nonce) internal {
        ExecutionEngine.Action memory a = ExecutionEngine.Action({
            challengeId: challengeId,
            agentId: agentId,
            kind: uint8(ExecutionEngine.ActionKind.Buy),
            asset: mETH,
            size: size,
            nonce: nonce,
            deadline: uint64(block.timestamp + 1 hours)
        });
        engine.submitAction(a, _sign(pk, a));
    }

    function _advancePastEnd() internal {
        vm.warp(1_750_000_000 + START_OFFSET + DURATION + 1);
    }

    // ---------- happy path ----------

    function test_settle_happyPath_rankingMatchesPnL() public {
        // All three buy 1 mETH (spend 1000 quote). Then price changes per agent's perspective —
        // but Mock has a single price, so we instead vary buy size to vary holdings, then pump.
        _buy(agentAlice, aliceKey, 1000e18, 0); // holds 1 mETH, cash 9000
        _buy(agentBob, bobKey, 2000e18, 0); // holds 2 mETH, cash 8000
        _buy(agentCarol, carolKey, 500e18, 0); // holds 0.5 mETH, cash 9500

        // Pump mETH from 1000 to 1500. Now:
        // Alice: 9000 + 1 * 1500 = 10500
        // Bob: 8000 + 2 * 1500 = 11000  (winner)
        // Carol: 9500 + 0.5 * 1500 = 10250
        oracle.setPrice(mETH, 1500e18);

        _advancePastEnd();

        vm.expectEmit(true, true, false, true, address(leaderboard));
        emit LeaderboardSettled(challengeId, address(this), 3);
        leaderboard.settle(challengeId);

        assertTrue(leaderboard.isSettled(challengeId));

        uint256[] memory rank = leaderboard.ranking(challengeId);
        assertEq(rank.length, 3);
        assertEq(rank[0], agentBob);
        assertEq(rank[1], agentAlice);
        assertEq(rank[2], agentCarol);

        assertEq(leaderboard.winnerOf(challengeId), agentBob);

        Leaderboard.AgentResult memory bobR = leaderboard.resultOf(challengeId, agentBob);
        assertEq(bobR.finalValue, 11000e18);
        assertEq(bobR.pnl, int256(1000e18));

        Leaderboard.AgentResult memory aliceR = leaderboard.resultOf(challengeId, agentAlice);
        assertEq(aliceR.finalValue, 10500e18);
        assertEq(aliceR.pnl, int256(500e18));

        Leaderboard.AgentResult memory carolR = leaderboard.resultOf(challengeId, agentCarol);
        assertEq(carolR.finalValue, 10250e18);
        assertEq(carolR.pnl, int256(250e18));

        assertEq(leaderboard.rankOf(challengeId, agentBob), 1);
        assertEq(leaderboard.rankOf(challengeId, agentAlice), 2);
        assertEq(leaderboard.rankOf(challengeId, agentCarol), 3);
    }

    function test_settle_recordsLossAsNegativePnL() public {
        _buy(agentAlice, aliceKey, 5000e18, 0); // holds 5 mETH, cash 5000
        // Crash price to 500. Alice: 5000 + 5 * 500 = 7500. PnL = -2500.
        oracle.setPrice(mETH, 500e18);

        _advancePastEnd();
        leaderboard.settle(challengeId);

        Leaderboard.AgentResult memory r = leaderboard.resultOf(challengeId, agentAlice);
        assertEq(r.finalValue, 7500e18);
        assertEq(r.pnl, -int256(2500e18));
    }

    function test_settle_untradedAgentsGetPnLZero() public {
        // No one trades. All portfolios remain at starting balance via lazy init.
        _advancePastEnd();
        leaderboard.settle(challengeId);

        for (uint256 i = 0; i < 3; ++i) {
            uint256 agentId = leaderboard.ranking(challengeId)[i];
            Leaderboard.AgentResult memory r = leaderboard.resultOf(challengeId, agentId);
            assertEq(r.finalValue, STARTING_BALANCE);
            assertEq(r.pnl, 0);
        }
    }

    // ---------- revert paths ----------

    function test_settle_revertsBeforeEnd() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                Leaderboard.ChallengeNotEnded.selector,
                challengeId,
                uint64(1_750_000_000 + START_OFFSET + DURATION),
                block.timestamp
            )
        );
        leaderboard.settle(challengeId);
    }

    function test_settle_revertsOnDoubleSettle() public {
        _advancePastEnd();
        leaderboard.settle(challengeId);

        vm.expectRevert(abi.encodeWithSelector(Leaderboard.AlreadySettled.selector, challengeId));
        leaderboard.settle(challengeId);
    }

    function test_settle_nonexistentChallengeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 999));
        leaderboard.settle(999);
    }

    function test_settle_emptyChallengeSettlesCleanly() public {
        // Create a fresh empty challenge.
        address[] memory assets = new address[](1);
        assets[0] = mETH;
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;
        vm.prank(admin);
        uint256 emptyId = challenge.createChallenge(start, end, STARTING_BALANCE, 0, 0, assets);

        vm.warp(end + 1);

        vm.expectEmit(true, true, false, true, address(leaderboard));
        emit LeaderboardSettled(emptyId, address(this), 0);
        leaderboard.settle(emptyId);

        assertTrue(leaderboard.isSettled(emptyId));
        assertEq(leaderboard.ranking(emptyId).length, 0);

        vm.expectRevert(abi.encodeWithSelector(Leaderboard.NoParticipants.selector, emptyId));
        leaderboard.winnerOf(emptyId);
    }

    // ---------- view gates ----------

    function test_views_revertBeforeSettle() public {
        vm.expectRevert(abi.encodeWithSelector(Leaderboard.NotSettled.selector, challengeId));
        leaderboard.resultOf(challengeId, agentAlice);
        vm.expectRevert(abi.encodeWithSelector(Leaderboard.NotSettled.selector, challengeId));
        leaderboard.ranking(challengeId);
        vm.expectRevert(abi.encodeWithSelector(Leaderboard.NotSettled.selector, challengeId));
        leaderboard.winnerOf(challengeId);
        vm.expectRevert(abi.encodeWithSelector(Leaderboard.NotSettled.selector, challengeId));
        leaderboard.rankOf(challengeId, agentAlice);
    }

    function test_rankOf_returnsZeroForNonParticipant() public {
        _advancePastEnd();
        leaderboard.settle(challengeId);
        assertEq(leaderboard.rankOf(challengeId, 9999), 0);
    }

    // ---------- agent history index ----------

    function test_agentChallengeHistory_accumulatesAcrossChallenges() public {
        _advancePastEnd();
        leaderboard.settle(challengeId);

        // Create + settle a second challenge with the same participants.
        address[] memory assets = new address[](1);
        assets[0] = mETH;
        uint64 start2 = uint64(block.timestamp) + 1 hours;
        uint64 end2 = start2 + 1 hours;
        vm.prank(admin);
        uint256 id2 = challenge.createChallenge(start2, end2, STARTING_BALANCE, 0, 0, assets);

        vm.prank(devAlice);
        challenge.enterAgent(id2, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent(id2, agentBob);

        vm.warp(end2 + 1);
        leaderboard.settle(id2);

        uint256[] memory aliceHistory = leaderboard.agentChallengeHistory(agentAlice);
        assertEq(aliceHistory.length, 2);
        assertEq(aliceHistory[0], challengeId);
        assertEq(aliceHistory[1], id2);
        assertEq(leaderboard.agentChallengeCount(agentAlice), 2);

        // Carol only joined the first challenge.
        assertEq(leaderboard.agentChallengeCount(agentCarol), 1);
    }

    // ---------- constructor ----------

    function test_constructor_revertsOnZeroChallenge() public {
        vm.expectRevert(Leaderboard.ZeroAddress.selector);
        new Leaderboard(Challenge(address(0)), engine);
    }

    function test_constructor_revertsOnZeroEngine() public {
        vm.expectRevert(Leaderboard.ZeroAddress.selector);
        new Leaderboard(challenge, ExecutionEngine(address(0)));
    }
}
