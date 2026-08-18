# RecallShield test matrix

| Area | Cases |
|---|---|
| Deployment | constructor owner, default pause state, info view |
| Funding | funded create, zero value reject, insufficient reserve reject, top-up |
| Intake | valid claim, duplicate claim, duplicate proof, duplicate image, capacity, invalid URLs |
| Consensus | eligible, ineligible, manual review, malformed model output, transient web failure, validator disagreement |
| Settlement | auto eligible payout, auto ineligible refund, manual 0/50/100% splits, second settlement rejection |
| Recovery | withdrawal, unused cancellation, close/reclaim, paused restrictions |
| Access | owner pause, case-owner actions, unauthorized caller rejections |
| Views | get_info, get_case, get_claim, list_case_claims pagination |
