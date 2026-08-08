// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CovenRegistry} from "../src/CovenRegistry.sol";
import {HonkVerifier} from "../src/CovenVerifier.sol";
import {IAPassComplianceValidator} from "../src/IAPassComplianceValidator.sol";
import {ICovenVerifier} from "../src/ICovenVerifier.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployCoven {
    error WrongChain(uint256 actualChainId);
    error InvalidDeployment();

    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10_143;
    uint256 internal constant MAX_INVOICE_VALUE = 100_000;
    uint256 internal constant MAX_MATURITY_DAYS = 180;
    address internal constant CLEANVERSE_COMPLIANCE_VALIDATOR = 0xaC7e5179C2C7f03f209136886c172eb34F161792;

    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (HonkVerifier verifier, CovenRegistry registry) {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);

        vm.startBroadcast();
        verifier = new HonkVerifier();
        registry = new CovenRegistry(
            ICovenVerifier(address(verifier)),
            IAPassComplianceValidator(CLEANVERSE_COMPLIANCE_VALIDATOR),
            MAX_INVOICE_VALUE,
            MAX_MATURITY_DAYS
        );
        vm.stopBroadcast();

        if (
            address(registry.verifier()) != address(verifier)
                || address(registry.complianceValidator()) != CLEANVERSE_COMPLIANCE_VALIDATOR
                || registry.maxInvoiceValue() != MAX_INVOICE_VALUE || registry.maxMaturityDays() != MAX_MATURITY_DAYS
        ) revert InvalidDeployment();
    }
}
