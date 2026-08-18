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
