// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AgentRegistryTest is Test {
    AgentRegistry internal registry;

    address internal admin = address(0xA11CE);
    address internal devAlice = address(0xA1);
    address internal devBob = address(0xB0B);

    address internal signerAlice = address(0xA1517E);
    address internal signerBob = address(0xB0B517E);
    bytes32 internal stratAlice = keccak256("alice-momentum-v1");
    bytes32 internal stratBob = keccak256("bob-mean-revert-v1");

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed developer,
        address indexed signingKey,
        bytes32 strategyHash,
        uint64 registeredAt
    );
    event SigningKeyRotated(uint256 indexed agentId, address indexed oldKey, address indexed newKey);
    event StrategyHashUpdated(uint256 indexed agentId, bytes32 indexed oldHash, bytes32 indexed newHash);
    event BaseURIUpdated(string newBaseURI);

    function setUp() public {
        registry = new AgentRegistry(admin);
    }

    // ---------- registration ----------

    function test_register_mintsNftAndStoresAgent() public {
        vm.warp(1_750_000_000);

        vm.expectEmit(true, true, true, true, address(registry));
        emit AgentRegistered(1, devAlice, signerAlice, stratAlice, uint64(block.timestamp));

        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");

        assertEq(agentId, 1);
        assertEq(registry.ownerOf(1), devAlice);
        assertEq(registry.balanceOf(devAlice), 1);
        assertEq(registry.totalAgents(), 1);
        assertEq(registry.agentIdBySigningKey(signerAlice), 1);

        AgentRegistry.Agent memory a = registry.getAgent(1);
        assertEq(a.developer, devAlice);
        assertEq(a.signingKey, signerAlice);
        assertEq(a.strategyHash, stratAlice);
        assertEq(a.registeredAt, uint64(block.timestamp));
    }

    function test_register_agentIdIncrements() public {
        vm.prank(devAlice);
        uint256 id1 = registry.registerAgent(signerAlice, stratAlice, "");
        vm.prank(devBob);
        uint256 id2 = registry.registerAgent(signerBob, stratBob, "");
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalAgents(), 2);
    }

    function test_register_revertsOnZeroSigningKey() public {
        vm.prank(devAlice);
        vm.expectRevert(AgentRegistry.ZeroSigningKey.selector);
        registry.registerAgent(address(0), stratAlice, "");
    }

    function test_register_revertsOnZeroStrategyHash() public {
        vm.prank(devAlice);
        vm.expectRevert(AgentRegistry.ZeroStrategyHash.selector);
        registry.registerAgent(signerAlice, bytes32(0), "");
    }

    function test_register_revertsOnDuplicateSigningKey() public {
        vm.prank(devAlice);
        registry.registerAgent(signerAlice, stratAlice, "");

        vm.prank(devBob);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.SigningKeyAlreadyRegistered.selector, signerAlice, 1));
        registry.registerAgent(signerAlice, stratBob, "");
    }

    // ---------- signing key rotation ----------

    function test_updateSigningKey_onlyOwnerCanRotate() public {
        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");

        address newSigner = address(0xBEEF);

        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, agentId, devBob));
        vm.prank(devBob);
        registry.updateSigningKey(agentId, newSigner);

        vm.expectEmit(true, true, true, true, address(registry));
        emit SigningKeyRotated(agentId, signerAlice, newSigner);
        vm.prank(devAlice);
        registry.updateSigningKey(agentId, newSigner);

        assertEq(registry.agentIdBySigningKey(newSigner), agentId);
        assertEq(registry.agentIdBySigningKey(signerAlice), 0);
        assertEq(registry.getAgent(agentId).signingKey, newSigner);
    }

    function test_updateSigningKey_revertsOnZero() public {
        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");
        vm.prank(devAlice);
        vm.expectRevert(AgentRegistry.ZeroSigningKey.selector);
        registry.updateSigningKey(agentId, address(0));
    }

    function test_updateSigningKey_revertsIfKeyUsedByOtherAgent() public {
        vm.prank(devAlice);
        uint256 id1 = registry.registerAgent(signerAlice, stratAlice, "");
        vm.prank(devBob);
        uint256 id2 = registry.registerAgent(signerBob, stratBob, "");

        vm.prank(devAlice);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.SigningKeyAlreadyRegistered.selector, signerBob, id2));
        registry.updateSigningKey(id1, signerBob);
    }

    function test_updateSigningKey_sameKeyIsNoop() public {
        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");
        vm.prank(devAlice);
        registry.updateSigningKey(agentId, signerAlice);
        assertEq(registry.getAgent(agentId).signingKey, signerAlice);
    }

    // ---------- strategy hash update ----------

    function test_updateStrategyHash_onlyOwnerCanUpdate() public {
        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");

        bytes32 newHash = keccak256("alice-momentum-v2");

        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, agentId, devBob));
        vm.prank(devBob);
        registry.updateStrategyHash(agentId, newHash);

        vm.expectEmit(true, true, true, true, address(registry));
        emit StrategyHashUpdated(agentId, stratAlice, newHash);
        vm.prank(devAlice);
        registry.updateStrategyHash(agentId, newHash);

        assertEq(registry.getAgent(agentId).strategyHash, newHash);
    }

    function test_updateStrategyHash_revertsOnZero() public {
        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");
        vm.prank(devAlice);
        vm.expectRevert(AgentRegistry.ZeroStrategyHash.selector);
        registry.updateStrategyHash(agentId, bytes32(0));
    }

    // ---------- ownership transfer effects ----------

    function test_transferringNft_movesUpdateRights() public {
        vm.prank(devAlice);
        uint256 agentId = registry.registerAgent(signerAlice, stratAlice, "");

        vm.prank(devAlice);
        registry.transferFrom(devAlice, devBob, agentId);

        // Old owner no longer authorized.
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, agentId, devAlice));
        vm.prank(devAlice);
        registry.updateSigningKey(agentId, address(0x1234));

        // New owner can rotate.
        vm.prank(devBob);
        registry.updateSigningKey(agentId, address(0x1234));

        // Immutable record of original developer preserved.
        assertEq(registry.getAgent(agentId).developer, devAlice);
    }

    // ---------- view: getAgent on nonexistent ----------

    function test_getAgent_revertsOnNonexistent() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentDoesNotExist.selector, 999));
        registry.getAgent(999);
    }

    // ---------- tokenURI / baseURI ----------

    function test_tokenURI_perAgentUriTakesPriority() public {
        vm.prank(devAlice);
        registry.registerAgent(signerAlice, stratAlice, "ipfs://alice-meta");

        // Even with base URI set, per-agent wins.
        vm.prank(admin);
        registry.setBaseURI("https://arena.example/agents/");

        assertEq(registry.tokenURI(1), "ipfs://alice-meta");
    }

    function test_tokenURI_fallsBackToBaseUriPlusId() public {
        vm.prank(devAlice);
        registry.registerAgent(signerAlice, stratAlice, "");

        vm.prank(admin);
        registry.setBaseURI("https://arena.example/agents/");

        assertEq(registry.tokenURI(1), "https://arena.example/agents/1");
    }

    function test_tokenURI_emptyWhenNeitherSet() public {
        vm.prank(devAlice);
        registry.registerAgent(signerAlice, stratAlice, "");
        assertEq(registry.tokenURI(1), "");
    }

    function test_setBaseURI_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, devAlice));
        vm.prank(devAlice);
        registry.setBaseURI("x");

        vm.expectEmit(false, false, false, true, address(registry));
        emit BaseURIUpdated("y");
        vm.prank(admin);
        registry.setBaseURI("y");
    }

    function test_tokenURI_revertsForNonexistent() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 42));
        registry.tokenURI(42);
    }

    // ---------- fuzz: signing-key uniqueness invariant ----------

    function testFuzz_register_uniqueSigningKey(address keyA, address keyB, bytes32 hA, bytes32 hB) public {
        vm.assume(keyA != address(0) && keyB != address(0));
        vm.assume(hA != bytes32(0) && hB != bytes32(0));
        vm.assume(keyA != keyB);

        vm.prank(devAlice);
        registry.registerAgent(keyA, hA, "");

        vm.prank(devBob);
        registry.registerAgent(keyB, hB, "");

        assertEq(registry.agentIdBySigningKey(keyA), 1);
        assertEq(registry.agentIdBySigningKey(keyB), 2);
        assertEq(registry.totalAgents(), 2);
    }

    function testFuzz_register_duplicateKeyAlwaysReverts(address key, bytes32 h1, bytes32 h2) public {
        vm.assume(key != address(0));
        vm.assume(h1 != bytes32(0) && h2 != bytes32(0));

        vm.prank(devAlice);
        registry.registerAgent(key, h1, "");

        vm.prank(devBob);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.SigningKeyAlreadyRegistered.selector, key, 1));
        registry.registerAgent(key, h2, "");
    }
}
