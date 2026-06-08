// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {Leaderboard} from "./Leaderboard.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title TrophyNFT — minted to an agent's developer when their agent finishes a challenge profitably.
/// @notice Anyone may call claim(); the NFT is always sent to the agent's original developer.
///         One trophy per (challengeId, agentId). All proof data stored on-chain; metadata is a
///         fully on-chain SVG — no IPFS, no external hosting.
contract TrophyNFT is ERC721 {
    using Strings for uint256;

    struct Trophy {
        uint256 challengeId;
        uint256 agentId;
        uint256 finalValue; // 1e18 scaled
        int256  pnl;        // 1e18 scaled, signed
        uint16  rank;
        uint64  claimedAt;
    }

    Leaderboard   public immutable leaderboard;
    AgentRegistry public immutable registry;

    uint256 private _nextTokenId = 1;
    mapping(uint256 tokenId  => Trophy) public trophies;
    mapping(uint256 challengeId => mapping(uint256 agentId => uint256)) public tokenOf;

    event TrophyClaimed(
        uint256 indexed tokenId,
        uint256 indexed challengeId,
        uint256 indexed agentId,
        address developer,
        int256 pnl,
        uint16 rank
    );

    error NotSettled(uint256 challengeId);
    error NotProfitable(uint256 agentId, int256 pnl);
    error AlreadyClaimed(uint256 challengeId, uint256 agentId);
    error ZeroAddress();

    constructor(Leaderboard _leaderboard, AgentRegistry _registry) ERC721("Agent Arena Trophy", "TROPHY") {
        if (address(_leaderboard) == address(0) || address(_registry) == address(0)) revert ZeroAddress();
        leaderboard = _leaderboard;
        registry    = _registry;
    }

    /// @notice Mint a profit-proof trophy for any agent that finished a settled challenge with PnL > 0.
    ///         Caller pays gas; NFT is delivered to the agent's developer address.
    function claim(uint256 challengeId, uint256 agentId) external returns (uint256 tokenId) {
        if (!leaderboard.isSettled(challengeId))           revert NotSettled(challengeId);
        if (tokenOf[challengeId][agentId] != 0)            revert AlreadyClaimed(challengeId, agentId);

        Leaderboard.AgentResult memory result = leaderboard.resultOf(challengeId, agentId);
        if (result.pnl <= 0)                               revert NotProfitable(agentId, result.pnl);

        uint16  rank      = leaderboard.rankOf(challengeId, agentId);
        address developer = registry.getAgent(agentId).developer;

        tokenId = _nextTokenId++;
        trophies[tokenId] = Trophy({
            challengeId: challengeId,
            agentId:     agentId,
            finalValue:  result.finalValue,
            pnl:         result.pnl,
            rank:        rank,
            claimedAt:   uint64(block.timestamp)
        });
        tokenOf[challengeId][agentId] = tokenId;

        _mint(developer, tokenId);
        emit TrophyClaimed(tokenId, challengeId, agentId, developer, result.pnl, rank);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Trophy memory t = trophies[tokenId];

        bool    positive = t.pnl >= 0;
        uint256 pnlAbs   = positive ? uint256(t.pnl) : uint256(-t.pnl);
        string memory pnlStr = string.concat(positive ? "+" : "-", "$", _fmtUsd(pnlAbs));

        string memory medalChar = t.rank == 1 ? unicode"🥇" : t.rank == 2 ? unicode"🥈" : t.rank == 3 ? unicode"🥉" : "#";
        string memory rankLabel = t.rank <= 3
            ? medalChar
            : string.concat("#", uint256(t.rank).toString());

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">',
            '<rect width="400" height="400" rx="20" fill="#0a0a0f"/>',
            '<rect x="8" y="8" width="384" height="384" rx="16" fill="none" stroke="#7c3aed" stroke-width="1.5"/>',
            '<text x="200" y="58" font-family="monospace" font-size="13" fill="#7c3aed" text-anchor="middle" letter-spacing="3">AGENT ARENA</text>',
            '<text x="200" y="82" font-family="monospace" font-size="10" fill="#6b7280" text-anchor="middle" letter-spacing="1">VERIFIED PROFIT TROPHY</text>',
            '<text x="200" y="180" font-family="monospace" font-size="80" text-anchor="middle">', rankLabel, '</text>',
            '<text x="200" y="228" font-family="monospace" font-size="30" fill="', positive ? "#22c55e" : "#ef4444", '" text-anchor="middle" font-weight="bold">', pnlStr, '</text>',
            '<text x="200" y="270" font-family="monospace" font-size="12" fill="#9ca3af" text-anchor="middle">Challenge #', t.challengeId.toString(), unicode"  ·  Agent #", t.agentId.toString(), '</text>',
            '<text x="200" y="294" font-family="monospace" font-size="11" fill="#4b5563" text-anchor="middle">Final Value: $', _fmtUsd(t.finalValue), '</text>',
            unicode'<text x="200" y="355" font-family="monospace" font-size="10" fill="#374151" text-anchor="middle">Mantle Network  ·  On-Chain Proof</text>',
            '<text x="200" y="374" font-family="monospace" font-size="9" fill="#1f2937" text-anchor="middle">Agent #', t.agentId.toString(), unicode" traded profitably in Challenge #", t.challengeId.toString(), '</text>',
            '</svg>'
        );

        string memory json = string.concat(
            '{"name":"Agent Arena Trophy #', tokenId.toString(),
            '","description":"Agent #', t.agentId.toString(),
            ' finished Challenge #', t.challengeId.toString(),
            ' with a profit of ', pnlStr, '. Fully on-chain proof minted on Mantle.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":[',
            '{"trait_type":"Challenge","value":', t.challengeId.toString(), '},',
            '{"trait_type":"Agent","value":', t.agentId.toString(), '},',
            '{"trait_type":"Rank","value":', uint256(t.rank).toString(), '},',
            '{"trait_type":"PnL","value":"', pnlStr, '"},',
            '{"trait_type":"Final Value","value":"$', _fmtUsd(t.finalValue), '"}',
            ']}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ── internal ────────────────────────────────────────────────────────────

    function _fmtUsd(uint256 v1e18) internal pure returns (string memory) {
        uint256 dollars = v1e18 / 1e18;
        uint256 cents   = (v1e18 % 1e18) * 100 / 1e18;
        return string.concat(dollars.toString(), ".", cents < 10 ? "0" : "", cents.toString());
    }
}
