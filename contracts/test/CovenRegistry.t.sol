// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CovenRegistry} from "../src/CovenRegistry.sol";
import {ICovenVerifier} from "../src/ICovenVerifier.sol";

contract TestVerifier is ICovenVerifier {
    bool public result = true;

    function setResult(bool next) external {
        result = next;
    }

    function verify(
        bytes calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        return result;
    }
}

contract CovenRegistryTest {
    TestVerifier internal verifier;
    CovenRegistry internal registry;

    function setUp() public {
        verifier = new TestVerifier();
        registry = new CovenRegistry(verifier, 100_000, 180);
    }

    function validInputs() internal pure returns (bytes32[] memory inputs) {
        inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(100_000));
        inputs[1] = bytes32(uint256(180));
        inputs[2] = keccak256("private invoice");
        inputs[3] = keccak256("invoice-42");
    }

    function testIssueConsumesNullifier() public {
        bytes32[] memory inputs = validInputs();
        registry.issue(hex"1234", inputs, address(0xCAFE));

        require(registry.usedNullifiers(inputs[3]), "nullifier was not consumed");
        (bytes32 commitment, address issuer, address asset,) =
            registry.issuances(inputs[3]);
        require(commitment == inputs[2], "commitment mismatch");
        require(issuer == address(this), "issuer mismatch");
        require(asset == address(0xCAFE), "asset mismatch");
    }

    function testDuplicateNullifierReverts() public {
        bytes32[] memory inputs = validInputs();
        registry.issue(hex"01", inputs, address(1));

        (bool success,) = address(registry).call(
            abi.encodeCall(CovenRegistry.issue, (hex"02", inputs, address(1)))
        );
        require(!success, "duplicate nullifier should revert");
    }

    function testInvalidProofReverts() public {
        verifier.setResult(false);
        (bool success,) = address(registry).call(
            abi.encodeCall(CovenRegistry.issue, (hex"00", validInputs(), address(1)))
        );
        require(!success, "invalid proof should revert");
    }

    function testPolicyMismatchReverts() public {
        bytes32[] memory inputs = validInputs();
        inputs[0] = bytes32(uint256(1_000_000));
        (bool success,) = address(registry).call(
            abi.encodeCall(CovenRegistry.issue, (hex"00", inputs, address(1)))
        );
        require(!success, "unapproved policy should revert");
    }
}
