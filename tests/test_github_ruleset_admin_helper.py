from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tooling.github_ruleset_admin_helper import ContractError, render_payloads, write_payloads


class GithubRulesetAdminHelperTest(unittest.TestCase):
    def copy_repo(self) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "repo"
        shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", "dist", "release"))
        self.addCleanup(lambda: shutil.rmtree(tmp.parent, ignore_errors=True))
        return tmp

    def test_current_contracts_render_expected_rulesets(self):
        payloads = render_payloads(ROOT)

        main = payloads["enterprise-main"]
        self.assertEqual("branch", main["target"])
        self.assertEqual("active", main["enforcement"])
        self.assertEqual(["~DEFAULT_BRANCH"], main["conditions"]["ref_name"]["include"])
        self.assertEqual(
            ["deletion", "non_fast_forward", "pull_request", "required_status_checks"],
            [rule["type"] for rule in main["rules"]],
        )
        status_rule = next(rule for rule in main["rules"] if rule["type"] == "required_status_checks")
        self.assertTrue(status_rule["parameters"]["strict_required_status_checks_policy"])
        self.assertEqual(
            [
                "check",
                "bundle",
                "postgres-contract",
                "scan",
                "CodeQL (javascript-typescript)",
                "CodeQL (python)",
            ],
            [entry["context"] for entry in status_rule["parameters"]["required_status_checks"]],
        )

        tag = payloads["enterprise-release-tags"]
        self.assertEqual("tag", tag["target"])
        self.assertEqual(["refs/tags/v*"], tag["conditions"]["ref_name"]["include"])
        self.assertEqual(["creation", "update", "deletion"], [rule["type"] for rule in tag["rules"]])

    def test_bypass_is_admin_role_only(self):
        payloads = render_payloads(ROOT)
        for payload in payloads.values():
            self.assertEqual(
                [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}],
                payload["bypass_actors"],
            )

    def test_weakened_tag_contract_is_rejected(self):
        repo = self.copy_repo()
        path = repo / "config" / "github-release-tag-ruleset-contract.json"
        contract = json.loads(path.read_text(encoding="utf-8"))
        contract["restrict_updates"] = False
        path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")

        with self.assertRaisesRegex(ContractError, "restrict updates"):
            render_payloads(repo)

    def test_weakened_main_strictness_is_rejected(self):
        repo = self.copy_repo()
        path = repo / "config" / "github-main-ruleset-contract.json"
        contract = json.loads(path.read_text(encoding="utf-8"))
        contract["require_branch_up_to_date"] = False
        path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")

        with self.assertRaisesRegex(ContractError, "up-to-date"):
            render_payloads(repo)

    def test_rendered_files_are_deterministic_json(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
        first = tmp / "first"
        second = tmp / "second"
        write_payloads(first, ROOT)
        write_payloads(second, ROOT)

        for name in ("enterprise-main.json", "enterprise-release-tags.json"):
            self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())


if __name__ == "__main__":
    unittest.main()
