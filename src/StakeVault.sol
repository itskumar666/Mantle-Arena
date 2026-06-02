// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AgentRegistry} from "./AgentRegistry.sol";
import {Challenge} from "./Challenge.sol";
import {Leaderboard} from "./Leaderboard.sol";

/// @title StakeVault — humans express conviction by staking on agents.
/// @notice Prediction-market model: losers' stakes are pooled into the prize pool. After the
///         Leaderboard settles a challenge, the prize pool is split 70/20/10 — winning agent's
///         backers (pro-rata to their stake on the winner), the protocol treasury, and the
///         winning agent's developer. Winning backers also get their original stake back.
///         Losing backers forfeit their stake (it funded the prize pool).
/// @dev    MVP uses native MNT (msg.value). PRD §3 specifies USDC for mainnet — swap to ERC-20
///         once Mantle mainnet exposes a canonical USDC and we plumb token routing through.
///         Pull pattern on payouts (claim) so a single griefer can't OOG the distribute() loop.
contract StakeVault is Ownable, ReentrancyGuard {
    uint256 public constant BPS_WINNER_BACKERS = 7000;
    uint256 public constant BPS_PROTOCOL = 2000;
    uint256 public constant BPS_DEV = 1000;
    uint256 public constant BPS_TOTAL = 10000;

    AgentRegistry public immutable agentRegistry;
    Challenge public immutable challenge;
    Leaderboard public immutable leaderboard;
    address public protocolTreasury;

    mapping(uint256 challengeId => mapping(uint256 agentId => mapping(address backer => uint256))) public stakeOf;
    mapping(uint256 challengeId => mapping(uint256 agentId => uint256)) public agentStakeTotal;
    mapping(uint256 challengeId => mapping(uint256 agentId => address[])) private _agentBackers;
    mapping(uint256 challengeId => mapping(uint256 agentId => mapping(address backer => bool))) private _isBacker;
    mapping(uint256 challengeId => bool) public distributed;
    mapping(address => uint256) public claimable;

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
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    error ZeroAddress();
    error ZeroAmount();
    error NotEnrolling(uint256 challengeId, Challenge.Phase phase);
    error NotAParticipant(uint256 challengeId, uint256 agentId);
    error NotSettled(uint256 challengeId);
    error AlreadyDistributed(uint256 challengeId);
    error NothingToClaim();
    error TransferFailed();

    constructor(
        AgentRegistry _agentRegistry,
        Challenge _challenge,
        Leaderboard _leaderboard,
        address initialOwner,
        address treasury
    ) Ownable(initialOwner) {
        if (
            address(_agentRegistry) == address(0) || address(_challenge) == address(0)
                || address(_leaderboard) == address(0)
        ) revert ZeroAddress();
        agentRegistry = _agentRegistry;
        challenge = _challenge;
        leaderboard = _leaderboard;
        protocolTreasury = treasury == address(0) ? initialOwner : treasury;
    }

    // -------- admin --------

    function setProtocolTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address old = protocolTreasury;
        protocolTreasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    // -------- stake --------

    function stake(uint256 challengeId, uint256 agentId) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        Challenge.Phase phase = challenge.phaseOf(challengeId);
        if (phase != Challenge.Phase.Enrolling) revert NotEnrolling(challengeId, phase);
        if (!challenge.isParticipant(challengeId, agentId)) revert NotAParticipant(challengeId, agentId);

        if (!_isBacker[challengeId][agentId][msg.sender]) {
            _isBacker[challengeId][agentId][msg.sender] = true;
            _agentBackers[challengeId][agentId].push(msg.sender);
        }
        stakeOf[challengeId][agentId][msg.sender] += msg.value;
        agentStakeTotal[challengeId][agentId] += msg.value;

        emit Staked(challengeId, agentId, msg.sender, msg.value);
    }

    // -------- distribute --------

    /// @notice Settle the stake pool of a finished challenge. Winners get principal + 70% of
    ///         loser pool pro-rata. Protocol gets 20%, winning agent's developer gets 10%.
    ///         Losers lose their stake (it funded the prize pool).
    function distribute(uint256 challengeId) external nonReentrant {
        if (distributed[challengeId]) revert AlreadyDistributed(challengeId);
        if (!leaderboard.isSettled(challengeId)) revert NotSettled(challengeId);
        distributed[challengeId] = true;

        uint256[] memory participants = challenge.getParticipants(challengeId);
        if (participants.length == 0) {
            emit Distributed(challengeId, 0, 0, 0, 0, 0);
            return;
        }

        uint256 winnerAgentId = leaderboard.winnerOf(challengeId);

        // Build loser pool by summing stakes on every non-winner participant.
        uint256 loserPool;
        for (uint256 i = 0; i < participants.length; ++i) {
            uint256 a = participants[i];
            if (a != winnerAgentId) loserPool += agentStakeTotal[challengeId][a];
        }

        uint256 protocolCut = (loserPool * BPS_PROTOCOL) / BPS_TOTAL;
        uint256 devCut = (loserPool * BPS_DEV) / BPS_TOTAL;
        // Use subtraction to absorb rounding into the winner-backer pool first.
        uint256 winnerBackerPool = loserPool - protocolCut - devCut;

        uint256 winnerTotal = agentStakeTotal[challengeId][winnerAgentId];
        address[] memory winnerBackers = _agentBackers[challengeId][winnerAgentId];

        if (winnerBackers.length > 0 && winnerTotal > 0) {
            for (uint256 i = 0; i < winnerBackers.length; ++i) {
                address backer = winnerBackers[i];
                uint256 backerStake = stakeOf[challengeId][winnerAgentId][backer];
                uint256 bonus = winnerBackerPool > 0 ? (winnerBackerPool * backerStake) / winnerTotal : 0;
                claimable[backer] += backerStake + bonus;
            }
        } else {
            // No one bet on the winner — bonus spills to the protocol.
            protocolCut += winnerBackerPool;
            winnerBackerPool = 0;
        }

        address winnerDeveloper = agentRegistry.getAgent(winnerAgentId).developer;
        if (devCut > 0) claimable[winnerDeveloper] += devCut;
        if (protocolCut > 0) claimable[protocolTreasury] += protocolCut;

        emit Distributed(challengeId, winnerAgentId, loserPool, winnerBackerPool, protocolCut, devCut);
    }

    // -------- claim --------

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(msg.sender, amount);
    }

    // -------- views --------

    function backersOf(uint256 challengeId, uint256 agentId) external view returns (address[] memory) {
        return _agentBackers[challengeId][agentId];
    }

    function backerCount(uint256 challengeId, uint256 agentId) external view returns (uint256) {
        return _agentBackers[challengeId][agentId].length;
    }
}
