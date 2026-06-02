// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Challenge} from "./Challenge.sol";
import {ExecutionEngine} from "./ExecutionEngine.sol";

/// @title Leaderboard — settles per-agent results and rankings for a finished challenge.
/// @notice Anyone may call settle() once the challenge's endTime has passed. The contract
///         snapshots each participant's mark-to-market portfolio value from ExecutionEngine,
///         records signed PnL relative to the challenge's starting balance, and stores a
///         descending ranking of agentIds. Settlement is one-shot per challenge.
/// @dev    PnL is timing-sensitive: getPortfolioValue uses live oracle prices, so the first
///         caller after endTime locks in those prices. For paper-trading sandbox MVP this is
///         acceptable; a snapshotting scheme that freezes prices at exactly endTime is v2.
contract Leaderboard {
    struct AgentResult {
        uint256 finalValue;
        int256 pnl;
    }

    Challenge public immutable challenge;
    ExecutionEngine public immutable executionEngine;

    mapping(uint256 challengeId => mapping(uint256 agentId => AgentResult)) private _results;
    mapping(uint256 challengeId => uint256[]) private _ranking;
    mapping(uint256 challengeId => bool) public isSettled;
    mapping(uint256 agentId => uint256[]) private _agentChallengeHistory;

    event LeaderboardSettled(uint256 indexed challengeId, address indexed settler, uint256 participants);
    event AgentResultRecorded(
        uint256 indexed challengeId, uint256 indexed agentId, uint256 finalValue, int256 pnl, uint16 rank
    );

    error ZeroAddress();
    error ChallengeNotEnded(uint256 challengeId, uint64 endTime, uint256 nowTs);
    error AlreadySettled(uint256 challengeId);
    error NotSettled(uint256 challengeId);
    error NoParticipants(uint256 challengeId);

    constructor(Challenge _challenge, ExecutionEngine _executionEngine) {
        if (address(_challenge) == address(0) || address(_executionEngine) == address(0)) {
            revert ZeroAddress();
        }
        challenge = _challenge;
        executionEngine = _executionEngine;
    }

    /// @notice Snapshot and rank all participants of a finished challenge.
    function settle(uint256 challengeId) external {
        if (isSettled[challengeId]) revert AlreadySettled(challengeId);

        Challenge.ChallengeData memory cd = challenge.getChallenge(challengeId);
        if (block.timestamp < cd.endTime) revert ChallengeNotEnded(challengeId, cd.endTime, block.timestamp);

        uint256[] memory participants = challenge.getParticipants(challengeId);
        uint256 n = participants.length;

        // Empty challenges still get marked settled — keeps downstream readers monotonic.
        if (n == 0) {
            isSettled[challengeId] = true;
            emit LeaderboardSettled(challengeId, msg.sender, 0);
            return;
        }

        // Snapshot final values.
        uint256[] memory ids = new uint256[](n);
        uint256[] memory vals = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            ids[i] = participants[i];
            vals[i] = executionEngine.getPortfolioValue(challengeId, participants[i]);
        }

        // Insertion sort: descending by final value. n is bounded by challenge entry count,
        // realistic upper bound is small (~tens). O(n²) is acceptable on testnet/MVP.
        for (uint256 i = 1; i < n; ++i) {
            uint256 curVal = vals[i];
            uint256 curId = ids[i];
            uint256 j = i;
            while (j > 0 && vals[j - 1] < curVal) {
                vals[j] = vals[j - 1];
                ids[j] = ids[j - 1];
                unchecked {
                    --j;
                }
            }
            vals[j] = curVal;
            ids[j] = curId;
        }

        // Persist.
        int256 startBal = int256(uint256(cd.startingBalance));
        uint256[] storage rankSlot = _ranking[challengeId];
        for (uint256 i = 0; i < n; ++i) {
            int256 pnl = int256(vals[i]) - startBal;
            _results[challengeId][ids[i]] = AgentResult({finalValue: vals[i], pnl: pnl});
            rankSlot.push(ids[i]);
            _agentChallengeHistory[ids[i]].push(challengeId);
            emit AgentResultRecorded(challengeId, ids[i], vals[i], pnl, uint16(i + 1));
        }

        isSettled[challengeId] = true;
        emit LeaderboardSettled(challengeId, msg.sender, n);
    }

    // -------- views --------

    function resultOf(uint256 challengeId, uint256 agentId) external view returns (AgentResult memory) {
        if (!isSettled[challengeId]) revert NotSettled(challengeId);
        return _results[challengeId][agentId];
    }

    function ranking(uint256 challengeId) external view returns (uint256[] memory) {
        if (!isSettled[challengeId]) revert NotSettled(challengeId);
        return _ranking[challengeId];
    }

    function winnerOf(uint256 challengeId) external view returns (uint256) {
        if (!isSettled[challengeId]) revert NotSettled(challengeId);
        uint256[] storage r = _ranking[challengeId];
        if (r.length == 0) revert NoParticipants(challengeId);
        return r[0];
    }

    function rankOf(uint256 challengeId, uint256 agentId) external view returns (uint16) {
        if (!isSettled[challengeId]) revert NotSettled(challengeId);
        uint256[] storage r = _ranking[challengeId];
        for (uint256 i = 0; i < r.length; ++i) {
            if (r[i] == agentId) return uint16(i + 1);
        }
        return 0; // agentId not in this challenge's ranking
    }

    function agentChallengeHistory(uint256 agentId) external view returns (uint256[] memory) {
        return _agentChallengeHistory[agentId];
    }

    function agentChallengeCount(uint256 agentId) external view returns (uint256) {
        return _agentChallengeHistory[agentId].length;
    }
}
