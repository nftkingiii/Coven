# Coven ZK proof

Pinned toolchain:

- Nargo / noirc: `1.0.0-beta.24`
- Barretenberg: `5.0.0-nightly.20260708`
- Proof system: ZK UltraHonk
- Solidity transcript hash: Keccak

The circuit keeps invoice value, maturity, identifier, and salt private. It
reveals only the approved policy limits, a Pedersen commitment, and a
domain-separated invoice nullifier.

The generated Solidity verifier is checked in at
`contracts/src/CovenVerifier.sol`. The registry verifies four caller-supplied
public fields in this exact order:

1. maximum invoice value;
2. maximum maturity in days;
3. invoice commitment;
4. invoice nullifier.

Barretenberg's verifier internally accounts for eight ZK pairing-point fields,
so its generated `NUMBER_OF_PUBLIC_INPUTS` constant is 12 while callers supply
four application public inputs.

`CovenVerifier.integration.t.sol` reads the proof produced by Barretenberg and
verifies it against the generated Solidity contract. The fixture uses fictional
invoice data only.
