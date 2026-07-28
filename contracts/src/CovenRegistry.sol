// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICovenVerifier} from "./ICovenVerifier.sol";

contract CovenRegistry {
    error InvalidProof();
    error InvalidPublicInputs();
    error PolicyMismatch();
    error NullifierAlreadyUsed();
    error NotOwner();

    struct Issuance {
        bytes32 commitment;
        address issuer;
        address asset;
        uint64 issuedAt;
    }

    ICovenVerifier public verifier;
    address public owner;
    uint256 public immutable maxInvoiceValue;
    uint256 public immutable maxMaturityDays;

    mapping(bytes32 => bool) public usedNullifiers;
    mapping(bytes32 => Issuance) public issuances;

    event InvoiceIssued(
        bytes32 indexed nullifier,
        bytes32 indexed commitment,
        address indexed issuer,
        address asset
    );
    event VerifierUpdated(address indexed verifier);

    constructor(
        ICovenVerifier initialVerifier,
        uint256 initialMaxInvoiceValue,
        uint256 initialMaxMaturityDays
    ) {
        verifier = initialVerifier;
        owner = msg.sender;
        maxInvoiceValue = initialMaxInvoiceValue;
        maxMaturityDays = initialMaxMaturityDays;
    }

    function issue(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        address asset
    ) external {
        if (publicInputs.length != 4) revert InvalidPublicInputs();
        if (
            uint256(publicInputs[0]) != maxInvoiceValue ||
            uint256(publicInputs[1]) != maxMaturityDays
        ) revert PolicyMismatch();

        bytes32 commitment = publicInputs[2];
        bytes32 nullifier = publicInputs[3];
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        usedNullifiers[nullifier] = true;
        issuances[nullifier] = Issuance({
            commitment: commitment,
            issuer: msg.sender,
            asset: asset,
            issuedAt: uint64(block.timestamp)
        });
        emit InvoiceIssued(nullifier, commitment, msg.sender, asset);
    }

    function setVerifier(ICovenVerifier nextVerifier) external {
        if (msg.sender != owner) revert NotOwner();
        verifier = nextVerifier;
        emit VerifierUpdated(address(nextVerifier));
    }
}
