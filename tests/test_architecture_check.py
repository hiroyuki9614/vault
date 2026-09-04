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
        shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", "dist"))
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
        for name in (
            "202609040002_idempotent_document_create.sql",
            "202609040003_document_write_authorization.sql",
        ):
            migration = repo / "supabase" / "migrations" / name
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

    def test_external_docker_from_must_be_fully_qualified(self):
        repo = self.copy_repo()
        dockerfile = repo / "deploy" / "docker" / "Dockerfile.apache"
        dockerfile.write_text(
            dockerfile.read_text(encoding="utf-8").replace("docker.io/library/httpd:", "httpd:", 1),
            encoding="utf-8",
        )
        self.assertTrue(any("fully qualified registry reference" in error for error in check(repo)))

    def test_external_docker_from_must_remain_digest_pinned(self):
        repo = self.copy_repo()
        dockerfile = repo / "deploy" / "docker" / "Dockerfile.apache"
        text = dockerfile.read_text(encoding="utf-8")
        dockerfile.write_text(text.split("@sha256:", 1)[0] + "\n" + "\n".join(text.splitlines()[1:]) + "\n", encoding="utf-8")
        self.assertTrue(any("Dockerfile external FROM must be digest pinned" in error for error in check(repo)))

    def test_docker_stage_alias_is_not_treated_as_external_image(self):
        repo = self.copy_repo()
        dockerfile = repo / "deploy" / "docker" / "Dockerfile.runtime"
        dockerfile.write_text(dockerfile.read_text(encoding="utf-8") + "\nFROM build AS alias-smoke\n", encoding="utf-8")
        self.assertFalse(any("Dockerfile external FROM" in error for error in check(repo)))

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

    def test_database_contract_requires_ordered_migration_execution(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "database-contract.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace("supabase/migrations/*.sql", "supabase/migrations/one.sql"),
            encoding="utf-8",
        )
        self.assertTrue(any("supabase/migrations/*.sql" in error for error in check(repo)))

    def test_database_contract_requires_fail_fast_psql(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "database-contract.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace("-v ON_ERROR_STOP=1", ""),
            encoding="utf-8",
        )
        self.assertTrue(any("ON_ERROR_STOP" in error for error in check(repo)))

    def test_document_write_authorization_guard_is_required_for_put_and_delete(self):
        repo = self.copy_repo()
        migration = repo / "supabase" / "migrations" / "202609040003_document_write_authorization.sql"
        migration.write_text(
            migration.read_text(encoding="utf-8").replace(
                "coalesce(public.current_vault_role(p_vault_id), '') not in ('owner', 'editor')",
                "false",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("authorize owner or editor" in error for error in check(repo)))

    def test_database_acceptance_requires_anonymous_boundary(self):
        repo = self.copy_repo()
        acceptance = repo / "tests" / "postgres" / "document-rls-acceptance.sql"
        acceptance.write_text(
            acceptance.read_text(encoding="utf-8").replace("set role anon", "set role removed_anon", 1),
            encoding="utf-8",
        )
        self.assertTrue(any("set role anon" in error for error in check(repo)))

    def test_provider_leak_in_public_api_fails(self):
        repo = self.copy_repo()
        public_api = repo / "documents" / "public.ts"
        public_api.write_text(public_api.read_text(encoding="utf-8") + "\n// Supabase\n", encoding="utf-8")
        self.assertTrue(any("public API must remain provider-free" in error for error in check(repo)))

    def test_apache_must_forward_authorization(self):
        repo = self.copy_repo()
        apache = repo / "deploy" / "apache" / "vault.conf.example"
        apache.write_text(
            apache.read_text(encoding="utf-8").replace(
                'RequestHeader set Authorization "%{VAULT_AUTHORIZATION}e" env=VAULT_AUTHORIZATION',
                "# removed authorization forwarding",
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("Authorization" in error for error in check(repo)))

    def test_apache_must_keep_forward_proxy_disabled(self):
        repo = self.copy_repo()
        apache = repo / "deploy" / "apache" / "vault.conf.example"
        apache.write_text(
            apache.read_text(encoding="utf-8").replace("ProxyRequests Off", "ProxyRequests On", 1),
            encoding="utf-8",
        )
        self.assertTrue(any("forward proxy" in error or "ProxyRequests Off" in error for error in check(repo)))

    def test_apache_must_proxy_to_loopback(self):
        repo = self.copy_repo()
        apache = repo / "deploy" / "apache" / "vault.conf.example"
        apache.write_text(
            apache.read_text(encoding="utf-8").replace("127.0.0.1:3100", "0.0.0.0:3100"),
            encoding="utf-8",
        )
        self.assertTrue(any("loopback Node upstream" in error for error in check(repo)))

    def test_apache_redirect_must_use_fixed_host(self):
        repo = self.copy_repo()
        apache = repo / "deploy" / "apache" / "vault.conf.example"
        apache.write_text(
            apache.read_text(encoding="utf-8").replace(
                "Redirect permanent / https://vault.example.com/",
                "Redirect permanent / https://untrusted.invalid/",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("Redirect permanent / https://vault.example.com/" in error for error in check(repo)))

    def test_apache_vhost_must_not_define_server_tokens(self):
        repo = self.copy_repo()
        apache = repo / "deploy" / "apache" / "vault.conf.example"
        apache.write_text(apache.read_text(encoding="utf-8") + "\nServerTokens Prod\n", encoding="utf-8")
        self.assertTrue(any("server-global ServerTokens" in error for error in check(repo)))

    def test_architecture_workflow_requires_apache_configtest(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "architecture.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace("sudo apachectl configtest", "# removed configtest", 1),
            encoding="utf-8",
        )
        self.assertTrue(any("apachectl configtest" in error for error in check(repo)))

    def test_architecture_workflow_requires_apache_bearer_smoke(self):
        repo = self.copy_repo()
        workflow = repo / ".github" / "workflows" / "architecture.yml"
        workflow.write_text(
            workflow.read_text(encoding="utf-8").replace(
                "Authorization: Bearer synthetic-ci-token",
                "X-Removed-Authorization: synthetic-ci-token",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("Authorization: Bearer synthetic-ci-token" in error for error in check(repo)))

    def test_superseded_nginx_artifact_fails(self):
        repo = self.copy_repo()
        stale = repo / "docs" / "NGINX_DEPLOYMENT.md"
        stale.write_text("superseded", encoding="utf-8")
        self.assertTrue(any("superseded Nginx artifact" in error for error in check(repo)))

    def test_server_default_bind_must_remain_loopback(self):
        repo = self.copy_repo()
        server_config = repo / "server" / "config.ts"
        server_config.write_text(
            server_config.read_text(encoding="utf-8").replace(
                "env.VAULT_HOST?.trim() || '127.0.0.1'",
                "env.VAULT_HOST?.trim() || '0.0.0.0'",
                1,
            ),
            encoding="utf-8",
        )
        self.assertTrue(any("default VAULT_HOST to 127.0.0.1" in error for error in check(repo)))

    def test_systemd_hardening_is_required(self):
        repo = self.copy_repo()
        unit = repo / "deploy" / "systemd" / "vault.service.example"
        unit.write_text(
            unit.read_text(encoding="utf-8").replace("NoNewPrivileges=true", "NoNewPrivileges=false"),
            encoding="utf-8",
        )
        self.assertTrue(any("NoNewPrivileges=true" in error for error in check(repo)))

    def test_production_build_entrypoint_is_required(self):
        repo = self.copy_repo()
        package = repo / "package.json"
        package.write_text(
            package.read_text(encoding="utf-8").replace("node dist/server/main.js", "node server/main.js"),
            encoding="utf-8",
        )
        self.assertTrue(any("dist/server/main.js" in error for error in check(repo)))


if __name__ == "__main__":
    unittest.main()
