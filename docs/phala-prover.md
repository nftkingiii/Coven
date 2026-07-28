# Coven confidential prover on Phala

The browser sends private invoice terms directly to the confidential prover.
The prover creates and verifies the Noir UltraHonk proof inside a Phala CVM and
returns only the proof, public inputs, commitment, and nullifier.

## Runtime endpoints

- `GET /health` — version and availability metadata.
- `GET /attestation` — Intel TDX quote when running inside Phala.
- `POST /prove/invoice` — single-concurrency private proof generation.

Request bodies are not logged or persisted. Responses use `Cache-Control:
no-store`.

## Deployment

1. Build and publish `ghcr.io/nftkingiii/coven-prover:latest`.
2. Create a CPU CVM in Phala Cloud using `docker-compose.phala.yml`.
3. Set `COVEN_WEB_ORIGIN` to the deployed Coven frontend origin.
4. Set the frontend build variable `VITE_PROVER_URL` to the Phala HTTPS
   endpoint.
5. Verify `/health`, fetch `/attestation`, and generate a test proof.

The Phala endpoint protects data in use. The frontend must not claim
attestation-bound end-to-end encryption until it verifies the quote and binds
the request-encryption key to the quote's report data.
