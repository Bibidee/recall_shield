# Recall Shield v2.1 hardening

This follow-up hardening pass is intentionally narrow. It starts from the v2 submission baseline at `2c2ade8d032c50b1080311bcdadbc7f203c9fee1` and does not change Recall Shield's core adjudication or settlement model.

## Emergency pause semantics

The contract-level pause now blocks operations that introduce or expand risk (`create_case`, `top_up_case`, case reopening/status changes, `submit_claim`, and `evaluate_claim`) while leaving liability-reducing exits available. Already-evaluated settlements, claimant withdrawals, manual settlements, surplus reclaim, finalization, unused-case cancellation, and final reclaim remain callable while globally paused.

This keeps emergency pause useful without giving the contract owner indefinite liveness/censorship power over already-reserved GEN liabilities.

## Manual-review liveness

A claimant whose claim reaches `needs_manual_review` may voluntarily withdraw instead of waiting indefinitely for the case owner.

Withdrawal from manual review:

- returns only the claimant bond to the claimant;
- releases the entire reserved claim allocation to the case owner;
- marks the claim terminal as `settled` with verdict `withdrawn`;
- reduces `outstanding_liability` by the full allocation plus bond;
- cannot produce an unearned claimant payout.

This provides a one-sided liveness escape without overriding the case owner's manual-resolution authority for claimants who choose to remain in review.

## Diagnostic validation

`quality` and `summary` remain outside semantic equivalence, so wording or evidence-quality labels cannot create unnecessary validator disagreement. They are nevertheless schema-validated before a leader result can be accepted and persisted.

## Evidence replay scope

Evidence replay protection is now scoped per recall case. The same canonical evidence URL remains non-reusable inside one case, but an unrelated case cannot globally poison that URL for all future recall programs.

## Studionet verification

The verifier now contains semantic safety assertions in addition to lifecycle/accounting checks:

- deliberately mismatched evidence must never become `eligible`;
- deliberately ownership-ambiguous evidence must never become `eligible`;
- failed/undetermined evaluations must leave a claim in `submitted` with `evaluated_at == 0`;
- recovery cleanup can withdraw either `submitted` or `needs_manual_review` claims.

Live deployment/source-match results must still be recorded from the exact final contract source. No GitHub Actions or CI are introduced by this hardening pass.

## Studionet evidence — 18 August 2026

- Tested/deployed source commit: `b390dfa30571301f33931f673eeb14b801f37c64`
- Contract: `0x8b49fF0a0E3C195c913f9a12Ae7Efc2FCbF1f15f`
- Deployment transaction: `0xbe4b85e45748c633d805739b4b6523f14932a92203a1ae93b171b677df6ac504`
- Deployment result: `FINALIZED / MAJORITY_AGREE / SUCCESS`
- Local and deployed SHA-256: `86762659bac2153ab3941febe5f4b838061bd93b6c8593e7e350babc650f067f`
- Source retrieval: exact byte match
- Direct Mode: `37 passed`
- Complete pytest: `37 passed, 1 skipped` (the Studionet integration wrapper is opt-in)
- GenVM lint: clean (`ok: true`, 17 methods, 4 views, 13 writes)
- GenVM schema generation: passed

Semantic matrix (`rs-v21-*-1787060782288`):

- matching: `needs_manual_review`, evaluation `0xaa9be14a785881755387f4d7450c1f2ded2696b3cde2a4264058a59fac755137`, finalized successfully;
- mismatch: no verdict, `CANCELED / NO_MAJORITY`, evaluation `0x5021ad765fd4124768ba0eb427f485cc9b381411783fa36fa6a7814faff9b447`; canonical state remained `submitted` with `evaluated_at = 0`, zero payout, unchanged liability and terminal counter; withdrawal `0xe561a8990e07b6930be133e9a57e2b4d1edcb6603a8cbfc43a2587b3ca14da8a` finalized successfully;
- ambiguous ownership: `needs_manual_review`, evaluation `0x071aa4b0a54df8e9db4838b909fd284ba764e42d4a7b4102050ef6903cb909fa`, finalized successfully after one rotation.

All three matrix cases ended `closed` with `funds_held = 0`, `outstanding_liability = 0`, one submitted/one terminal claim, and `liability_invariant = true`.

Live v2.1 liveness (`rs-v21-live-*-1787062126912`):

- paused evaluation was rejected at `0xb40483243058229990fa46bcc1effbea0cd05dca5f340f5a96537d8fa71135e6` (`FINALIZED / MAJORITY_AGREE / ERROR`) without mutating the submitted claim or liability;
- submitted-claim withdrawal while still paused finalized at `0x3a780a715daf4ef4164e70c175bde073588158b99d5da276be75584e0a33ea22`;
- the manual-exit evaluation finalized as `needs_manual_review` at `0x765237bd746c5d91bb189d6f684642f8ab2d276916263ec193d6c69c4095fa49`;
- manual-review claimant withdrawal while paused finalized at `0x65f2ff945cd6c85ada12fc0755aa95ad666d0fd020fed9b7f6cfab0428098637`;
- claimant payout was exactly the `0.01 GEN` bond; owner release was the complete `0.15 GEN` allocation; no recall payout was created;
- both liveness cases ended closed with zero funds, zero outstanding liability, equal submitted/terminal counters, and a true accounting invariant.

There were no `UNDETERMINED` transactions in these runs. The mismatch evaluation was `CANCELED / NO_MAJORITY` and is reported as a no-verdict outcome, not a pass or business verdict.
