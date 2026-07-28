# Coven architecture

1. The issuer completes CVI verification through Cleanverse on Monad.
2. Invoice fields remain in the browser and are salted into a commitment.
3. A Noir proof establishes value, maturity, and uniqueness policy predicates.
4. `CovenRegistry` verifies the proof and consumes the public nullifier.
5. The issuance service launches or registers the corresponding CVA with transfer rules.
6. The asset address is linked to the commitment, never to the raw invoice.

The API key is used only server-side to AES-encrypt Cleanverse mutation bodies. The
browser never receives it. Writes are disabled unless `CLEANVERSE_WRITE_ENABLED=true`.

