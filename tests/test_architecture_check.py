import tempfile
import unittest
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tooling.architecture_check import check


class ArchitectureCheckTest(unittest.TestCase):
    def copy_repo(self) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "repo"
        shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules"))
        self.addCleanup(lambda: shutil.rmtree(tmp.parent, ignore_errors=True))
        return tmp

    def test_current_repository_passes(self):
        self.assertEqual([], check(ROOT))

    def test_legacy_personal_path_fails(self):
        repo = self.copy_repo()
        (repo / "30_Areas").mkdir()
        errors = check(repo)
        self.assertTrue(any("30_Areas" in error for error in errors))

    def test_missing_rpc_fails(self):
        repo = self.copy_repo()
        migration = repo / "supabase" / "migrations" / "202608310001_supabase_first_vault.sql"
        migration.write_text(migration.read_text(encoding="utf-8").replace("function public.get_document", "function public.removed_get_document", 1), encoding="utf-8")
        errors = check(repo)
        self.assertTrue(any("get_document" in error for error in errors))

    def test_provider_dependency_in_functional_core_fails(self):
        repo = self.copy_repo()
        core = repo / "documents" / "machine" / "core" / "document-policy.ts"
        core.write_text(core.read_text(encoding="utf-8") + "\n// supabase\n", encoding="utf-8")
        errors = check(repo)
        self.assertTrue(any("functional core" in error and "supabase" in error for error in errors))

    def test_missing_typescript_runtime_file_fails(self):
        repo = self.copy_repo()
        (repo / "documents" / "machine" / "ports" / "document-store.ts").unlink()
        errors = check(repo)
        self.assertTrue(any("document-store.ts" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
