# RecallShield

RecallShield is a reusable GenLayer contract for recall-claim adjudication and native GEN escrow.

## Submission boundary

Deploy only `contracts/recall_shield.py`. Keep tests, fixtures, scripts, generated ABI files, and editor configuration outside the uploaded source bundle. This prevents non-contract imports such as `pytest` from being discovered as contract candidates.

## Required release gate

Run on the exact file you upload:

```powershell
genvm-lint check contracts/recall_shield.py --json
genvm-lint schema contracts/recall_shield.py --output artifacts/recall_shield.abi.json
```

Do not deploy while either command reports a diagnostic. After deployment, compare Explorer-retrieved source with this exact file.

## Escrow invariant

`funds_deposited` is the only custody ledger. Every payout first zeroes or debits that ledger and saves claim state, then calls the single transfer helper. The contract offers eligible payout, ineligible refund, manual split, unused-case cancellation, and closed-case recovery.
