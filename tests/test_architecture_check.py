import shutil
import sys
import tempfile
import unittest
from pathlib import Path

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
        self.assertTrue(any("30_Areas" in error for error in check(repo)))

    def test_missing_identity_rpc_fails(self):
        repo = self.copy_repo()
        migration = repo / "supabase" / "migrations" / "202609040001_document_identity_read.sql"
        migration.write_text(
            migration.read_text(encoding="utf-8").replace(
                "function public.get_document_by_id",
                "function public.removed_get_document_by_id",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("get_document_by_id" in error for error in check(repo)))

    def test_missing_idempotent_create_invariant_fails(self):
        repo = self.copy_repo()
        migration = repo / "supabase" / "migrations" / "202609040002_idempotent_document_create.sql"
        migration.write_text(
            migration.read_text(encoding="utf-8").replace("idempotency_conflict", "removed_conflict"),
            encoding="utf-8",
        )
        self.assertTrue(any("idempotency_conflict" in error for error in check(repo)))

    def test_create_command_without_required_identity_fails(self):
        repo = self.copy_repo()
        contract = repo / "documents" / "machine" / "contracts" / "document.ts"
        original = contract.read_text(encoding="utf-8")
        create_start = original.index("readonly kind: 'create';")
        id_start = original.index("readonly id: string;", create_start)
        mutated = original[:id_start] + "readonly id?: string;" + original[id_start + len("readonly id: string;"):]
        self.assertNotEqual(original, mutated)
        contract.write_text(mutated, encoding="utf-8")
        self.assertTrue(any("caller-generated document identity" in error for error in check(repo)))

    def test_provider_dependency_in_functional_core_fails(self):
        repo = self.copy_repo()
        core = repo / "documents" / "machine" / "core" / "document-policy.ts"
        core.write_text(core.read_text(encoding="utf-8") + "\n// supabase\n", encoding="utf-8")
        self.assertTrue(any("functional core" in error and "supabase" in error for error in check(repo)))

    def test_missing_typescript_runtime_file_fails(self):
        repo = self.copy_repo()
        (repo / "documents" / "machine" / "ports" / "document-store.ts").unlink()
        self.assertTrue(any("document-store.ts" in error for error in check(repo)))

    def test_missing_lockfile_fails(self):
        repo = self.copy_repo()
        (repo / "package-lock.json").unlink()
        self.assertTrue(any("package-lock.json" in error for error in check(repo)))

    def test_unpinned_dependency_fails(self):
        repo = self.copy_repo()
        package = repo / "package.json"
        package.write_text(
            package.read_text(encoding="utf-8").replace('"vitest": "4.1.11"', '"vitest": "^4.1.11"'),
            encoding="utf-8",
        )
        self.assertTrue(any("devDependency must be exact" in error and "vitest" in error for error in check(repo)))

    def test_npm_install_in_ci_fails(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "architecture.yml"
        workflow.write_text(workflow.read_text(encoding="utf-8").replace("npm ci", "npm install", 1), encoding="utf-8")
        self.assertTrue(any("must use npm ci" in error for error in check(repo)))

    def test_unpinned_action_fails_for_dash_uses_syntax(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "architecture.yml"
        text = workflow.read_text(encoding="utf-8")
        text = text.replace("actions/checkout@11d5960a326750d5838078e36cf38b85af677262", "actions/checkout@v4", 1)
        workflow.write_text(text, encoding="utf-8")
        self.assertTrue(any("40-hex commit" in error for error in check(repo)))

    def test_codeql_language_invariant_fails(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "codeql.yml"
        workflow.write_text(workflow.read_text(encoding="utf-8").replace("javascript-typescript", "removed-language"), encoding="utf-8")
        self.assertTrue(any("CodeQL workflow missing invariant" in error for error in check(repo)))

    def test_dependency_scan_requires_exact_osv_pin(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "dependency-vulnerability-scan.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace(
                "google/osv-scanner-action/osv-scanner-action@baa4139e56d6312335d899e6ba045fa16d1d3d0b",
                "google/osv-scanner-action/osv-scanner-action@1111111111111111111111111111111111111111",
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("pinned OSV scanner action" in error for error in check(repo)))

    def test_dependency_scan_requires_package_lock(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "dependency-vulnerability-scan.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace("--lockfile=package-lock.json", "--recursive"),
            encoding="utf-8",
        )
        self.assertTrue(any("committed npm lockfile" in error for error in check(repo)))

    def test_dependency_scan_rejects_npm_audit_fallback(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "dependency-vulnerability-scan.yml"
        workflow.write_text(workflow.read_text(encoding="utf-8") + "\n# npm audit\n", encoding="utf-8")
        self.assertTrue(any("must not depend on npm audit" in error for error in check(repo)))

    def test_provider_leak_in_public_api_fails(self):
        repo = self.copy_repo()
        public_api = repo / "documents" / "public.ts"
        public_api.write_text(public_api.read_text(encoding="utf-8") + "\n// Supabase\n", encoding="utf-8")
        self.assertTrue(any("public API must remain provider-free" in error for error in check(repo)))


if __name__ == "__main__":
    unittest.main()
