from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tooling.github_governance_check import check


class GithubGovernanceCheckTest(unittest.TestCase):
    def copy_repo(self) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "repo"
        shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", "dist"))
        self.addCleanup(lambda: shutil.rmtree(tmp.parent, ignore_errors=True))
        return tmp

    def test_current_repository_passes(self):
        self.assertEqual([], check(ROOT))

    def test_required_check_context_drift_fails(self):
        repo = self.copy_repo()
        contract_path = repo / "config" / "github-main-ruleset-contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["required_status_checks"][0]["context"] = "renamed-check"
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.assertTrue(any("required status checks" in error for error in check(repo)))

    def test_workflow_job_rename_fails(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "database-contract.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace("  postgres-contract:", "  renamed-contract:", 1),
            encoding="utf-8",
        )
        self.assertTrue(any("postgres-contract" in error for error in check(repo)))

    def test_force_push_protection_intent_is_required(self):
        repo = self.copy_repo()
        contract_path = repo / "config" / "github-main-ruleset-contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["block_force_pushes"] = False
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.assertTrue(any("block_force_pushes" in error for error in check(repo)))

    def test_release_tag_update_restriction_is_required(self):
        repo = self.copy_repo()
        contract_path = repo / "config" / "github-release-tag-ruleset-contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["restrict_updates"] = False
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.assertTrue(any("restrict_updates" in error for error in check(repo)))

    def test_release_tag_pattern_must_remain_version_scoped(self):
        repo = self.copy_repo()
        contract_path = repo / "config" / "github-release-tag-ruleset-contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["target_pattern"] = "*"
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.assertTrue(any("target_pattern" in error for error in check(repo)))


if __name__ == "__main__":
    unittest.main()
