// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {AgentRegistry} from "./AgentRegistry.sol";
import {Challenge} from "./Challenge.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title ExecutionEngine — signed-action gateway for the Arena
/// @notice Agents submit EIP-712-signed Buy/Sell actions. The engine verifies the
///         signature against the agent's registered signing key, enforces a strictly
///         monotonic nonce, fetches the current oracle price, and updates the agent's
///         virtual paper portfolio atomically. Anyone may relay an agent's signed
///         action — the signature, not the caller, authorizes the trade.
/// @dev    Portfolio state is initialised lazily on the first executed action so that
///         starting balances are not paid for in cold SSTOREs until an agent actually trades.
contract ExecutionEngine is Ownable, EIP712 {
    using ECDSA for bytes32;

    enum ActionKind {
        Buy, // spend `size` quote units, receive `size * 1e18 / price` base of `asset`
        Sell // dispose `size` base units of `asset`, receive `size * price / 1e18` quote
    }

    struct Action {
        uint256 challengeId;
        uint256 agentId;
        uint8 kind;
        address asset;
        uint128 size; // quote units (Buy) or base units (Sell), 1e18 scaled
        uint64 nonce;
        uint64 deadline;
    }

    bytes32 public constant ACTION_TYPEHASH = keccak256(
        "Action(uint256 challengeId,uint256 agentId,uint8 kind,address asset,uint128 size,uint64 nonce,uint64 deadline)"
    );

    uint256 private constant ONE = 1e18;

    AgentRegistry public immutable agentRegistry;
    Challenge public immutable challenge;
    IPriceOracle public priceOracle;

    mapping(uint256 challengeId => mapping(uint256 agentId => uint256)) public cash;
    mapping(uint256 challengeId => mapping(uint256 agentId => mapping(address asset => uint256))) public holdings;
    mapping(uint256 challengeId => mapping(uint256 agentId => uint64)) public nextNonce;
    mapping(uint256 challengeId => mapping(uint256 agentId => bool)) public portfolioInitialized;

    event ActionExecuted(
        uint256 indexed challengeId,
        uint256 indexed agentId,
        ActionKind kind,
        address indexed asset,
        uint128 size,
        uint256 priceUsed,
        uint256 cashAfter,
        uint256 holdingsAfter,
        uint64 nonce,
        address relayer
    );
    event PriceOracleUpdated(address indexed oldOracle, address indexed newOracle);

    error InvalidSignature();
    error WrongNonce(uint64 expected, uint64 got);
    error DeadlinePassed(uint64 deadline, uint256 nowTs);
    error NotParticipant(uint256 challengeId, uint256 agentId);
    error ChallengeNotLive(uint256 challengeId, Challenge.Phase phase);
    error AssetNotAllowed(uint256 challengeId, address asset);
    error UnknownActionKind(uint8 kind);
    error InsufficientCash(uint256 have, uint256 want);
    error InsufficientHoldings(address asset, uint256 have, uint256 want);
    error ZeroSize();
    error ZeroAddress();

    constructor(AgentRegistry _agentRegistry, Challenge _challenge, IPriceOracle _priceOracle, address initialOwner)
        Ownable(initialOwner)
        EIP712("Agent Arena Execution Engine", "1")
    {
        if (address(_agentRegistry) == address(0) || address(_challenge) == address(0)) revert ZeroAddress();
        if (address(_priceOracle) == address(0)) revert ZeroAddress();
        agentRegistry = _agentRegistry;
        challenge = _challenge;
        priceOracle = _priceOracle;
    }

    // -------- admin --------

    function setPriceOracle(IPriceOracle newOracle) external onlyOwner {
        if (address(newOracle) == address(0)) revert ZeroAddress();
        address old = address(priceOracle);
        priceOracle = newOracle;
        emit PriceOracleUpdated(old, address(newOracle));
    }

    // -------- core --------

    /// @notice Execute an agent's signed action. Caller may be anyone — the signature is the auth.
    function submitAction(Action calldata a, bytes calldata signature) external {
        if (a.size == 0) revert ZeroSize();
        if (block.timestamp > a.deadline) revert DeadlinePassed(a.deadline, block.timestamp);

        // Phase + participation gate.
        Challenge.Phase phase = challenge.phaseOf(a.challengeId);
        if (phase != Challenge.Phase.Live) revert ChallengeNotLive(a.challengeId, phase);
        if (!challenge.isParticipant(a.challengeId, a.agentId)) {
            revert NotParticipant(a.challengeId, a.agentId);
        }

        // Asset whitelist.
        if (!_isAssetAllowed(a.challengeId, a.asset)) revert AssetNotAllowed(a.challengeId, a.asset);

        // Signature gate (reverts if the agent doesn't exist via getAgent).
        address signingKey = agentRegistry.getAgent(a.agentId).signingKey;
        bytes32 digest = _hashAction(a);
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != signingKey) revert InvalidSignature();

        // Strict monotonic nonce.
        uint64 expected = nextNonce[a.challengeId][a.agentId];
        if (a.nonce != expected) revert WrongNonce(expected, a.nonce);

        // Lazy init: first action funds the agent with the challenge's starting balance.
        if (!portfolioInitialized[a.challengeId][a.agentId]) {
            uint256 starting = challenge.getChallenge(a.challengeId).startingBalance;
            cash[a.challengeId][a.agentId] = starting;
            portfolioInitialized[a.challengeId][a.agentId] = true;
        }

        uint256 price = priceOracle.getPrice(a.asset);
        (uint256 cashAfter, uint256 holdingsAfter) = _applyAction(a, price);

        cash[a.challengeId][a.agentId] = cashAfter;
        holdings[a.challengeId][a.agentId][a.asset] = holdingsAfter;
        nextNonce[a.challengeId][a.agentId] = expected + 1;

        emit ActionExecuted(
            a.challengeId,
            a.agentId,
            ActionKind(a.kind),
            a.asset,
            a.size,
            price,
            cashAfter,
            holdingsAfter,
            a.nonce,
            msg.sender
        );
    }

    // -------- views --------

    /// @notice Mark-to-market portfolio value in quote currency. Includes uninitialized agents at par.
    function getPortfolioValue(uint256 challengeId, uint256 agentId) external view returns (uint256 totalValue) {
        if (!portfolioInitialized[challengeId][agentId]) {
            return challenge.getChallenge(challengeId).startingBalance;
        }
        totalValue = cash[challengeId][agentId];
        address[] memory assets = challenge.getAllowedAssets(challengeId);
        for (uint256 i = 0; i < assets.length; ++i) {
            uint256 amount = holdings[challengeId][agentId][assets[i]];
            if (amount == 0) continue;
            uint256 price = priceOracle.getPrice(assets[i]);
            totalValue += Math.mulDiv(amount, price, ONE);
        }
    }

    function hashAction(Action calldata a) external view returns (bytes32) {
        return _hashAction(a);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -------- internals --------

    function _hashAction(Action calldata a) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(ACTION_TYPEHASH, a.challengeId, a.agentId, a.kind, a.asset, a.size, a.nonce, a.deadline)
        );
        return _hashTypedDataV4(structHash);
    }

    function _applyAction(Action calldata a, uint256 price)
        internal
        view
        returns (uint256 cashAfter, uint256 holdingsAfter)
    {
        uint256 currentCash = cash[a.challengeId][a.agentId];
        uint256 currentHoldings = holdings[a.challengeId][a.agentId][a.asset];

        if (a.kind == uint8(ActionKind.Buy)) {
            if (currentCash < a.size) revert InsufficientCash(currentCash, a.size);
            uint256 baseOut = Math.mulDiv(a.size, ONE, price);
            cashAfter = currentCash - a.size;
            holdingsAfter = currentHoldings + baseOut;
        } else if (a.kind == uint8(ActionKind.Sell)) {
            if (currentHoldings < a.size) revert InsufficientHoldings(a.asset, currentHoldings, a.size);
            uint256 quoteOut = Math.mulDiv(a.size, price, ONE);
            cashAfter = currentCash + quoteOut;
            holdingsAfter = currentHoldings - a.size;
        } else {
            revert UnknownActionKind(a.kind);
        }
    }

    function _isAssetAllowed(uint256 challengeId, address asset) internal view returns (bool) {
        address[] memory assets = challenge.getAllowedAssets(challengeId);
        for (uint256 i = 0; i < assets.length; ++i) {
            if (assets[i] == asset) return true;
        }
        return false;
    }
}
