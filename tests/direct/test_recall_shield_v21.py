from test_recall_shield import (
    ONE,
    PROOF,
    IMAGE,
    create,
    deploy,
    mock_result,
    submit,
)


def test_global_pause_blocks_new_risk_but_allows_submitted_claim_exit(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    create(direct_vm, c)
    submit(direct_vm, c)
    c.set_paused(True)

    with direct_vm.expect_revert("Contract is paused"):
        c.evaluate_claim("claim-1")

    c.withdraw_claim("claim-1")
    claim = c.get_claim("claim-1")
    case = c.get_case("case-1")
    assert claim["status"] == "settled"
    assert claim["verdict"] == "withdrawn"
    assert claim["claimant_payout"] == str(ONE // 10)
    assert case["outstanding_liability"] == "0"


def test_global_pause_allows_already_evaluated_auto_settlement(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    create(direct_vm, c)
    submit(direct_vm, c)
    mock_result(direct_vm)
    c.evaluate_claim("claim-1")
    c.set_paused(True)

    c.settle_auto_claim("claim-1")
    claim = c.get_claim("claim-1")
    assert claim["status"] == "settled"
    assert claim["claimant_payout"] == str(ONE + ONE // 10)


def test_global_pause_blocks_each_risk_increasing_operation(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy)
    create(direct_vm, c)
    submit(direct_vm, c)
    c.set_paused(True)

    with direct_vm.expect_revert("Contract is paused"):
        create(direct_vm, c, case_id="case-2")
    direct_vm.value = ONE
    try:
        with direct_vm.expect_revert("Contract is paused"):
            c.top_up_case("case-1")
    finally:
        direct_vm.value = 0
    with direct_vm.expect_revert("Contract is paused"):
        c.set_case_status("case-1", "paused")
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("Contract is paused"):
            submit(direct_vm, c, "claim-2", "case-1", "https://proof.example.com/2", "https://images.example.com/2.png")
    with direct_vm.expect_revert("Contract is paused"):
        c.evaluate_claim("claim-1")


def test_global_pause_allows_manual_settlement_and_case_exits(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    create(direct_vm, c, case_id="manual")
    submit(direct_vm, c, "manual-claim", "manual")
    mock_result(direct_vm, ownership="unclear", confidence=50)
    c.evaluate_claim("manual-claim")

    create(direct_vm, c, case_id="surplus")
    c.set_case_status("surplus", "claims_closed")
    create(direct_vm, c, case_id="final-reclaim")
    c.set_case_status("final-reclaim", "claims_closed")
    create(direct_vm, c, case_id="cancel")
    c.set_paused(True)

    c.settle_manual_claim("manual-claim", 0, "Release allocation during emergency pause.")
    c.reclaim_surplus("surplus")
    c.finalize_case("surplus")
    c.finalize_case("final-reclaim")
    c.reclaim_closed_case("final-reclaim")
    c.cancel_unused_case("cancel")

    assert c.get_claim("manual-claim")["status"] == "settled"
    for case_id in ("surplus", "final-reclaim", "cancel"):
        case = c.get_case(case_id)
        assert case["funds_held"] == "0"
        assert case["outstanding_liability"] == "0"


def test_manual_review_claimant_can_exit_and_only_recover_bond(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    create(direct_vm, c)
    submit(direct_vm, c)
    mock_result(direct_vm, ownership="unclear", confidence=50)
    c.evaluate_claim("claim-1")
    assert c.get_claim("claim-1")["status"] == "needs_manual_review"

    c.withdraw_claim("claim-1")
    claim = c.get_claim("claim-1")
    case = c.get_case("case-1")
    assert claim["status"] == "settled"
    assert claim["verdict"] == "withdrawn"
    assert claim["claimant_payout"] == str(ONE // 10)
    assert claim["owner_release"] == str(2 * ONE)
    assert case["outstanding_liability"] == "0"


def test_evidence_reuse_is_blocked_within_case_but_allowed_across_cases(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy)
    create(direct_vm, c, case_id="case-1")
    create(direct_vm, c, case_id="case-2")
    submit(direct_vm, c, "claim-1", "case-1", PROOF, IMAGE)

    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("Evidence already used in this case"):
            submit(direct_vm, c, "claim-2", "case-1", PROOF + "?same=1", "https://images.example.com/other.png")

        submit(direct_vm, c, "claim-3", "case-2", PROOF, IMAGE)

    assert c.get_claim("claim-3")["case_id"] == "case-2"


def test_diagnostic_fields_are_validated_but_not_compared(direct_vm, direct_deploy):
    c = deploy(direct_vm, direct_deploy)
    module = direct_vm._recall_module
    base = {
        "product_match": "yes",
        "recall_match": "yes",
        "ownership_match": "yes",
        "confidence": 90,
        "quality": "strong",
        "summary": "valid",
    }
    assert module.valid_analysis(base) is True

    bad_quality = dict(base)
    bad_quality["quality"] = "excellent"
    assert module.valid_analysis(bad_quality) is False

    bad_summary = dict(base)
    bad_summary["summary"] = "x" * (module.MAX_SUMMARY + 1)
    assert module.valid_analysis(bad_summary) is False

    equivalent = dict(base)
    equivalent["quality"] = "adequate"
    equivalent["summary"] = "different diagnostic wording"
    assert module.equivalent_observation(base, equivalent) is True
