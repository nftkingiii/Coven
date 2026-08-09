// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Cleanverse CCP V2 identity-compliance interface.
interface IAPassComplianceValidator {
    struct RuleV2 {
        bytes2 allowedGroup;
        bytes2 allowedSubGroup;
        uint8 minTier;
        uint8 minSubTier;
        bool isBlackList;
        uint256 countryBitmap;
    }

    function complianceVerify(address poolAddress, address userAddress) external view returns (bool);

    function setRuleV2FromContract(RuleV2 calldata rule) external;

    function addRuleV2FromContract(RuleV2 calldata rule) external;

    function removeRuleV2FromContract(uint256 index) external;

    function getRulesV2(address poolAddress) external view returns (RuleV2[] memory);
}
