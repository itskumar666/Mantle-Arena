// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";


import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Challenge} from "../src/Challenge.sol";
import {ExecutionEngine} from "../src/ExecutionEngine.sol";
import {Leaderboard} from "../src/Leaderboard.sol";
import {Reputation} from "../src/Reputation.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {TrophyNFT} from "../src/TrophyNFT.sol";
import {Api3PriceOracle} from "../src/oracle/Api3PriceOracle.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";

/// @notice Deploys the full Agent-Marena stack in dependency order and prints addresses.
///
/// Usage (Mantle Sepolia):
///   forge script script/Deploy.s.sol:DeployScript \
///     --rpc-url $MANTLE_SEPOLIA_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify --verifier blockscout \
///     --verifier-url https://explorer.sepolia.mantle.xyz/api?
///
/// Environment:
///   PRIVATE_KEY            (required) deployer key — testnet-only wallet
///   PROTOCOL_TREASURY      (optional) treasury address; defaults to deployer
///   ORACLE_MAX_STALENESS   (optional) seconds, default 3600
///
/// Post-deploy: owner calls `Api3PriceOracle.setProxy(asset, proxy)` per supported feed,
/// then `ExecutionEngine.setPriceOracle(api3Oracle)` to flip from mock to live pricing.
contract DeployScript is Script {
    struct Deployment {
        AgentRegistry registry;
        Challenge challenge;
        Api3PriceOracle priceOracle;
        ExecutionEngine engine;
        Leaderboard leaderboard;
        Reputation reputation;
        StakeVault stakeVault;
        TrophyNFT trophy;
    }

    function run() external returns (Deployment memory d) {
    
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);
        uint32 maxStaleness = uint32(vm.envOr("ORACLE_MAX_STALENESS", uint256(3600)));

        console2.log("Deployer:", deployer);
        console2.log("Treasury:", treasury);
        console2.log("Oracle max staleness (s):", maxStaleness);

        vm.startBroadcast(deployerKey);

        d.registry = new AgentRegistry(deployer);
        d.challenge = new Challenge(d.registry, deployer, treasury);
        d.priceOracle = new Api3PriceOracle(deployer, maxStaleness);
        d.engine = new ExecutionEngine(d.registry, d.challenge, IPriceOracle(address(d.priceOracle)), deployer);
        d.leaderboard = new Leaderboard(d.challenge, d.engine);
        d.reputation = new Reputation(d.leaderboard);
        d.stakeVault = new StakeVault(d.registry, d.challenge, d.leaderboard, deployer, treasury);
        d.trophy = new TrophyNFT(d.leaderboard, d.registry);

        vm.stopBroadcast();

        console2.log("---- deployed addresses ----");
        console2.log("AgentRegistry   ", address(d.registry));
        console2.log("Challenge       ", address(d.challenge));
        console2.log("Api3PriceOracle ", address(d.priceOracle));
        console2.log("ExecutionEngine ", address(d.engine));
        console2.log("Leaderboard     ", address(d.leaderboard));
        console2.log("Reputation      ", address(d.reputation));
        console2.log("StakeVault      ", address(d.stakeVault));
        console2.log("TrophyNFT       ", address(d.trophy));
    }
}
