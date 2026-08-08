# Coven

Privacy-preserving issuance and lifecycle compliance for tokenized trade invoices.

Coven lets an issuer prove that a private invoice satisfies a financing policy without
publishing its commercial terms. The official Cleanverse CCP validator gates
issuers on-chain, CVA provides the compliant asset layer, and an on-chain
commitment plus nullifier prevents the same invoice from being financed twice.

## Start locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Cleanverse-backed actions remain unavailable until
the sandbox API credentials are configured server-side; Coven does not substitute
illustrative identity or issuance results.

## Privacy boundary

- Raw invoice fields travel over HTTPS only to the confidential Phala prover.
- Only the proof, salted commitment, deterministic nullifier, and policy
  parameters return for public settlement.
- CVI confirms eligibility; it does not reveal identity data to Coven.
- Wallet addresses, transactions, token amounts, and timing remain public on-chain.

## Repository map

- `apps/web` — issuer console and local proof preparation
- `apps/api` — Cleanverse adapter and guarded CVA write path
- `contracts` — issuance registry and verifier interface
- `circuits` — Noir policy circuit boundary
- `docs` — architecture, proof matrix, and integration notes

The final issuance action is deliberately two-system: Cleanverse accepts an
asynchronous policy-bound CVA application, Coven polls that same request until
the A-Token is issued, then the connected issuer signs a Monad transaction that
verifies the Noir proof and links the returned asset address to its commitment.
The UI marks an asset as registered only after transaction confirmation and
registry read-back.

Fresh sandbox wallets can onboard without leaving Coven. The wallet signs a
short-lived ownership message, the backend submits encrypted
`POST /generate_apass`, and the UI waits for Cleanverse's `/query_apass`
read-back before unlocking the proof flow. This is explicitly sandbox
onboarding; Coven does not issue or self-attest production identity credentials.

The evidence views reconstruct public `InvoiceIssued` records from the shared
registry, then use the connected wallet to determine issuer and investor context.
Before a launch, Coven reads both `usedNullifiers` and the registry's official
CCP compliance result. The financing desk then lets the CVA administrator
activate its documented `MINTER_ROLE`, mint privacy-preserving participation
units, check an investor through Cleanverse `verify_apass`, and submit the real
ERC-20 transfer. The CVA repeats RuleV2 enforcement at execution, so the API
preview is never the final authority. Coven reads issuer and investor balances
back from Monad and links the confirmed transaction.

Monad Testnet deployment and post-deploy verification are documented in
[`docs/testnet-deployment.md`](docs/testnet-deployment.md).

The production web and API deployment sequence, environment boundaries, smoke
test, and rollback procedure are documented in
[`docs/railway-deployment.md`](docs/railway-deployment.md). The web and API run
as separate Railway services; the confidential prover remains on Phala.
