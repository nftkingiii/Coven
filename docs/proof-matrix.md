# Hackathon proof matrix

| Judging claim | Product evidence | Technical evidence |
| --- | --- | --- |
| Private invoice terms | Browser labels private fields and reveals only commitment | Web Crypto preparation in `apps/web/src/crypto.ts` |
| Verified participants | CVI status and tier are shown before issuance | Live `/query_apass` adapter with `chain: monad` |
| CVA at issuance | Final step creates a policy-bound asset | Guarded encrypted `/atoken/launch` adapter |
| No double financing | Reused invoice is rejected | `usedNullifiers` check in `CovenRegistry.sol` |
| Policy compliance | Value and maturity limits shown before proof | Noir policy circuit and verifier interface |
| Honest privacy | Public/private boundary is visible | Architecture documentation and UI disclosure |

