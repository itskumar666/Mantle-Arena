// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal interface for an API3 dAPI / dataFeed reader proxy.
/// @dev    Each API3 feed (e.g. ETH/USD) is exposed at its own proxy address. Calling read()
///         returns the latest aggregated value (1e18-scaled, signed int224) and the timestamp
///         at which it was set on-chain. See https://docs.api3.org/guides/dapis/subscribing-managed-dapis/.
interface IApi3ReaderProxy {
    function read() external view returns (int224 value, uint32 timestamp);
}
