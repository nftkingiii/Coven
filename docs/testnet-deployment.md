# Monad Testnet deployment

Coven uses a two-contract deployment:

1. `HonkVerifier`, generated from the Noir invoice policy circuit.
2. `CovenRegistry`, configured with the verifier and Cleanverse's official
   compliance validator.

The deployment script refuses to run anywhere except Monad Testnet chain ID
`10143`. Its policy constants are `100,000` aUSDC and `180` days, matching the
public inputs enforced by the circuit and registry.

## Preflight

Run from `contracts/`:

```powershell
forge fmt --check
forge test
forge script script/DeployCoven.s.sol:DeployCoven --rpc-url https://testnet-rpc.monad.xyz
```

The last command is a simulation only. It does not spend testnet MON.

## Broadcast with the local keystore

The deployer key must remain in Foundry's encrypted keystore. Never place it in
an `.env` file, command history, repository, deployment log, or chat.

```powershell
$deployer = cast wallet address --account CovenDeployer
forge script script/DeployCoven.s.sol:DeployCoven `
  --rpc-url https://testnet-rpc.monad.xyz `
  --account CovenDeployer `
  --sender $deployer `
  --broadcast
```

Foundry prompts locally for the keystore password when deriving the sender and
again when signing. The deployment receipts are written under
`contracts/broadcast/`, which is gitignored.

## Required post-deploy work

1. Record both contract addresses and deployment transaction hashes.
2. Confirm runtime bytecode and constructor wiring through Monad RPC.
3. Verify both contracts' source on the supported Monad explorer.
4. Register `CovenRegistry` through Cleanverse's validator registration flow.
5. Configure RuleV2 through `CovenRegistry.setComplianceRule`.
6. Set `VITE_COVEN_REGISTRY_ADDRESS` and
   `VITE_COVEN_REGISTRY_DEPLOYMENT_BLOCK` for the frontend.
7. Exercise one accepted and one rejected wallet flow before labeling the CCP
integration live.

## Canary evidence — 2026-08-06

- Deployer: `0xC6CFa54eDA215a62fD5495A9B6555Bd85b6B7ddB`
- Honk verifier: `0x312630B939a56700650b013C2828203bE1Abf0A1`
- Coven registry: `0xb5bdc630f78BEB587235C42e4fD4b6c67Fd1d65a`
- Relations library: `0x74edCCbB085a487E77A701D986c0C1829c42aBcA`
- Transcript library: `0x3804EC2A1b6304eEcAf7f8626f6C039C94511A7A`
- Registry deployment block: `51305108`
- Verifier deployment transaction:
  `0x1c6ef7518d07b3c7f700e6b67f9d52f9123689685fa167f392221f3e87b861c7`
- Registry deployment transaction:
  `0x48cfb3cf97665cfc08009885d4a9ee94976010e34f93150cb090b337d893b508`
- Cleanverse registration transaction:
  `0x60bf9167072a790c2fc37fd8a48d43f98def00314b96f70f493e27e8e50a83fe`
- Cleanverse registration block: `51309425`

RPC read-back confirmed the registry owner and verifier address, the official
Cleanverse validator `0xaC7e5179C2C7f03f209136886c172eb34F161792`, and policy constants `100000`
and `180`. This proves deployment and constructor configuration only; it does
not yet prove Cleanverse registration, RuleV2 activation, or a live issuance.

The initial registration rule is the complete six-field RuleV2:
`allowedGroup=0x0000`, `allowedSubGroup=0x0000`, `minTier=20`,
`minSubTier=0`, `isBlackList=false`, and `countryBitmap=0`. It permits any
group, sub-group, and country while retaining a meaningful tier-20
verified-identity gate.

Sign the exact lowercase EIP-191 message and submit the encrypted registration:

```powershell
$signature = cast wallet sign --account CovenDeployer `
  "monad0xb5bdc630f78beb587235c42e4fd4b6c67fd1d65a"
node ..\apps\api\register-validator.mjs $signature
```

Source was submitted through MonadVision's Sourcify verifier. The registry and
both linked libraries returned `exact_match`; the linked Honk verifier returned
`match`. Verification job IDs are:

- Registry: `16759a28-c88d-451e-b1b0-d727f0087d2b`
- Honk verifier: `94b2ac6f-8024-4b73-9373-e305a3a7f907`
- Relations library: `25ed99c8-6dd5-489c-b313-6b6366837c72`
- Transcript library: `80016847-2ffd-4e3d-8025-fcb351f97159`

Cleanverse and Monad read-back both confirm the pool is registered with one
six-field RuleV2 entry: `allowedGroup=0x0000`, `allowedSubGroup=0x0000`,
`minTier=20`, `minSubTier=0`, `isBlackList=false`, and `countryBitmap=0`.
`isIssuerCompliant` returns `true` for the
active tier-20 owner and `false` for fresh address
`0x6e281ec756978a0bca15c1bd78d4ae6548e4ef52`, for which `query_apass` returns
no A-Pass. Common placeholder addresses such as `0x111...` are not valid
negative fixtures because the Cleanverse sandbox preloads A-Passes for them.

This verifies deployment, registration, RuleV2 activation, and positive and
negative compliance reads. A wallet-signed `CovenRegistry.issue` transaction
and registry issuance read-back are still required for the complete user-flow
claim.

If the contract bytecode changes after this canary deployment, redeploy both
contracts and replace the frontend address. The old deployment remains useful
as evidence but must not be presented as the current release.
