"""Local release gate. This repository intentionally has no CI workflow."""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "recall_shield.py"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
LINTER = ROOT / ".venv" / "Scripts" / "genvm-lint.exe"

if list((ROOT / ".github" / "workflows").glob("*.y*ml")):
    raise SystemExit("CI workflow files are forbidden for this submission")

commands = [
    [str(PYTHON), "-m", "pytest", "tests/direct", "-q"],
    [str(LINTER), "check", str(CONTRACT), "--json"],
    [str(LINTER), "schema", str(CONTRACT), "--output", str(ROOT / "artifacts" / "recall_shield.abi.json")],
]
for command in commands:
    result = subprocess.run(command, cwd=ROOT, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)
print("RecallShield local release gates passed")
