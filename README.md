# Coven

Privacy-preserving issuance and lifecycle compliance for tokenized trade invoices.

Coven lets an issuer prove that a private invoice satisfies a financing policy without
publishing its commercial terms. Cleanverse CVI gates verified participants, CVA provides
the compliant asset layer, and an on-chain commitment plus nullifier prevents the same
invoice from being financed twice.

## Start locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The app runs in a clearly labelled demo mode until a
Cleanverse sandbox API ID is added to `.env`.

## Privacy boundary

- Raw invoice fields stay in the browser.
- Only a salted commitment and deterministic nullifier are submitted.
- CVI confirms eligibility; it does not reveal identity data to Coven.
- Wallet addresses, transactions, token amounts, and timing remain public on-chain.

## Repository map

- `apps/web` — issuer console and local proof preparation
- `apps/api` — Cleanverse adapter and guarded CVA write path
- `contracts` — issuance registry and verifier interface
- `circuits` — Noir policy circuit boundary
- `docs` — architecture, proof matrix, and integration notes

