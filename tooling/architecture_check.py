from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "architecture.json"
ACTION_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
USES_LINE_RE = re.compile(r"^-?\s*uses:\s*([^#\s]+)")
OSV_SCANNER_ACTION = "google/osv-scanner-action/osv-scanner-action@baa4139e56d6312335d899e6ba045fa16d1d3d0b"
WRITER_GUARD = "coalesce(public.current_vault_role(p_vault_id), '') not in ('owner', 'editor')"


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def check(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    config = json.loads((root / "config" / "architecture.json").read_text(encoding="utf-8"))

    if config.get("canonical_data_backend") != "supabase": errors.append("canonical_data_backend must be supabase")
    if config.get("supabase_required") is not True: errors.append("supabase_required must be true")
    if config.get("github_data_canonical") is not False: errors.append("github_data_canonical must be false")
    if config.get("runtime_language") != "typescript": errors.append("runtime_language must be typescript")
    if config.get("runtime_architecture") != "functional_core_effectful_adapter": errors.append("runtime_architecture must be functional_core_effectful_adapter")
    if config.get("dependency_install") != "npm_ci": errors.append("dependency_install must be npm_ci")
    if config.get("lockfile_required") is not True: errors.append("lockfile_required must be true")
    if config.get("identity_read_back_required") is not True: errors.append("identity_read_back_required must be true")
    if config.get("idempotent_create_required") is not True: errors.append("idempotent_create_required must be true")
    if config.get("semantic_store_errors_required") is not True: errors.append("semantic_store_errors_required must be true")
    if config.get("pinned_workflow_actions_required") is not True: errors.append("pinned_workflow_actions_required must be true")
    if config.get("code_scanning_workflow_required") is not True: errors.append("code_scanning_workflow_required must be true")
    if config.get("dependency_vulnerability_scan_required") is not True: errors.append("dependency_vulnerability_scan_required must be true")
    if config.get("database_contract_test_required") is not True: errors.append("database_contract_test_required must be true")
    if config.get("nginx_reverse_proxy_runtime_required") is not True: errors.append("nginx_reverse_proxy_runtime_required must be true")

    for path in config.get("required_paths", []):
        if not (root / path).exists(): errors.append(f"missing required path: {path}")
    for path in config.get("forbidden_top_level_paths", []):
        if (root / path).exists(): errors.append(f"legacy/personal path must not exist: {path}")

    package_path = root / "package.json"
    if package_path.exists():
        package = json.loads(package_path.read_text(encoding="utf-8"))
        if package.get("packageManager") != "npm@11.19.0": errors.append("packageManager must pin npm@11.19.0")
        for name, version in package.get("devDependencies", {}).items():
            if not isinstance(version, str) or version.startswith(("^", "~", ">", "<", "*")):
                errors.append(f"devDependency must be exact: {name}={version}")
        scripts = package.get("scripts", {})
        if scripts.get("build") != "tsc -p tsconfig.build.json": errors.append("production build must use tsconfig.build.json")
        if scripts.get("start") != "node dist/server/main.js": errors.append("production start must execute dist/server/main.js")
        if "npm run build" not in scripts.get("check:ts", ""): errors.append("TypeScript check must include production build")

    workflows_root = root / ".github" / "workflows"
    if workflows_root.exists():
        for workflow_path in sorted(workflows_root.glob("*.yml")):
            workflow_text = workflow_path.read_text(encoding="utf-8")
            if "timeout-minutes:" not in workflow_text:
                errors.append(f"workflow must bound execution time: {workflow_path.name}")
            for line_number, line in enumerate(workflow_text.splitlines(), start=1):
                match = USES_LINE_RE.match(line.strip())
                if match is None: continue
                target = match.group(1)
                if target.startswith("./"): continue
                if "@" not in target:
                    errors.append(f"workflow action must be SHA pinned: {workflow_path.name}:{line_number}")
                    continue
                _, ref = target.rsplit("@", 1)
                if not ACTION_SHA_RE.fullmatch(ref):
                    errors.append(f"workflow action must use a 40-hex commit: {workflow_path.name}:{line_number}")

    architecture_workflow = workflows_root / "architecture.yml"
    if architecture_workflow.exists():
        text = architecture_workflow.read_text(encoding="utf-8")
        if "npm ci" not in text: errors.append("architecture workflow must use npm ci")
        if "npm install" in text: errors.append("architecture workflow must not use npm install")
        if "npm run build" not in text: errors.append("architecture workflow must build the production runtime")

    codeql_workflow = workflows_root / "codeql.yml"
    if codeql_workflow.exists():
        text = codeql_workflow.read_text(encoding="utf-8")
        for fragment in ("javascript-typescript", "python", "security-extended", "security-events: write"):
            if fragment not in text: errors.append(f"CodeQL workflow missing invariant: {fragment}")

    dependency_scan_workflow = workflows_root / "dependency-vulnerability-scan.yml"
    if dependency_scan_workflow.exists():
        text = dependency_scan_workflow.read_text(encoding="utf-8")
        if OSV_SCANNER_ACTION not in text:
            errors.append("dependency vulnerability scan must use the pinned OSV scanner action")
        if "--lockfile=package-lock.json" not in text:
            errors.append("dependency vulnerability scan must scan the committed npm lockfile")
        if "persist-credentials: false" not in text:
            errors.append("dependency vulnerability scan checkout must not persist credentials")
        if "npm audit" in text:
            errors.append("dependency vulnerability scan must not depend on npm audit")

    database_contract_workflow = workflows_root / "database-contract.yml"
    if database_contract_workflow.exists():
        text = database_contract_workflow.read_text(encoding="utf-8")
        required_database_fragments = (
            "runs-on: ubuntu-24.04",
            "persist-credentials: false",
            "sudo systemctl start postgresql.service",
            "createdb vault_ci",
            "-v ON_ERROR_STOP=1",
            "tests/postgres/supabase-auth-bootstrap.sql",
            "supabase/migrations/*.sql",
            "tests/postgres/document-rls-acceptance.sql",
        )
        for fragment in required_database_fragments:
            if fragment not in text:
                errors.append(f"database contract workflow missing invariant: {fragment}")

    core_root = root / "documents" / "machine" / "core"
    if core_root.exists():
        forbidden = [fragment.lower() for fragment in config.get("core_forbidden_fragments", [])]
        for path in core_root.glob("*.ts"):
            text = path.read_text(encoding="utf-8").lower()
            for fragment in forbidden:
                if fragment in text:
                    errors.append(f"functional core contains effect/provider fragment in {path.relative_to(root)}: {fragment}")

    contracts = root / "documents" / "machine" / "contracts" / "document.ts"
    if contracts.exists():
        text = contracts.read_text(encoding="utf-8")
        if "readonly documentId: string;" not in text: errors.append("document create/update request identity must be a required string")
        if "readonly documentId: string | null;" in text: errors.append("document request must not allow null identity")
        create_parts = text.split("readonly kind: 'create';", 1)
        create_body = create_parts[1].split("readonly kind: 'update';", 1)[0] if len(create_parts) == 2 else ""
        if "readonly id: string;" not in create_body: errors.append("create command must require caller-generated document identity")

    migrations_root = root / "supabase" / "migrations"
    migration_files = sorted(migrations_root.glob("*.sql")) if migrations_root.exists() else []
    all_sql = "\n".join(path.read_text(encoding="utf-8").lower() for path in migration_files)
    for fragment in ["enable row level security", "auth.uid()", "security invoker", "version_conflict", *config.get("required_sql_fragments", [])]:
        if fragment.lower() not in all_sql: errors.append(f"migrations missing invariant: {fragment}")
    for rpc in config.get("required_rpc_names", []):
        if f"create or replace function public.{rpc}" not in all_sql: errors.append(f"migrations missing semantic RPC: {rpc}")

    write_auth_migration = migrations_root / "202609040003_document_write_authorization.sql"
    if write_auth_migration.exists():
        text = write_auth_migration.read_text(encoding="utf-8").lower()
        if text.count(WRITER_GUARD) < 2:
            errors.append("document put/delete must authorize owner or editor before replay reconciliation")
        if "raise exception 'permission_denied'" not in text:
            errors.append("document write authorization must expose semantic permission_denied")

    acceptance = root / "tests" / "postgres" / "document-rls-acceptance.sql"
    if acceptance.exists():
        text = acceptance.read_text(encoding="utf-8").lower()
        for fragment in (
            "set role authenticated",
            "set role anon",
            "idempotency_conflict",
            "path_conflict",
            "version_conflict",
            "permission_denied",
            "public.delete_document",
            "acceptance_cross_tenant_read_leak",
        ):
            if fragment not in text:
                errors.append(f"database acceptance missing invariant: {fragment}")

    adapter = root / "documents" / "machine" / "adapters" / "supabase-rpc-document-store.ts"
    if adapter.exists():
        text = adapter.read_text(encoding="utf-8")
        for rpc in config.get("required_rpc_names", []):
            if f"'{rpc}'" not in text and f'"{rpc}"' not in text: errors.append(f"Supabase adapter missing semantic RPC mapping: {rpc}")
        for semantic_error in ("DocumentStoreError", "idempotency_conflict", "path_conflict", "permission_denied"):
            if semantic_error not in text: errors.append(f"Supabase adapter missing semantic failure mapping: {semantic_error}")

    service = root / "documents" / "machine" / "runtime" / "document-service.ts"
    if service.exists() and "store.getById" not in service.read_text(encoding="utf-8"):
        errors.append("document service must verify mutations by document identity")

    public_api = root / "documents" / "public.ts"
    if public_api.exists() and "supabase" in public_api.read_text(encoding="utf-8").lower():
        errors.append("documents public API must remain provider-free")

    runtime_config = root / "server" / "config.ts"
    if runtime_config.exists():
        text = runtime_config.read_text(encoding="utf-8")
        for fragment in ("'127.0.0.1'", "VAULT_ALLOW_PUBLIC_BIND", "SUPABASE_RPC_TIMEOUT_MS", "VAULT_MAX_BODY_BYTES"):
            if fragment not in text: errors.append(f"server runtime configuration missing invariant: {fragment}")
        if "process.env" in text: errors.append("server config parser must receive environment explicitly")
        if "SUPABASE_SERVICE_ROLE" in text: errors.append("normal server runtime must not accept a Supabase service-role credential")

    http_app = root / "server" / "http-app.ts"
    if http_app.exists():
        text = http_app.read_text(encoding="utf-8")
        for fragment in (
            "/health/live",
            "/health/ready",
            "/v1/documents/get-by-path",
            "/v1/documents/get-by-id",
            "/v1/documents/put",
            "/v1/documents/delete",
            "requireBearer",
            "config.maxBodyBytes",
            "createSupabaseRpcDocumentStore",
            "DocumentStoreError",
            "x-request-id",
        ):
            if fragment not in text: errors.append(f"HTTP server missing invariant: {fragment}")
        if "SUPABASE_SERVICE_ROLE" in text: errors.append("HTTP server must not use service-role credentials")

    http_rpc_client = root / "server" / "supabase-http-rpc-client.ts"
    if http_rpc_client.exists():
        text = http_rpc_client.read_text(encoding="utf-8")
        for fragment in (
            "authorization: `Bearer ${config.accessToken}`",
            "apikey: config.anonKey",
            "AbortSignal.timeout(config.timeoutMs)",
            "/rest/v1/rpc/",
        ):
            if fragment not in text: errors.append(f"Supabase HTTP RPC client missing invariant: {fragment}")
        if "service_role" in text.lower(): errors.append("Supabase HTTP RPC client must remain user-bearer scoped")

    server_main = root / "server" / "main.ts"
    if server_main.exists():
        text = server_main.read_text(encoding="utf-8")
        for fragment in ("process.env", "SIGTERM", "SIGINT", "server.close(", "server.closeAllConnections()"):
            if fragment not in text: errors.append(f"server lifecycle missing invariant: {fragment}")

    env_example = root / ".env.example"
    if env_example.exists():
        text = env_example.read_text(encoding="utf-8")
        if "VAULT_HOST=127.0.0.1" not in text: errors.append("example runtime environment must bind loopback")
        if "VAULT_ALLOW_PUBLIC_BIND=true" in text: errors.append("example runtime environment must not opt into public Node bind")
        if "SUPABASE_SERVICE_ROLE" in text: errors.append("example runtime environment must not request service-role credentials")

    nginx = root / "deploy" / "nginx" / "vault.conf.example"
    if nginx.exists():
        text = nginx.read_text(encoding="utf-8")
        for fragment in (
            "server 127.0.0.1:3100;",
            "location /v1/",
            "proxy_set_header Authorization $http_authorization;",
            "proxy_set_header X-Request-ID $request_id;",
            "client_max_body_size 1m;",
            "proxy_connect_timeout 2s;",
            "proxy_read_timeout 15s;",
        ):
            if fragment not in text: errors.append(f"Nginx deployment missing invariant: {fragment}")
        if "0.0.0.0:3100" in text: errors.append("Nginx must proxy to the loopback Node upstream")

    systemd = root / "deploy" / "systemd" / "vault.service.example"
    if systemd.exists():
        text = systemd.read_text(encoding="utf-8")
        for fragment in (
            "User=vault",
            "EnvironmentFile=/etc/vault/vault.env",
            "ExecStart=/usr/bin/node /opt/vault/current/dist/server/main.js",
            "NoNewPrivileges=true",
            "ProtectSystem=strict",
            "ProtectHome=true",
            "CapabilityBoundingSet=",
            "KillSignal=SIGTERM",
        ):
            if fragment not in text: errors.append(f"systemd deployment missing invariant: {fragment}")

    tsconfig = root / "tsconfig.json"
    if tsconfig.exists() and '"server/**/*.ts"' not in tsconfig.read_text(encoding="utf-8"):
        errors.append("TypeScript typecheck must include server runtime")

    build_config = root / "tsconfig.build.json"
    if build_config.exists():
        text = build_config.read_text(encoding="utf-8")
        for fragment in ('"noEmit": false', '"outDir": "dist"', '"server/**/*.ts"', '"**/*.test.ts"'):
            if fragment not in text: errors.append(f"production build config missing invariant: {fragment}")

    codeowners = root / ".github" / "CODEOWNERS"
    if codeowners.exists():
        text = codeowners.read_text(encoding="utf-8")
        for path in ("/supabase/migrations/", "/documents/machine/core/", "/server/", "/deploy/", "/.github/"):
            if path not in text: errors.append(f"CODEOWNERS missing security-critical path: {path}")

    forbidden_text = ["kind: personal", "partner vault", "canonical_repository: hiroyuki9614/vault", "supabase_outage_write_fallback: allowed"]
    for relative in ("README.md", "AGENTS.md", "vault.config.yml", "docs/ARCHITECTURE.md"):
        path = root / relative
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8").lower()
        for needle in forbidden_text:
            if needle.lower() in text: errors.append(f"legacy contract remains in {relative}: {needle}")

    return errors


def main() -> int:
    errors = check()
    if errors:
        for error in errors: print(f"FAIL: {error}")
        return 1
    print("PASS: public vault meets the enterprise nginx/database contract baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
