# RecallShield

RecallShield is a reusable GenLayer Intelligent Contract primitive for consensus-backed recall-claim adjudication and native GEN escrow. It is not a frontend, an AI demo, or a prompt wrapper. It combines independently observed live web/image evidence with a deterministic case state machine and a liability-protected settlement ledger.

The exact submission artifact is [`contracts/recall_shield.py`](contracts/recall_shield.py). Upload or deploy that file alone.

## The trust problem

A normal deterministic smart contract cannot fetch live recall pages, interpret product images, decide whether a configured recall applies, or assess whether ownership evidence is sufficient. A single off-chain model or oracle could answer those questions, but then that operator unilaterally controls eligibility and money.

RecallShield uses GenLayer because each validator independently fetches the configured sources and claimant evidence, independently interprets the evidence, and accepts a state transition only when the settlement-relevant observations are equivalent. Remove GenLayer consensus and one external service must be trusted to decide who receives escrow.

The contract makes a deliberately modest claim:

> RecallShield adjudicates claimant evidence against the case's configured recall and product sources using independent validator web access and semantic consensus.

The case owner chooses those sources. RecallShield does not cryptographically prove that a URL belongs to a regulator or manufacturer. Sources and policy are immutable after case creation.

## Architecture

```text
bounded deterministic inputs
          |
          v
case admission + bond + liability reservation
          |
          v
independent validator web/image observation
          |
          v
structured analysis/error envelope
          |
          v
decision-field equivalence
          |
          v
deterministic verdict policy
          |
          v
checks -> accounting effects -> native GEN transfers
```

Nondeterministic work is limited to:

- rendering the configured recall page;
- rendering the optional configured product page;
- rendering the claimant proof page;
- rendering product and optional purchase images;
- classifying product identity, recall applicability, ownership evidence, and confidence.

Deterministic code owns:

- HTTPS/host/input validation;
- authoritative transaction time and deadlines;
- claim admission, per-address limit, evidence uniqueness, capacity and bond;
- lifecycle transitions;
- the eligibility threshold and verdict derivation;
- liability reservation and release;
- payout amounts and recipients;
- settlement, surplus reclaim, final reclaim and all counters.

The model never decides a payout amount, recipient, state mutation, or reclaim.

## Consensus and equivalence

The leader returns one of two bounded envelopes:

```json
{"kind":"analysis","result":{"product_match":"yes","recall_match":"yes","ownership_match":"unclear","confidence":55,"quality":"adequate","summary":"..."}}
```

```json
{"kind":"error","class":"transient_fetch"}
```

A validator independently repeats every fetch, render and model classification. It does not accept a payload merely because it has the correct shape.

For successful analysis, equivalence requires agreement on:

- `product_match`;
- `recall_match`;
- `ownership_match`;
- the deterministically derived verdict class.

`quality` and `summary` are diagnostic. They cannot change settlement, so differences in those fields do not reject an otherwise equivalent decision. Confidence does not use a loose numeric tolerance: it matters only where it changes the deterministic verdict at the 70-point boundary. Tests cover quality-only disagreement and the 69/70 boundary.

For technical failures, validators independently agree on the error class. The deterministic post-consensus path raises a `[RETRYABLE]` error. No claim field, timestamp, counter or GEN ledger value changes.

## Verdict policy

- `eligible`: product, recall and ownership are all `yes`, with confidence at least 70.
- `ineligible`: product or recall is `no`, with confidence at least 70.
- `needs_manual_review`: evidence was successfully evaluated but does not satisfy either automatic rule.

Technical errors are not manual review. `transient_fetch`, `transient_image`, `empty_evidence`, `model_unavailable` and `malformed_model_output` remain retryable failures.

## `UNDETERMINED`

`UNDETERMINED` is a GenLayer transaction outcome, not a RecallShield verdict. It can occur when validators do not reach equivalence after the configured rotations.

