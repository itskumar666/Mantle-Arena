// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title AgentRegistry — Agent Arena identity NFT (ERC-8004 inspired)
/// @notice Mints a soul-bound-ish identity NFT for each AI agent that joins the Arena.
///         Each agent has a signing key (used by ExecutionEngine to validate actions),
///         a strategy description hash (off-chain manifest), and an on-chain history
///         that downstream contracts (Leaderboard, Reputation) will index against agentId.
/// @dev    Identity Registry layer of the protocol. The Reputation and Validation
///         layers of the full ERC-8004 design are deferred to later contracts.
contract AgentRegistry is ERC721, Ownable {
    using Strings for uint256;

    struct Agent {
        address developer; // original registrant (immutable record of origin)
        address signingKey; // current ECDSA address that signs ExecutionEngine actions
        bytes32 strategyHash; // hash of off-chain strategy manifest
        uint64 registeredAt; // block timestamp of registration
    }

    uint256 private _nextAgentId = 1;
    string private _baseTokenURI;

    mapping(uint256 agentId => Agent) private _agents;
    mapping(address signingKey => uint256 agentId) public agentIdBySigningKey;

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

    error ZeroSigningKey();
    error ZeroStrategyHash();
    error SigningKeyAlreadyRegistered(address signingKey, uint256 existingAgentId);
    error NotAgentOwner(uint256 agentId, address caller);
    error AgentDoesNotExist(uint256 agentId);

    constructor(address initialOwner) ERC721("Agent Arena Identity", "AGENT") Ownable(initialOwner) {}

    /// @notice Register a new agent. Mints an identity NFT to `msg.sender`.
    /// @param signingKey  ECDSA address whose signatures the ExecutionEngine will accept for this agent.
    /// @param strategyHash Hash of the off-chain strategy manifest. Used downstream for verifiable disclosure.
    /// @param metadataURI Per-agent metadata pointer (optional; pass empty string to use default `baseURI/agentId`).
    /// @return agentId The newly minted agent's id (== ERC-721 tokenId).
    function registerAgent(address signingKey, bytes32 strategyHash, string calldata metadataURI)
        external
        returns (uint256 agentId)
    {
        if (signingKey == address(0)) revert ZeroSigningKey();
        if (strategyHash == bytes32(0)) revert ZeroStrategyHash();

        uint256 existing = agentIdBySigningKey[signingKey];
        if (existing != 0) revert SigningKeyAlreadyRegistered(signingKey, existing);

        agentId = _nextAgentId++;
        agentIdBySigningKey[signingKey] = agentId;

        _agents[agentId] = Agent({
            developer: msg.sender,
            signingKey: signingKey,
            strategyHash: strategyHash,
            registeredAt: uint64(block.timestamp)
        });

        _safeMint(msg.sender, agentId);

        if (bytes(metadataURI).length != 0) {
            _perAgentURI[agentId] = metadataURI;
        }

        emit AgentRegistered(agentId, msg.sender, signingKey, strategyHash, uint64(block.timestamp));
    }

    /// @notice Rotate the signing key of an agent. Only the current NFT owner may call.
    /// @dev    Maintains the signingKey→agentId uniqueness invariant.
    function updateSigningKey(uint256 agentId, address newSigningKey) external {
        _requireAgentOwner(agentId);
        if (newSigningKey == address(0)) revert ZeroSigningKey();

        uint256 existing = agentIdBySigningKey[newSigningKey];
        if (existing != 0 && existing != agentId) {
            revert SigningKeyAlreadyRegistered(newSigningKey, existing);
        }

        Agent storage a = _agents[agentId];
        address oldKey = a.signingKey;
        if (oldKey == newSigningKey) return; // no-op

        delete agentIdBySigningKey[oldKey];
        agentIdBySigningKey[newSigningKey] = agentId;
        a.signingKey = newSigningKey;

        emit SigningKeyRotated(agentId, oldKey, newSigningKey);
    }

    /// @notice Update the strategy manifest hash of an agent. Only the current NFT owner may call.
    function updateStrategyHash(uint256 agentId, bytes32 newStrategyHash) external {
        _requireAgentOwner(agentId);
        if (newStrategyHash == bytes32(0)) revert ZeroStrategyHash();

        Agent storage a = _agents[agentId];
        bytes32 oldHash = a.strategyHash;
        if (oldHash == newStrategyHash) return;

        a.strategyHash = newStrategyHash;
        emit StrategyHashUpdated(agentId, oldHash, newStrategyHash);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        if (!_agentExists(agentId)) revert AgentDoesNotExist(agentId);
        return _agents[agentId];
    }

    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }

    /// @notice Admin: set the base URI used for tokenURI when no per-agent URI is set.
    ///         Intended to point at a metadata service that composes live reputation in.
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory perAgent = _perAgentURI[tokenId];
        if (bytes(perAgent).length != 0) return perAgent;
        if (bytes(_baseTokenURI).length == 0) return "";
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString()));
    }

    mapping(uint256 agentId => string) private _perAgentURI;

    function _requireAgentOwner(uint256 agentId) internal view {
        address owner = _ownerOf(agentId);
        if (owner == address(0)) revert AgentDoesNotExist(agentId);
        if (owner != msg.sender) revert NotAgentOwner(agentId, msg.sender);
    }

    function _agentExists(uint256 agentId) internal view returns (bool) {
        return _ownerOf(agentId) != address(0);
    }
}
