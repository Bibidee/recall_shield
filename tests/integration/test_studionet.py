"""Opt-in live verification for the deployed RecallShield v2 contract.

Run only with explicit network credentials:
RUN_STUDIONET=1 RS_CONTRACT=0x... RS_WALLET_PASSWORD=... pytest tests/integration -s
"""

import os
import subprocess
import pytest


@pytest.mark.skipif(os.getenv("RUN_STUDIONET") != "1", reason="live Studionet test is opt-in")
def test_full_studionet_verdict_and_accounting_cycle():
    required = ("RS_CONTRACT", "RS_WALLET_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    assert not missing, f"missing live-test environment variables: {missing}"
    completed = subprocess.run(
        ["node", "scripts/studionet_verify.mjs"],
        check=False,
        text=True,
        capture_output=True,
        env=os.environ.copy(),
    )
    print(completed.stdout)
    if completed.stderr: print(completed.stderr)
    assert completed.returncode == 0
    assert '"finalCase"' in completed.stdout
    assert '"outstanding_liability":"0"' in completed.stdout