Because `evaluate_claim` performs no storage mutation before `run_nondet_unsafe` returns an agreed observation, an `UNDETERMINED` evaluation leaves the claim `submitted`, preserves its liability, moves no GEN and remains retryable. The Studionet verifier prints `UNDETERMINED` explicitly and checks finalized claim state before taking a dependent action.

If repeated evaluation never converges, the claimant can call `withdraw_claim`. That returns the claimant bond, releases the claim allocation to the case owner, marks the claim settled with verdict `withdrawn`, and removes the outstanding liability. The case owner cannot withdraw a claimant's pending claim.

## Escrow invariant

For every case, at every accepted state:

```text
funds_held >= outstanding_liability

outstanding_liability
  = sum(all unresolved claim allocations + their refundable claimant bonds)
```

When a claim is admitted, its full payout/reserve allocation and exact claimant bond are reserved. When it settles or the claimant withdraws, both are removed from `outstanding_liability` before transfers are emitted.

All value-moving paths use checks-effects-interactions:

1. validate status, authority, split and ledger coverage;
2. update case accounting, claim state, counters and totals;
3. emit native GEN transfers.

`reclaim_surplus` can only release `funds_held - outstanding_liability` after claim intake is closed. `finalize_case` requires zero outstanding liability and every submitted claim terminal. `reclaim_closed_case` requires that finalized, liability-free state. Double settlement, double cancellation and double reclaim fail deterministically.

## State machines

```text
Case
OPEN <-> PAUSED
  |        |
  +--------+----> CLAIMS_CLOSED ----> CLOSED
       unused \                         |
               +----> CANCELLED         +--> final reclaim

Claim
SUBMITTED --consensus--> EVALUATED(eligible/ineligible) --> SETTLED
     |
     +--consensus--> NEEDS_MANUAL_REVIEW --> owner split --> SETTLED
     |
     +--claimant withdrawal-----------------------------> SETTLED/withdrawn
     |
     +--retryable error or UNDETERMINED-----------------> SUBMITTED (unchanged)
```

Closing intake and completing resolution are distinct. Claims already submitted remain evaluable and settleable in `claims_closed`. Deadlines stop new submissions only; they never strand existing claims.

## Claim-slot griefing

Each case configures a positive exact claimant bond. A valid submission must include it, each address may submit only once per case, evidence URLs cannot be reused globally, and per-case capacity is capped at 32. Invalid submissions roll back before consuming capacity. The bond is returned on every terminal financial path, including claimant withdrawal.

This is a reusable economic friction mechanism, not an application-specific allowlist. A Sybil attacker can still create multiple funded addresses; applications may add stronger admission rules outside this primitive.

## Storage and input bounds

| Item | Bound |
|---|---:|
| Cases per deployment | 256 |
| Claims per deployment | 2,048 |
| Claims per case | 32 |
| Identifier | 96 chars |
| URL | 500 chars |
| Title/manufacturer | 180 chars |
| Product description | 1,200 chars |
| Rules | 1,800 chars |
| Claim statement | 1,200 chars |
| Manual note | 700 chars |
| Stored summary | 350 chars |
| Rendered page supplied to model | 6,000 chars/source |
| View page size | 50 |

The contract does not maintain unbounded global ID or audit arrays. Per-case claim enumeration is bounded by the hard 32-claim maximum. Events carry lifecycle history without a permanently growing audit array.

Only public HTTPS DNS hosts are admitted. Obvious loopback, private, link-local, credential-bearing, explicit-port, malformed and local/internal targets are rejected. This is application-level SSRF hardening, not a replacement for validator-runtime egress controls or DNS-rebinding protection.

## Trust and threat model

### Malicious claimant

A claimant may submit an unrelated product, unrelated recall, fake ownership, duplicate evidence, prompt-injection content or deliberately unavailable URLs. Deterministic validation rejects malformed/duplicate inputs before consensus. Prompts frame webpages, claimant text and image text as hostile data. Validators independently observe the evidence; technical failure is retryable and cannot become eligibility.

