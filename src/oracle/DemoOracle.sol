// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @title DemoOracle — owner-settable prices for testnet demos and compressed-time challenges.
/// @notice Swapped in via ExecutionEngine.setPriceOracle(). API3 proxies can replace this
///         once they are available on Mantle Sepolia.
contract DemoOracle is IPriceOracle, Ownable {
    mapping(address asset => uint256 price) private _prices;

    event PriceSet(address indexed asset, uint256 price);

    error PriceNotSet(address asset);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setPrice(address asset, uint256 price) external onlyOwner {
        _prices[asset] = price;
        emit PriceSet(asset, price);
    }

    function setPriceBatch(address[] calldata assets, uint256[] calldata prices) external onlyOwner {
        require(assets.length == prices.length, "length mismatch");
        for (uint256 i = 0; i < assets.length; ++i) {
            _prices[assets[i]] = prices[i];
            emit PriceSet(assets[i], prices[i]);
        }
    }

    function getPrice(address asset) external view override returns (uint256) {
        uint256 p = _prices[asset];
        if (p == 0) revert PriceNotSet(asset);
        return p;
    }
}
