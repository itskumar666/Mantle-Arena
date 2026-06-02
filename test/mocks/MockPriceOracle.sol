// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "../../src/interfaces/IPriceOracle.sol";

/// @notice Test-only oracle. Prices are 1e18 scaled (quote per 1 base).
contract MockPriceOracle is IPriceOracle {
    mapping(address asset => uint256) public prices;

    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    function getPrice(address asset) external view override returns (uint256) {
        return prices[asset];
    }
}
