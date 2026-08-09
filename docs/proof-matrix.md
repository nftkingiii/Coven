# Hackathon proof matrix

| Judging claim | Product evidence | Technical evidence |
| --- | --- | --- |
| Private invoice terms | UI labels the protected transport boundary and reveals only public outputs | Phala prover request in `apps/web/src/remote-proof.ts` and Noir witness handling in `apps/prover` |
| Verified participants | CVI API preview is visibly distinguished from the final on-chain gate | `/query_apass` preview plus official CCP `complianceVerify(CovenRegistry, issuer)` |
| Self-service sandbox onboarding | A fresh wallet signs a non-transaction ownership challenge and receives a Cleanverse-issued sandbox CVI | Encrypted `POST /generate_apass`, followed by `/query_apass` read-back; controlled canary returned active tier 50 |
| CVA at issuance | Final step preserves one application, shows its actual status, and requires a wallet-signed registry receipt | Guarded encrypted `/atoken/launch`, `/atoken/query_apply_status`, and `CovenRegistry.issue` |
| No double financing | A registered invoice proof is stopped before another CVA application | `usedNullifiers` preflight plus the contract replay guard |
| Policy compliance | Value and maturity limits shown before proof | Noir policy circuit and verifier interface |
| Honest privacy | Public/private boundary is visible | Architecture documentation and UI disclosure |
| Verifiable confidential execution | Proof receipt distinguishes verified TEE evidence from local/unavailable evidence | Quote bound to commitment and nullifier, verified by Phala attestation API |
| Persistent evidence | Prior confirmations return after a refresh or reconnection | `InvoiceIssued` event read-back filtered by issuer |
| Compliant investor allocation | Financing desk activates supply, mints participation units, shows allowed or blocked investors, submits the transfer, and reads both balances back | Documented `MINTER_ROLE`, Cleanverse `POST /verify_apass` preview, standard ERC-20 `transfer`, and the CVA's execution-time RuleV2 gate; final live transfer receipt pending wallet test |
| CCP policy management | Registry owner can replace, append, remove, and read RuleV2 policies | Cleanverse single-contract wrappers in `CovenRegistry` |

`CovenRegistry` is deployed on Monad Testnet at
`0xb5bdc630f78BEB587235C42e4fD4b6c67Fd1d65a` from block `51305108` and points
to `HonkVerifier` at `0x312630B939a56700650b013C2828203bE1Abf0A1`.
Deployment and constructor wiring are RPC-verified. The user-flow and live CCP
registration are now verified: Cleanverse registered the pool in transaction
`0x60bf9167072a790c2fc37fd8a48d43f98def00314b96f70f493e27e8e50a83fe`,
and Monad read-back confirms the six-field RuleV2: `allowedGroup=0x0000`,
`allowedSubGroup=0x0000`, `minTier=20`, `minSubTier=0`,
`isBlackList=false`, and `countryBitmap=0`, plus positive and negative
compliance results. The complete issuance row is verified by wallet transaction
`0xd18129eda099b71db87e84bf8c72f0c8724f945ba49467824c9e0a16acc7c586`,
whose `InvoiceIssued` event resolves to CVA
`0xdFf72480344D28cA7d9242ce80B9c61fD8Af8b7E`. A separate controlled
`generate_apass` canary created an active tier-50 sandbox CVI for a fresh burner
wallet in transaction
`0xba6845c2a4c1cfa53d40f204cb4760c0f6ab5f6f879c45d7743032ffce23b996`.
