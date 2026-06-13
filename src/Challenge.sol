// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Challenge — Arena competition lifecycle
/// @notice Defines a paper-trading competition: enrollment window, trading window,
///         virtual starting balance per agent, allowed-asset universe, entry fee in MNT,
///         and a settler bounty. Multiple challenges can run concurrently.
/// @dev    Settlement here transitions state and pays the settler. PnL accounting and
///         prize distribution live in Leaderboard + StakeVault (later contracts).
contract Challenge is Ownable, ReentrancyGuard {
    enum Phase {
        Enrolling, // now < startTime
        Live, // startTime <= now < endTime
        Ended, // endTime <= now, not yet settled
        Settled // settle() called
    }

    struct ChallengeData {
        address creator;
        uint64 startTime;
        uint64 endTime;
        uint128 startingBalance; // virtual quote-currency units per agent (e.g. 1e18 = $1)
        uint128 entryFee; // MNT wei per agent entry
        uint128 settleBounty; // MNT wei paid to whoever calls settle()
        uint128 entryFeesCollected; // running total of MNT held for this challenge
        bool settled;
    }

    IERC721 public immutable agentRegistry;
    address public protocolTreasury;
    uint256 public nextChallengeId = 1;

    mapping(uint256 challengeId => ChallengeData) private _challenges;
    mapping(uint256 challengeId => address[]) private _allowedAssets;
    mapping(uint256 challengeId => uint256[]) private _participants;
    mapping(uint256 challengeId => mapping(uint256 agentId => bool)) public isParticipant;

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
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    error InvalidTimes(uint64 startTime, uint64 endTime);
    error EmptyAssetUniverse();
    error BountyExceedsExpectedFees();
    error ChallengeDoesNotExist(uint256 challengeId);
    error WrongPhase(uint256 challengeId, Phase actual, Phase required);
    error AgentDoesNotExist(uint256 agentId);
    error NotAgentOwner(uint256 agentId, address caller);
    error AlreadyEntered(uint256 challengeId, uint256 agentId);
    error IncorrectEntryFee(uint128 expected, uint256 sent);
    error AlreadySettled(uint256 challengeId);
    error TransferFailed();

    constructor(IERC721 _agentRegistry, address initialOwner, address treasury) Ownable(initialOwner) {
        agentRegistry = _agentRegistry;
        protocolTreasury = treasury == address(0) ? initialOwner : treasury;
    }

    // -------- admin --------

    /// @notice Create a new challenge. Permissionless — anyone can host a competition.
    /// @param startTime       Unix time when enrollment closes and the live window opens.
    /// @param endTime         Unix time when trading closes and the challenge becomes settleable.
    /// @param startingBalance Virtual quote-currency balance allocated to each agent.
    /// @param entryFee        MNT wei every entrant pays to register an agent.
    /// @param settleBounty    MNT wei paid to whoever calls settle(); must be coverable by entry fees alone.
    /// @param allowedAssets   Asset identifiers (price-feed addresses) the trading window restricts agents to.
    function createChallenge(
        uint64 startTime,
        uint64 endTime,
        uint128 startingBalance,
        uint128 entryFee,
        uint128 settleBounty,
        address[] calldata allowedAssets
    ) external returns (uint256 challengeId) {
        if (startTime <= block.timestamp || endTime <= startTime) {
            revert InvalidTimes(startTime, endTime);
        }
        if (allowedAssets.length == 0) revert EmptyAssetUniverse();
        // Settle bounty must be coverable by entry fees alone — protocol does not subsidise settlement.
        // (entryFee == 0 implicitly means bounty must also be zero.)
        if (entryFee > 0) {
            if (uint256(settleBounty) > type(uint128).max) revert BountyExceedsExpectedFees(); // defensive
        } else if (settleBounty > 0) {
            revert BountyExceedsExpectedFees();
        }

        challengeId = nextChallengeId++;
        _challenges[challengeId] = ChallengeData({
            creator: msg.sender,
            startTime: startTime,
            endTime: endTime,
            startingBalance: startingBalance,
            entryFee: entryFee,
            settleBounty: settleBounty,
            entryFeesCollected: 0,
            settled: false
        });

        address[] storage assets = _allowedAssets[challengeId];
        for (uint256 i = 0; i < allowedAssets.length; ++i) {
            assets.push(allowedAssets[i]);
        }

        emit ChallengeCreated(
            challengeId, msg.sender, startTime, endTime, startingBalance, entryFee, settleBounty, allowedAssets
        );
    }

    function setProtocolTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert TransferFailed();
        address old = protocolTreasury;
        protocolTreasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    // -------- agent participation --------

    /// @notice Enter an agent into a challenge. Caller must own the agent's identity NFT.
    /// @dev    Strict NFT-owner gate (MVP). v2 may relax to "anyone who pays" with developer opt-in.
    function enterAgent(uint256 challengeId, uint256 agentId) external payable nonReentrant {
        ChallengeData storage c = _challenges[challengeId];
        if (c.startTime == 0) revert ChallengeDoesNotExist(challengeId);
        Phase p = _phaseOf(c);
        if (p != Phase.Enrolling) revert WrongPhase(challengeId, p, Phase.Enrolling);

        address agentOwner = _safeOwnerOf(agentId);
        if (agentOwner == address(0)) revert AgentDoesNotExist(agentId);
        if (agentOwner != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        if (isParticipant[challengeId][agentId]) revert AlreadyEntered(challengeId, agentId);
        if (msg.value != c.entryFee) revert IncorrectEntryFee(c.entryFee, msg.value);

        isParticipant[challengeId][agentId] = true;
        _participants[challengeId].push(agentId);
        c.entryFeesCollected += c.entryFee;

        emit AgentEntered(challengeId, agentId, msg.sender, c.entryFee);
    }

    // -------- settlement --------

    /// @notice Finalize a challenge once trading has ended. Pays the settler the configured bounty
    ///         and forwards the residue to the protocol treasury. Idempotent — reverts if already settled.
    function settle(uint256 challengeId) external nonReentrant {
        ChallengeData storage c = _challenges[challengeId];
        if (c.startTime == 0) revert ChallengeDoesNotExist(challengeId);
        if (c.settled) revert AlreadySettled(challengeId);
        Phase p = _phaseOf(c);
        if (p != Phase.Ended) revert WrongPhase(challengeId, p, Phase.Ended);

        c.settled = true;

        uint128 totalFees = c.entryFeesCollected;
        uint128 bounty = c.settleBounty <= totalFees ? c.settleBounty : totalFees;
        uint128 residue = totalFees - bounty;

        if (bounty > 0) {
            (bool ok,) = msg.sender.call{value: bounty}("");
            if (!ok) revert TransferFailed();
        }
        if (residue > 0) {
            (bool ok,) = protocolTreasury.call{value: residue}("");
            if (!ok) revert TransferFailed();
        }

        emit ChallengeSettled(challengeId, msg.sender, bounty, residue);
    }

    // -------- views --------

    function getChallenge(uint256 challengeId) external view returns (ChallengeData memory) {
        ChallengeData memory c = _challenges[challengeId];
        if (c.startTime == 0) revert ChallengeDoesNotExist(challengeId);
        return c;
    }

    function getAllowedAssets(uint256 challengeId) external view returns (address[] memory) {
        if (_challenges[challengeId].startTime == 0) revert ChallengeDoesNotExist(challengeId);
        return _allowedAssets[challengeId];
    }

    function getParticipants(uint256 challengeId) external view returns (uint256[] memory) {
        if (_challenges[challengeId].startTime == 0) revert ChallengeDoesNotExist(challengeId);
        return _participants[challengeId];
    }

    function participantCount(uint256 challengeId) external view returns (uint256) {
        return _participants[challengeId].length;
    }

    function phaseOf(uint256 challengeId) external view returns (Phase) {
        ChallengeData storage c = _challenges[challengeId];
        if (c.startTime == 0) revert ChallengeDoesNotExist(challengeId);
        return _phaseOf(c);
    }

    // -------- internals --------

    function _phaseOf(ChallengeData storage c) internal view returns (Phase) {
        if (c.settled) return Phase.Settled;
        if (block.timestamp < c.startTime) return Phase.Enrolling;
        if (block.timestamp < c.endTime) return Phase.Live;
        return Phase.Ended;
    }

    /// @dev IERC721.ownerOf reverts for nonexistent tokens; absorb that and signal via a zero return.
    function _safeOwnerOf(uint256 agentId) internal view returns (address) {
        try agentRegistry.ownerOf(agentId) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }
}
