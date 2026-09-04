from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN_CONTRACT = ROOT / "config" / "github-main-ruleset-contract.json"
TAG_CONTRACT = ROOT / "config" / "github-release-tag-ruleset-contract.json"

EXPECTED_CHECKS = [
    ("architecture", "check"),
    ("release-integrity", "bundle"),
    ("database-contract", "postgres-contract"),
    ("dependency-vulnerability-scan", "scan"),
    ("codeql", "CodeQL (javascript-typescript)"),
    ("codeql", "CodeQL (python)"),
]


def check(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    contract_path = root / "config" / "github-main-ruleset-contract.json"
    if not contract_path.exists():
        return ["missing GitHub main ruleset contract"]

    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    if contract.get("schema_version") != 1:
        errors.append("GitHub main ruleset contract schema_version must be 1")
    if contract.get("repository") != "hiroyuki9614/vault":
        errors.append("GitHub main ruleset contract repository must be hiroyuki9614/vault")
    if contract.get("target_branch") != "main":
        errors.append("GitHub main ruleset contract must target main")
    if contract.get("intended_enforcement") != "active":
        errors.append("GitHub main ruleset intended enforcement must be active")

    for field in (
        "require_pull_request",
        "require_branch_up_to_date",
        "block_force_pushes",
        "block_branch_deletion",
    ):
        if contract.get(field) is not True:
            errors.append(f"GitHub main ruleset contract requires {field}=true")

    if contract.get("required_approvals_public_reference") != 0:
        errors.append("public reference repository must not require an unavailable second reviewer")
    if contract.get("production_recommended_minimum_approvals", 0) < 1:
        errors.append("production recommendation must require at least one approval")
    if contract.get("bypass_policy") != "break_glass_administrators_only":
        errors.append("GitHub main ruleset bypass policy must be break_glass_administrators_only")

    declared = [
        (entry.get("workflow"), entry.get("context"))
        for entry in contract.get("required_status_checks", [])
        if isinstance(entry, dict)
    ]
    if declared != EXPECTED_CHECKS:
        errors.append(f"required status checks must exactly match {EXPECTED_CHECKS!r}")

    workflow_jobs = {
        "architecture": (root / ".github" / "workflows" / "architecture.yml", "  check:"),
        "release-integrity": (root / ".github" / "workflows" / "release-integrity.yml", "  bundle:"),
        "database-contract": (root / ".github" / "workflows" / "database-contract.yml", "  postgres-contract:"),
        "dependency-vulnerability-scan": (root / ".github" / "workflows" / "dependency-vulnerability-scan.yml", "  scan:"),
    }
    for workflow, (path, job_fragment) in workflow_jobs.items():
        if not path.exists():
            errors.append(f"missing workflow backing required check: {workflow}")
            continue
        text = path.read_text(encoding="utf-8")
        if job_fragment not in text:
            errors.append(f"workflow {workflow} no longer declares required job context {job_fragment.strip(': ')}")

    codeql = root / ".github" / "workflows" / "codeql.yml"
    if not codeql.exists():
        errors.append("missing codeql workflow backing required checks")
    else:
        text = codeql.read_text(encoding="utf-8")
        for fragment in ("javascript-typescript", "python", "name: CodeQL (${{ matrix.language }})"):
            if fragment not in text:
                errors.append(f"CodeQL workflow no longer guarantees required context shape: {fragment}")

    tag_contract_path = root / "config" / "github-release-tag-ruleset-contract.json"
    if not tag_contract_path.exists():
        errors.append("missing GitHub release tag ruleset contract")
    else:
        tag_contract = json.loads(tag_contract_path.read_text(encoding="utf-8"))
        expected_scalar = {
            "schema_version": 1,
            "repository": "hiroyuki9614/vault",
            "target": "tag",
            "target_pattern": "v*",
            "intended_enforcement": "active",
            "bypass_policy": "release_or_break_glass_administrators_only",
        }
        for field, expected in expected_scalar.items():
            if tag_contract.get(field) != expected:
                errors.append(f"GitHub release tag ruleset contract requires {field}={expected!r}")
        for field in ("restrict_creations", "restrict_updates", "restrict_deletions"):
            if tag_contract.get(field) is not True:
                errors.append(f"GitHub release tag ruleset contract requires {field}=true")
        source_gate = tag_contract.get("source_release_gate", {})
        expected_gate = {
            "workflow": "release-integrity",
            "job": "attest-tag",
            "tag_must_match_package_version": True,
            "tagged_commit_must_be_ancestor_of_main": True,
        }
        if source_gate != expected_gate:
            errors.append("GitHub release tag ruleset source_release_gate must match the attested release contract")

    governance = root / "docs" / "REPOSITORY_GOVERNANCE.md"
    if not governance.exists():
        errors.append("missing repository governance document")
    else:
        text = governance.read_text(encoding="utf-8")
        for _, context in EXPECTED_CHECKS:
            if f"`{context}`" not in text:
                errors.append(f"repository governance must name required status context: {context}")
        if "config/github-main-ruleset-contract.json" not in text:
            errors.append("repository governance must link the declarative main ruleset contract")
        if "config/github-release-tag-ruleset-contract.json" not in text:
            errors.append("repository governance must link the declarative release tag ruleset contract")

    tag_governance = root / "docs" / "RELEASE_TAG_GOVERNANCE.md"
    if not tag_governance.exists():
        errors.append("missing release tag governance document")
    else:
        text = tag_governance.read_text(encoding="utf-8")
        for fragment in ("v*", "Restrict creations", "Restrict updates", "Restrict deletions", "integrated into `main`"):
            if fragment not in text:
                errors.append(f"release tag governance missing invariant: {fragment}")

    return errors


def main() -> int:
    errors = check()
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print("PASS: GitHub main and release-tag governance declarations match source-controlled workflow contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
