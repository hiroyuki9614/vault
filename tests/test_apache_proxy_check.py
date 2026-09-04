from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tooling.apache_proxy_check import check


class ApacheProxyCheckTest(unittest.TestCase):
    def copy_repo(self) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "repo"
        shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", "dist"))
        self.addCleanup(lambda: shutil.rmtree(tmp.parent, ignore_errors=True))
        return tmp

    def test_current_repository_passes(self):
        self.assertEqual([], check(ROOT))

    def test_apache_must_replace_caller_request_id(self):
        repo = self.copy_repo()
        config = repo / "deploy" / "apache" / "vault.conf.example"
        config.write_text(
            config.read_text(encoding="utf-8").replace(
                'RequestHeader set X-Request-ID "%{UNIQUE_ID}e"',
                '# removed trusted request id replacement',
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("X-Request-ID" in error for error in check(repo)))

    def test_ci_must_enable_unique_id_module(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "architecture.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace(
                "a2enmod ssl proxy proxy_http headers setenvif unique_id",
                "a2enmod ssl proxy proxy_http headers setenvif",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("unique_id" in error for error in check(repo)))

    def test_ci_must_probe_spoofed_request_id(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "architecture.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace(
                "attacker-controlled-request-id",
                "removed-spoof-probe",
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("attacker-controlled-request-id" in error for error in check(repo)))


if __name__ == "__main__":
    unittest.main()
