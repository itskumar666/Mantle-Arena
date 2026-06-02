// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Api3PriceOracle} from "../src/oracle/Api3PriceOracle.sol";
import {IApi3ReaderProxy} from "../src/interfaces/IApi3ReaderProxy.sol";
import {MockApi3Proxy} from "./mocks/MockApi3Proxy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Api3PriceOracleTest is Test {
    Api3PriceOracle internal oracle;
    MockApi3Proxy internal ethProxy;
    MockApi3Proxy internal btcProxy;

    address internal admin = address(0xA11CE);
    address internal mETH = address(0xE7);
    address internal fBTC = address(0xB7C);

    uint32 internal constant MAX_STALENESS = 1 hours;

    event ProxySet(address indexed asset, address indexed proxy);
    event MaxStalenessSet(uint32 oldValue, uint32 newValue);

    function setUp() public {
        vm.warp(1_750_000_000);
        oracle = new Api3PriceOracle(admin, MAX_STALENESS);
        ethProxy = new MockApi3Proxy();
        btcProxy = new MockApi3Proxy();

        ethProxy.set(int224(3000e18), uint32(block.timestamp));
        btcProxy.set(int224(60_000e18), uint32(block.timestamp));

        vm.startPrank(admin);
        oracle.setProxy(mETH, ethProxy);
        oracle.setProxy(fBTC, btcProxy);
        vm.stopPrank();
    }

    // ---------- read happy path ----------

    function test_getPrice_returnsConfiguredValue() public view {
        assertEq(oracle.getPrice(mETH), 3000e18);
        assertEq(oracle.getPrice(fBTC), 60_000e18);
    }

    function test_getPrice_returnsLatestAfterUpdate() public {
        ethProxy.set(int224(3500e18), uint32(block.timestamp));
        assertEq(oracle.getPrice(mETH), 3500e18);
    }

    // ---------- reverts ----------

    function test_getPrice_revertsForUnconfiguredAsset() public {
        vm.expectRevert(abi.encodeWithSelector(Api3PriceOracle.ProxyNotSet.selector, address(0xCAFE)));
        oracle.getPrice(address(0xCAFE));
    }

    function test_getPrice_revertsOnStaleness() public {
        (, uint32 proxyTs) = ethProxy.read();
        vm.warp(block.timestamp + MAX_STALENESS + 1);

        vm.expectRevert(
            abi.encodeWithSelector(Api3PriceOracle.StalePrice.selector, mETH, proxyTs, block.timestamp, MAX_STALENESS)
        );
        oracle.getPrice(mETH);
    }

    function test_getPrice_revertsOnZeroPrice() public {
        ethProxy.set(int224(0), uint32(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(Api3PriceOracle.NonPositivePrice.selector, mETH, int224(0)));
        oracle.getPrice(mETH);
    }

    function test_getPrice_revertsOnNegativePrice() public {
        ethProxy.set(int224(-1), uint32(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(Api3PriceOracle.NonPositivePrice.selector, mETH, int224(-1)));
        oracle.getPrice(mETH);
    }

    // ---------- admin ----------

    function test_setProxy_onlyOwner() public {
        MockApi3Proxy newProxy = new MockApi3Proxy();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        oracle.setProxy(mETH, newProxy);

        vm.expectEmit(true, true, false, false, address(oracle));
        emit ProxySet(mETH, address(newProxy));
        vm.prank(admin);
        oracle.setProxy(mETH, newProxy);
        assertEq(address(oracle.proxyOf(mETH)), address(newProxy));
    }

    function test_setProxy_revertsOnZeroAsset() public {
        vm.expectRevert(Api3PriceOracle.ZeroAddress.selector);
        vm.prank(admin);
        oracle.setProxy(address(0), ethProxy);
    }

    function test_setProxy_revertsOnZeroProxy() public {
        vm.expectRevert(Api3PriceOracle.ZeroAddress.selector);
        vm.prank(admin);
        oracle.setProxy(mETH, IApi3ReaderProxy(address(0)));
    }

    function test_setMaxStaleness_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        oracle.setMaxStaleness(30 minutes);

        vm.expectEmit(false, false, false, true, address(oracle));
        emit MaxStalenessSet(MAX_STALENESS, 30 minutes);
        vm.prank(admin);
        oracle.setMaxStaleness(30 minutes);
        assertEq(oracle.maxStaleness(), 30 minutes);
    }

    function test_setMaxStaleness_revertsOnZero() public {
        vm.expectRevert(Api3PriceOracle.ZeroAddress.selector);
        vm.prank(admin);
        oracle.setMaxStaleness(0);
    }

    function test_constructor_revertsOnZeroStaleness() public {
        vm.expectRevert(Api3PriceOracle.ZeroAddress.selector);
        new Api3PriceOracle(admin, 0);
    }
}
