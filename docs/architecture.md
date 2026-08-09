# Coven architecture

1. The issuer previews CVI eligibility through Cleanverse on Monad. If the
   connected wallet has no sandbox CVI, Coven requests a short-lived ownership
   signature, calls encrypted `generate_apass` from the backend, and polls
   `query_apass` until Cleanverse confirms the new record.
2. Invoice fields travel over HTTPS to the confidential Phala prover and are
   salted into a commitment inside that protected boundary.
3. A Noir proof establishes value, maturity, and uniqueness policy predicates;
   only its public outputs return to the browser.
4. The app reads `CovenRegistry.isIssuerCompliant`, which delegates to the
   official CCP validator, and stops before launch if the issuer fails RuleV2.
5. The issuance service submits the corresponding CVA application with CVI
   transfer rules, retains its request ID, and polls until Cleanverse reports
   `ISSUED`.
6. The connected issuer submits the proof, public inputs, and issued CVA
   address to `CovenRegistry` on Monad.
7. `CovenRegistry` repeats the official CCP check at transaction execution,
   verifies the proof, consumes the public nullifier, and links the asset to
   the commitment.
8. The app waits for confirmation and reads the registry record back before it
   labels the asset as issued.

The API key is used only server-side to AES-encrypt Cleanverse mutation bodies. The
browser never receives it. Writes are disabled unless `CLEANVERSE_WRITE_ENABLED=true`.

The Cleanverse request ID is retained in browser state if issuance is still
processing or wallet registration is rejected. A retry resumes polling or
registration without launching another CVA. Before launch, Coven reads
`usedNullifiers` from the registry to stop a duplicate earlier in the flow.

Each proof response can include a Phala quote bound to the proof commitment and
nullifier. The prover verifies that quote through Phala's attestation service
and returns a public verification URL. Coven labels local or unavailable
attestation states honestly rather than presenting them as TEE-verified.

The Proofs and Assets views reconstruct confirmed history from
`InvoiceIssued` events. The Assets financing desk reads the live CVA's supply,
issuer balance, and AccessControl roles. The issuer can grant itself the
documented `MINTER_ROLE`, mint participation units that do not disclose the
private face value, preview an investor through Cleanverse `verify_apass`, and
submit an ERC-20 transfer. The CVA enforces RuleV2 during that transfer; Coven
then reads both balances back and exposes the Monad receipt. The sandbox flow
allocates the claim but does not move an investor payment token.

## CCP deployment boundary

- Monad Testnet validator: `0xaC7e5179C2C7f03f209136886c172eb34F161792`.
- `CovenRegistry` follows the Cleanverse single-contract pattern and receives
  the validator address as an immutable constructor argument.
- After deployment, the registry must be registered through Cleanverse
  `POST /api/cooperate/validator/register` using the owner-signature procedure.
- The owner then configures RuleV2 through `setComplianceRule`; additional OR
  paths can be added with `addComplianceRule`.
- The active RuleV2 is explicitly `allowedGroup=0x0000`,
  `allowedSubGroup=0x0000`, `minTier=20`, `minSubTier=0`,
  `isBlackList=false`, and `countryBitmap=0` (no group, sub-group, blacklist,
  or country restriction). Positive and negative compliance reads plus a
  wallet-issued registry receipt are preserved in the proof matrix.
