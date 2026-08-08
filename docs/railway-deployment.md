# Railway deployment runbook

Coven deploys as two Railway services from this monorepo:

- `coven-api` runs the server-side Cleanverse adapter. Cleanverse credentials exist only here.
- `coven-web` serves the compiled browser application with the cross-origin isolation headers required by the local Noir fallback.
- The remote Noir prover remains the separate Phala CVM service. Railway does not replace it.

Nothing in this runbook needs to be deployed until the final preflight is approved.

## 1. Create the services

Create `coven-api` and `coven-web` from the same GitHub repository. Keep the repository root as the Railway source root for both services because npm workspaces use the root lockfile.

Set each service's Railway configuration file:

| Service | Config file | Health endpoint |
| --- | --- | --- |
| `coven-api` | `/railway.api.json` | `/api/ready` |
| `coven-web` | `/railway.web.json` | `/health` |

Generate a public Railway domain for both services before setting cross-service variables. Railway supplies `PORT`; do not create or override it.

## 2. Configure `coven-api`

Set these Railway variables on the API service:

```text
CLEANVERSE_BASE_URL=https://uatapi.cleanverse.com/api/cooperate
CLEANVERSE_API_ID=<secret>
CLEANVERSE_API_KEY=<secret>
CLEANVERSE_WRITE_ENABLED=true
CORS_ORIGINS=https://<coven-web-domain>
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_HISTORY_RPC_URL=https://monad-testnet.drpc.org
MONAD_EXPLORER_URL=https://testnet.monadvision.com
COVEN_REGISTRY_ADDRESS=0xb5bdc630f78BEB587235C42e4fD4b6c67Fd1d65a
COVEN_REGISTRY_DEPLOYMENT_BLOCK=51305108
```

`CLEANVERSE_API_ID` and `CLEANVERSE_API_KEY` are secrets. Never add them to the web service, a `VITE_*` variable, source control, screenshots, or a demo recording.

The API liveness endpoint is `/api/health`. The readiness endpoint is `/api/ready`; it fails deployment promotion when credentials or the production CORS allowlist are missing. It does not depend on temporary Cleanverse or RPC availability.

## 3. Configure `coven-web`

Set these Railway variables on the web service:

```text
VITE_API_URL=https://<coven-api-domain>
VITE_PROVER_URL=https://<phala-prover-domain>
VITE_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
VITE_MONAD_HISTORY_RPC_URL=https://monad-testnet.drpc.org
VITE_MONAD_EXPLORER_URL=https://testnet.monadvision.com
VITE_COVEN_REGISTRY_ADDRESS=0xb5bdc630f78BEB587235C42e4fD4b6c67Fd1d65a
VITE_COVEN_REGISTRY_DEPLOYMENT_BLOCK=51305108
```

Every `VITE_*` value is public and is embedded during the Docker build. After changing one, redeploy the web service and force a rebuild if Railway reuses a cached build.

## 4. Re-enable Phala for the live app

Start the Phala CVM only when the full production smoke test begins. Set its allowed web origin to the exact HTTPS Railway web domain:

```text
COVEN_WEB_ORIGIN=https://<coven-web-domain>
```

Confirm its `/health` endpoint and attestation endpoint before testing a proof. Keep raw invoice fields out of Railway logs; they should travel over HTTPS only from the browser to the attested prover.

## 5. Preflight before exposing the link

Verify the deployed revision rather than relying on a successful build badge:

```powershell
Invoke-RestMethod https://<coven-api-domain>/api/health
Invoke-RestMethod https://<coven-api-domain>/api/ready
Invoke-RestMethod https://<coven-web-domain>/health
Invoke-RestMethod https://<phala-prover-domain>/health
```

The Railway responses must report `ok: true`, and the API and web revision fields must match the Git commit intended for submission.

Then use a clean browser profile and complete this sequence:

1. Connect a wallet and confirm Monad Testnet switching.
2. Read an existing CVI or complete sandbox CVI enrollment.
3. Generate a remote proof and inspect its public receipt.
4. Sign the one-time launch authorization, then launch a CVA with a new invoice reference and token symbol to avoid Cleanverse duplicate-symbol rejection.
5. Register the issued CVA on Monad and confirm the transaction in the explorer.
6. Refresh Proofs and Assets and confirm registry history reconstructs from the API checkpoint/RPC path.
7. Check an investor, mint or transfer participation units, and confirm the investor holding appears after chain read-back.

Record the URLs, wallet, transaction hashes, contract addresses, UTC time, and expected/observed result in the proof matrix.

## 6. Rollback and containment

- If a Railway revision fails, redeploy the last known-good deployment for that service.
- Set `CLEANVERSE_WRITE_ENABLED=false` to disable CVI/CVA write operations while leaving read-only evidence available.
- Stop the Phala CVM when it is not being tested to preserve credits; start it before judging and re-run its health and attestation checks.
- Do not replace the deployed registry address during rollback. Treat contract upgrades as a separate migration with new verified evidence.

Railway health checks gate the initial traffic switch; they are not continuous monitoring. During the judging window, periodically check all three health endpoints and the critical proof-to-registry flow.
