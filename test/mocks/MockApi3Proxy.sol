// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IApi3ReaderProxy} from "../../src/interfaces/IApi3ReaderProxy.sol";

contract MockApi3Proxy is IApi3ReaderProxy {
    int224 internal _value;
    uint32 internal _timestamp;

    function set(int224 value, uint32 timestamp) external {
        _value = value;
        _timestamp = timestamp;
    }

    function read() external view override returns (int224 value, uint32 timestamp) {
        return (_value, _timestamp);
    }
}
