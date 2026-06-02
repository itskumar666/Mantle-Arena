// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {IApi3ReaderProxy} from "../interfaces/IApi3ReaderProxy.sol";

/// @title Api3PriceOracle — IPriceOracle adapter over API3 dAPI reader proxies.
/// @notice One API3 proxy address per asset, set by the owner. On read, validates that the
///         feed is positive and not staler than `maxStaleness`. API3 values are 1e18-scaled,
///         matching the protocol's internal price scale, so no rescaling is needed.
/// @dev    Production path for ExecutionEngine.priceOracle. MockPriceOracle remains in tests
///         and is the right choice for the live-stream demo (compressed-time mode wants
///         driveable prices), but mainnet stretch swaps in this adapter at deploy time.
contract Api3PriceOracle is IPriceOracle, Ownable {
    mapping(address asset => IApi3ReaderProxy proxy) public proxyOf;
    uint32 public maxStaleness;

    event ProxySet(address indexed asset, address indexed proxy);
    event MaxStalenessSet(uint32 oldValue, uint32 newValue);

    error ProxyNotSet(address asset);
    error StalePrice(address asset, uint32 timestamp, uint256 nowTs, uint32 maxStaleness);
    error NonPositivePrice(address asset, int224 value);
    error ZeroAddress();

    constructor(address initialOwner, uint32 initialMaxStaleness) Ownable(initialOwner) {
        if (initialMaxStaleness == 0) revert ZeroAddress(); // reusing for "invalid config"
        maxStaleness = initialMaxStaleness;
    }

    function setProxy(address asset, IApi3ReaderProxy proxy) external onlyOwner {
        if (asset == address(0) || address(proxy) == address(0)) revert ZeroAddress();
        proxyOf[asset] = proxy;
        emit ProxySet(asset, address(proxy));
    }

    function setMaxStaleness(uint32 newMaxStaleness) external onlyOwner {
        if (newMaxStaleness == 0) revert ZeroAddress();
        uint32 old = maxStaleness;
        maxStaleness = newMaxStaleness;
        emit MaxStalenessSet(old, newMaxStaleness);
    }

    function getPrice(address asset) external view override returns (uint256) {
        IApi3ReaderProxy proxy = proxyOf[asset];
        if (address(proxy) == address(0)) revert ProxyNotSet(asset);

        (int224 value, uint32 timestamp) = proxy.read();
        if (value <= 0) revert NonPositivePrice(asset, value);
        if (block.timestamp - timestamp > maxStaleness) {
            revert StalePrice(asset, timestamp, block.timestamp, maxStaleness);
        }
        return uint256(uint224(value));
    }
}
