// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TrophyNFT} from "../src/TrophyNFT.sol";
import {Leaderboard} from "../src/Leaderboard.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

/// @notice Deploys TrophyNFT against already-deployed Leaderboard + AgentRegistry.
///
/// Usage (Mantle Sepolia):
///   forge script script/DeployTrophy.s.sol \
///     --rpc-url $MANTLE_SEPOLIA_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify --verifier blockscout \
///     --verifier-url "https://explorer.sepolia.mantle.xyz/api?"
contract DeployTrophy is Script {
    // Deployed addresses — Mantle Sepolia (2026-06-03)
    address constant LEADERBOARD   = 0xB050caC3607c4c2818A5b3E2E9B231842766D771;
    address constant AGENT_REGISTRY = 0xd12719De9e5f76C2a6C2A91CdF2f0FF65d366BEd;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        TrophyNFT trophy = new TrophyNFT(
            Leaderboard(LEADERBOARD),
            AgentRegistry(AGENT_REGISTRY)
        );
        vm.stopBroadcast();

        console2.log("TrophyNFT deployed:", address(trophy));
    }
}
