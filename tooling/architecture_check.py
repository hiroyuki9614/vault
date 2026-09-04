from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "architecture.json"
ACTION_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
USES_LINE_RE = re.compile(r"^-?\s*uses:\s*([^#\s]+)")


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
    if config.get("dependency_review_workflow_required") is not True: errors.append("dependency_review_workflow_required must be true")

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

    codeql_workflow = workflows_root / "codeql.yml"
    if codeql_workflow.exists():
        text = codeql_workflow.read_text(encoding="utf-8")
        for fragment in ("javascript-typescript", "python", "security-extended", "security-events: write"):
            if fragment not in text: errors.append(f"CodeQL workflow missing invariant: {fragment}")

    dependency_review_workflow = workflows_root / "dependency-review.yml"
    if dependency_review_workflow.exists():
        text = dependency_review_workflow.read_text(encoding="utf-8")
        if "fail-on-severity: high" not in text: errors.append("dependency review must fail on high severity or above")

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

    adapter = root / "documents" / "machine" / "adapters" / "supabase-rpc-document-store.ts"
    if adapter.exists():
        text = adapter.read_text(encoding="utf-8")
        for rpc in config.get("required_rpc_names", []):
            if f"'{rpc}'" not in text and f'"{rpc}"' not in text: errors.append(f"Supabase adapter missing semantic RPC mapping: {rpc}")
        for semantic_error in ("DocumentStoreError", "idempotency_conflict", "path_conflict"):
            if semantic_error not in text: errors.append(f"Supabase adapter missing semantic failure mapping: {semantic_error}")

    service = root / "documents" / "machine" / "runtime" / "document-service.ts"
    if service.exists() and "store.getById" not in service.read_text(encoding="utf-8"):
        errors.append("document service must verify mutations by document identity")

    public_api = root / "documents" / "public.ts"
    if public_api.exists() and "supabase" in public_api.read_text(encoding="utf-8").lower():
        errors.append("documents public API must remain provider-free")

    codeowners = root / ".github" / "CODEOWNERS"
    if codeowners.exists():
        text = codeowners.read_text(encoding="utf-8")
        for path in ("/supabase/migrations/", "/documents/machine/core/", "/.github/"):
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
    print("PASS: public vault meets the enterprise resilience and security baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
