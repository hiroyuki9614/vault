from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tooling.release_integrity_check import check


class ReleaseIntegrityCheckTest(unittest.TestCase):
    def copy_repo(self) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "repo"
        shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", "dist", "release"))
        self.addCleanup(lambda: shutil.rmtree(tmp.parent, ignore_errors=True))
        return tmp

    def test_current_repository_passes(self):
        self.assertEqual([], check(ROOT))

    def test_attestation_action_must_remain_pinned(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "release-integrity.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace(
                "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6",
                "actions/attest@v4",
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("actions/attest@" in error for error in check(repo)))

    def test_deterministic_rebuild_comparison_is_required(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "release-integrity.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace('cmp "$bundle"', 'echo "$bundle"', 1),
            encoding="utf-8",
        )
        self.assertTrue(any("cmp" in error for error in check(repo)))

    def test_tag_attestation_must_remain_tag_scoped(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "release-integrity.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace(
                "if: startsWith(github.ref, 'refs/tags/v')",
                "if: always()",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("refs/tags/v" in error for error in check(repo)))


if __name__ == "__main__":
    unittest.main()
