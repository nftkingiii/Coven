// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HonkVerifier} from "../src/CovenVerifier.sol";

interface Vm {
    function readFileBinary(string calldata path) external view returns (bytes memory);
}

contract CovenVerifierIntegrationTest {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testGeneratedProofVerifies() public {
        bytes memory proof =
            vm.readFileBinary("../circuits/invoice_policy/target/proof");
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(100_000));
        inputs[1] = bytes32(uint256(180));
        inputs[2] =
            0x10be417a655b4377f7054816da94cab35016f05c0d93d9f2f99e250f18db69c4;
        inputs[3] =
            0x2fbd5b645bedc58e276e04e983120ffcede254ad44ab7ab3c2aa4d8dd79387dd;

        HonkVerifier verifier = new HonkVerifier();
        require(verifier.verify(proof, inputs), "generated proof did not verify");
    }
}
