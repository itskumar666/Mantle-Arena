// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {ExecutionEngine} from "../src/ExecutionEngine.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ExecutionEngineTest is Test {
    AgentRegistry internal registry;
    Challenge internal challenge;
    ExecutionEngine internal engine;
    MockPriceOracle internal oracle;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0x7AEA5);
    address internal devAlice = address(0xA1);
    address internal devBob = address(0xB0B);
    address internal relayer = address(0xBEEF);

    // Agent signing keys (private → address via vm.addr).
    uint256 internal aliceKey = uint256(keccak256("agent-alice-signing-key"));
    uint256 internal bobKey = uint256(keccak256("agent-bob-signing-key"));
    uint256 internal rogueKey = uint256(keccak256("rogue-key"));

    address internal aliceSigner;
    address internal bobSigner;

    uint256 internal agentAlice;
    uint256 internal agentBob;
    uint256 internal challengeId;

    address internal mETH = address(0xE7);
    address internal USDY = address(0x05D);
    address internal MNT_ASSET = address(0x4AC7);
    address internal notInUniverse = address(0xBADA55);

    uint64 internal constant START_OFFSET = 1 hours;
    uint64 internal constant DURATION = 24 hours;
    uint128 internal constant STARTING_BALANCE = 10_000e18;
    uint128 internal constant ENTRY_FEE = 0;

    event ActionExecuted(
        uint256 indexed challengeId,
        uint256 indexed agentId,
        ExecutionEngine.ActionKind kind,
        address indexed asset,
        uint128 size,
        uint256 priceUsed,
        uint256 cashAfter,
        uint256 holdingsAfter,
        uint64 nonce,
        address relayer
    );
    event PriceOracleUpdated(address indexed oldOracle, address indexed newOracle);

    function setUp() public {
        vm.warp(1_750_000_000);
        aliceSigner = vm.addr(aliceKey);
        bobSigner = vm.addr(bobKey);

        registry = new AgentRegistry(admin);
        challenge = new Challenge(IERC721(address(registry)), admin, treasury);
        oracle = new MockPriceOracle();
        engine = new ExecutionEngine(registry, challenge, oracle, admin);

        oracle.setPrice(mETH, 3000e18);
        oracle.setPrice(USDY, 1e18);
        oracle.setPrice(MNT_ASSET, 0.5e18);

        vm.prank(devAlice);
        agentAlice = registry.registerAgent(aliceSigner, keccak256("alice-strat"), "");
        vm.prank(devBob);
        agentBob = registry.registerAgent(bobSigner, keccak256("bob-strat"), "");

        address[] memory assets = new address[](3);
        assets[0] = mETH;
        assets[1] = USDY;
        assets[2] = MNT_ASSET;

        uint64 start = uint64(block.timestamp) + START_OFFSET;
        uint64 end = start + DURATION;
        vm.prank(admin);
        challengeId = challenge.createChallenge(start, end, STARTING_BALANCE, ENTRY_FEE, 0, assets);

        vm.prank(devAlice);
        challenge.enterAgent{value: 0}(challengeId, agentAlice);
        vm.prank(devBob);
        challenge.enterAgent{value: 0}(challengeId, agentBob);

        // Move into the Live window.
        vm.warp(start + 1);
    }

    // ---------- helpers ----------

    function _action(
        uint256 agentId,
        ExecutionEngine.ActionKind kind,
        address asset,
        uint128 size,
        uint64 nonce,
        uint64 deadline
    ) internal view returns (ExecutionEngine.Action memory) {
        return ExecutionEngine.Action({
            challengeId: challengeId,
            agentId: agentId,
            kind: uint8(kind),
            asset: asset,
            size: size,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _sign(uint256 pk, ExecutionEngine.Action memory a) internal view returns (bytes memory) {
        bytes32 digest = engine.hashAction(a);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ---------- happy paths ----------

    function test_submitAction_buy_happyPath_lazyInitsAndUpdatesPortfolio() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, mETH, 3000e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        // 3000e18 quote / 3000e18 price = 1e18 base (i.e. 1 mETH)
        vm.expectEmit(true, true, true, true, address(engine));
        emit ActionExecuted(
            challengeId,
            agentAlice,
            ExecutionEngine.ActionKind.Buy,
            mETH,
            3000e18,
            3000e18,
            STARTING_BALANCE - 3000e18,
            1e18,
            0,
            relayer
        );

        vm.prank(relayer);
        engine.submitAction(a, sig);

        assertEq(engine.cash(challengeId, agentAlice), STARTING_BALANCE - 3000e18);
        assertEq(engine.holdings(challengeId, agentAlice, mETH), 1e18);
        assertEq(engine.nextNonce(challengeId, agentAlice), 1);
        assertTrue(engine.portfolioInitialized(challengeId, agentAlice));
    }

    function test_submitAction_sell_happyPath() public {
        // First BUY some mETH...
        ExecutionEngine.Action memory buy =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, mETH, 3000e18, 0, uint64(block.timestamp + 10));
        engine.submitAction(buy, _sign(aliceKey, buy));

        // ...then SELL half of it back at the same price.
        ExecutionEngine.Action memory sell =
            _action(agentAlice, ExecutionEngine.ActionKind.Sell, mETH, 0.5e18, 1, uint64(block.timestamp + 10));
        engine.submitAction(sell, _sign(aliceKey, sell));

        // Cash: 10000 - 3000 + (0.5 * 3000) = 8500.
        assertEq(engine.cash(challengeId, agentAlice), 8500e18);
        assertEq(engine.holdings(challengeId, agentAlice, mETH), 0.5e18);
        assertEq(engine.nextNonce(challengeId, agentAlice), 2);
    }

    function test_submitAction_anyoneCanRelay() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        // devBob relays Alice's signed action.
        vm.prank(devBob);
        engine.submitAction(a, sig);

        assertEq(engine.cash(challengeId, agentAlice), STARTING_BALANCE - 100e18);
    }

    function test_submitAction_nonceMonotonicAcrossManyActions() public {
        uint64 dl = uint64(block.timestamp + 1 hours);
        for (uint64 i = 0; i < 5; ++i) {
            ExecutionEngine.Action memory a = _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, i, dl);
            engine.submitAction(a, _sign(aliceKey, a));
        }
        assertEq(engine.nextNonce(challengeId, agentAlice), 5);
        assertEq(engine.cash(challengeId, agentAlice), STARTING_BALANCE - 500e18);
    }

    // ---------- signature failures ----------

    function test_submitAction_revertsOnWrongSigner() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, mETH, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(rogueKey, a);

        vm.expectRevert(ExecutionEngine.InvalidSignature.selector);
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsAfterKeyRotation_oldKey() public {
        // Alice rotates her signing key.
        address newSigner = vm.addr(uint256(keccak256("alice-new-key")));
        vm.prank(devAlice);
        registry.updateSigningKey(agentAlice, newSigner);

        // Old key now invalid.
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, mETH, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory oldSig = _sign(aliceKey, a);

        vm.expectRevert(ExecutionEngine.InvalidSignature.selector);
        engine.submitAction(a, oldSig);
    }

    function test_submitAction_succeedsAfterKeyRotation_newKey() public {
        uint256 newKey = uint256(keccak256("alice-new-key"));
        address newSigner = vm.addr(newKey);
        vm.prank(devAlice);
        registry.updateSigningKey(agentAlice, newSigner);

        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(newKey, a);

        engine.submitAction(a, sig);
        assertEq(engine.nextNonce(challengeId, agentAlice), 1);
    }

    function test_submitAction_tamperedFieldFailsSig() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        // Tamper the size after signing.
        a.size = 500e18;
        vm.expectRevert(ExecutionEngine.InvalidSignature.selector);
        engine.submitAction(a, sig);
    }

    // ---------- nonce / deadline ----------

    function test_submitAction_revertsOnWrongNonce_tooHigh() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 5, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.WrongNonce.selector, uint64(0), uint64(5)));
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsOnReplay() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);
        engine.submitAction(a, sig);

        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.WrongNonce.selector, uint64(1), uint64(0)));
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsAfterDeadline() public {
        uint64 dl = uint64(block.timestamp + 10);
        ExecutionEngine.Action memory a = _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, dl);
        bytes memory sig = _sign(aliceKey, a);

        vm.warp(dl + 1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.DeadlinePassed.selector, dl, block.timestamp));
        engine.submitAction(a, sig);
    }

    // ---------- gating ----------

    function test_submitAction_revertsIfNotParticipant() public {
        // Register an agent that never entered the challenge.
        uint256 strangerKey = uint256(keccak256("stranger-key"));
        address strangerSigner = vm.addr(strangerKey);
        vm.prank(devAlice);
        uint256 strangerAgent = registry.registerAgent(strangerSigner, keccak256("stranger-strat"), "");

        ExecutionEngine.Action memory a =
            _action(strangerAgent, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(strangerKey, a);

        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.NotParticipant.selector, challengeId, strangerAgent));
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsBeforeLive() public {
        // Move time back to before the challenge starts.
        vm.warp(1_750_000_000 + 100); // pre-start window from setUp's perspective
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        vm.expectRevert(
            abi.encodeWithSelector(ExecutionEngine.ChallengeNotLive.selector, challengeId, Challenge.Phase.Enrolling)
        );
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsAfterEnded() public {
        // Move past challenge end.
        vm.warp(1_750_000_000 + START_OFFSET + DURATION + 1);
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        vm.expectRevert(
            abi.encodeWithSelector(ExecutionEngine.ChallengeNotLive.selector, challengeId, Challenge.Phase.Ended)
        );
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsOnDisallowedAsset() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, notInUniverse, 100e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.AssetNotAllowed.selector, challengeId, notInUniverse));
        engine.submitAction(a, sig);
    }

    // ---------- accounting reverts ----------

    function test_submitAction_revertsOnZeroSize() public {
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 0, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);
        vm.expectRevert(ExecutionEngine.ZeroSize.selector);
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsOnInsufficientCash() public {
        ExecutionEngine.Action memory a = _action(
            agentAlice, ExecutionEngine.ActionKind.Buy, USDY, STARTING_BALANCE + 1, 0, uint64(block.timestamp + 10)
        );
        bytes memory sig = _sign(aliceKey, a);

        vm.expectRevert(
            abi.encodeWithSelector(
                ExecutionEngine.InsufficientCash.selector, uint256(STARTING_BALANCE), uint256(STARTING_BALANCE) + 1
            )
        );
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsOnInsufficientHoldings() public {
        // Alice has zero mETH and tries to sell.
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Sell, mETH, 1e18, 0, uint64(block.timestamp + 10));
        bytes memory sig = _sign(aliceKey, a);

        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.InsufficientHoldings.selector, mETH, 0, 1e18));
        engine.submitAction(a, sig);
    }

    function test_submitAction_revertsForNonexistentAgent() public {
        ExecutionEngine.Action memory a = ExecutionEngine.Action({
            challengeId: challengeId,
            agentId: 9999,
            kind: uint8(ExecutionEngine.ActionKind.Buy),
            asset: USDY,
            size: 100e18,
            nonce: 0,
            deadline: uint64(block.timestamp + 10)
        });
        bytes memory sig = _sign(aliceKey, a);

        // Hits the NotParticipant gate first because phaseOf and isParticipant queries succeed,
        // and the unregistered agentId is naturally not enrolled.
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.NotParticipant.selector, challengeId, 9999));
        engine.submitAction(a, sig);
    }

    // ---------- portfolio value view ----------

    function test_getPortfolioValue_uninitializedReturnsStartingBalance() public view {
        assertEq(engine.getPortfolioValue(challengeId, agentAlice), STARTING_BALANCE);
    }

    function test_getPortfolioValue_includesHoldingsAtSpot() public {
        // Buy 1 mETH at 3000.
        ExecutionEngine.Action memory a =
            _action(agentAlice, ExecutionEngine.ActionKind.Buy, mETH, 3000e18, 0, uint64(block.timestamp + 10));
        engine.submitAction(a, _sign(aliceKey, a));

        // Spot still 3000 → portfolio value == starting balance.
        assertEq(engine.getPortfolioValue(challengeId, agentAlice), STARTING_BALANCE);

        // Spot pumps to 3500 → portfolio = 7000 cash + 1 * 3500 = 10500.
        oracle.setPrice(mETH, 3500e18);
        assertEq(engine.getPortfolioValue(challengeId, agentAlice), 10500e18);
    }

    // ---------- admin ----------

    function test_setPriceOracle_onlyOwner() public {
        MockPriceOracle newOracle = new MockPriceOracle();

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, devAlice));
        vm.prank(devAlice);
        engine.setPriceOracle(newOracle);

        vm.expectEmit(true, true, false, false, address(engine));
        emit PriceOracleUpdated(address(oracle), address(newOracle));
        vm.prank(admin);
        engine.setPriceOracle(newOracle);
        assertEq(address(engine.priceOracle()), address(newOracle));
    }

    function test_setPriceOracle_revertsOnZero() public {
        vm.expectRevert(ExecutionEngine.ZeroAddress.selector);
        vm.prank(admin);
        engine.setPriceOracle(IPriceOracle(address(0)));
    }

    // ---------- fuzz ----------

    function testFuzz_submitAction_nonceMonotonic(uint8 n) public {
        n = uint8(bound(n, 1, 20));
        uint64 dl = uint64(block.timestamp + 1 hours);

        for (uint64 i = 0; i < n; ++i) {
            ExecutionEngine.Action memory a = _action(agentAlice, ExecutionEngine.ActionKind.Buy, USDY, 10e18, i, dl);
            engine.submitAction(a, _sign(aliceKey, a));
        }
        assertEq(engine.nextNonce(challengeId, agentAlice), uint256(n));
        assertEq(engine.cash(challengeId, agentAlice), uint256(STARTING_BALANCE) - 10e18 * uint256(n));
    }
}
