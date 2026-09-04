from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MAIN_CONTRACT = ROOT / "config" / "github-main-ruleset-contract.json"
TAG_CONTRACT = ROOT / "config" / "github-release-tag-ruleset-contract.json"
REPOSITORY = "hiroyuki9614/vault"
API_VERSION = "2026-03-10"
ADMIN_BYPASS = {
    "actor_id": 5,
    "actor_type": "RepositoryRole",
    "bypass_mode": "always",
}


class ContractError(ValueError):
    pass


def _load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ContractError(f"contract must be a JSON object: {path}")
    return payload


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractError(message)


def render_main_ruleset(contract: dict[str, Any]) -> dict[str, Any]:
    _require(contract.get("schema_version") == 1, "main contract schema_version must be 1")
    _require(contract.get("repository") == REPOSITORY, f"main contract repository must be {REPOSITORY}")
    _require(contract.get("target_branch") == "main", "main contract must target main")
    _require(contract.get("intended_enforcement") == "active", "main ruleset must intend active enforcement")
    _require(contract.get("require_pull_request") is True, "main ruleset must require pull requests")
    _require(contract.get("require_branch_up_to_date") is True, "main ruleset must require an up-to-date branch")
    _require(contract.get("block_force_pushes") is True, "main ruleset must block force pushes")
    _require(contract.get("block_branch_deletion") is True, "main ruleset must block branch deletion")
    _require(contract.get("required_approvals_public_reference") == 0, "public reference approval count must remain zero")
    _require(contract.get("code_owner_review_public_reference") is False, "public reference CODEOWNERS review must remain disabled")
    _require(contract.get("bypass_policy") == "break_glass_administrators_only", "main bypass policy must stay administrator-only")

    checks = contract.get("required_status_checks")
    _require(isinstance(checks, list) and checks, "main contract must declare required status checks")
    contexts: list[dict[str, str]] = []
    for entry in checks:
        _require(isinstance(entry, dict) and isinstance(entry.get("context"), str), "each required status check must declare a context")
        contexts.append({"context": entry["context"]})

    return {
        "name": "enterprise-main",
        "target": "branch",
        "enforcement": "active",
        "bypass_actors": [ADMIN_BYPASS],
        "conditions": {
            "ref_name": {
                "include": ["~DEFAULT_BRANCH"],
                "exclude": [],
            }
        },
        "rules": [
            {"type": "deletion"},
            {"type": "non_fast_forward"},
            {
                "type": "pull_request",
                "parameters": {
                    "required_approving_review_count": 0,
                    "dismiss_stale_reviews_on_push": False,
                    "require_code_owner_review": False,
                    "require_last_push_approval": False,
                    "required_review_thread_resolution": False,
                },
            },
            {
                "type": "required_status_checks",
                "parameters": {
                    "do_not_enforce_on_create": False,
                    "required_status_checks": contexts,
                    "strict_required_status_checks_policy": True,
                },
            },
        ],
    }


def render_release_tag_ruleset(contract: dict[str, Any]) -> dict[str, Any]:
    _require(contract.get("schema_version") == 1, "release-tag contract schema_version must be 1")
    _require(contract.get("repository") == REPOSITORY, f"release-tag contract repository must be {REPOSITORY}")
    _require(contract.get("target") == "tag", "release-tag contract must target tags")
    _require(contract.get("target_pattern") == "v*", "release-tag contract must target v*")
    _require(contract.get("intended_enforcement") == "active", "release-tag ruleset must intend active enforcement")
    _require(contract.get("restrict_creations") is True, "release-tag ruleset must restrict creation")
    _require(contract.get("restrict_updates") is True, "release-tag ruleset must restrict updates")
    _require(contract.get("restrict_deletions") is True, "release-tag ruleset must restrict deletion")
    _require(
        contract.get("bypass_policy") == "release_or_break_glass_administrators_only",
        "release-tag bypass policy must stay administrator-only",
    )

    source_gate = contract.get("source_release_gate")
    _require(isinstance(source_gate, dict), "release-tag contract must declare source_release_gate")
    _require(source_gate.get("tag_must_match_package_version") is True, "release tags must match the package version")
    _require(source_gate.get("tagged_commit_must_be_ancestor_of_main") is True, "release tags must point to commits integrated into main")

    return {
        "name": "enterprise-release-tags",
        "target": "tag",
        "enforcement": "active",
        "bypass_actors": [ADMIN_BYPASS],
        "conditions": {
            "ref_name": {
                "include": ["refs/tags/v*"],
                "exclude": [],
            }
        },
        "rules": [
            {"type": "creation"},
            {"type": "update"},
            {"type": "deletion"},
        ],
    }


def render_payloads(root: Path = ROOT) -> dict[str, dict[str, Any]]:
    return {
        "enterprise-main": render_main_ruleset(_load(root / "config" / MAIN_CONTRACT.name)),
        "enterprise-release-tags": render_release_tag_ruleset(_load(root / "config" / TAG_CONTRACT.name)),
    }


def write_payloads(output_dir: Path, root: Path = ROOT) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, payload in render_payloads(root).items():
        path = output_dir / f"{name}.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        written.append(path)
    return written


def print_apply_commands(output_dir: Path) -> None:
    for name in ("enterprise-main", "enterprise-release-tags"):
        path = output_dir / f"{name}.json"
        print(
            "gh api --method POST "
            f"-H 'X-GitHub-Api-Version: {API_VERSION}' "
            f"repos/{REPOSITORY}/rulesets --input {path}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render administrator-applied GitHub ruleset payloads from the repository governance contracts."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(".ruleset-payloads"),
        help="Directory for rendered JSON payloads (default: .ruleset-payloads)",
    )
    parser.add_argument(
        "--print-apply-commands",
        action="store_true",
        help="Print gh api commands. The helper itself never mutates GitHub.",
    )
    args = parser.parse_args()

    try:
        paths = write_payloads(args.output_dir)
    except (ContractError, json.JSONDecodeError, OSError) as exc:
        print(f"FAIL: {exc}")
        return 1

    for path in paths:
        print(f"WROTE: {path}")
    if args.print_apply_commands:
        print_apply_commands(args.output_dir)
    print("PASS: administrator ruleset payloads rendered from source-controlled contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
