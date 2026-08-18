import json
import sys
from conftest import warp_to

CONTRACT = "contracts/recall_shield.py"
ONE = 10**18
NOW = 1_787_040_000
DEADLINE = NOW + 86_400
RECALL = "https://recalls.example.com/note7"
PRODUCT = "https://products.example.com/note7"
PROOF = "https://proof.example.com/claim-1"
IMAGE = "https://images.example.com/phone-1.png"
PROMPT = r"You are a safety-recall evidence assessor"


def deploy(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm._recall_module = sys.modules[contract.__class__.__module__]
    warp_to(direct_vm, "2026-08-18T08:00:00Z")
    return contract


def create(direct_vm, contract, case_id="case-1", max_claims=2, deposit=4*ONE,
           deadline=DEADLINE, bond=ONE//10, recall=RECALL, product=PRODUCT):
    direct_vm.value = deposit
    try:
        contract.create_case(case_id, "Note 7 recall", "Samsung", "Galaxy Note 7",
            recall, product, "Match product, recall scope, and ownership.",
            ONE, ONE, max_claims, bond, deadline)
    finally:
        direct_vm.value = 0


def submit(direct_vm, contract, claim_id="claim-1", case_id="case-1", proof=PROOF,
           image=IMAGE, purchase="", statement="I own the pictured recalled phone."):
    direct_vm.value = ONE//10
    try: contract.submit_claim(claim_id, case_id, proof, image, purchase, statement)
    finally: direct_vm.value = 0


def mock_result(direct_vm, product="yes", recall="yes", ownership="yes", confidence=90,
                quality="strong", summary="Evidence matches."):
    result = {"product_match": product, "recall_match": recall, "ownership_match": ownership,
        "confidence": confidence, "quality": quality, "summary": summary}
    direct_vm._recall_module.observe_once = lambda *args: {"kind": "analysis", "result": dict(result)}


def mock_error(direct_vm, error_class):
    direct_vm._recall_module.observe_once = lambda *args: {"kind": "error", "class": error_class}


def test_valid_case_exact_accounting_and_timestamp(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c)
    case = c.get_case("case-1")
    assert case["funds_held"] == str(4*ONE)
    assert case["outstanding_liability"] == "0"
    assert case["created_at"] == NOW
    assert case["liability_invariant"] is True


def test_case_rejects_insufficient_escrow(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    with direct_vm.expect_revert("Deposit cannot cover"):
        create(direct_vm, c, deposit=3*ONE)


def test_case_rejects_invalid_limits_and_deadline(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    with direct_vm.expect_revert("max_claims"): create(direct_vm, c, max_claims=33, deposit=66*ONE)
    with direct_vm.expect_revert("deadline"): create(direct_vm, c, case_id="bad-deadline", deadline=NOW)


def test_case_rejects_bad_urls_and_ids(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    for bad in ("http://example.com", "https://localhost/x", "https://127.0.0.1/x", "https://user@example.com/x"):
        with direct_vm.expect_revert("recall_url"): create(direct_vm, c, case_id="bad-url", recall=bad)
    with direct_vm.expect_revert("case_id"): create(direct_vm, c, case_id="spaces are invalid")


def test_duplicate_case_rejected(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c)
    with direct_vm.expect_revert("already exists"): create(direct_vm, c)


def test_claim_adds_exact_bond_and_liability(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    case, claim = c.get_case("case-1"), c.get_claim("claim-1")
    assert case["funds_held"] == str(4*ONE + ONE//10)
    assert case["outstanding_liability"] == str(2*ONE + ONE//10)
    assert claim["allocation"] == str(2*ONE)
    assert claim["bond"] == str(ONE//10)
    assert claim["submitted_at"] == NOW


def test_claim_requires_exact_bond(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c)
    direct_vm.value = 0
    with direct_vm.expect_revert("Exact claimant bond"):
        c.submit_claim("claim-1", "case-1", PROOF, IMAGE, "", "statement")


def test_missing_case_and_duplicate_claim_rejected(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    direct_vm.value = ONE//10
    with direct_vm.expect_revert("not found"): c.submit_claim("claim-x", "missing", PROOF, IMAGE, "", "statement")
    direct_vm.value = 0; create(direct_vm, c); submit(direct_vm, c)
    with direct_vm.expect_revert("already exists"): submit(direct_vm, c)


def test_duplicate_evidence_and_same_claimant_blocked(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("Evidence already used"):
            submit(direct_vm, c, "claim-2", proof=PROOF + "?cache=1", image="https://images.example.com/phone-2.png")
    with direct_vm.expect_revert("One claim per address"):
        submit(direct_vm, c, "claim-3", proof="https://proof.example.com/3", image="https://images.example.com/3.png")


def test_url_fragments_are_rejected(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c)
    with direct_vm.expect_revert("blocked or malformed"):
        submit(direct_vm, c, proof=PROOF + "#fragment")


def test_capacity_and_closed_intake_enforced(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c, max_claims=1, deposit=2*ONE); submit(direct_vm, c)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("capacity"):
            submit(direct_vm, c, "claim-2", proof="https://proof.example.com/2", image="https://images.example.com/2.png")
    c.set_case_status("case-1", "claims_closed")
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("closed to new claims"):
            submit(direct_vm, c, "claim-3", proof="https://proof.example.com/3", image="https://images.example.com/3.png")


def test_deadline_boundary_and_expiry(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c, deadline=NOW+10)
    warp_to(direct_vm, "2026-08-18T08:00:10Z"); submit(direct_vm, c)
    warp_to(direct_vm, "2026-08-18T08:00:00Z"); create(direct_vm, c, case_id="case-2", deadline=NOW+10)
    warp_to(direct_vm, "2026-08-18T08:00:11Z")
    with direct_vm.expect_revert("deadline has passed"): submit(direct_vm, c, case_id="case-2", proof="https://proof.example.com/2", image="https://images.example.com/2.png")


def test_legal_and_illegal_case_transitions(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c)
    c.set_case_status("case-1", "paused"); assert c.get_case("case-1")["status"] == "paused"
    c.set_case_status("case-1", "open"); c.set_case_status("case-1", "claims_closed")
    with direct_vm.expect_revert("Illegal"): c.set_case_status("case-1", "open")


def test_intake_close_keeps_existing_claim_evaluable(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); c.set_case_status("case-1", "claims_closed")
    mock_result(direct_vm, ownership="unclear", confidence=55); c.evaluate_claim("claim-1")
    assert c.get_claim("claim-1")["status"] == "needs_manual_review"


def test_eligible_evaluation_and_validator_independence(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); mock_result(direct_vm)
    c.evaluate_claim("claim-1")
    assert c.get_claim("claim-1")["verdict"] == "eligible"
    assert direct_vm.run_validator() is True
    direct_vm.clear_mocks(); mock_result(direct_vm, product="no")
    assert direct_vm.run_validator() is False


def test_ineligible_and_manual_verdicts(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    mock_result(direct_vm, product="no", confidence=90); c.evaluate_claim("claim-1")
    assert c.get_claim("claim-1")["verdict"] == "ineligible"
    warp_to(direct_vm, "2026-08-18T08:00:00Z"); create(direct_vm, c, case_id="case-2")
    submit(direct_vm, c, "claim-2", "case-2", "https://proof.example.com/2", "https://images.example.com/2.png")
    direct_vm.clear_mocks(); mock_result(direct_vm, ownership="unclear", confidence=60); c.evaluate_claim("claim-2")
    assert c.get_claim("claim-2")["status"] == "needs_manual_review"


def test_quality_and_summary_do_not_affect_equivalence(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); mock_result(direct_vm, quality="strong", summary="leader")
    c.evaluate_claim("claim-1"); direct_vm.clear_mocks(); mock_result(direct_vm, quality="adequate", summary="validator wording")
    assert direct_vm.run_validator() is True


def test_confidence_boundary_changes_decision_class(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); mock_result(direct_vm, confidence=70)
    c.evaluate_claim("claim-1"); direct_vm.clear_mocks(); mock_result(direct_vm, confidence=69)
    assert direct_vm.run_validator() is False


def test_malformed_model_output_is_retryable_without_mutation(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    mock_error(direct_vm, "malformed_model_output")
    before = c.get_claim("claim-1")
    with direct_vm.expect_revert("RETRYABLE"): c.evaluate_claim("claim-1")
    after = c.get_claim("claim-1")
    assert after["status"] == before["status"] == "submitted" and after["evaluated_at"] == 0


def test_agreed_fetch_failure_is_retryable_not_manual(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    mock_error(direct_vm, "transient_fetch")
    with direct_vm.expect_revert("RETRYABLE"): c.evaluate_claim("claim-1")
    assert c.get_claim("claim-1")["status"] == "submitted"


def test_retry_after_technical_failure_succeeds(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    mock_error(direct_vm, "transient_fetch")
    with direct_vm.expect_revert("RETRYABLE"): c.evaluate_claim("claim-1")
    direct_vm.clear_mocks(); mock_result(direct_vm, ownership="unclear", confidence=50); c.evaluate_claim("claim-1")
    assert c.get_claim("claim-1")["verdict"] == "needs_manual_review"


def test_outstanding_liability_blocks_finalize_and_final_reclaim(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); c.set_case_status("case-1", "claims_closed")
    with direct_vm.expect_revert("Unresolved"): c.finalize_case("case-1")
    with direct_vm.expect_revert("Final liability-free"): c.reclaim_closed_case("case-1")


def test_claimant_can_withdraw_retryable_claim_and_release_liability(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("Claimant only"): c.withdraw_claim("claim-1")
    c.withdraw_claim("claim-1")
    claim, case = c.get_claim("claim-1"), c.get_case("case-1")
    assert claim["status"] == "settled" and claim["verdict"] == "withdrawn"
    assert claim["claimant_payout"] == str(ONE//10)
    assert case["outstanding_liability"] == "0"
    with direct_vm.expect_revert("submitted claim"): c.withdraw_claim("claim-1")


def test_surplus_reclaim_preserves_claim_liability(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); c.set_case_status("case-1", "claims_closed")
    c.reclaim_surplus("case-1"); case = c.get_case("case-1")
    assert case["funds_held"] == case["outstanding_liability"] == str(2*ONE + ONE//10)
    assert case["liability_invariant"] is True


def test_eligible_settlement_exact_accounting_and_no_double_settlement(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); mock_result(direct_vm); c.evaluate_claim("claim-1")
    c.settle_auto_claim("claim-1"); claim, case = c.get_claim("claim-1"), c.get_case("case-1")
    assert claim["claimant_payout"] == str(ONE + ONE//10) and claim["owner_release"] == str(ONE)
    assert case["outstanding_liability"] == "0" and case["claims_terminal"] == 1
    with direct_vm.expect_revert("auto-settleable"): c.settle_auto_claim("claim-1")


def test_ineligible_settlement_returns_bond_and_releases_allocation(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); mock_result(direct_vm, product="no"); c.evaluate_claim("claim-1")
    c.settle_auto_claim("claim-1"); claim = c.get_claim("claim-1")
    assert claim["claimant_payout"] == str(ONE//10) and claim["owner_release"] == str(2*ONE)


def test_manual_split_and_bps_bounds(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); submit(direct_vm, c); mock_result(direct_vm, ownership="unclear", confidence=50); c.evaluate_claim("claim-1")
    with direct_vm.expect_revert("Invalid manual"): c.settle_manual_claim("claim-1", 10001, "bad")
    c.settle_manual_claim("claim-1", 2500, "Owner reviewed ambiguous evidence.")
    claim = c.get_claim("claim-1")
    assert claim["claimant_payout"] == str(ONE//2 + ONE//10) and claim["owner_release"] == str(ONE + ONE//2)


def test_resolution_after_deadline_and_safe_final_close(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c, max_claims=1, deposit=2*ONE, deadline=NOW+10); submit(direct_vm, c)
    c.set_case_status("case-1", "claims_closed"); warp_to(direct_vm, "2026-08-19T08:00:00Z")
    mock_result(direct_vm, product="no"); c.evaluate_claim("claim-1"); c.settle_auto_claim("claim-1"); c.finalize_case("case-1")
    assert c.get_case("case-1")["status"] == "closed"


def test_unused_cancellation_and_no_double_reclaim(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy); create(direct_vm, c); c.cancel_unused_case("case-1")
    assert c.get_case("case-1")["funds_held"] == "0"
    with direct_vm.expect_revert("Only an unused"): c.cancel_unused_case("case-1")


def test_field_bounds_and_list_pagination(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    direct_vm.value = 2*ONE
    with direct_vm.expect_revert("title"): c.create_case("x", "x"*181, "M", "P", RECALL, PRODUCT, "R", ONE, ONE, 1, ONE//10, DEADLINE)
    direct_vm.value = 0; create(direct_vm, c); submit(direct_vm, c)
    rows = c.list_case_claims("case-1", 0, 1000)
    assert len(rows) == 1 and rows[0]["id"] == "claim-1"
