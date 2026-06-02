// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {ExecutionEngine} from "../src/ExecutionEngine.sol";
import {Leaderboard} from "../src/Leaderboard.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract StakeVaultTest is Test {
    AgentRegistry internal registry;
    Challenge internal challenge;
    ExecutionEngine internal engine;
    Leaderboard internal leaderboard;
    StakeVault internal vault;
    MockPriceOracle internal oracle;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0x7AEA5);
    address internal devAlice = address(0xA1);
    address internal devBob = address(0xB0B);
    address internal devCarol = address(0xCA401);

    address internal backer1 = address(0xB1);
    address internal backer2 = address(0xB2);
    address internal backer3 = address(0xB3);
    address internal backer4 = address(0xB4);

    uint256 internal aliceKey = uint256(keccak256("alice"));
    uint256 internal bobKey = uint256(keccak256("bob"));
    uint256 internal carolKey = uint256(keccak256("carol"));

    uint256 internal agentAlice;
    uint256 internal agentBob;
    uint256 internal agentCarol;
    uint256 internal challengeId;

    address internal mETH = address(0xE7);

    uint128 internal constant STARTING_BALANCE = 10_000e18;

    event Staked(uint256 indexed challengeId, uint256 indexed agentId, address indexed backer, uint256 amount);
    event Distributed(
        uint256 indexed challengeId,
        uint256 indexed winnerAgentId,
        uint256 loserPool,
        uint256 winnerBackerPool,
        uint256 protocolCut,
        uint256 devCut
    );
    event Claimed(address indexed backer, uint256 amount);

    function setUp() public {
        vm.warp(1_750_000_000);
        registry = new AgentRegistry(admin);
        challenge = new Challenge(IERC721(address(registry)), admin, treasury);
        oracle = new MockPriceOracle();
        engine = new ExecutionEngine(registry, challenge, oracle, admin);
        leaderboard = new Leaderboard(challenge, engine);
        vault = new StakeVault(registry, challenge, leaderboard, admin, treasury);

        oracle.setPrice(mETH, 1000e18);

        vm.prank(devAlice);
        agentAlice = registry.registerAgent(vm.addr(aliceKey), keccak256("alice"), "");
        vm.prank(devBob);
        agentBob = registry.registerAgent(vm.addr(bobKey), keccak256("bob"), "");
        vm.prank(devCarol);
        agentCarol = registry.registerAgent(vm.addr(carolKey), keccak256("carol"), "");

        address[] memory assets = new address[](1);
        assets[0] = mETH;
        uint64 start = uint64(block.timestamp) + 1 hours;
        uint64 end = start + 1 hours;
        vm.prank(admin);
        challengeId = challenge.createChallenge(start, end, STARTING_BALANCE, 0, 0, assets);

        vm.prank(devAlice);
        challenge.enterAgent(challengeId, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent(challengeId, agentBob);
        vm.prank(devCarol);
        challenge.enterAgent(challengeId, agentCarol);

        // Fund backers.
        vm.deal(backer1, 100 ether);
        vm.deal(backer2, 100 ether);
        vm.deal(backer3, 100 ether);
        vm.deal(backer4, 100 ether);
    }

    // ---------- helpers ----------

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
        bytes32 digest = engine.hashAction(a);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        engine.submitAction(a, abi.encodePacked(r, s, v));
    }

    function _runChallengeWithAliceWinning() internal {
        // Move into live phase.
        vm.warp(1_750_000_000 + 1 hours + 1);
        // Each agent buys mETH; Alice buys most, pump = Alice wins.
        _buy(agentAlice, aliceKey, 5000e18, 0);
        _buy(agentBob, bobKey, 1000e18, 0);
        _buy(agentCarol, carolKey, 500e18, 0);
        oracle.setPrice(mETH, 1500e18);
        vm.warp(1_750_000_000 + 2 hours + 1);
        leaderboard.settle(challengeId);
    }

    // ---------- stake ----------

    function test_stake_happyPath_storesAndEmits() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit Staked(challengeId, agentAlice, backer1, 5 ether);

        vm.prank(backer1);
        vault.stake{value: 5 ether}(challengeId, agentAlice);

        assertEq(vault.stakeOf(challengeId, agentAlice, backer1), 5 ether);
        assertEq(vault.agentStakeTotal(challengeId, agentAlice), 5 ether);
        assertEq(vault.backerCount(challengeId, agentAlice), 1);
        address[] memory bs = vault.backersOf(challengeId, agentAlice);
        assertEq(bs.length, 1);
        assertEq(bs[0], backer1);
    }

    function test_stake_sameBackerAccumulates_noDuplicateBackersList() public {
        vm.prank(backer1);
        vault.stake{value: 2 ether}(challengeId, agentAlice);
        vm.prank(backer1);
        vault.stake{value: 3 ether}(challengeId, agentAlice);

        assertEq(vault.stakeOf(challengeId, agentAlice, backer1), 5 ether);
        assertEq(vault.agentStakeTotal(challengeId, agentAlice), 5 ether);
        assertEq(vault.backerCount(challengeId, agentAlice), 1);
    }

    function test_stake_zeroReverts() public {
        vm.expectRevert(StakeVault.ZeroAmount.selector);
        vm.prank(backer1);
        vault.stake{value: 0}(challengeId, agentAlice);
    }

    function test_stake_nonParticipantReverts() public {
        vm.prank(devAlice);
        uint256 lonely = registry.registerAgent(address(0xDEAD), keccak256("lonely"), "");

        vm.expectRevert(abi.encodeWithSelector(StakeVault.NotAParticipant.selector, challengeId, lonely));
        vm.prank(backer1);
        vault.stake{value: 1 ether}(challengeId, lonely);
    }

    function test_stake_revertsOnceLive() public {
        vm.warp(1_750_000_000 + 1 hours + 1);
        vm.expectRevert(abi.encodeWithSelector(StakeVault.NotEnrolling.selector, challengeId, Challenge.Phase.Live));
        vm.prank(backer1);
        vault.stake{value: 1 ether}(challengeId, agentAlice);
    }

    // ---------- distribute ----------

    function test_distribute_happyPath_winnerBackersGetPrincipalPlusBonus() public {
        // Pre-challenge stakes.
        vm.prank(backer1);
        vault.stake{value: 10 ether}(challengeId, agentAlice); // winner backer
        vm.prank(backer2);
        vault.stake{value: 30 ether}(challengeId, agentAlice); // winner backer (3× backer1)
        vm.prank(backer3);
        vault.stake{value: 5 ether}(challengeId, agentBob); // loser
        vm.prank(backer4);
        vault.stake{value: 5 ether}(challengeId, agentCarol); // loser

        _runChallengeWithAliceWinning();

        // loserPool = 5 + 5 = 10 ether
        // protocolCut = 10 * 2000 / 10000 = 2 ether
        // devCut     = 10 * 1000 / 10000 = 1 ether
        // winnerBackerPool = 10 - 2 - 1 = 7 ether
        // backer1 bonus = 7 * 10 / 40 = 1.75 ether → claimable = 10 + 1.75 = 11.75
        // backer2 bonus = 7 * 30 / 40 = 5.25 ether → claimable = 30 + 5.25 = 35.25

        vm.expectEmit(true, true, false, true, address(vault));
        emit Distributed(challengeId, agentAlice, 10 ether, 7 ether, 2 ether, 1 ether);
        vault.distribute(challengeId);

        assertEq(vault.claimable(backer1), 11.75 ether);
        assertEq(vault.claimable(backer2), 35.25 ether);
        assertEq(vault.claimable(backer3), 0); // losers forfeit
        assertEq(vault.claimable(backer4), 0);
        assertEq(vault.claimable(treasury), 2 ether);
        assertEq(vault.claimable(devAlice), 1 ether); // winner's developer
        assertTrue(vault.distributed(challengeId));
    }

    function test_distribute_revertsBeforeSettle() public {
        vm.expectRevert(abi.encodeWithSelector(StakeVault.NotSettled.selector, challengeId));
        vault.distribute(challengeId);
    }

    function test_distribute_revertsOnRepeat() public {
        _runChallengeWithAliceWinning();
        vault.distribute(challengeId);
        vm.expectRevert(abi.encodeWithSelector(StakeVault.AlreadyDistributed.selector, challengeId));
        vault.distribute(challengeId);
    }

    function test_distribute_noWinnerBackers_spillsToProtocol() public {
        // Only losers have backers.
        vm.prank(backer3);
        vault.stake{value: 10 ether}(challengeId, agentBob);
        vm.prank(backer4);
        vault.stake{value: 10 ether}(challengeId, agentCarol);

        _runChallengeWithAliceWinning();

        // loserPool = 20, protocolCut = 4, devCut = 2, winnerBackerPool = 14 (spills to protocol)
        // Final: protocol = 4 + 14 = 18, dev = 2.
        vm.expectEmit(true, true, false, true, address(vault));
        emit Distributed(challengeId, agentAlice, 20 ether, 0, 18 ether, 2 ether);
        vault.distribute(challengeId);

        assertEq(vault.claimable(treasury), 18 ether);
        assertEq(vault.claimable(devAlice), 2 ether);
        assertEq(vault.claimable(backer3), 0);
        assertEq(vault.claimable(backer4), 0);
    }

    function test_distribute_noLosers_winnerKeepsPrincipalOnly() public {
        // Only winner has backers. No loser pool → no bonus, no protocol/dev cut.
        vm.prank(backer1);
        vault.stake{value: 7 ether}(challengeId, agentAlice);

        _runChallengeWithAliceWinning();

        vm.expectEmit(true, true, false, true, address(vault));
        emit Distributed(challengeId, agentAlice, 0, 0, 0, 0);
        vault.distribute(challengeId);

        assertEq(vault.claimable(backer1), 7 ether);
        assertEq(vault.claimable(treasury), 0);
        assertEq(vault.claimable(devAlice), 0);
    }

    function test_distribute_noParticipants_emitsZeroEvent() public {
        // Empty challenge.
        address[] memory assets = new address[](1);
        assets[0] = mETH;
        uint64 start = uint64(block.timestamp) + 1 hours;
        uint64 end = start + 1 hours;
        vm.prank(admin);
        uint256 emptyId = challenge.createChallenge(start, end, STARTING_BALANCE, 0, 0, assets);

        vm.warp(end + 1);
        leaderboard.settle(emptyId);

        vm.expectEmit(true, true, false, true, address(vault));
        emit Distributed(emptyId, 0, 0, 0, 0, 0);
        vault.distribute(emptyId);

        assertTrue(vault.distributed(emptyId));
    }

    // ---------- claim ----------

    function test_claim_happyPath_drainsBalance() public {
        vm.prank(backer1);
        vault.stake{value: 10 ether}(challengeId, agentAlice);
        vm.prank(backer3);
        vault.stake{value: 10 ether}(challengeId, agentBob);

        _runChallengeWithAliceWinning();
        vault.distribute(challengeId);

        // backer1: 10 + (7 * 10 / 10) = 17 ether
        uint256 expected = 10 ether + 7 ether;
        assertEq(vault.claimable(backer1), expected);

        uint256 beforeBal = backer1.balance;
        vm.expectEmit(true, false, false, true, address(vault));
        emit Claimed(backer1, expected);
        vm.prank(backer1);
        vault.claim();

        assertEq(vault.claimable(backer1), 0);
        assertEq(backer1.balance - beforeBal, expected);
    }

    function test_claim_revertsOnEmpty() public {
        vm.expectRevert(StakeVault.NothingToClaim.selector);
        vm.prank(backer1);
        vault.claim();
    }

    function test_claim_loserGetsNothing() public {
        vm.prank(backer3);
        vault.stake{value: 5 ether}(challengeId, agentBob);

        _runChallengeWithAliceWinning();
        vault.distribute(challengeId);

        assertEq(vault.claimable(backer3), 0);
        vm.expectRevert(StakeVault.NothingToClaim.selector);
        vm.prank(backer3);
        vault.claim();
    }

    function test_claim_treasuryAndDevCanWithdraw() public {
        vm.prank(backer1);
        vault.stake{value: 10 ether}(challengeId, agentAlice);
        vm.prank(backer3);
        vault.stake{value: 10 ether}(challengeId, agentBob);

        _runChallengeWithAliceWinning();
        vault.distribute(challengeId);

        // protocol = 2, dev = 1.
        uint256 tBefore = treasury.balance;
        vm.prank(treasury);
        vault.claim();
        assertEq(treasury.balance - tBefore, 2 ether);

        uint256 dBefore = devAlice.balance;
        vm.prank(devAlice);
        vault.claim();
        assertEq(devAlice.balance - dBefore, 1 ether);
    }

    // ---------- admin ----------

    function test_setProtocolTreasury_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, devAlice));
        vm.prank(devAlice);
        vault.setProtocolTreasury(address(0xCAFE));

        vm.prank(admin);
        vault.setProtocolTreasury(address(0xCAFE));
        assertEq(vault.protocolTreasury(), address(0xCAFE));
    }

    function test_setProtocolTreasury_revertsOnZero() public {
        vm.expectRevert(StakeVault.ZeroAddress.selector);
        vm.prank(admin);
        vault.setProtocolTreasury(address(0));
    }

    // ---------- conservation invariant ----------

    function test_conservation_totalIn_equalsTotalClaimable() public {
        vm.prank(backer1);
        vault.stake{value: 10 ether}(challengeId, agentAlice);
        vm.prank(backer2);
        vault.stake{value: 30 ether}(challengeId, agentAlice);
        vm.prank(backer3);
        vault.stake{value: 5 ether}(challengeId, agentBob);
        vm.prank(backer4);
        vault.stake{value: 5 ether}(challengeId, agentCarol);

        _runChallengeWithAliceWinning();
        vault.distribute(challengeId);

        uint256 totalIn = 10 ether + 30 ether + 5 ether + 5 ether;
        uint256 totalOut = vault.claimable(backer1) + vault.claimable(backer2) + vault.claimable(backer3)
            + vault.claimable(backer4) + vault.claimable(treasury) + vault.claimable(devAlice);
        assertEq(totalOut, totalIn);
        assertEq(address(vault).balance, totalIn);
    }
}
