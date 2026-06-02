// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Leaderboard} from "./Leaderboard.sol";

/// @title Reputation — derived view over an agent's settled-challenge history.
/// @notice Pure read contract. Aggregates an agent's cumulative on-chain history into a
///         compact score: challenges entered, wins (rank-1 finishes), cumulative PnL, and
///         average final portfolio value. Frontends, AgentRegistry tokenURI services, and
///         StakeVault risk heuristics can all consume this in a single call.
/// @dev    Sharpe-style risk-adjusted scoring (consistency, volatility, drawdown) is v2.
contract Reputation {
    struct ReputationScore {
        uint256 totalChallenges;
        uint256 wins;
        int256 cumulativePnL;
        uint256 averageFinalValue;
    }

    Leaderboard public immutable leaderboard;

    error ZeroAddress();

    constructor(Leaderboard _leaderboard) {
        if (address(_leaderboard) == address(0)) revert ZeroAddress();
        leaderboard = _leaderboard;
    }

    function reputationOf(uint256 agentId) external view returns (ReputationScore memory s) {
        uint256[] memory history = leaderboard.agentChallengeHistory(agentId);
        uint256 n = history.length;
        if (n == 0) return s;

        uint256 sumFinalValue;
        int256 sumPnL;
        uint256 winCount;

        for (uint256 i = 0; i < n; ++i) {
            uint256 cid = history[i];
            Leaderboard.AgentResult memory r = leaderboard.resultOf(cid, agentId);
            sumFinalValue += r.finalValue;
            sumPnL += r.pnl;
            if (leaderboard.winnerOf(cid) == agentId) {
                unchecked {
                    ++winCount;
                }
            }
        }

        s.totalChallenges = n;
        s.wins = winCount;
        s.cumulativePnL = sumPnL;
        s.averageFinalValue = sumFinalValue / n;
    }
}
