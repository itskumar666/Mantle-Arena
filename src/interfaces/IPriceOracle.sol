// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPriceOracle — uniform price feed surface used by the Arena
/// @notice Returns the spot price of `asset` denominated in the protocol's quote currency,
///         scaled by 1e18. Implementations on Mantle wrap whatever native source is
///         appropriate (Mantle oracle, Pyth, RedStone, or a frozen test feed).
interface IPriceOracle {
    /// @return price Quote units per 1 base unit, 1e18 scaled.
    function getPrice(address asset) external view returns (uint256 price);
}
