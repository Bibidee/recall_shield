# Deployment record

Deploy only `contracts/recall_shield.py` after the local preflight passes. The historical v1 address is not valid evidence for the hardened v2 source.

For every v2 deployment record:

- source SHA-256;
- deployment transaction hash;
- deployed contract address;
- Explorer source-match result;
- network and timestamp;
- lint/schema commands and results;
- live scenario transaction hashes, terminal status and canonical resulting state.

Do not describe an `UNDETERMINED`, rollback, retryable technical error or stale-state read as a successful verdict.

## Current hardened deployment

- Network: Studionet
- Contract: `0x95D3c923cb1f5Ef5b298441edF750Ab83b3C57a1`
- Deployment transaction: `0x03cc7531f0aeda70e40c1b04dd3e09337a92cf4c551f6a2fbcfa31b780a6c832`
- Deployment result: `FINALIZED / MAJORITY_AGREE / SUCCESS`
- Exact local/deployed SHA-256: `3cab8fe75f540f50b02d7bab5f266999b3db7bcec2e8a59f51512b836f80b0aa`
- Source retrieval: exact byte match (`npm run source:match`)
- Live matrix prefix: `rs-v2-*-1787055496699`
- Canonical final state: three closed cases, each with `funds_held = 0`, `outstanding_liability = 0`, `claims_submitted = claims_terminal = 1`, and `liability_invariant = true`

Evaluation evidence:

- matching/manual: `0xfa861be6a3250c137efb9f0cdc0e1e433e5b65309cf1ad8eeba9b78d7a368090`
- mismatch/no-majority: `0x39bb09ac04fa4419e8c545cdb3ef3de7e6ec2f860ec6c3d2d5fe101546c843a1`; canonical claim remained submitted with zero evaluation fields, then withdrawal finalized at `0x89711dfd21628c3858b3c777eab0e0d77a0d0d1e27cb3026c470a8805f7bc011`
- ambiguous/manual: `0x484baa4b20b084d883cab5c0b9d7448a89c9ee972d13bbcec4830bd4fe49eb60`

Explorer: https://explorer-studio.genlayer.com/address/0x95D3c923cb1f5Ef5b298441edF750Ab83b3C57a1

## Current v2.1 deployment

- Source commit: `b390dfa30571301f33931f673eeb14b801f37c64`
- Contract: `0x8b49fF0a0E3C195c913f9a12Ae7Efc2FCbF1f15f`
- Deployment transaction: `0xbe4b85e45748c633d805739b4b6523f14932a92203a1ae93b171b677df6ac504`
- Result: `FINALIZED / MAJORITY_AGREE / SUCCESS`
- Exact local/deployed SHA-256: `86762659bac2153ab3941febe5f4b838061bd93b6c8593e7e350babc650f067f`
- Source retrieval: exact byte match
- Full evidence: `docs/V2_1_HARDENING.md`
- Explorer: https://explorer-studio.genlayer.com/address/0x8b49fF0a0E3C195c913f9a12Ae7Efc2FCbF1f15f
