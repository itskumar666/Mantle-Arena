// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ChallengeTest is Test {
    AgentRegistry internal registry;
    Challenge internal challenge;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0x7AEA5);
    address internal devAlice = address(0xA1);
    address internal devBob = address(0xB0B);
    address internal devCarol = address(0xCA401);
    address internal stranger = address(0xDEAD);

    uint256 internal agentAlice;
    uint256 internal agentBob;
    uint256 internal agentCarol;

    address internal mETH = address(0xE7);
    address internal USDY = address(0x05D);
    address internal MNT = address(0x4AC7);

    uint64 internal constant START_OFFSET = 1 hours;
    uint64 internal constant DURATION = 24 hours;
    uint128 internal constant STARTING_BALANCE = 10_000e18;
    uint128 internal constant ENTRY_FEE = 0.01 ether;
    uint128 internal constant SETTLE_BOUNTY = 0.005 ether;

    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed creator,
        uint64 startTime,
        uint64 endTime,
        uint128 startingBalance,
        uint128 entryFee,
        uint128 settleBounty,
        address[] allowedAssets
    );
    event AgentEntered(uint256 indexed challengeId, uint256 indexed agentId, address indexed entrant, uint128 feePaid);
    event ChallengeSettled(
        uint256 indexed challengeId, address indexed settler, uint128 bountyPaid, uint128 treasuryResidue
    );

    function setUp() public {
        vm.warp(1_750_000_000);
        registry = new AgentRegistry(admin);
        challenge = new Challenge(IERC721(address(registry)), admin, treasury);

        vm.prank(devAlice);
        agentAlice = registry.registerAgent(address(0xA1517E), keccak256("alice-strat"), "");
        vm.prank(devBob);
        agentBob = registry.registerAgent(address(0xB0B517E), keccak256("bob-strat"), "");
        vm.prank(devCarol);
        agentCarol = registry.registerAgent(address(0xCA20517E), keccak256("carol-strat"), "");

        vm.deal(devAlice, 10 ether);
        vm.deal(devBob, 10 ether);
        vm.deal(devCarol, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    // ---------- helpers ----------

    function _defaultAssets() internal view returns (address[] memory a) {
        a = new address[](3);
        a[0] = mETH;
        a[1] = USDY;
        a[2] = MNT;
    }

    function _createDefaultChallenge() internal returns (uint256) {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;
        vm.prank(admin);
        return challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);
    }

    // ---------- createChallenge ----------

    function test_createChallenge_storesStateAndEmits() public {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;

        vm.expectEmit(true, true, false, true, address(challenge));
        emit ChallengeCreated(1, admin, start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);

        vm.prank(admin);
        uint256 id = challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);

        assertEq(id, 1);
        assertEq(challenge.nextChallengeId(), 2);

        Challenge.ChallengeData memory data = challenge.getChallenge(id);
        assertEq(data.creator, admin);
        assertEq(data.startTime, start);
        assertEq(data.endTime, end);
        assertEq(data.startingBalance, STARTING_BALANCE);
        assertEq(data.entryFee, ENTRY_FEE);
        assertEq(data.settleBounty, SETTLE_BOUNTY);
        assertEq(data.entryFeesCollected, 0);
        assertEq(data.settled, false);

        address[] memory got = challenge.getAllowedAssets(id);
        assertEq(got.length, 3);
        assertEq(got[0], mETH);
        assertEq(got[1], USDY);
        assertEq(got[2], MNT);

        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Enrolling));
    }

    function test_createChallenge_onlyOwner() public {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, devAlice));
        vm.prank(devAlice);
        challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);
    }

    function test_createChallenge_revertsOnStartInPast() public {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp); // not in the future
        uint64 end = start + DURATION;

        vm.expectRevert(abi.encodeWithSelector(Challenge.InvalidTimes.selector, start, end));
        vm.prank(admin);
        challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);
    }

    function test_createChallenge_revertsOnEndBeforeStart() public {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp) + 1 hours;
        uint64 end = start; // not strictly after

        vm.expectRevert(abi.encodeWithSelector(Challenge.InvalidTimes.selector, start, end));
        vm.prank(admin);
        challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);
    }

    function test_createChallenge_revertsOnEmptyAssetUniverse() public {
        address[] memory assets = new address[](0);
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;

        vm.expectRevert(Challenge.EmptyAssetUniverse.selector);
        vm.prank(admin);
        challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, SETTLE_BOUNTY, assets);
    }

    function test_createChallenge_revertsIfBountyButNoEntryFee() public {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;

        vm.expectRevert(Challenge.BountyExceedsExpectedFees.selector);
        vm.prank(admin);
        challenge.createChallenge(start, end, STARTING_BALANCE, 0, 1 wei, assets);
    }

    function test_createChallenge_freeEntryNoBountyAllowed() public {
        address[] memory assets = _defaultAssets();
        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;

        vm.prank(admin);
        uint256 id = challenge.createChallenge(start, end, STARTING_BALANCE, 0, 0, assets);
        assertEq(id, 1);
    }

    // ---------- enterAgent ----------

    function test_enterAgent_happyPath() public {
        uint256 id = _createDefaultChallenge();

        vm.expectEmit(true, true, true, true, address(challenge));
        emit AgentEntered(id, agentAlice, devAlice, ENTRY_FEE);

        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);

        assertTrue(challenge.isParticipant(id, agentAlice));
        assertEq(challenge.participantCount(id), 1);
        uint256[] memory ps = challenge.getParticipants(id);
        assertEq(ps.length, 1);
        assertEq(ps[0], agentAlice);

        assertEq(challenge.getChallenge(id).entryFeesCollected, ENTRY_FEE);
        assertEq(address(challenge).balance, ENTRY_FEE);
    }

    function test_enterAgent_revertsOnNonexistentChallenge() public {
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 42));
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(42, agentAlice);
    }

    function test_enterAgent_revertsOnNonexistentAgent() public {
        uint256 id = _createDefaultChallenge();

        vm.expectRevert(abi.encodeWithSelector(Challenge.AgentDoesNotExist.selector, 9999));
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, 9999);
    }

    function test_enterAgent_revertsIfCallerNotAgentOwner() public {
        uint256 id = _createDefaultChallenge();

        vm.expectRevert(abi.encodeWithSelector(Challenge.NotAgentOwner.selector, agentAlice, devBob));
        vm.prank(devBob);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);
    }

    function test_enterAgent_revertsOnDuplicate() public {
        uint256 id = _createDefaultChallenge();
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);

        vm.expectRevert(abi.encodeWithSelector(Challenge.AlreadyEntered.selector, id, agentAlice));
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);
    }

    function test_enterAgent_revertsOnWrongFee() public {
        uint256 id = _createDefaultChallenge();

        vm.expectRevert(abi.encodeWithSelector(Challenge.IncorrectEntryFee.selector, ENTRY_FEE, ENTRY_FEE - 1));
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE - 1}(id, agentAlice);

        vm.expectRevert(abi.encodeWithSelector(Challenge.IncorrectEntryFee.selector, ENTRY_FEE, ENTRY_FEE + 1));
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE + 1}(id, agentAlice);
    }

    function test_enterAgent_revertsOnceLive() public {
        uint256 id = _createDefaultChallenge();
        vm.warp(block.timestamp + START_OFFSET + 1);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Live));

        vm.expectRevert(
            abi.encodeWithSelector(Challenge.WrongPhase.selector, id, Challenge.Phase.Live, Challenge.Phase.Enrolling)
        );
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);
    }

    function test_enterAgent_revertsOnceEnded() public {
        uint256 id = _createDefaultChallenge();
        vm.warp(block.timestamp + START_OFFSET + DURATION + 1);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Ended));

        vm.expectRevert(
            abi.encodeWithSelector(Challenge.WrongPhase.selector, id, Challenge.Phase.Ended, Challenge.Phase.Enrolling)
        );
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);
    }

    function test_enterAgent_multipleAgentsAccumulateFees() public {
        uint256 id = _createDefaultChallenge();

        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentBob);
        vm.prank(devCarol);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentCarol);

        assertEq(challenge.participantCount(id), 3);
        assertEq(challenge.getChallenge(id).entryFeesCollected, ENTRY_FEE * 3);
        assertEq(address(challenge).balance, ENTRY_FEE * 3);
    }

    // ---------- settle ----------

    function test_settle_happyPath_paysBountyAndResidue() public {
        uint256 id = _createDefaultChallenge();
        vm.prank(devAlice);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent{value: ENTRY_FEE}(id, agentBob);

        vm.warp(block.timestamp + START_OFFSET + DURATION + 1);
        uint256 strangerBefore = stranger.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.expectEmit(true, true, false, true, address(challenge));
        emit ChallengeSettled(id, stranger, SETTLE_BOUNTY, uint128(ENTRY_FEE * 2 - SETTLE_BOUNTY));

        vm.prank(stranger);
        challenge.settle(id);

        assertEq(stranger.balance - strangerBefore, SETTLE_BOUNTY);
        assertEq(treasury.balance - treasuryBefore, ENTRY_FEE * 2 - SETTLE_BOUNTY);
        assertEq(address(challenge).balance, 0);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Settled));
        assertTrue(challenge.getChallenge(id).settled);
    }

    function test_settle_withZeroParticipants_paysNothing() public {
        uint256 id = _createDefaultChallenge();
        vm.warp(block.timestamp + START_OFFSET + DURATION + 1);

        uint256 strangerBefore = stranger.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(stranger);
        challenge.settle(id);

        assertEq(stranger.balance, strangerBefore);
        assertEq(treasury.balance, treasuryBefore);
        assertTrue(challenge.getChallenge(id).settled);
    }

    function test_settle_revertsBeforeEnded() public {
        uint256 id = _createDefaultChallenge();

        vm.expectRevert(
            abi.encodeWithSelector(Challenge.WrongPhase.selector, id, Challenge.Phase.Enrolling, Challenge.Phase.Ended)
        );
        challenge.settle(id);

        vm.warp(block.timestamp + START_OFFSET + 1);
        vm.expectRevert(
            abi.encodeWithSelector(Challenge.WrongPhase.selector, id, Challenge.Phase.Live, Challenge.Phase.Ended)
        );
        challenge.settle(id);
    }

    function test_settle_revertsIfAlreadySettled() public {
        uint256 id = _createDefaultChallenge();
        vm.warp(block.timestamp + START_OFFSET + DURATION + 1);
        challenge.settle(id);

        vm.expectRevert(abi.encodeWithSelector(Challenge.AlreadySettled.selector, id));
        challenge.settle(id);
    }

    function test_settle_revertsOnNonexistentChallenge() public {
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 7));
        challenge.settle(7);
    }

    // ---------- treasury admin ----------

    function test_setProtocolTreasury_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, devAlice));
        vm.prank(devAlice);
        challenge.setProtocolTreasury(address(0xCAFE));

        vm.prank(admin);
        challenge.setProtocolTreasury(address(0xCAFE));
        assertEq(challenge.protocolTreasury(), address(0xCAFE));
    }

    function test_setProtocolTreasury_revertsOnZero() public {
        vm.expectRevert(Challenge.TransferFailed.selector);
        vm.prank(admin);
        challenge.setProtocolTreasury(address(0));
    }

    // ---------- phase boundary check ----------

    function test_phaseOf_exactBoundaries() public {
        uint256 id = _createDefaultChallenge();
        uint64 startTime = challenge.getChallenge(id).startTime;
        uint64 endTime = challenge.getChallenge(id).endTime;

        vm.warp(startTime - 1);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Enrolling));
        vm.warp(startTime);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Live));
        vm.warp(endTime - 1);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Live));
        vm.warp(endTime);
        assertEq(uint256(challenge.phaseOf(id)), uint256(Challenge.Phase.Ended));
    }

    // ---------- nonexistent challenge views ----------

    function test_views_revertOnNonexistentChallenge() public {
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 1));
        challenge.getChallenge(1);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 1));
        challenge.getAllowedAssets(1);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 1));
        challenge.getParticipants(1);
        vm.expectRevert(abi.encodeWithSelector(Challenge.ChallengeDoesNotExist.selector, 1));
        challenge.phaseOf(1);
        // participantCount is allowed to be 0 for nonexistent (gas-cheap path)
        assertEq(challenge.participantCount(1), 0);
    }

    // ---------- fuzz: participant accounting invariant ----------

    function testFuzz_enterAgent_feesMatchParticipantCount(uint8 nAgents) public {
        nAgents = uint8(bound(nAgents, 1, 50));
        uint256 id = _createDefaultChallenge();

        for (uint256 i = 0; i < nAgents; ++i) {
            address dev = address(uint160(0xC0DE + i));
            vm.deal(dev, 1 ether);
            address signer = address(uint160(0xD00D + i));
            bytes32 strat = keccak256(abi.encode("strat", i));
            vm.prank(dev);
            uint256 newAgentId = registry.registerAgent(signer, strat, "");

            vm.prank(dev);
            challenge.enterAgent{value: ENTRY_FEE}(id, newAgentId);
        }

        assertEq(challenge.participantCount(id), nAgents);
        assertEq(challenge.getChallenge(id).entryFeesCollected, ENTRY_FEE * nAgents);
        assertEq(address(challenge).balance, ENTRY_FEE * nAgents);
    }
}