### Malicious case owner

A case owner may choose misleading recall/product sources. That source-authority trust is explicit. Once created, source URLs and policy cannot change. The owner cannot reclaim reserved liabilities, cannot settle an automatic verdict with an arbitrary split, and cannot withdraw a claimant's pending claim. For `needs_manual_review`, the owner is deliberately the final resolver and may choose 0-100% of the base allocation; the claimant bond is always returned. That authority is auditable and cannot exceed reserved escrow.

### Unreliable web and models

Downtime, empty render, unavailable image, model transport failure and malformed output have distinct technical classes. When validators agree on a technical class, the transaction rolls back with `[RETRYABLE]`. When observations materially disagree, consensus can become `UNDETERMINED`. Neither path changes business state or money.

### Consensus assumptions

RecallShield inherits GenLayer's validator-majority trust assumption. Consensus reduces unilateral oracle/model control; it does not make semantic classification infallible or defend against a malicious validator majority.

## Local tests

Create the local environment and run:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt pytest
.\.venv\Scripts\python.exe -m pytest tests\direct -q
.\.venv\Scripts\python.exe scripts\preflight.py
```

The direct suite covers case creation, funding, URLs, deadlines, bonds, capacity, duplicate claim/evidence, one-claim-per-address, lifecycle transitions, all verdicts, independent validator disagreement, quality-only equivalence, confidence boundary, retryable errors, retry, eligible/ineligible/manual accounting, claimant withdrawal, unsafe reclaim prevention, surplus reclaim, final close, cancellation, double operations, bounds and pagination.

The live test is opt-in:

```powershell
$env:RUN_STUDIONET='1'
$env:RS_CONTRACT='0x...'
$env:RS_WALLET_PASSWORD='...'
.\.venv\Scripts\python.exe -m pytest tests\integration -s
```

## Studionet tooling

Set `RS_KEYSTORE` to an encrypted signer kept outside generated artifacts. Never commit a keystore or password.

```powershell
$env:RS_WALLET_PASSWORD='...'
$env:RS_KEYSTORE='C:\path\to\encrypted-keystore.json'
npm run deploy:studionet

$env:RS_CONTRACT='0x...'
npm run verify:studionet

npm run source:match
```

The verifier waits for terminal transaction status and then waits again for canonical `latest-final` state before every dependent write. `UNDETERMINED` is printed as such, its no-mutation invariant is checked, and the claimant withdrawal path releases the test liability. The run closes intake, settles or withdraws every claim, finalizes the case and reclaims only provable surplus.

The previous v1 deployment at [`0x56914572783B7f88C4257993eCBA6b185cD65205`](https://explorer-studio.genlayer.com/address/0x56914572783B7f88C4257993eCBA6b185cD65205) is historical and is not submission evidence for v2. It contains the unsafe close/reclaim design fixed here. A v2 deployment must be recorded only after its Explorer source matches the final local file.

## Release gate and submission boundary

There is intentionally no CI and no GitHub Actions workflow. Run locally against the exact file:

```powershell
.\.venv\Scripts\genvm-lint.exe check contracts\recall_shield.py --json
.\.venv\Scripts\genvm-lint.exe schema contracts\recall_shield.py --output artifacts\recall_shield.abi.json
```

Both commands must be clean. Then deploy/upload only:

```text
contracts/recall_shield.py
```

Tests, fixtures, scripts, generated ABI, package files and documentation are repository support files—not GenLayer contract candidates and not part of the submission payload.

## Reuse

An application can fund a bounded recall case, configure its evidence sources and policy, accept bonded claims, request consensus evaluation, inspect structured verdicts and rely on deterministic GEN settlement. Consumers do not need to reproduce web access, image interpretation, equivalence logic, failure classification or escrow arithmetic.
