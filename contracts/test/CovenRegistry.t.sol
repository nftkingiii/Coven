// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CovenRegistry} from "../src/CovenRegistry.sol";
import {ICovenVerifier} from "../src/ICovenVerifier.sol";
import {IAPassComplianceValidator} from "../src/IAPassComplianceValidator.sol";

contract TestVerifier is ICovenVerifier {
    bool public result = true;

    function setResult(bool next) external {
        result = next;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return result;
    }
}

contract TestComplianceValidator is IAPassComplianceValidator {
    bool public compliant = true;
    RuleV2[] internal rules;

    function setCompliant(bool next) external {
        compliant = next;
    }

    function complianceVerify(address, address) external view returns (bool) {
        return compliant;
    }

    function setRuleV2FromContract(RuleV2 calldata rule) external {
        delete rules;
        rules.push(rule);
    }

    function addRuleV2FromContract(RuleV2 calldata rule) external {
        rules.push(rule);
    }

    function removeRuleV2FromContract(uint256 index) external {
        rules[index] = rules[rules.length - 1];
        rules.pop();
    }

    function getRulesV2(address) external view returns (RuleV2[] memory) {
        return rules;
    }
}

contract CovenRegistryTest {
    TestVerifier internal verifier;
    TestComplianceValidator internal complianceValidator;
    CovenRegistry internal registry;

    function setUp() public {
        verifier = new TestVerifier();
        complianceValidator = new TestComplianceValidator();
        registry = new CovenRegistry(verifier, complianceValidator, 100_000, 180);
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
        (bytes32 commitment, address issuer, address asset,) = registry.issuances(inputs[3]);
        require(commitment == inputs[2], "commitment mismatch");
        require(issuer == address(this), "issuer mismatch");
        require(asset == address(0xCAFE), "asset mismatch");
    }

    function testDuplicateNullifierReverts() public {
        bytes32[] memory inputs = validInputs();
        registry.issue(hex"01", inputs, address(1));

        (bool success,) = address(registry).call(abi.encodeCall(CovenRegistry.issue, (hex"02", inputs, address(1))));
        require(!success, "duplicate nullifier should revert");
    }

    function testInvalidProofReverts() public {
        verifier.setResult(false);
        (bool success,) =
            address(registry).call(abi.encodeCall(CovenRegistry.issue, (hex"00", validInputs(), address(1))));
        require(!success, "invalid proof should revert");
    }

    function testPolicyMismatchReverts() public {
        bytes32[] memory inputs = validInputs();
        inputs[0] = bytes32(uint256(1_000_000));
        (bool success,) = address(registry).call(abi.encodeCall(CovenRegistry.issue, (hex"00", inputs, address(1))));
        require(!success, "unapproved policy should revert");
    }

    function testNonCompliantIssuerRevertsBeforeProofConsumption() public {
        complianceValidator.setCompliant(false);
        bytes32[] memory inputs = validInputs();
        (bool success,) = address(registry).call(abi.encodeCall(CovenRegistry.issue, (hex"00", inputs, address(1))));
        require(!success, "non-compliant issuer should revert");
        require(!registry.usedNullifiers(inputs[3]), "nullifier was consumed");
    }

    function testOwnerCanManageComplianceRules() public {
        IAPassComplianceValidator.RuleV2 memory rule = IAPassComplianceValidator.RuleV2({
            allowedGroup: bytes2("IN"), allowedSubGroup: bytes2(0), minTier: 30, minSubTier: 0, poolCountryBitmap: 0
        });
        registry.setComplianceRule(rule);
        IAPassComplianceValidator.RuleV2[] memory rules = registry.getComplianceRules();
        require(rules.length == 1, "rule was not set");
        require(rules[0].minTier == 30, "tier mismatch");
    }
}
